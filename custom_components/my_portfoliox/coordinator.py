"""DataUpdateCoordinator für My Portfolio X."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta
from typing import Any

import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.helpers.storage import Store

from .const import (
    DOMAIN,
    CONF_FMP_API_KEY,
    CONF_INFLUX_URL,
    CONF_INFLUX_TOKEN,
    CONF_INFLUX_ORG,
    CONF_INFLUX_BUCKET,
    CONF_STEUERSATZ,
    DEFAULT_STEUERSATZ,
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
    ATTR_SMA_20,
    ATTR_SMA_50,
    ATTR_SMA_200,
    ATTR_PREIS_HISTORY,
    ATTR_TRANSAKTIONEN,
    ATTR_VERKAUFSKURS,
    ATTR_VERKAUFSDATUM,
    ATTR_GEWINN_BRUTTO,
    ATTR_GEWINN_BRUTTO_PCT,
    ATTR_GEWINN_NETTO,
    ATTR_STEUER_BETRAG,
    ATTR_ERLOES_GESAMT,
)
from .yahoo_finance import fetch_price_yahoo
from .ing import fetch_price_ing
from . import influx as _influx

_LOGGER = logging.getLogger(__name__)

# SMA/History-Cache TTL: 23 Stunden (Tageswerte)
_SMA_TTL = timedelta(hours=23)
# Transaktions-Cache TTL: 1 Stunde
_TX_TTL = timedelta(hours=1)


class MyPortfolioCoordinator(DataUpdateCoordinator):
    """Coordinator: Kurse abrufen, InfluxDB befüllen und Portfolio-Daten verwalten."""

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

        # Portfolio-Gesamtdaten
        self.portfolio_summary: dict = {
            ATTR_GESAMT_INVEST: None,
            ATTR_GESAMT_WERT: None,
            ATTR_PORTFOLIO_DIFFERENZ: None,
            ATTR_PORTFOLIO_PROZENT: None,
        }

        # SMA/History-Cache: kuerzel → {sma_20, sma_50, sma_200, preis_history, _ts}
        self._sma_cache: dict[str, dict] = {}

        # Bilanz-Cache: [{kuerzel, bezeichnung, ...}]
        self._bilanz_data: list[dict] = []
        self._bilanz_ts: datetime | None = None

    # ── Setup ─────────────────────────────────────────────────────────────────

    async def async_setup(self) -> None:
        """Gespeicherte Portfolio-Daten laden + initiale Bilanz-Abfrage."""
        stored = await self._store.async_load()
        if stored and "stocks" in stored:
            self._stocks = stored["stocks"]
        _LOGGER.debug(
            "Portfolio '%s' geladen – %d Aktien, Quelle: %s",
            self.portfolio_name, len(self._stocks), self.data_source,
        )
        # Bilanz beim Start laden (nicht-blockierend)
        self.hass.async_create_task(self._async_refresh_bilanz())

    # ── InfluxDB-Config ───────────────────────────────────────────────────────

    def _influx_cfg(self) -> dict[str, str]:
        """Gibt InfluxDB-Konfiguration aus den Entry-Optionen zurück."""
        opts = {**self.config_entry.data, **self.config_entry.options}
        return {
            "base_url": opts.get(CONF_INFLUX_URL, ""),
            "token":    opts.get(CONF_INFLUX_TOKEN, ""),
            "org":      opts.get(CONF_INFLUX_ORG, ""),
            "bucket":   opts.get(CONF_INFLUX_BUCKET, ""),
        }

    def _influx_ok(self) -> bool:
        cfg = self._influx_cfg()
        return all(cfg.values())

    def _steuersatz(self) -> float:
        opts = {**self.config_entry.data, **self.config_entry.options}
        return float(opts.get(CONF_STEUERSATZ, DEFAULT_STEUERSATZ))

    # ── Haupt-Update-Schleife ─────────────────────────────────────────────────

    async def _fetch_price(self, stock: dict) -> dict:
        """Kurs abrufen – Quelle pro Aktie (ING via ISIN oder Yahoo via Kürzel)."""
        quelle = stock.get(ATTR_DATENQUELLE) or self.data_source
        if quelle == SOURCE_ING:
            isin = (stock.get(ATTR_ISIN) or "").strip()
            if isin:
                return await fetch_price_ing(self._session, isin)
            _LOGGER.warning(
                "ING gewählt aber kein ISIN für '%s' – Fallback auf Yahoo",
                stock.get(ATTR_KUERZEL, "?"),
            )
        return await fetch_price_yahoo(self._session, stock.get(ATTR_KUERZEL, ""))

    async def _async_update_data(self) -> dict[str, dict]:
        """Aktuelle Kurse abrufen, InfluxDB befüllen, SMAs cachen."""
        if not self._stocks:
            return {}

        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()

        cfg = self._influx_cfg()
        influx_active = self._influx_ok()

        updated_data: dict[str, dict] = {}

        for stock_id, stock in self._stocks.items():
            price_data = await self._fetch_price(stock)
            aktueller_kurs = price_data.get("aktueller_kurs")
            if aktueller_kurs is None:
                aktueller_kurs = stock.get(ATTR_AKTUELLER_KURS)

            stock_data = dict(stock)
            stock_data[ATTR_AKTUELLER_KURS] = aktueller_kurs
            stock_data[ATTR_KURS_VORTAG] = (
                price_data.get("kurs_vortag") or stock.get(ATTR_KURS_VORTAG)
            )
            stock_data[ATTR_TAGES_ABS] = (
                price_data.get("tages_aenderung_abs") or stock.get(ATTR_TAGES_ABS)
            )
            stock_data[ATTR_TAGES_PCT] = (
                price_data.get("tages_aenderung_pct") or stock.get(ATTR_TAGES_PCT)
            )

            preis = stock.get(ATTR_PREIS) or 0.0
            if aktueller_kurs is not None and preis:
                stock_data[ATTR_GEWINN] = round((aktueller_kurs - preis) * 100.0 / preis, 2)
            else:
                stock_data[ATTR_GEWINN] = None

            limit_oben  = stock.get(ATTR_LIMIT_OBEN)
            limit_unten = stock.get(ATTR_LIMIT_UNTEN)
            if aktueller_kurs is not None:
                stock_data[ATTR_ALARM_OBEN]  = bool(limit_oben  and limit_oben  > 0 and aktueller_kurs > limit_oben)
                stock_data[ATTR_ALARM_UNTEN] = bool(limit_unten and limit_unten > 0 and aktueller_kurs < limit_unten)
            else:
                stock_data[ATTR_ALARM_OBEN]  = False
                stock_data[ATTR_ALARM_UNTEN] = False

            # ── InfluxDB: Kurs schreiben ───────────────────────────────────
            if influx_active and aktueller_kurs is not None:
                await _influx.write_price(
                    self._session,
                    cfg["base_url"], cfg["token"], cfg["org"], cfg["bucket"],
                    kuerzel=stock.get(ATTR_KUERZEL, ""),
                    isin=stock.get(ATTR_ISIN, ""),
                    portfolio=self.portfolio_name,
                    kurs=aktueller_kurs,
                )

            # ── SMA / History aus Cache oder InfluxDB ──────────────────────
            sma_data = await self._get_sma_cached(stock.get(ATTR_KUERZEL, ""), influx_active, cfg)
            stock_data[ATTR_SMA_20]        = sma_data.get("sma_20")
            stock_data[ATTR_SMA_50]        = sma_data.get("sma_50")
            stock_data[ATTR_SMA_200]       = sma_data.get("sma_200")
            stock_data[ATTR_PREIS_HISTORY] = sma_data.get("preis_history", [])

            updated_data[stock_id] = stock_data

        # ── Portfolio-Gesamtwerte ──────────────────────────────────────────
        gesamt_invest      = 0.0
        gesamt_wert        = 0.0
        all_prices_avail   = True

        for stock_id, stock in self._stocks.items():
            preis      = stock.get(ATTR_PREIS) or 0.0
            stueckzahl = float(stock.get(ATTR_STUECKZAHL) or 0)
            aktueller_kurs = updated_data.get(stock_id, {}).get(ATTR_AKTUELLER_KURS)
            gesamt_invest += preis * stueckzahl
            if aktueller_kurs is not None:
                gesamt_wert += aktueller_kurs * stueckzahl
            else:
                all_prices_avail = False

        gesamt_invest = round(gesamt_invest, 3)
        gesamt_wert   = round(gesamt_wert, 3) if all_prices_avail else None
        portfolio_differenz = (
            round(gesamt_wert - gesamt_invest, 3) if gesamt_wert is not None else None
        )
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

        # FMP Analysten-Daten
        fmp_key = (
            self.config_entry.options.get(CONF_FMP_API_KEY, "")
            or self.config_entry.data.get(CONF_FMP_API_KEY, "")
        )
        if fmp_key and fmp_key.strip():
            await self._update_analyst_data(fmp_key.strip(), updated_data)

        return updated_data

    # ── SMA-Cache ─────────────────────────────────────────────────────────────

    async def _get_sma_cached(
        self, kuerzel: str, influx_active: bool, cfg: dict
    ) -> dict[str, Any]:
        """SMA + History aus Cache (23h TTL) oder frisch von InfluxDB."""
        if not kuerzel or not influx_active:
            return {"sma_20": None, "sma_50": None, "sma_200": None, "preis_history": []}

        cached = self._sma_cache.get(kuerzel)
        now = datetime.now()
        if cached and (now - cached["_ts"]) < _SMA_TTL:
            return cached

        smas = await _influx.query_smas(
            self._session, cfg["base_url"], cfg["token"], cfg["org"], cfg["bucket"], kuerzel
        )
        history = await _influx.query_price_history(
            self._session, cfg["base_url"], cfg["token"], cfg["org"], cfg["bucket"], kuerzel,
            days=400,
        )
        entry = {**smas, "preis_history": history, "_ts": now}
        self._sma_cache[kuerzel] = entry
        return entry

    # ── Bilanz ────────────────────────────────────────────────────────────────

    async def _async_refresh_bilanz(self) -> None:
        """Transaktionen aus InfluxDB laden und cachen."""
        if not self._influx_ok():
            return
        cfg = self._influx_cfg()
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        self._bilanz_data = await _influx.query_transactions(
            self._session, cfg["base_url"], cfg["token"], cfg["org"], cfg["bucket"],
            self.portfolio_name,
        )
        self._bilanz_ts = datetime.now()
        _LOGGER.debug("Bilanz: %d Transaktionen geladen.", len(self._bilanz_data))

    def get_bilanz_data(self) -> list[dict]:
        return self._bilanz_data

    # ── Portfolio-Verwaltung ───────────────────────────────────────────────────

    def get_stocks(self) -> dict[str, dict]:
        return self._stocks

    async def async_add_stock(self, stock_data: dict) -> str:
        """Aktie hinzufügen + Kauf-Transaktion in InfluxDB schreiben."""
        stock_id = str(uuid.uuid4())
        self._stocks[stock_id] = stock_data
        await self._async_save()

        # Kauf-Transaktion in InfluxDB
        if self._influx_ok():
            cfg = self._influx_cfg()
            if self._session is None or self._session.closed:
                self._session = aiohttp.ClientSession()
            kuerzel   = stock_data.get(ATTR_KUERZEL, "")
            investiert = round(
                float(stock_data.get(ATTR_PREIS, 0)) * float(stock_data.get(ATTR_STUECKZAHL, 0)), 3
            )
            await _influx.write_transaction(
                self._session,
                cfg["base_url"], cfg["token"], cfg["org"], cfg["bucket"],
                kuerzel=kuerzel,
                portfolio=self.portfolio_name,
                typ="kauf",
                fields={
                    "bezeichnung":  str(stock_data.get(ATTR_BEZEICHNUNG, "")),
                    "kaufkurs":     float(stock_data.get(ATTR_PREIS, 0)),
                    "stueckzahl":   float(stock_data.get(ATTR_STUECKZAHL, 0)),
                    "kaufdatum":    str(stock_data.get(ATTR_KAUFDATUM, "")),
                    "investiert":   investiert,
                    "isin":         str(stock_data.get(ATTR_ISIN, "")),
                },
            )

        await self.async_request_refresh()
        return stock_id

    async def async_update_stock(self, stock_id: str, stock_data: dict) -> None:
        if stock_id not in self._stocks:
            raise ValueError(f"Aktie {stock_id} nicht gefunden")
        self._stocks[stock_id].update(stock_data)
        await self._async_save()
        await self.async_request_refresh()

    async def async_remove_stock(self, stock_id: str) -> None:
        """Aktie aus Portfolio entfernen (ohne Verkauf-Transaktion)."""
        self._stocks.pop(stock_id, None)
        await self._async_save()

    async def async_sell_stock(
        self,
        stock_id: str,
        verkaufskurs: float,
        verkaufsdatum: str,
    ) -> dict:
        """Aktie verkaufen: Transaktion schreiben, Kurshistorie löschen, Aktie entfernen."""
        stock = self._stocks.get(stock_id)
        if not stock:
            raise ValueError(f"Aktie {stock_id} nicht gefunden")

        kuerzel    = stock.get(ATTR_KUERZEL, "")
        kaufkurs   = float(stock.get(ATTR_PREIS, 0))
        stueckzahl = float(stock.get(ATTR_STUECKZAHL, 0))
        steuersatz = self._steuersatz()

        erloes_gesamt  = round(verkaufskurs * stueckzahl, 2)
        gewinn_brutto  = round((verkaufskurs - kaufkurs) * stueckzahl, 2)
        gewinn_brutto_pct = round((verkaufskurs - kaufkurs) / kaufkurs * 100, 2) if kaufkurs else 0.0
        # Steuer nur auf positive Gewinne
        steuer_betrag  = round(max(0.0, gewinn_brutto) * steuersatz / 100.0, 2)
        gewinn_netto   = round(gewinn_brutto - steuer_betrag, 2)

        result = {
            "kuerzel":          kuerzel,
            "bezeichnung":      stock.get(ATTR_BEZEICHNUNG, ""),
            "kaufkurs":         kaufkurs,
            "verkaufskurs":     verkaufskurs,
            "stueckzahl":       stueckzahl,
            "kaufdatum":        stock.get(ATTR_KAUFDATUM, ""),
            "verkaufsdatum":    verkaufsdatum,
            "erloes_gesamt":    erloes_gesamt,
            "gewinn_brutto":    gewinn_brutto,
            "gewinn_brutto_pct": gewinn_brutto_pct,
            "steuer_betrag":    steuer_betrag,
            "gewinn_netto":     gewinn_netto,
            "steuersatz":       steuersatz,
        }

        # InfluxDB: Verkauf schreiben + Kurshistorie löschen
        if self._influx_ok():
            cfg = self._influx_cfg()
            if self._session is None or self._session.closed:
                self._session = aiohttp.ClientSession()

            fields = {k: v for k, v in result.items() if k != "kuerzel"}
            await _influx.write_transaction(
                self._session,
                cfg["base_url"], cfg["token"], cfg["org"], cfg["bucket"],
                kuerzel=kuerzel,
                portfolio=self.portfolio_name,
                typ="verkauf",
                fields=fields,
            )
            await _influx.delete_stock_history(
                self._session,
                cfg["base_url"], cfg["token"], cfg["org"], cfg["bucket"],
                kuerzel=kuerzel,
            )

        # Aktie aus Portfolio und SMA-Cache entfernen
        self._sma_cache.pop(kuerzel, None)
        self._stocks.pop(stock_id, None)
        await self._async_save()

        # Bilanz neu laden
        await self._async_refresh_bilanz()

        return result

    async def _async_save(self) -> None:
        await self._store.async_save({"stocks": self._stocks})

    async def async_shutdown(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()

    # ── FMP Analysten-Daten ────────────────────────────────────────────────────

    async def _update_analyst_data(self, api_key: str, stock_data: dict) -> None:
        """FMP-Analystendaten – maximal einmal alle 24h pro Symbol."""
        from .fmp import fetch_analyst_data
        if not hasattr(self, "_analyst_cache"):
            self._analyst_cache: dict = {}
        cutoff = datetime.now() - timedelta(hours=24)
        for stock_id, stock in stock_data.items():
            kuerzel = stock.get("kuerzel", "")
            if not kuerzel:
                continue
            cached = self._analyst_cache.get(kuerzel)
            if cached and cached.get("_fetched_at") and cached["_fetched_at"] > cutoff:
                analyst = cached
            else:
                try:
                    analyst = await fetch_analyst_data(self._session, kuerzel, api_key)
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
