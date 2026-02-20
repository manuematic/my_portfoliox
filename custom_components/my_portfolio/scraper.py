"""HTML-Scraper für finanzen.net und finanzen100.de."""
from __future__ import annotations

import asyncio
import logging
import re

import aiohttp

from .const import HTTP_HEADERS

_LOGGER = logging.getLogger(__name__)

_SCRAPE_HEADERS = {
    **HTTP_HEADERS,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# ──────────────────────────────────────────────────────────────────────────────
# finanzen.net
# URL-Schema: https://www.finanzen.net/aktien/{name}-aktie
# Der Kurs steht in einem span mit Klasse "snapshot__value-current"
# Beispiel: https://www.finanzen.net/aktien/basf-aktie
# ──────────────────────────────────────────────────────────────────────────────

# Muster die in finanzen.net HTML gesucht werden
_FINANZEN_NET_PATTERNS = [
    # Eingebettetes JSON (sicherste Methode)
    r'"currentValue"\s*:\s*([\d]+[.,][\d]+)',
    r'"price"\s*:\s*"([\d]+[.,][\d]+)"',
    # HTML-Tag mit Kurs
    r'snapshot__value-current[^>]*>.*?<span[^>]*>([\d]+[.,][\d]*)</span>',
    r'data-push[^>]*value="([\d]+[.,][\d]*)"',
    # Fallback: erste große Dezimalzahl auf der Seite nach "Kurs"
    r'Kurs[^<]*<[^>]+>([\d]{1,6}[.,][\d]{1,4})',
]

_FINANZEN100_PATTERNS = [
    r'"price"\s*:\s*([\d]+\.[\d]+)',
    r'data-push[^>]*value="([\d]+\.[\d]*)"',
    r'class="[^"]*push[^"]*"[^>]*>([\d]+[.,][\d]+)',
    r'"currentPrice"\s*:\s*([\d]+\.[\d]+)',
]


def _parse_german_number(raw: str) -> float | None:
    """Deutschen Dezimalstring (1.234,56 oder 1234.56) in float konvertieren."""
    raw = raw.strip()
    if "," in raw and "." in raw:
        # Format: 1.234,56 → Punkte als Tausender, Komma als Dezimal
        raw = raw.replace(".", "").replace(",", ".")
    elif "," in raw:
        # Format: 1234,56 → Komma als Dezimal
        raw = raw.replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


async def fetch_price_html(
    session: aiohttp.ClientSession,
    url: str,
    source_name: str,
    patterns: list[str],
) -> float | None:
    """Generischer HTML-Scraper: lädt URL und sucht Kurs per Regex-Liste."""
    try:
        async with session.get(
            url,
            headers=_SCRAPE_HEADERS,
            timeout=aiohttp.ClientTimeout(total=20),
            allow_redirects=True,
        ) as resp:
            if resp.status != 200:
                _LOGGER.warning("%s: HTTP %s für %s", source_name, resp.status, url)
                return None

            html = await resp.text(errors="replace")

            for pattern in patterns:
                match = re.search(pattern, html, re.DOTALL | re.IGNORECASE)
                if match:
                    raw = match.group(1)
                    price = _parse_german_number(raw)
                    if price and price > 0:
                        _LOGGER.debug("%s: Kurs gefunden: %s (Pattern: %s)", source_name, price, pattern[:40])
                        return price

            _LOGGER.warning(
                "%s: Kein Kurs in HTML gefunden für %s (Seite: %d Zeichen)",
                source_name, url, len(html),
            )
            return None

    except asyncio.TimeoutError:
        _LOGGER.warning("%s: Timeout für %s", source_name, url)
        return None
    except aiohttp.ClientError as err:
        _LOGGER.warning("%s: Verbindungsfehler für %s: %s", source_name, url, err)
        return None
    except Exception as err:  # pylint: disable=broad-except
        _LOGGER.error("%s: Unerwarteter Fehler für %s: %s", source_name, url, err)
        return None


async def fetch_price_finanzen_net(
    session: aiohttp.ClientSession,
    url: str,
) -> float | None:
    """Kurs von finanzen.net scrapen."""
    return await fetch_price_html(session, url, "finanzen.net", _FINANZEN_NET_PATTERNS)


async def fetch_price_finanzen100(
    session: aiohttp.ClientSession,
    url: str,
) -> float | None:
    """Kurs von finanzen100.de scrapen."""
    return await fetch_price_html(session, url, "finanzen100", _FINANZEN100_PATTERNS)
