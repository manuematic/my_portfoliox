"""DataUpdateCoordinator for Mein Portfolio."""
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
    STORAGE_KEY,
    STORAGE_VERSION,
    DEFAULT_SCAN_INTERVAL,
    ATTR_BEZEICHNUNG,
    ATTR_KUERZEL,
    ATTR_PREIS,
    ATTR_STUECKZAHL,
    ATTR_KAUFDATUM,
    ATTR_LIMIT_OBEN,
    ATTR_LIMIT_UNTEN,
    ATTR_ALARM_OBEN,
    ATTR_ALARM_UNTEN,
    ATTR_GEWINN,
    ATTR_AKTUELLER_KURS,
)
from .yahoo_finance import fetch_stock_price

_LOGGER = logging.getLogger(__name__)


class MyPortfolioCoordinator(DataUpdateCoordinator):
    """Coordinator: Kurse abrufen und Portfolio-Daten verwalten."""

    def __init__(
        self,
        hass: HomeAssistant,
        portfolio_name: str,
        entry_id: str,
        scan_interval: int = DEFAULT_SCAN_INTERVAL,
    ) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN}_{entry_id}",
            update_interval=timedelta(minutes=scan_interval),
        )
        self.portfolio_name = portfolio_name
        self.entry_id = entry_id
        self._store = Store(hass, STORAGE_VERSION, f"{STORAGE_KEY}.{entry_id}")
        self._stocks: dict[str, dict] = {}
        self._session: aiohttp.ClientSession | None = None

    async def async_setup(self) -> None:
        """Gespeicherte Portfolio-Daten laden."""
        stored = await self._store.async_load()
        if stored and "stocks" in stored:
            self._stocks = stored["stocks"]
        _LOGGER.debug(
            "Portfolio '%s' geladen – %d Aktien", self.portfolio_name, len(self._stocks)
        )

    async def _async_update_data(self) -> dict[str, dict]:
        """Aktuelle Kurse für alle Aktien abrufen und Felder berechnen."""
        if not self._stocks:
            return {}

        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()

        updated_data: dict[str, dict] = {}

        for stock_id, stock in self._stocks.items():
            kuerzel = stock.get(ATTR_KUERZEL, "")
            aktueller_kurs = await fetch_stock_price(self._session, kuerzel)

            # Letzten bekannten Kurs behalten wenn Abruf fehlschlägt
            if aktueller_kurs is None:
                aktueller_kurs = stock.get(ATTR_AKTUELLER_KURS)

            stock_data = dict(stock)
            stock_data[ATTR_AKTUELLER_KURS] = aktueller_kurs

            preis = stock.get(ATTR_PREIS) or 0.0

            # ── Gewinn: prozentualer Kursgewinn seit Kauf ──────────────────
            # Formel: ((Aktueller Kurs - Kaufpreis) * 100 / Kaufpreis)
            # Format: float 3,2 (max. 3 Vor-, 2 Nachkommastellen)
            if aktueller_kurs is not None and preis:
                gewinn_pct = (aktueller_kurs - preis) * 100.0 / preis
                stock_data[ATTR_GEWINN] = round(gewinn_pct, 2)
            else:
                stock_data[ATTR_GEWINN] = None

            # ── Kurs-Alarme ────────────────────────────────────────────────
            limit_oben = stock.get(ATTR_LIMIT_OBEN)   # None oder 0 = kein Limit
            limit_unten = stock.get(ATTR_LIMIT_UNTEN)

            if aktueller_kurs is not None:
                # Alarm oben:  Kurs > Limit oben  (Limit muss gesetzt und > 0 sein)
                stock_data[ATTR_ALARM_OBEN] = bool(
                    limit_oben and limit_oben > 0 and aktueller_kurs > limit_oben
                )
                # Alarm unten: Kurs < Limit unten (Limit muss gesetzt und > 0 sein)
                stock_data[ATTR_ALARM_UNTEN] = bool(
                    limit_unten and limit_unten > 0 and aktueller_kurs < limit_unten
                )
            else:
                stock_data[ATTR_ALARM_OBEN] = False
                stock_data[ATTR_ALARM_UNTEN] = False

            updated_data[stock_id] = stock_data

        return updated_data

    # ------------------------------------------------------------------ #
    #  Portfolio-Verwaltung                                                #
    # ------------------------------------------------------------------ #

    def get_stocks(self) -> dict[str, dict]:
        """Alle gespeicherten Aktien zurückgeben."""
        return self._stocks

    async def async_add_stock(self, stock_data: dict) -> str:
        """Neue Aktie hinzufügen und persistieren."""
        stock_id = str(uuid.uuid4())
        self._stocks[stock_id] = stock_data
        await self._async_save()
        await self.async_request_refresh()
        return stock_id

    async def async_update_stock(self, stock_id: str, stock_data: dict) -> None:
        """Bestehende Aktie aktualisieren."""
        if stock_id not in self._stocks:
            raise ValueError(f"Aktie {stock_id} nicht gefunden")
        self._stocks[stock_id].update(stock_data)
        await self._async_save()
        await self.async_request_refresh()

    async def async_remove_stock(self, stock_id: str) -> None:
        """Aktie aus Portfolio entfernen."""
        self._stocks.pop(stock_id, None)
        await self._async_save()

    async def _async_save(self) -> None:
        """Portfolio in HA-Storage speichern."""
        await self._store.async_save({"stocks": self._stocks})

    async def async_shutdown(self) -> None:
        """HTTP-Session beim Entladen schließen."""
        if self._session and not self._session.closed:
            await self._session.close()
