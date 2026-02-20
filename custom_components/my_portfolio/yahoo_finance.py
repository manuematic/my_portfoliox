"""Yahoo Finance Kursabruf via JSON-API."""
from __future__ import annotations

import asyncio
import logging

import aiohttp

from .const import YAHOO_API_HOSTS, HTTP_HEADERS

_LOGGER = logging.getLogger(__name__)

_YAHOO_HEADERS = {
    **HTTP_HEADERS,
    "Accept": "application/json,text/plain,*/*",
    "Origin": "https://finance.yahoo.com",
}


async def fetch_price_yahoo(
    session: aiohttp.ClientSession,
    kuerzel: str,
) -> float | None:
    """Kurs von Yahoo Finance JSON-API abrufen (query1 / query2 Fallback)."""
    symbol = kuerzel.upper()

    for host in YAHOO_API_HOSTS:
        url = (
            f"https://{host}/v8/finance/chart/{symbol}"
            f"?interval=1d&range=1d&includePrePost=false"
        )
        try:
            async with session.get(
                url, headers=_YAHOO_HEADERS, timeout=aiohttp.ClientTimeout(total=15)
            ) as resp:
                if resp.status == 404:
                    _LOGGER.warning("Yahoo: Symbol '%s' nicht gefunden (404)", symbol)
                    return None
                if resp.status == 429:
                    _LOGGER.warning("Yahoo: Rate-limit für '%s', versuche nächsten Host", symbol)
                    await asyncio.sleep(1)
                    continue
                if resp.status != 200:
                    _LOGGER.warning("Yahoo: HTTP %s für '%s'", resp.status, symbol)
                    continue

                data = await resp.json(content_type=None)
                result = data.get("chart", {}).get("result") or []
                if not result:
                    _LOGGER.warning("Yahoo: Leeres Ergebnis für '%s'", symbol)
                    return None

                meta = result[0].get("meta", {})
                price = meta.get("regularMarketPrice") or meta.get("previousClose")
                if price is not None:
                    _LOGGER.debug("Yahoo: Kurs %s = %s", symbol, price)
                    return float(price)

                _LOGGER.warning("Yahoo: Kein Kursfeld für '%s' in %s", symbol, list(meta.keys()))
                return None

        except (aiohttp.ClientError, asyncio.TimeoutError) as err:
            _LOGGER.warning("Yahoo: Verbindungsfehler für '%s' auf %s: %s", symbol, host, err)
        except Exception as err:  # pylint: disable=broad-except
            _LOGGER.error("Yahoo: Unerwarteter Fehler für '%s': %s", symbol, err)
            return None

    _LOGGER.error("Yahoo: Kurs für '%s' nicht abrufbar (alle Hosts fehlgeschlagen)", symbol)
    return None
