"""
Playwright stealth utilities and bot-detection helpers.
Applies anti-fingerprinting measures and simulates human browsing behavior.
"""

import asyncio
import random
from typing import Optional, Union

from loguru import logger

try:
    from playwright.async_api import Page, Response
    from playwright_stealth import stealth_async
    _PLAYWRIGHT_AVAILABLE = True
except ImportError:
    _PLAYWRIGHT_AVAILABLE = False
    logger.warning("Playwright or playwright-stealth not installed — stealth features disabled")


# Phrases that indicate a bot-check or block page
_BLOCK_INDICATORS = [
    "captcha",
    "are you a robot",
    "human verification",
    "access denied",
    "blocked",
    "unusual traffic",
    "verify you are human",
    "bot check",
    "ddos-guard",
    "cloudflare",
    "just a moment",
    "checking your browser",
    "please wait while we check",
    "security check",
    "403 forbidden",
    "rate limit",
    "too many requests",
    "service unavailable",
    "your ip has been",
    "ip has been blocked",
    "temporarily blocked",
    "scraping detected",
]

# Common viewport sizes weighted by market share
_VIEWPORTS = [
    {"width": 1920, "height": 1080},
    {"width": 1366, "height": 768},
    {"width": 1440, "height": 900},
    {"width": 1536, "height": 864},
    {"width": 1280, "height": 720},
    {"width": 1600, "height": 900},
    {"width": 2560, "height": 1440},
    {"width": 1280, "height": 800},
]

_TIMEZONES = [
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Toronto",
    "America/Vancouver",
    "Europe/London",
    "Europe/Berlin",
    "Europe/Paris",
    "Australia/Sydney",
]

_LOCALES = [
    "en-US",
    "en-GB",
    "en-CA",
    "en-AU",
    "en-NZ",
]


async def apply_stealth(page: "Page") -> None:
    """
    Apply stealth patches to a Playwright page to avoid bot detection.

    Hides webdriver signals, randomizes viewport/timezone/locale,
    and applies playwright-stealth overrides.

    Args:
        page: An active Playwright Page instance.
    """
    if not _PLAYWRIGHT_AVAILABLE:
        logger.warning("Stealth not applied — playwright-stealth unavailable")
        return

    # Apply playwright-stealth patches (removes navigator.webdriver, etc.)
    await stealth_async(page)

    # Set a realistic viewport
    viewport = random.choice(_VIEWPORTS)
    await page.set_viewport_size(viewport)

    # Patch additional JS properties that leak automation
    await page.add_init_script("""
        // Remove automation fingerprint traces
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
        });
        Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en'],
        });

        // Fake chrome runtime
        if (!window.chrome) {
            window.chrome = { runtime: {} };
        }

        // Conceal headless mode
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
            if (parameter === 37445) return 'Intel Inc.';
            if (parameter === 37446) return 'Intel Iris OpenGL Engine';
            return getParameter.apply(this, [parameter]);
        };

        // Override permissions API
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );
    """)

    logger.debug(f"Stealth applied: viewport={viewport['width']}x{viewport['height']}")


async def human_delay(min_s: float = 2.0, max_s: float = 9.0) -> None:
    """
    Sleep for a random duration to simulate human browsing pace.

    Uses a weighted distribution — shorter pauses are more common,
    with occasional longer "reading" pauses.

    Args:
        min_s: Minimum sleep time in seconds.
        max_s: Maximum sleep time in seconds.
    """
    # Biased toward shorter delays with occasional long pauses
    if random.random() < 0.15:
        # 15% chance of a longer "reading" pause
        delay = random.uniform(max_s * 0.7, max_s)
    else:
        delay = random.uniform(min_s, max_s * 0.5)

    logger.debug(f"Human delay: {delay:.2f}s")
    await asyncio.sleep(delay)


async def random_scroll(page: "Page") -> None:
    """
    Scroll the page in a human-like pattern — partial scrolls, pauses, occasional back-scroll.

    Args:
        page: An active Playwright Page instance.
    """
    try:
        # Get total page height
        total_height: int = await page.evaluate("document.body.scrollHeight")
        viewport_height: int = await page.evaluate("window.innerHeight")

        if total_height <= viewport_height:
            return

        current_pos = 0
        scroll_target = total_height

        while current_pos < scroll_target:
            # Random scroll amount (200–600px)
            step = random.randint(200, 600)
            current_pos = min(current_pos + step, scroll_target)

            await page.evaluate(f"window.scrollTo({{top: {current_pos}, behavior: 'smooth'}})")

            # Pause between scrolls (0.3–1.5s)
            await asyncio.sleep(random.uniform(0.3, 1.5))

            # 10% chance of scrolling back up slightly (human behavior)
            if random.random() < 0.10 and current_pos > 300:
                back_amount = random.randint(100, 300)
                current_pos = max(0, current_pos - back_amount)
                await page.evaluate(f"window.scrollTo({{top: {current_pos}, behavior: 'smooth'}})")
                await asyncio.sleep(random.uniform(0.2, 0.8))

        logger.debug(f"Random scroll complete: scrolled {total_height}px total")

    except Exception as exc:
        logger.debug(f"Scroll failed (non-critical): {exc}")


def is_blocked(response_or_html: Union["Response", str, None]) -> tuple[bool, str]:
    """
    Detect whether a response indicates a block, CAPTCHA, or bot-check.

    Args:
        response_or_html: A Playwright Response object, an HTML string, or None.

    Returns:
        A tuple of (is_blocked: bool, reason: str).
        reason is empty string if not blocked.
    """
    if response_or_html is None:
        return False, ""

    # Check HTTP status codes
    if hasattr(response_or_html, "status"):
        status: int = response_or_html.status
        if status == 403:
            return True, "HTTP 403 Forbidden"
        if status == 429:
            return True, "HTTP 429 Too Many Requests"
        if status == 503:
            return True, "HTTP 503 Service Unavailable"
        if status >= 500:
            return True, f"HTTP {status} Server Error"

    # Check HTML content for block indicators
    html: str = ""
    if isinstance(response_or_html, str):
        html = response_or_html.lower()
    elif hasattr(response_or_html, "text"):
        try:
            # Sync check — avoid blocking the event loop by checking the body attribute
            body = getattr(response_or_html, "_body", None)
            if body:
                html = body.decode("utf-8", errors="ignore").lower()
        except Exception:
            pass

    if html:
        for indicator in _BLOCK_INDICATORS:
            if indicator in html:
                return True, f"Block indicator found: '{indicator}'"

    return False, ""


async def is_blocked_async(page: "Page") -> tuple[bool, str]:
    """
    Async version — checks current page content for block indicators.

    Args:
        page: An active Playwright Page instance after navigation.

    Returns:
        A tuple of (is_blocked: bool, reason: str).
    """
    try:
        content = await page.content()
        return is_blocked(content.lower())
    except Exception as exc:
        logger.debug(f"Block check failed: {exc}")
        return False, ""
