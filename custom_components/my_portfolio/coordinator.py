"""DataUpdateCoordinator für Mein Portfolio."""
from __future__ import annotations

import logging
import uuid
from datetime import timedelta

import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.helpers.storage import Store

from .const import (
    DOMAIN,
    CONF_FMP_API_KEY,
    STORAGE_KEY,
    STORAGE_VERSION,
    DEFAULT_SCAN_INTERVAL,
    DEFAULT_SOURCE,
    SOURCE_ING,
    SOURCE_YAHOO,
    CONF_DATA_SOURCE,
    ATTR_DATENQUELLE,
    ATTR_ISIN,
    ATTR_BEZEICHNUNG,
    ATTR_KUERZEL,
    ATTR_WKN,
    ATTR_ISIN,
    ATTR_PREIS,
    ATTR_STUECKZAHL,
    ATTR_KAUFDATUM,
    ATTR_LIMIT_OBEN,
    ATTR_LIMIT_UNTEN,
    ATTR_ALARM_OBEN,
    ATTR_ALARM_UNTEN,
    ATTR_GEWINN,
    ATTR_KURS_VORTAG,
    ATTR_TAGES_ABS,
    ATTR_TAGES_PCT,
    ATTR_KZ_HOCH,
    ATTR_KZ_TIEF,
    ATTR_KZ_MITTEL,
    ATTR_KZ_ANZAHL,
    ATTR_KZ_KONSENS,
    ATTR_KZ_DATUM,
    ATTR_AKTUELLER_KURS,
    ATTR_GESAMT_INVEST,
    ATTR_GESAMT_WERT,
    ATTR_PORTFOLIO_DIFFERENZ,
    ATTR_PORTFOLIO_PROZENT,
)
from .yahoo_finance import fetch_price_yahoo
from .ing import fetch_price_ing

_LOGGER = logging.getLogger(__name__)


