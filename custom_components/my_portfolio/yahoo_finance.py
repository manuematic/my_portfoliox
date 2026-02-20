"""Yahoo Finance Kursabruf für Mein Portfolio.

Verwendet die inoffizielle JSON-API von Yahoo Finance (query1/query2),
die auch von der bekannten yfinance-Bibliothek genutzt wird.
Kein HTML-Scraping, kein Parsing von JavaScript – direktes JSON.

API-Endpunkt:
  https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=1d
  Antwort: chart.result[0].meta.regularMarketPrice
"""
from __future__ import annotations

import logging
import asyncio

import aiohttp

_LOGGER = logging.getLogger(__name__)

# Beide Hosts abwechselnd nutzen – Yahoo load-balanced darüber
_API_HOSTS = [
    "query1.finance.yahoo.com",
    "query2.finance.yahoo.com",
]

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8",
    "Referer": "https://finance.yahoo.com/",
    "Origin": "https://finance.yahoo.com",
}


async def fetch_stock_price(
    session: aiohttp.ClientSession,
    kuerzel: str,
    *,
    _host_index: int = 0,
) -> float | None:
    """Aktuellen Kurs von Yahoo Finance JSON-API abrufen.

    Versucht nacheinander query1 und query2 als Host.
    Gibt None zurück wenn kein Kurs ermittelt werden konnte.
    """
    symbol = kuerzel.upper()
    last_error: Exception | None = None

    for attempt, host in enumerate(_API_HOSTS):
        url = (
            f"https://{host}/v8/finance/chart/{symbol}"
            f"?interval=1d&range=1d&includePrePost=false"
        )
        try:
            async with session.get(
                url,
                headers=_HEADERS,
                timeout=aiohttp.ClientTimeout(total=15),
            ) as response:
                if response.status == 404:
                    _LOGGER.warning(
                        "Symbol '%s' nicht gefunden (404) auf %s", symbol, host
                    )
                    return None  # Kein Retry – Symbol existiert nicht

                if response.status == 429:
                    _LOGGER.warning(
                        "Rate-limit (429) auf %s für '%s' – versuche nächsten Host",
                        host, symbol,
                    )
                    await asyncio.sleep(1)
                    continue

                if response.status != 200:
                    _LOGGER.warning(
                        "HTTP %s von %s für '%s'", response.status, host, symbol
                    )
                    continue

                data = await response.json(content_type=None)

                # JSON-Struktur: chart → result[0] → meta → regularMarketPrice
                try:
                    result = data["chart"]["result"]
                    if not result:
                        _LOGGER.warning(
                            "Leeres Ergebnis von Yahoo für '%s'", symbol
                        )
                        return None

                    meta = result[0]["meta"]

                    # Bevorzugt: regularMarketPrice (aktueller Handelskurs)
                    price = meta.get("regularMarketPrice")
                    if price is not None:
                        _LOGGER.debug(
                            "Kurs für %s: %s (host=%s)", symbol, price, host
                        )
                        return float(price)

                    # Fallback: letzter Schlusskurs
                    price = meta.get("previousClose") or meta.get("chartPreviousClose")
                    if price is not None:
                        _LOGGER.debug(
                            "Kurs für %s (previousClose): %s", symbol, price
                        )
                        return float(price)

                    _LOGGER.warning(
                        "Kein Kursfeld in Yahoo-Antwort für '%s': %s",
                        symbol, list(meta.keys()),
                    )
                    return None

                except (KeyError, IndexError, TypeError) as parse_err:
                    _LOGGER.error(
                        "Fehler beim Parsen der Yahoo-Antwort für '%s': %s",
                        symbol, parse_err,
                    )
                    return None

        except aiohttp.ClientResponseError as err:
            _LOGGER.warning("HTTP-Fehler für '%s' auf %s: %s", symbol, host, err)
            last_error = err
        except aiohttp.ClientConnectionError as err:
            _LOGGER.warning("Verbindungsfehler für '%s' auf %s: %s", symbol, host, err)
            last_error = err
        except asyncio.TimeoutError:
            _LOGGER.warning("Timeout für '%s' auf %s", symbol, host)
            last_error = asyncio.TimeoutError()
        except Exception as err:  # pylint: disable=broad-except
            _LOGGER.error("Unerwarteter Fehler für '%s': %s", symbol, err)
            return None

    _LOGGER.error(
        "Kurs für '%s' konnte nicht abgerufen werden (beide Hosts fehlgeschlagen). "
        "Letzter Fehler: %s",
        symbol, last_error,
    )
    return None
