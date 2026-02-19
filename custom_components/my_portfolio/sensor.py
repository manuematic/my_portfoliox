"""Sensor platform for Mein Portfolio."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    DOMAIN,
    NAME,
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
    ATTR_PORTFOLIO_NAME,
)
from .coordinator import MyPortfolioCoordinator

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up sensor entities for each stock in the portfolio."""
    coordinator: MyPortfolioCoordinator = hass.data[DOMAIN][entry.entry_id]

    # Track already-added stock IDs to avoid duplicates on reload
    known_ids: set[str] = set()

    @callback
    def _handle_coordinator_update() -> None:
        """Add new sensor entities when stocks are added."""
        new_entities = []
        for stock_id in coordinator.get_stocks():
            if stock_id not in known_ids:
                known_ids.add(stock_id)
                new_entities.append(StockSensor(coordinator, entry, stock_id))
        if new_entities:
            async_add_entities(new_entities, update_before_add=True)

    # Initial setup
    for stock_id in coordinator.get_stocks():
        known_ids.add(stock_id)

    initial_entities = [
        StockSensor(coordinator, entry, stock_id)
        for stock_id in coordinator.get_stocks()
    ]
    async_add_entities(initial_entities, update_before_add=True)

    # Register listener for future additions
    entry.async_on_unload(coordinator.async_add_listener(_handle_coordinator_update))


class StockSensor(CoordinatorEntity[MyPortfolioCoordinator], SensorEntity):
    """Represents a single stock position in the portfolio."""

    _attr_has_entity_name = True
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_native_unit_of_measurement = None  # currency varies

    def __init__(
        self,
        coordinator: MyPortfolioCoordinator,
        entry: ConfigEntry,
        stock_id: str,
    ) -> None:
        """Initialize the stock sensor."""
        super().__init__(coordinator)
        self._stock_id = stock_id
        self._entry = entry

        stock = coordinator.get_stocks().get(stock_id, {})
        self._kuerzel = stock.get(ATTR_KUERZEL, stock_id)

        self._attr_unique_id = stock_id
        self._attr_name = self._kuerzel

        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=f"{NAME} – {coordinator.portfolio_name}",
            manufacturer="Mein Portfolio",
            model="Yahoo Finance",
            entry_type="service",  # type: ignore[arg-type]
        )

    @property
    def _stock_data(self) -> dict[str, Any]:
        """Return current stock data from coordinator."""
        if self.coordinator.data is None:
            return {}
        return self.coordinator.data.get(self._stock_id, {})

    @property
    def native_value(self) -> float | None:
        """Return the current market price as the state."""
        val = self._stock_data.get(ATTR_AKTUELLER_KURS)
        if val is not None:
            return round(float(val), 3)
        return None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return all stock fields as attributes."""
        data = self._stock_data
        base = self.coordinator.get_stocks().get(self._stock_id, {})

        attrs: dict[str, Any] = {
            ATTR_PORTFOLIO_NAME: self.coordinator.portfolio_name,
            ATTR_KUERZEL: base.get(ATTR_KUERZEL),
            ATTR_PREIS: base.get(ATTR_PREIS),          # float 5,3 – Kaufpreis
            ATTR_STUECKZAHL: base.get(ATTR_STUECKZAHL),  # integer 6
            ATTR_KAUFDATUM: base.get(ATTR_KAUFDATUM),
            ATTR_LIMIT_OBEN: base.get(ATTR_LIMIT_OBEN),  # float 5,3
            ATTR_LIMIT_UNTEN: base.get(ATTR_LIMIT_UNTEN),  # float 5,3
            ATTR_AKTUELLER_KURS: data.get(ATTR_AKTUELLER_KURS),
            ATTR_ALARM_OBEN: data.get(ATTR_ALARM_OBEN, False),   # boolean
            ATTR_ALARM_UNTEN: data.get(ATTR_ALARM_UNTEN, False),  # boolean
            ATTR_GEWINN: data.get(ATTR_GEWINN),          # float 4,3
        }
        return attrs

    @property
    def icon(self) -> str:
        """Return icon based on alarm state."""
        data = self._stock_data
        if data.get(ATTR_ALARM_OBEN):
            return "mdi:trending-up"
        if data.get(ATTR_ALARM_UNTEN):
            return "mdi:trending-down"
        return "mdi:chart-line"

    @callback
    def _handle_coordinator_update(self) -> None:
        """Handle updated data from the coordinator."""
        # Update kuerzel in case it was changed
        base = self.coordinator.get_stocks().get(self._stock_id, {})
        new_kuerzel = base.get(ATTR_KUERZEL, self._kuerzel)
        if new_kuerzel != self._kuerzel:
            self._kuerzel = new_kuerzel
            self._attr_name = new_kuerzel
        super()._handle_coordinator_update()
