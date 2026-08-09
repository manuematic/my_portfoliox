"""OnVista – Technik-, Dividenden-, Termin- und Analystendaten (unauthentifizierte JSON-API).

Ablauf pro ISIN (siehe coordinator._update_onvista_data, einmal täglich ab 8 Uhr):
  1. GET .../stocks/ISIN:{isin}/snapshot        -> stocksCnTechnical, stocksCnFundamentalList
  2. GET .../stocks/{entityValue}/analyzer_recommendations -> Kursziele + Konsens
  3. GET https://www.onvista.de/aktien/{isin}   -> __NEXT_DATA__ / calendarEvents (best effort)
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone

import aiohttp

from .const import (
    ONVISTA_SNAPSHOT_URL,
    ONVISTA_ANALYZER_URL,
    ONVISTA_STOCK_PAGE_URL,
    ATTR_OV_SMA_20,
    ATTR_OV_SMA_200,
    ATTR_OV_RSL_30,
    ATTR_OV_RSL_250,
    ATTR_OV_MOMENTUM_30,
    ATTR_OV_MOMENTUM_250,
    ATTR_OV_DIVIDENDE,
    ATTR_OV_DIVIDENDE_RENDITE,
    ATTR_OV_NAECHSTER_TERMIN,
    ATTR_OV_SIGNAL,
    ATTR_OV_KZ_MITTEL,
    ATTR_OV_KZ_HOCH,
    ATTR_OV_KZ_TIEF,
    ATTR_OV_ANALYSTEN_ANZAHL,
    ATTR_OV_ANALYSTEN_KONSENS,
    ATTR_OV_ANALYSTEN_BUY,
    ATTR_OV_ANALYSTEN_HOLD,
    ATTR_OV_ANALYSTEN_SELL,
)

_LOGGER = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/html;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8",
}

_NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.S
)

# Konsens-Skala von OnVista: 1 = Strong Buy ... 5 = Strong Sell
_KONSENS_STEPS = [
    (1.5, "Kaufen (stark)"),
    (2.5, "Kaufen"),
    (3.5, "Halten"),
    (4.5, "Verkaufen"),
]
_KONSENS_FALLBACK = "Verkaufen (stark)"

_RESULT_KEYS = (
    ATTR_OV_SMA_20, ATTR_OV_SMA_200,
    ATTR_OV_RSL_30, ATTR_OV_RSL_250,
    ATTR_OV_MOMENTUM_30, ATTR_OV_MOMENTUM_250,
    ATTR_OV_DIVIDENDE, ATTR_OV_DIVIDENDE_RENDITE,
    ATTR_OV_NAECHSTER_TERMIN, ATTR_OV_SIGNAL,
    ATTR_OV_KZ_MITTEL, ATTR_OV_KZ_HOCH, ATTR_OV_KZ_TIEF,
    ATTR_OV_ANALYSTEN_ANZAHL, ATTR_OV_ANALYSTEN_KONSENS,
    ATTR_OV_ANALYSTEN_BUY, ATTR_OV_ANALYSTEN_HOLD, ATTR_OV_ANALYSTEN_SELL,
)


def _empty_result() -> dict:
    return {key: None for key in _RESULT_KEYS}


async def fetch_onvista_data(session: aiohttp.ClientSession, isin: str) -> dict:
    """Holt Technik-, Dividenden-, Termin- und Analystendaten von onvista.de für eine ISIN."""
    isin = (isin or "").strip().upper()
    result = _empty_result()
    if not isin:
        return result

    entity_value: str | None = None
    rsi_20: float | None = None

    try:
        url = ONVISTA_SNAPSHOT_URL.format(isin=isin)
        async with session.get(
            url, headers=_HEADERS, timeout=aiohttp.ClientTimeout(total=12)
        ) as resp:
            if resp.status == 200:
                snapshot = await resp.json(content_type=None)
                entity_value = str(
                    (snapshot.get("instrument") or {}).get("entityValue") or ""
                ) or None
                rsi_20 = _parse_technical(snapshot, result)
                _parse_dividend(snapshot, result)
            else:
                _LOGGER.debug("OnVista Snapshot: HTTP %s für ISIN '%s'", resp.status, isin)
    except Exception as exc:  # pylint: disable=broad-except
        _LOGGER.debug("OnVista Snapshot-Fehler für ISIN '%s': %s", isin, exc)

    if entity_value:
        try:
            url2 = ONVISTA_ANALYZER_URL.format(entity_value=entity_value)
            async with session.get(
                url2, headers=_HEADERS, timeout=aiohttp.ClientTimeout(total=12)
            ) as resp:
                if resp.status == 200:
                    recommendations = await resp.json(content_type=None)
                    _parse_analyst(recommendations, result)
                else:
                    _LOGGER.debug(
                        "OnVista Analyzer: HTTP %s für entityValue '%s'", resp.status, entity_value
                    )
        except Exception as exc:  # pylint: disable=broad-except
            _LOGGER.debug("OnVista Analyzer-Fehler für ISIN '%s': %s", isin, exc)

    try:
        await _fetch_next_event(session, isin, result)
    except Exception as exc:  # pylint: disable=broad-except
        _LOGGER.debug("OnVista Termine-Fehler für ISIN '%s': %s", isin, exc)

    result[ATTR_OV_SIGNAL] = _compute_signal(rsi_20)
    return result


def _parse_technical(snapshot: dict, result: dict) -> float | None:
    """SMA/RSL/Momentum aus stocksCnTechnical übernehmen, gibt RSI(20) für das Signal zurück."""
    tech = snapshot.get("stocksCnTechnical") or {}
    result[ATTR_OV_SMA_20]       = tech.get("movingAverage20")
    result[ATTR_OV_SMA_200]      = tech.get("movingAverage200")
    result[ATTR_OV_RSL_30]       = tech.get("relativeStrengthLevy30")
    result[ATTR_OV_RSL_250]      = tech.get("relativeStrengthLevy250")
    result[ATTR_OV_MOMENTUM_30]  = tech.get("momentum30")
    result[ATTR_OV_MOMENTUM_250] = tech.get("momentum250")
    return tech.get("relativeStrengthIndexWilder20")


def _parse_dividend(snapshot: dict, result: dict) -> None:
    """Letzte bereits ausgeschüttete Dividende (Ex-Datum <= heute) aus stocksCnFundamentalList."""
    entries = ((snapshot.get("stocksCnFundamentalList") or {}).get("list")) or []
    now = datetime.now(timezone.utc)
    best_date: datetime | None = None
    best_dps: float | None = None
    best_yield: float | None = None

    for entry in entries:
        ex_div = entry.get("dateExDividend")
        dps = entry.get("cnDps")
        if not ex_div or dps is None:
            continue
        try:
            when = datetime.fromisoformat(ex_div.replace("Z", "+00:00"))
        except ValueError:
            continue
        if when <= now and (best_date is None or when > best_date):
            best_date = when
            best_dps = dps
            best_yield = entry.get("cnDivYield")

    if best_dps is not None:
        result[ATTR_OV_DIVIDENDE] = round(float(best_dps), 3)
    if best_yield is not None:
        result[ATTR_OV_DIVIDENDE_RENDITE] = round(float(best_yield), 2)


def _parse_analyst(recommendations: dict, result: dict) -> None:
    result[ATTR_OV_KZ_MITTEL] = recommendations.get("avgTargetPrice")
    result[ATTR_OV_KZ_HOCH]   = recommendations.get("maxTargetPrice")
    result[ATTR_OV_KZ_TIEF]   = recommendations.get("minTargetPrice")
    result[ATTR_OV_ANALYSTEN_ANZAHL] = recommendations.get("numTotal")
    result[ATTR_OV_ANALYSTEN_BUY]  = (
        (recommendations.get("numBuy") or 0) + (recommendations.get("numStrongBuy") or 0)
    )
    result[ATTR_OV_ANALYSTEN_HOLD] = recommendations.get("numHold")
    result[ATTR_OV_ANALYSTEN_SELL] = (
        (recommendations.get("numSell") or 0) + (recommendations.get("numStrongSell") or 0)
    )

    consensus = recommendations.get("recommendationConsensus")
    if consensus is not None:
        label = _KONSENS_FALLBACK
        for threshold, text in _KONSENS_STEPS:
            if consensus <= threshold:
                label = text
                break
        result[ATTR_OV_ANALYSTEN_KONSENS] = label


def _compute_signal(rsi_20: float | None) -> str | None:
    """Überkauft/Überverkauft-Signal aus dem Wilder-RSI(20) ableiten (klassische 30/70-Schwellen)."""
    if rsi_20 is None:
        return None
    if rsi_20 >= 70:
        return f"Überkauft (RSI {rsi_20:.0f})"
    if rsi_20 <= 30:
        return f"Überverkauft (RSI {rsi_20:.0f})"
    return f"Neutral (RSI {rsi_20:.0f})"


async def _fetch_next_event(session: aiohttp.ClientSession, isin: str, result: dict) -> None:
    """Nächsten Unternehmenstermin aus dem __NEXT_DATA__-Block der Aktienseite lesen (best effort)."""
    url = ONVISTA_STOCK_PAGE_URL.format(isin=isin)
    async with session.get(
        url, headers=_HEADERS, timeout=aiohttp.ClientTimeout(total=12), allow_redirects=True
    ) as resp:
        if resp.status != 200:
            return
        html = await resp.text()

    match = _NEXT_DATA_RE.search(html)
    if not match:
        return

    next_data = json.loads(match.group(1))
    events = (
        next_data.get("props", {})
        .get("pageProps", {})
        .get("data", {})
        .get("calendarEvents")
        or []
    )
    if not events:
        return

    first = events[0]
    when = first.get("datetimeStart") or first.get("datetimeEnd")
    title = (
        (first.get("stocksCompanyEvent") or {}).get("companyEvent", {}).get("eventName")
        or first.get("name")
        or ""
    )
    if not when:
        return

    try:
        event_date = datetime.fromisoformat(when.replace("Z", "+00:00"))
        datum = event_date.strftime("%d.%m.%Y")
    except ValueError:
        datum = when[:10]

    result[ATTR_OV_NAECHSTER_TERMIN] = f"{datum}: {title}".strip(": ")
