"""
Proxy fetching, testing, and Supabase pool management.

Sources free proxies from proxyscrape.com and geonode.com,
validates each one for connectivity, then syncs to Supabase.
"""

import asyncio
import os
import socket
import time
from typing import Optional

import aiohttp
from loguru import logger

# Environment-configurable endpoints
_PROXYSCRAPE_URL = os.getenv(
    "PROXYSCRAPE_URL",
    "https://api.proxyscrape.com/v3/free-proxy-list/get"
    "?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all&simplified=true",
)
_GEONODE_URL = os.getenv(
    "GEONODE_URL",
    "https://proxylist.geonode.com/api/proxy-list?limit=100&page=1&sort_by=lastChecked&sort_type=desc&protocols=http%2Chttps&filterUpTime=90",
)
_TEST_URL = "https://httpbin.org/ip"
_CONNECT_TIMEOUT = 5.0  # seconds
_TOR_PROXY = "socks5://127.0.0.1:9050"


async def _fetch_proxyscrape(session: aiohttp.ClientSession) -> list[dict]:
    """Fetch proxy list from proxyscrape.com."""
    proxies: list[dict] = []
    try:
        async with session.get(_PROXYSCRAPE_URL, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status != 200:
                logger.warning(f"proxyscrape returned HTTP {resp.status}")
                return proxies
            text = await resp.text()
            for line in text.strip().splitlines():
                line = line.strip()
                if ":" in line:
                    proxies.append({"url": f"http://{line}", "type": "http", "source": "proxyscrape"})
    except Exception as exc:
        logger.warning(f"Failed to fetch from proxyscrape: {exc}")
    return proxies


async def _fetch_geonode(session: aiohttp.ClientSession) -> list[dict]:
    """Fetch proxy list from geonode.com JSON API."""
    proxies: list[dict] = []
    try:
        async with session.get(_GEONODE_URL, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status != 200:
                logger.warning(f"geonode returned HTTP {resp.status}")
                return proxies
            data = await resp.json()
            for item in data.get("data", []):
                ip = item.get("ip", "")
                port = item.get("port", "")
                proto = item.get("protocols", ["http"])[0] if item.get("protocols") else "http"
                if ip and port:
                    proxies.append({
                        "url": f"{proto}://{ip}:{port}",
                        "type": proto,
                        "source": "geonode",
                    })
    except Exception as exc:
        logger.warning(f"Failed to fetch from geonode: {exc}")
    return proxies


async def _test_proxy(session: aiohttp.ClientSession, proxy_info: dict) -> Optional[dict]:
    """
    Test a single proxy by making a GET request to httpbin.org/ip.

    Returns the proxy dict with latency_ms added, or None if unreachable.
    """
    proxy_url = proxy_info["url"]
    start = time.monotonic()
    try:
        connector = aiohttp.TCPConnector(ssl=False)
        async with aiohttp.ClientSession(connector=connector) as test_session:
            async with test_session.get(
                _TEST_URL,
                proxy=proxy_url,
                timeout=aiohttp.ClientTimeout(total=_CONNECT_TIMEOUT),
            ) as resp:
                if resp.status == 200:
                    latency_ms = int((time.monotonic() - start) * 1000)
                    return {**proxy_info, "latency_ms": latency_ms}
    except Exception:
        pass
    return None


async def fetch_and_test_proxies(concurrency: int = 50) -> list[dict]:
    """
    Fetch proxies from all sources and test each one concurrently.

    Args:
        concurrency: Max simultaneous proxy tests.

    Returns:
        List of working proxy dicts: {url, type, latency_ms, source}
    """
    async with aiohttp.ClientSession() as session:
        logger.info("Fetching proxy lists...")
        raw_proxyscrape, raw_geonode = await asyncio.gather(
            _fetch_proxyscrape(session),
            _fetch_geonode(session),
        )

    all_proxies = raw_proxyscrape + raw_geonode

    # Deduplicate by URL
    seen: set[str] = set()
    unique_proxies: list[dict] = []
    for p in all_proxies:
        if p["url"] not in seen:
            seen.add(p["url"])
            unique_proxies.append(p)

    logger.info(f"Testing {len(unique_proxies)} unique proxies (concurrency={concurrency})...")

    semaphore = asyncio.Semaphore(concurrency)
    working: list[dict] = []

    async def test_with_limit(proxy_info: dict) -> None:
        async with semaphore:
            async with aiohttp.ClientSession() as s:
                result = await _test_proxy(s, proxy_info)
            if result:
                working.append(result)

    await asyncio.gather(*[test_with_limit(p) for p in unique_proxies])

    # Sort by latency
    working.sort(key=lambda x: x.get("latency_ms", 99999))
    logger.info(f"Found {len(working)} working proxies out of {len(unique_proxies)} tested")
    return working


async def refresh_proxy_pool(supabase_client) -> int:
    """
    Refresh the proxy_pool table in Supabase.

    Marks all existing proxies as inactive, fetches and tests new proxies,
    then upserts working ones as active.

    Args:
        supabase_client: An initialized supabase-py client.

    Returns:
        Number of active proxies inserted.
    """
    logger.info("Refreshing proxy pool in Supabase...")

    # Mark existing proxies inactive
    try:
        supabase_client.table("proxy_pool").update({"is_active": False}).neq("id", 0).execute()
    except Exception as exc:
        logger.warning(f"Failed to deactivate old proxies: {exc}")

    working_proxies = await fetch_and_test_proxies()

    if not working_proxies:
        logger.warning("No working proxies found")
        return 0

    rows = [
        {
            "url": p["url"],
            "proxy_type": p.get("type", "http"),
            "latency_ms": p.get("latency_ms", 9999),
            "source": p.get("source", "unknown"),
            "is_active": True,
            "success_count": 0,
            "fail_count": 0,
        }
        for p in working_proxies
    ]

    try:
        supabase_client.table("proxy_pool").upsert(rows, on_conflict="url").execute()
        logger.info(f"Inserted {len(rows)} proxies into proxy_pool")
        return len(rows)
    except Exception as exc:
        logger.error(f"Failed to upsert proxies: {exc}")
        return 0


def get_tor_proxy() -> Optional[str]:
    """
    Return the Tor SOCKS5 proxy URL if Tor is running.

    Returns:
        "socks5://127.0.0.1:9050" if Tor is reachable, None otherwise.
    """
    try:
        with socket.create_connection(("127.0.0.1", 9050), timeout=2):
            logger.debug("Tor is running on 127.0.0.1:9050")
            return _TOR_PROXY
    except (socket.timeout, ConnectionRefusedError, OSError):
        logger.debug("Tor not available on port 9050")
        return None