class MyPortfolioCoordinator(DataUpdateCoordinator):
    """Coordinator: Kurse abrufen und Portfolio-Daten verwalten."""

    def __init__(
        self,
        hass: HomeAssistant,
        portfolio_name: str,
        entry_id: str,
        scan_interval: int = DEFAULT_SCAN_INTERVAL,
        data_source: str = DEFAULT_SOURCE,
    ) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN}_{entry_id}",
            update_interval=timedelta(minutes=scan_interval),
        )
        self.portfolio_name = portfolio_name
        self.entry_id = entry_id
        self.data_source = data_source
        self._store = Store(hass, STORAGE_VERSION, f"{STORAGE_KEY}.{entry_id}")
        self._stocks: dict[str, dict] = {}
        self._session: aiohttp.ClientSession | None = None
        self.portfolio_summary: dict = {
            ATTR_GESAMT_INVEST: None,
            ATTR_GESAMT_WERT: None,
            ATTR_PORTFOLIO_DIFFERENZ: None,
            ATTR_PORTFOLIO_PROZENT: None,
        }

    async def async_setup(self) -> None:
        """Gespeicherte Portfolio-Daten laden."""
        stored = await self._store.async_load()
        if stored and "stocks" in stored:
            self._stocks = stored["stocks"]
        _LOGGER.debug(
            "Portfolio '%s' geladen – %d Aktien, Quelle: %s",
            self.portfolio_name, len(self._stocks), self.data_source,
        )

    async def _fetch_price(self, stock: dict) -> dict:
        """Kurs abrufen – Quelle pro Aktie wählbar (ING via ISIN oder Yahoo via Kürzel)."""
        # Quelle pro Aktie hat Vorrang, sonst Portfolio-Default
        quelle = stock.get(ATTR_DATENQUELLE) or self.data_source

        if quelle == SOURCE_ING:
            isin = (stock.get(ATTR_ISIN) or "").strip()
            if isin:
                return await fetch_price_ing(self._session, isin)
            # Kein ISIN → Fallback auf Yahoo
            _LOGGER.warning(
                "ING gewählt aber kein ISIN für '%s' – Fallback auf Yahoo",
                stock.get(ATTR_KUERZEL, "?"),
            )

        # Yahoo Finance (Default-Fallback)
        return await fetch_price_yahoo(self._session, stock.get(ATTR_KUERZEL, ""))

    async def _async_update_data(self) -> dict[str, dict]:
        """Aktuelle Kurse für alle Aktien abrufen und Felder berechnen."""
        if not self._stocks:
            return {}

        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()

        updated_data: dict[str, dict] = {}

        for stock_id, stock in self._stocks.items():
            price_data = await self._fetch_price(stock)
            aktueller_kurs = price_data.get("aktueller_kurs")

            # Letzten bekannten Kurs behalten wenn Abruf fehlschlägt
            if aktueller_kurs is None:
                aktueller_kurs = stock.get(ATTR_AKTUELLER_KURS)

            stock_data = dict(stock)
            stock_data[ATTR_AKTUELLER_KURS] = aktueller_kurs
            # Tagesdaten – nur überschreiben wenn frisch abgerufen
            stock_data[ATTR_KURS_VORTAG]  = price_data.get("kurs_vortag")          or stock.get(ATTR_KURS_VORTAG)
            stock_data[ATTR_TAGES_ABS]    = price_data.get("tages_aenderung_abs")  or stock.get(ATTR_TAGES_ABS)
            stock_data[ATTR_TAGES_PCT]    = price_data.get("tages_aenderung_pct")  or stock.get(ATTR_TAGES_PCT)

            preis = stock.get(ATTR_PREIS) or 0.0

            # ── Gewinn: prozentualer Kursgewinn seit Kauf ──────────────────
            # Formel: ((Aktueller Kurs - Kaufpreis) * 100 / Kaufpreis)  float 3,2
            if aktueller_kurs is not None and preis:
                gewinn_pct = (aktueller_kurs - preis) * 100.0 / preis
                stock_data[ATTR_GEWINN] = round(gewinn_pct, 2)
            else:
                stock_data[ATTR_GEWINN] = None

            # ── Kurs-Alarme ────────────────────────────────────────────────
            limit_oben = stock.get(ATTR_LIMIT_OBEN)
            limit_unten = stock.get(ATTR_LIMIT_UNTEN)

            if aktueller_kurs is not None:
                stock_data[ATTR_ALARM_OBEN] = bool(
                    limit_oben and limit_oben > 0 and aktueller_kurs > limit_oben
                )
                stock_data[ATTR_ALARM_UNTEN] = bool(
                    limit_unten and limit_unten > 0 and aktueller_kurs < limit_unten
                )
            else:
                stock_data[ATTR_ALARM_OBEN] = False
                stock_data[ATTR_ALARM_UNTEN] = False

            updated_data[stock_id] = stock_data

        # ── Portfolio-Gesamtwerte ──────────────────────────────────────────
        gesamt_invest = 0.0
        gesamt_wert = 0.0
        all_prices_available = True

        for stock_id, stock in self._stocks.items():
            preis = stock.get(ATTR_PREIS) or 0.0
            stueckzahl = float(stock.get(ATTR_STUECKZAHL) or 0)
            aktueller_kurs = updated_data.get(stock_id, {}).get(ATTR_AKTUELLER_KURS)

            gesamt_invest += preis * stueckzahl

            if aktueller_kurs is not None:
                gesamt_wert += aktueller_kurs * stueckzahl
            else:
                all_prices_available = False

        gesamt_invest = round(gesamt_invest, 3)
        gesamt_wert = round(gesamt_wert, 3) if all_prices_available else None

        # portfoliodifferenz = gesamtwert - gesamtinvest    float 7,3
        portfolio_differenz = (
            round(gesamt_wert - gesamt_invest, 3)
            if gesamt_wert is not None else None
        )

        # portfolioprozent = (gesamtwert - gesamtinvest) * 100 / gesamtinvest  float 4,2
        portfolio_prozent = (
            round((gesamt_wert - gesamt_invest) * 100.0 / gesamt_invest, 2)
            if gesamt_wert is not None and gesamt_invest else None
        )

        self.portfolio_summary = {
            ATTR_GESAMT_INVEST:       gesamt_invest,
            ATTR_GESAMT_WERT:         gesamt_wert,
            ATTR_PORTFOLIO_DIFFERENZ: portfolio_differenz,
            ATTR_PORTFOLIO_PROZENT:   portfolio_prozent,
        }

        # FMP Analysten-Daten (einmal täglich, nur wenn API-Key gesetzt)
        fmp_key = (
            self.config_entry.options.get(CONF_FMP_API_KEY, "")
            or self.config_entry.data.get(CONF_FMP_API_KEY, "")
        )
        if fmp_key and fmp_key.strip():
            await self._update_analyst_data(fmp_key.strip(), updated_data)

        return updated_data

    # ── Portfolio-Verwaltung ───────────────────────────────────────────────

    def get_stocks(self) -> dict[str, dict]:
        return self._stocks

    async def async_add_stock(self, stock_data: dict) -> str:
        stock_id = str(uuid.uuid4())
        self._stocks[stock_id] = stock_data
        await self._async_save()
        await self.async_request_refresh()
        return stock_id

    async def async_update_stock(self, stock_id: str, stock_data: dict) -> None:
        if stock_id not in self._stocks:
            raise ValueError(f"Aktie {stock_id} nicht gefunden")
        self._stocks[stock_id].update(stock_data)
        await self._async_save()
        await self.async_request_refresh()

    async def async_remove_stock(self, stock_id: str) -> None:
        self._stocks.pop(stock_id, None)
        await self._async_save()

    async def _async_save(self) -> None:
        await self._store.async_save({"stocks": self._stocks})

    async def async_shutdown(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()

    async def _update_analyst_data(self, api_key: str, stock_data: dict) -> None:
        """Ruft FMP-Analystendaten ab – maximal einmal alle 24h pro Symbol."""
        from datetime import datetime, timedelta
        if not hasattr(self, "_analyst_cache"):
            self._analyst_cache: dict = {}
        cutoff = datetime.now() - timedelta(hours=24)
        for stock_id, stock in stock_data.items():
            kuerzel = stock.get("kuerzel", "")
            if not kuerzel:
                continue
            cached = self._analyst_cache.get(kuerzel)
            if cached and cached.get("_fetched_at") and                cached["_fetched_at"] > cutoff:
                analyst = cached
            else:
                try:
                    analyst = await fetch_analyst_data(self.session, kuerzel, api_key)
                    analyst["_fetched_at"] = datetime.now()
                    self._analyst_cache[kuerzel] = analyst
                except Exception as exc:
                    _LOGGER.debug("FMP error für %s: %s", kuerzel, exc)
                    continue
            stock[ATTR_KZ_HOCH]    = analyst.get("kursziel_hoch")
            stock[ATTR_KZ_TIEF]    = analyst.get("kursziel_tief")
            stock[ATTR_KZ_MITTEL]  = analyst.get("kursziel_mittel")
            stock[ATTR_KZ_ANZAHL]  = analyst.get("analysten_anzahl")
            stock[ATTR_KZ_KONSENS] = analyst.get("analysten_konsens")
            stock[ATTR_KZ_DATUM]   = analyst.get("kursziel_datum")

