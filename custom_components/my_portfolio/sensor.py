"""Sensor-Platform für Mein Portfolio."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.device_registry import DeviceEntryType
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    DOMAIN,
    NAME,
    ATTR_BEZEICHNUNG,
    ATTR_WKN,
    ATTR_ISIN,
    ATTR_KUERZEL,
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
    ATTR_PORTFOLIO_NAME,
    ATTR_DATENQUELLE,
    ATTR_GESAMT_INVEST,
    ATTR_GESAMT_WERT,
    ATTR_PORTFOLIO_DIFFERENZ,
    ATTR_PORTFOLIO_PROZENT,
)
from .coordinator import MyPortfolioCoordinator

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: MyPortfolioCoordinator = hass.data[DOMAIN][entry.entry_id]
    known_ids: set[str] = set()

    @callback
    def _handle_coordinator_update() -> None:
        new_entities = []
        for stock_id in coordinator.get_stocks():
            if stock_id not in known_ids:
                known_ids.add(stock_id)
                new_entities.append(StockSensor(coordinator, entry, stock_id))
        if new_entities:
            async_add_entities(new_entities, update_before_add=True)

    for stock_id in coordinator.get_stocks():
        known_ids.add(stock_id)

    initial_entities = [
        StockSensor(coordinator, entry, stock_id)
        for stock_id in coordinator.get_stocks()
    ]
    async_add_entities(initial_entities, update_before_add=True)

    # Portfolio-Gesamt-Sensoren
    async_add_entities([
        PortfolioSummarySensor(coordinator, entry, ATTR_GESAMT_INVEST,       "Gesamtinvest",       "mdi:bank-outline",      "EUR", 3),
        PortfolioSummarySensor(coordinator, entry, ATTR_GESAMT_WERT,         "Gesamtwert",          "mdi:chart-areaspline",  "EUR", 3),
        PortfolioSummarySensor(coordinator, entry, ATTR_PORTFOLIO_DIFFERENZ, "Portfoliodifferenz",  "mdi:minus-box-outline", "EUR", 3),
        PortfolioSummarySensor(coordinator, entry, ATTR_PORTFOLIO_PROZENT,   "Portfolioprozent",    "mdi:percent-outline",   "%",   2),
    ], update_before_add=True)

    entry.async_on_unload(coordinator.async_add_listener(_handle_coordinator_update))


class StockSensor(CoordinatorEntity[MyPortfolioCoordinator], SensorEntity):
    """Eine Aktienposition als HA-Sensor."""

    _attr_has_entity_name = True
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator: MyPortfolioCoordinator, entry: ConfigEntry, stock_id: str) -> None:
        super().__init__(coordinator)
        self._stock_id = stock_id
        self._attr_unique_id = stock_id
        self._attr_name = self._display_name(coordinator.get_stocks().get(stock_id, {}))
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=f"{NAME} – {coordinator.portfolio_name}",
            manufacturer="Mein Portfolio",
            model="Yahoo Finance",
            entry_type=DeviceEntryType.SERVICE,
        )

    @staticmethod
    def _display_name(stock: dict) -> str:
        bezeichnung = (stock.get(ATTR_BEZEICHNUNG) or "").strip()
        return bezeichnung if bezeichnung else stock.get(ATTR_KUERZEL, "Unbekannt")

    @property
    def _base(self) -> dict[str, Any]:
        return self.coordinator.get_stocks().get(self._stock_id, {})

    @property
    def _data(self) -> dict[str, Any]:
        if self.coordinator.data is None:
            return {}
        return self.coordinator.data.get(self._stock_id, {})

    @property
    def native_value(self) -> float | None:
        val = self._data.get(ATTR_AKTUELLER_KURS)
        return round(float(val), 3) if val is not None else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        base, data = self._base, self._data
        return {
            ATTR_PORTFOLIO_NAME:  self.coordinator.portfolio_name,
            ATTR_DATENQUELLE:     base.get(ATTR_DATENQUELLE, ""),
            ATTR_BEZEICHNUNG:     base.get(ATTR_BEZEICHNUNG, ""),
            ATTR_WKN:             base.get(ATTR_WKN, ""),
            ATTR_ISIN:            base.get(ATTR_ISIN, ""),
            ATTR_KUERZEL:         base.get(ATTR_KUERZEL),
            ATTR_PREIS:           base.get(ATTR_PREIS),
            ATTR_STUECKZAHL:      base.get(ATTR_STUECKZAHL),
            ATTR_KAUFDATUM:       base.get(ATTR_KAUFDATUM),
            ATTR_LIMIT_OBEN:      base.get(ATTR_LIMIT_OBEN),
            ATTR_LIMIT_UNTEN:     base.get(ATTR_LIMIT_UNTEN),
            ATTR_AKTUELLER_KURS:  data.get(ATTR_AKTUELLER_KURS),
            ATTR_ALARM_OBEN:      data.get(ATTR_ALARM_OBEN, False),
            ATTR_ALARM_UNTEN:     data.get(ATTR_ALARM_UNTEN, False),
            ATTR_GEWINN:          data.get(ATTR_GEWINN),
            ATTR_KURS_VORTAG:     data.get(ATTR_KURS_VORTAG),
            ATTR_TAGES_ABS:       data.get(ATTR_TAGES_ABS),
            ATTR_TAGES_PCT:       data.get(ATTR_TAGES_PCT),
        }

    @property
    def icon(self) -> str:
        if self._data.get(ATTR_ALARM_OBEN):
            return "mdi:trending-up"
        if self._data.get(ATTR_ALARM_UNTEN):
            return "mdi:trending-down"
        return "mdi:chart-line"

    @callback
    def _handle_coordinator_update(self) -> None:
        new_name = self._display_name(self._base)
        if new_name != self._attr_name:
            self._attr_name = new_name
        super()._handle_coordinator_update()


class PortfolioSummarySensor(CoordinatorEntity[MyPortfolioCoordinator], SensorEntity):
    """Portfolio-Gesamtwert-Sensor."""

    _attr_has_entity_name = True
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(
        self,
        coordinator: MyPortfolioCoordinator,
        entry: ConfigEntry,
        attr_key: str,
        display_name: str,
        icon: str,
        unit: str,
        decimals: int,
    ) -> None:
        super().__init__(coordinator)
        self._attr_key = attr_key
        self._decimals = decimals
        self._attr_unique_id = f"{entry.entry_id}_summary_{attr_key}"
        self._attr_name = display_name
        self._attr_icon = icon
        self._attr_native_unit_of_measurement = unit
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=f"{NAME} – {coordinator.portfolio_name}",
            manufacturer="Mein Portfolio",
            model="Yahoo Finance",
            entry_type=DeviceEntryType.SERVICE,
        )

    @property
    def native_value(self) -> float | None:
        val = self.coordinator.portfolio_summary.get(self._attr_key)
        return round(float(val), self._decimals) if val is not None else None

    @property
    def extra_state_attributes(self) -> dict:
        return {
            ATTR_PORTFOLIO_NAME: self.coordinator.portfolio_name,
            "summary_key": self._attr_key,   # z.B. "gesamtinvest" – für Dashboard-Cards
        }
