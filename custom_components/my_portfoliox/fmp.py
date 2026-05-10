"""Financial Modeling Prep API – Analysten-Kursziele."""
from __future__ import annotations

import logging
from typing import TypedDict

import aiohttp

from .const import FMP_BASE_URL

_LOGGER = logging.getLogger(__name__)


class AnalystData(TypedDict, total=False):
    kursziel_hoch:     float | None
    kursziel_tief:     float | None
    kursziel_mittel:   float | None
    analysten_anzahl:  int   | None
    analysten_konsens: str   | None   # "Buy" / "Hold" / "Sell"
    kursziel_datum:    str   | None


async def fetch_analyst_data(
    session: aiohttp.ClientSession,
    symbol: str,
    api_key: str,
) -> AnalystData:
    """Holt Analysten-Kursziele von FMP für ein Symbol."""

    result: AnalystData = {
        "kursziel_hoch":     None,
        "kursziel_tief":     None,
        "kursziel_mittel":   None,
        "analysten_anzahl":  None,
        "analysten_konsens": None,
        "kursziel_datum":    None,
    }

    # FMP erwartet für Deutsche Aktien z.B. "SAP.DE" → intern oft ohne ".DE"
    # Wir versuchen beides, beginnend mit dem Original-Symbol.
    symbols_to_try = [symbol]
    if symbol.upper().endswith(".DE"):
        symbols_to_try.append(symbol[:-3])   # z.B. "SAP"

    for sym in symbols_to_try:
        url = f"{FMP_BASE_URL}/analyst-stock-recommendations/{sym}?apikey={api_key}"
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status != 200:
                    continue
                data = await resp.json()
                if not data or not isinstance(data, list):
                    continue

                # Neueste Empfehlung nehmen (sortiert nach Datum desc)
                latest = data[0]
                result["analysten_konsens"] = latest.get("analystRatingsbuy") and "Buy" \
                    or latest.get("analystRatingsStrongBuy") and "Strong Buy" \
                    or latest.get("analystRatingsHold") and "Hold" \
                    or latest.get("analystRatingsSell") and "Sell" \
                    or "–"
                result["kursziel_datum"] = latest.get("date", "")
                # Analysten-Summen
                n_buy  = int(latest.get("analystRatingsbuy")       or 0)
                n_sbuy = int(latest.get("analystRatingsStrongBuy") or 0)
                n_hold = int(latest.get("analystRatingsHold")      or 0)
                n_sell = int(latest.get("analystRatingsSell")      or 0)
                n_ss   = int(latest.get("analystRatingsStrongSell")or 0)
                total  = n_buy + n_sbuy + n_hold + n_sell + n_ss
                result["analysten_anzahl"] = total if total > 0 else None
                # Konsens aus Mehrheit
                if total > 0:
                    if (n_buy + n_sbuy) > total * 0.5:
                        result["analysten_konsens"] = "Buy"
                    elif (n_sell + n_ss) > total * 0.5:
                        result["analysten_konsens"] = "Sell"
                    else:
                        result["analysten_konsens"] = "Hold"
        except Exception as exc:
            _LOGGER.debug("FMP recommendations error for %s: %s", sym, exc)

        # Kursziele aus price-target Endpoint
        url2 = f"{FMP_BASE_URL}/price-target?symbol={sym}&apikey={api_key}"
        try:
            async with session.get(url2, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status != 200:
                    continue
                data2 = await resp.json()
                if not data2 or not isinstance(data2, list):
                    continue

                # Letzten 12 Monate für Hoch/Tief/Mittel berechnen
                from datetime import datetime, timedelta
                cutoff = datetime.now() - timedelta(days=365)
                recent = []
                for entry in data2:
                    try:
                        d = datetime.strptime(entry.get("publishedDate", "")[:10], "%Y-%m-%d")
                        if d >= cutoff:
                            pt = float(entry.get("priceTarget") or 0)
                            if pt > 0:
                                recent.append(pt)
                    except Exception:
                        pass

                if recent:
                    result["kursziel_hoch"]   = round(max(recent), 2)
                    result["kursziel_tief"]   = round(min(recent), 2)
                    result["kursziel_mittel"] = round(sum(recent) / len(recent), 2)
                    if not result["analysten_anzahl"]:
                        result["analysten_anzahl"] = len(recent)
                    # Datum der neuesten Empfehlung
                    if data2[0].get("publishedDate"):
                        result["kursziel_datum"] = data2[0]["publishedDate"][:10]
                    break  # Erfolg – kein zweites Symbol nötig

        except Exception as exc:
            _LOGGER.debug("FMP price-target error for %s: %s", sym, exc)

    return result
