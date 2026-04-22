"""ING Wertpapiere API – Kursabruf via component-api."""
from __future__ import annotations

import asyncio
import logging
from typing import TypedDict

import aiohttp

_LOGGER = logging.getLogger(__name__)

ING_API_BASE = "https://component-api.wertpapiere.ing.de/api/v1/components"

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


class PriceData(TypedDict, total=False):
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


async def fetch_price_ing(
    session: aiohttp.ClientSession,
    isin: str,
) -> PriceData:
    """Aktuellen Kurs einer Aktie von der ING-API abrufen.

    Endpunkt: GET /api/v1/components/instrumentheader/{ISIN}
    Antwort-Felder (relevante Auswahl):
      $.price              – aktueller Kurs
      $.previousPrice      – Vortages-Schlusskurs
      $.priceChangeAbsolut – Tagesveränderung absolut
      $.priceChangePercent – Tagesveränderung in %
      $.priceChangeDate    – Datum/Zeit des Kurses
      $.currency           – Währung
      $.name               – Wertpapier-Name
    """
    isin = isin.strip().upper()
    if not isin:
        _LOGGER.warning("ING: Leere ISIN übergeben")
        return _EMPTY.copy()

    url = f"{ING_API_BASE}/instrumentheader/{isin}"
    try:
        async with session.get(
            url,
            headers=_ING_HEADERS,
            timeout=aiohttp.ClientTimeout(total=15),
        ) as resp:
            if resp.status == 404:
                _LOGGER.warning("ING: ISIN '%s' nicht gefunden (404)", isin)
                return _EMPTY.copy()
            if resp.status == 403:
                _LOGGER.warning(
                    "ING: Zugriff verweigert für ISIN '%s' (403) – "
                    "API ggf. nur aus Deutschland erreichbar", isin
                )
                return _EMPTY.copy()
            if resp.status != 200:
                _LOGGER.warning("ING: HTTP %s für ISIN '%s'", resp.status, isin)
                return _EMPTY.copy()

            data = await resp.json(content_type=None)

            kurs       = data.get("price")
            vortag     = data.get("previousPrice")
            tages_abs  = data.get("priceChangeAbsolut")   # ING-Schreibweise
            tages_pct  = data.get("priceChangePercent")

            # Fallback: selbst berechnen wenn ING-Felder fehlen
            if kurs is not None and vortag and tages_abs is None:
                tages_abs = round(float(kurs) - float(vortag), 4)
            if kurs is not None and vortag and tages_pct is None and float(vortag) != 0:
                tages_pct = (float(kurs) - float(vortag)) / float(vortag) * 100.0

            result: PriceData = {
                "aktueller_kurs":      round(float(kurs), 5)      if kurs      is not None else None,
                "kurs_vortag":         round(float(vortag), 5)    if vortag    is not None else None,
                "tages_aenderung_abs": round(float(tages_abs), 3) if tages_abs is not None else None,
                "tages_aenderung_pct": round(float(tages_pct), 2) if tages_pct is not None else None,
            }

            _LOGGER.debug(
                "ING: %s kurs=%.3f vortag=%s tages_pct=%s",
                isin,
                float(kurs) if kurs else 0,
                vortag,
                tages_pct,
            )
            return result

    except (aiohttp.ClientError, asyncio.TimeoutError) as err:
        _LOGGER.warning("ING: Verbindungsfehler für ISIN '%s': %s", isin, err)
    except Exception as err:  # pylint: disable=broad-except
        _LOGGER.error("ING: Unerwarteter Fehler für ISIN '%s': %s", isin, err)

    return _EMPTY.copy()
