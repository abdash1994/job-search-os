"""
ProxyPool: manages a rotating pool of proxies backed by Supabase.

Loads active proxies on initialization, tracks success/failure per proxy,
and falls back to Tor when no proxy is available.
"""

from __future__ import annotations

import threading
from typing import Optional

from loguru import logger

from proxy.fetcher import get_tor_proxy

_MAX_FAILURES = 5  # Deactivate proxy after this many consecutive failures


class ProxyPool:
    """
    Thread-safe rotating proxy pool backed by Supabase.

    Attributes:
        _proxies: List of active proxy dicts loaded from Supabase.
        _index: Current round-robin index.
        _lock: Threading lock for thread-safe operations.
        _supabase: Supabase client reference.
    """

    def __init__(self, supabase_client) -> None:
        self._supabase = supabase_client
        self._proxies: list[dict] = []
        self._index: int = 0
        self._lock = threading.Lock()
        self._load_proxies()

    def _load_proxies(self) -> None:
        """Load active proxies from the Supabase proxy_pool table."""
        try:
            result = (
                self._supabase
                .table("proxy_pool")
                .select("*")
                .eq("is_active", True)
                .order("latency_ms", desc=False)
                .execute()
            )
            self._proxies = result.data or []
            logger.info(f"Loaded {len(self._proxies)} active proxies from Supabase")
        except Exception as exc:
            logger.error(f"Failed to load proxies from Supabase: {exc}")
            self._proxies = []

    def get_proxy(self) -> Optional[str]:
        """
        Return the proxy URL with the best success rate.

        Success rate is computed as success_count / (success_count + fail_count + 1).
        Falls back to Tor if no proxies are available.

        Returns:
            Proxy URL string (e.g. "http://1.2.3.4:8080"), or None if unavailable.
        """
        with self._lock:
            if not self._proxies:
                tor = get_tor_proxy()
                if tor:
                    logger.info("No HTTP proxies available — using Tor fallback")
                    return tor
                logger.warning("No proxies available (including Tor)")
                return None

            # Sort by success rate descending
            def success_rate(p: dict) -> float:
                s = p.get("success_count", 0)
                f = p.get("fail_count", 0)
                return s / (s + f + 1)

            best = max(self._proxies, key=success_rate)
            return best["url"]

    def rotate(self) -> Optional[str]:
        """
        Get the next proxy in round-robin rotation.

        Returns:
            Proxy URL string, or None if the pool is empty.
        """
        with self._lock:
            if not self._proxies:
                return get_tor_proxy()
            proxy = self._proxies[self._index % len(self._proxies)]
            self._index = (self._index + 1) % len(self._proxies)
            return proxy["url"]

    def mark_success(self, proxy_url: str) -> None:
        """
        Record a successful request for the given proxy URL.

        Increments success_count and updates last_used in Supabase.

        Args:
            proxy_url: The proxy URL string that succeeded.
        """
        with self._lock:
            for proxy in self._proxies:
                if proxy["url"] == proxy_url:
                    proxy["success_count"] = proxy.get("success_count", 0) + 1
                    break

        try:
            self._supabase.table("proxy_pool").update({
                "success_count": self._supabase.raw(  # type: ignore[attr-defined]
                    "success_count + 1"
                ),
                "last_used": "now()",
            }).eq("url", proxy_url).execute()
        except Exception as exc:
            # Non-critical: in-memory state is already updated
            logger.debug(f"Failed to update proxy success in DB: {exc}")

    def mark_failure(self, proxy_url: str) -> None:
        """
        Record a failed request for the given proxy URL.

        Increments fail_count. Deactivates the proxy if fail_count exceeds threshold.

        Args:
            proxy_url: The proxy URL string that failed.
        """
        with self._lock:
            to_remove: Optional[dict] = None
            for proxy in self._proxies:
                if proxy["url"] == proxy_url:
                    proxy["fail_count"] = proxy.get("fail_count", 0) + 1
                    if proxy["fail_count"] > _MAX_FAILURES:
                        to_remove = proxy
                    break

            if to_remove:
                self._proxies.remove(to_remove)
                logger.info(
                    f"Deactivated proxy {proxy_url} after {_MAX_FAILURES} failures"
                )

        try:
            # Increment fail count in DB
            self._supabase.table("proxy_pool").update({
                "fail_count": self._supabase.raw(  # type: ignore[attr-defined]
                    "fail_count + 1"
                ),
            }).eq("url", proxy_url).execute()

            if to_remove:
                self._supabase.table("proxy_pool").update({
                    "is_active": False,
                }).eq("url", proxy_url).execute()
        except Exception as exc:
            logger.debug(f"Failed to update proxy failure in DB: {exc}")

    def refresh(self) -> None:
        """Reload proxies from Supabase (call after a refresh_proxy_pool run)."""
        self._load_proxies()

    @property
    def size(self) -> int:
        """Return the number of active proxies in the pool."""
        with self._lock:
            return len(self._proxies)
