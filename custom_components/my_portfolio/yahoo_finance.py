"""Yahoo Finance Kursabruf via JSON-API."""
from __future__ import annotations

import asyncio
import logging
from typing import TypedDict

import aiohttp

from .const import YAHOO_API_HOSTS, HTTP_HEADERS

_LOGGER = logging.getLogger(__name__)

_YAHOO_HEADERS = {
    **HTTP_HEADERS,
    "Accept": "application/json,text/plain,*/*",
    "Origin": "https://finance.yahoo.com",
}


class PriceData(TypedDict, total=False):
    """Rückgabestruktur eines Kursabrufs."""
    aktueller_kurs:       float | None
    kurs_vortag:          float | None
    tages_aenderung_abs:  float | None
    tages_aenderung_pct:  float | None


_EMPTY: PriceData = {
    "aktueller_kurs":      None,
    "kurs_vortag":         None,
    "tages_aenderung_abs": None,
    "tages_aenderung_pct": None,
}


async def fetch_price_yahoo(
    session: aiohttp.ClientSession,
    kuerzel: str,
) -> PriceData:
    """Kurs + Tagesdaten von Yahoo Finance JSON-API abrufen."""
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
                    return _EMPTY.copy()
                if resp.status == 429:
                    _LOGGER.warning("Yahoo: Rate-limit für '%s', nächster Host", symbol)
                    await asyncio.sleep(1)
                    continue
                if resp.status != 200:
                    _LOGGER.warning("Yahoo: HTTP %s für '%s'", resp.status, symbol)
                    continue

                data = await resp.json(content_type=None)
                result = data.get("chart", {}).get("result") or []
                if not result:
                    _LOGGER.warning("Yahoo: Leeres Ergebnis für '%s'", symbol)
                    return _EMPTY.copy()

                meta = result[0].get("meta", {})

                # ── Aktueller Kurs ─────────────────────────────────────────
                kurs = meta.get("regularMarketPrice")
                if kurs is None:
                    kurs = meta.get("previousClose")   # Fallback außerhalb Handelszeit

                # ── Vortag & Tagesänderung ─────────────────────────────────
                vortag = meta.get("previousClose") or meta.get("chartPreviousClose")

                # Yahoo liefert regularMarketChange und regularMarketChangePercent
                tages_abs = meta.get("regularMarketChange")
                tages_pct = meta.get("regularMarketChangePercent")

                # Fallback: selbst berechnen wenn Yahoo-Felder fehlen
                if kurs is not None and vortag and tages_abs is None:
                    tages_abs = kurs - vortag
                if kurs is not None and vortag and tages_pct is None and vortag != 0:
                    tages_pct = (kurs - vortag) / vortag * 100.0

                result_data: PriceData = {
                    "aktueller_kurs":      round(float(kurs), 5)       if kurs      is not None else None,
                    "kurs_vortag":         round(float(vortag), 5)     if vortag    is not None else None,
                    "tages_aenderung_abs": round(float(tages_abs), 3)  if tages_abs is not None else None,
                    "tages_aenderung_pct": round(float(tages_pct), 2)  if tages_pct is not None else None,
                }

                _LOGGER.debug(
                    "Yahoo: %s kurs=%.3f vortag=%s tages_pct=%s",
                    symbol,
                    kurs or 0,
                    vortag,
                    tages_pct,
                )
                return result_data

        except (aiohttp.ClientError, asyncio.TimeoutError) as err:
            _LOGGER.warning("Yahoo: Verbindungsfehler '%s' auf %s: %s", symbol, host, err)
        except Exception as err:  # pylint: disable=broad-except
            _LOGGER.error("Yahoo: Unerwarteter Fehler '%s': %s", symbol, err)
            return _EMPTY.copy()

    _LOGGER.error("Yahoo: '%s' nicht abrufbar (alle Hosts fehlgeschlagen)", symbol)
    return _EMPTY.copy()
