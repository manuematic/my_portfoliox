"""ING Wertpapiere API – Kursabruf via component-api."""
from __future__ import annotations

import asyncio
import logging

import aiohttp

_LOGGER = logging.getLogger(__name__)

# Korrekter Endpunkt (getestet 2026-04-23)
# GET /api/v1/instrument-header?isinOrSearchTerm={ISIN}
# Antwort-Felder:
#   price           – aktueller Kurs (Direkthandel/Tradegate)
#   changeAbsolute  – Tagesveränderung absolut in €
#   changePercent   – Tagesveränderung in %
#   bid / ask       – Geld/Brief
#   priceChangeDate – Zeitstempel des Kurses
#   name            – Wertpapier-Name
#   exchangeName    – Handelsplatz (z.B. "Direkthandel")
ING_API_BASE = "https://component-api.wertpapiere.ing.de/api/v1"

_ING_HEADERS = {
    "Accept":          "application/json, text/plain, */*",
    "Accept-Language": "de-DE,de;q=0.9",
    "Origin":          "https://www.ing.de",
    "Referer":         "https://www.ing.de/",
    "User-Agent":      (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
}

_EMPTY = {
    "aktueller_kurs":      None,
    "kurs_vortag":         None,
    "tages_aenderung_abs": None,
    "tages_aenderung_pct": None,
}


async def fetch_price_ing(
    session: aiohttp.ClientSession,
    isin: str,
) -> dict:
    """Aktuellen Kurs von der ING-API abrufen."""
    isin = isin.strip().upper()
    if not isin:
        _LOGGER.warning("ING: Leere ISIN uebergeben")
        return _EMPTY.copy()

    url = f"{ING_API_BASE}/instrument-header"
    params = {"isinOrSearchTerm": isin}

    try:
        async with session.get(
            url,
            params=params,
            headers=_ING_HEADERS,
            timeout=aiohttp.ClientTimeout(total=15),
        ) as resp:
            if resp.status == 404:
                _LOGGER.warning("ING: ISIN '%s' nicht gefunden (404)", isin)
                return _EMPTY.copy()
            if resp.status == 403:
                _LOGGER.warning("ING: Zugriff verweigert fuer '%s' (403)", isin)
                return _EMPTY.copy()
            if resp.status != 200:
                _LOGGER.warning("ING: HTTP %s fuer ISIN '%s'", resp.status, isin)
                return _EMPTY.copy()

            data = await resp.json(content_type=None)

            kurs      = data.get("price")
            tages_abs = data.get("changeAbsolute")
            tages_pct = data.get("changePercent")

            if kurs is None:
                _LOGGER.warning(
                    "ING: Kein 'price'-Feld fuer ISIN '%s'. "
                    "Verfuegbare Felder: %s", isin, list(data.keys())
                )
                return _EMPTY.copy()

            kurs      = float(kurs)
            tages_abs = float(tages_abs) if tages_abs is not None else None
            tages_pct = float(tages_pct) if tages_pct is not None else None

            # Vortag berechnen: price - changeAbsolute
            vortag = None
            if tages_abs is not None:
                vortag = round(kurs - tages_abs, 5)

            _LOGGER.debug(
                "ING: %s kurs=%.4f abs=%s pct=%s",
                isin, kurs, tages_abs, tages_pct
            )
            return {
                "aktueller_kurs":      round(kurs, 5),
                "kurs_vortag":         vortag,
                "tages_aenderung_abs": round(tages_abs, 4) if tages_abs is not None else None,
                "tages_aenderung_pct": round(tages_pct, 4) if tages_pct is not None else None,
            }

    except (aiohttp.ClientError, asyncio.TimeoutError) as err:
        _LOGGER.warning("ING: Verbindungsfehler fuer ISIN '%s': %s", isin, err)
    except Exception as err:  # pylint: disable=broad-except
        _LOGGER.error("ING: Unerwarteter Fehler fuer ISIN '%s': %s", isin, err)

    return _EMPTY.copy()
