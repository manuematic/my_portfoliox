"""DataUpdateCoordinator for Mein Portfolio."""
from __future__ import annotations

import logging
from datetime import timedelta

import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.helpers.storage import Store

from .const import (
    DOMAIN,
    STORAGE_KEY,
    STORAGE_VERSION,
    DEFAULT_SCAN_INTERVAL,
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
    """Coordinator to fetch stock data and manage portfolio storage."""

    def __init__(
        self,
        hass: HomeAssistant,
        portfolio_name: str,
        entry_id: str,
        scan_interval: int = DEFAULT_SCAN_INTERVAL,
    ) -> None:
        """Initialize the coordinator."""
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
        """Load stored portfolio data."""
        stored = await self._store.async_load()
        if stored and "stocks" in stored:
            self._stocks = stored["stocks"]
        _LOGGER.debug("Loaded portfolio '%s' with %d stocks", self.portfolio_name, len(self._stocks))

    async def _async_update_data(self) -> dict[str, dict]:
        """Fetch latest prices for all stocks."""
        if not self._stocks:
            return {}

        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()

        updated_data: dict[str, dict] = {}

        for stock_id, stock in self._stocks.items():
            kuerzel = stock.get(ATTR_KUERZEL, "")
            aktueller_kurs = await fetch_stock_price(self._session, kuerzel)

            # Preserve last known price on failure
            if aktueller_kurs is None:
                aktueller_kurs = stock.get(ATTR_AKTUELLER_KURS)

            stock_data = dict(stock)
            stock_data[ATTR_AKTUELLER_KURS] = aktueller_kurs

            # Calculate profit/loss
            preis = stock.get(ATTR_PREIS, 0.0)
            stueckzahl = stock.get(ATTR_STUECKZAHL, 0)
            if aktueller_kurs is not None and preis and stueckzahl:
                gewinn = (aktueller_kurs - preis) * stueckzahl
                stock_data[ATTR_GEWINN] = round(gewinn, 3)
            else:
                stock_data[ATTR_GEWINN] = None

            # Evaluate alarms
            limit_oben = stock.get(ATTR_LIMIT_OBEN)
            limit_unten = stock.get(ATTR_LIMIT_UNTEN)
            if aktueller_kurs is not None:
                stock_data[ATTR_ALARM_OBEN] = (
                    bool(limit_oben and aktueller_kurs >= limit_oben)
                )
                stock_data[ATTR_ALARM_UNTEN] = (
                    bool(limit_unten and aktueller_kurs <= limit_unten)
                )
            else:
                stock_data[ATTR_ALARM_OBEN] = False
                stock_data[ATTR_ALARM_UNTEN] = False

            updated_data[stock_id] = stock_data

        return updated_data

    # ------------------------------------------------------------------ #
    #  Portfolio management helpers                                        #
    # ------------------------------------------------------------------ #

    def get_stocks(self) -> dict[str, dict]:
        """Return current stock definitions."""
        return self._stocks

    async def async_add_stock(self, stock_data: dict) -> str:
        """Add a new stock to the portfolio."""
        import uuid
        stock_id = str(uuid.uuid4())
        self._stocks[stock_id] = stock_data
        await self._async_save()
        await self.async_request_refresh()
        return stock_id

    async def async_update_stock(self, stock_id: str, stock_data: dict) -> None:
        """Update an existing stock entry."""
        if stock_id not in self._stocks:
            raise ValueError(f"Stock {stock_id} not found")
        self._stocks[stock_id].update(stock_data)
        await self._async_save()
        await self.async_request_refresh()

    async def async_remove_stock(self, stock_id: str) -> None:
        """Remove a stock from the portfolio."""
        self._stocks.pop(stock_id, None)
        await self._async_save()

    async def _async_save(self) -> None:
        """Persist portfolio to HA storage."""
        await self._store.async_save({"stocks": self._stocks})

    async def async_shutdown(self) -> None:
        """Close HTTP session on unload."""
        if self._session and not self._session.closed:
            await self._session.close()
