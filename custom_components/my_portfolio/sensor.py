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
    """Sensor-Entitäten für jede Aktie im Portfolio einrichten."""
    coordinator: MyPortfolioCoordinator = hass.data[DOMAIN][entry.entry_id]

    known_ids: set[str] = set()

    @callback
    def _handle_coordinator_update() -> None:
        """Neue Sensor-Entitäten hinzufügen wenn Aktien ergänzt werden."""
        new_entities = []
        for stock_id in coordinator.get_stocks():
            if stock_id not in known_ids:
                known_ids.add(stock_id)
                new_entities.append(StockSensor(coordinator, entry, stock_id))
        if new_entities:
            async_add_entities(new_entities, update_before_add=True)

    # Initiales Setup
    for stock_id in coordinator.get_stocks():
        known_ids.add(stock_id)

    initial_entities = [
        StockSensor(coordinator, entry, stock_id)
        for stock_id in coordinator.get_stocks()
    ]
    async_add_entities(initial_entities, update_before_add=True)

    entry.async_on_unload(coordinator.async_add_listener(_handle_coordinator_update))

    # Portfolio-Gesamt-Sensoren (einmalig, nicht pro Aktie)
    portfolio_sensors = [
        PortfolioSummarySensor(coordinator, entry, ATTR_GESAMT_INVEST,      "Gesamtinvest",        "mdi:bank-outline",       "%"),
        PortfolioSummarySensor(coordinator, entry, ATTR_GESAMT_WERT,        "Gesamtwert",          "mdi:chart-areaspline",   "%"),
        PortfolioSummarySensor(coordinator, entry, ATTR_PORTFOLIO_DIFFERENZ,"Portfoliodifferenz",  "mdi:minus-box-outline",  "%"),
        PortfolioSummarySensor(coordinator, entry, ATTR_PORTFOLIO_PROZENT,  "Portfolioprozent",    "mdi:percent-outline",    "%"),
    ]
    async_add_entities(portfolio_sensors, update_before_add=True)


class StockSensor(CoordinatorEntity[MyPortfolioCoordinator], SensorEntity):
    """Eine Aktienposition im Portfolio als HA-Sensor."""

    _attr_has_entity_name = True
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(
        self,
        coordinator: MyPortfolioCoordinator,
        entry: ConfigEntry,
        stock_id: str,
    ) -> None:
        super().__init__(coordinator)
        self._stock_id = stock_id
        self._entry = entry

        stock = coordinator.get_stocks().get(stock_id, {})
        # Anzeigename: Bezeichnung wenn vorhanden, sonst Kürzel
        self._attr_unique_id = stock_id
        self._attr_name = self._display_name(stock)

        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=f"{NAME} – {coordinator.portfolio_name}",
            manufacturer="Mein Portfolio",
            model="Yahoo Finance",
            entry_type=DeviceEntryType.SERVICE,
        )

    @staticmethod
    def _display_name(stock: dict) -> str:
        """Bezeichnung zurückgeben, falls vorhanden – sonst Kürzel."""
        bezeichnung = (stock.get(ATTR_BEZEICHNUNG) or "").strip()
        return bezeichnung if bezeichnung else stock.get(ATTR_KUERZEL, "Unbekannt")

    @property
    def _stock_base(self) -> dict[str, Any]:
        """Gespeicherte Stammdaten der Aktie."""
        return self.coordinator.get_stocks().get(self._stock_id, {})

    @property
    def _stock_data(self) -> dict[str, Any]:
        """Aktuelle Laufzeitdaten (Kurs, Alarm, Gewinn) vom Coordinator."""
        if self.coordinator.data is None:
            return {}
        return self.coordinator.data.get(self._stock_id, {})

    @property
    def native_value(self) -> float | None:
        """Aktueller Kurs als Sensor-State."""
        val = self._stock_data.get(ATTR_AKTUELLER_KURS)
        return round(float(val), 3) if val is not None else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Alle Aktienfelder als Entitäts-Attribute."""
        base = self._stock_base
        data = self._stock_data

        return {
            ATTR_PORTFOLIO_NAME:  self.coordinator.portfolio_name,
            ATTR_BEZEICHNUNG:     base.get(ATTR_BEZEICHNUNG, ""),
            ATTR_KUERZEL:         base.get(ATTR_KUERZEL),
            ATTR_PREIS:           base.get(ATTR_PREIS),           # float 5,3
            ATTR_STUECKZAHL:      base.get(ATTR_STUECKZAHL),      # integer 6
            ATTR_KAUFDATUM:       base.get(ATTR_KAUFDATUM),
            ATTR_LIMIT_OBEN:      base.get(ATTR_LIMIT_OBEN),      # float 5,3
            ATTR_LIMIT_UNTEN:     base.get(ATTR_LIMIT_UNTEN),     # float 5,3
            ATTR_AKTUELLER_KURS:  data.get(ATTR_AKTUELLER_KURS),
            ATTR_ALARM_OBEN:      data.get(ATTR_ALARM_OBEN, False),
            ATTR_ALARM_UNTEN:     data.get(ATTR_ALARM_UNTEN, False),
            ATTR_GEWINN:          data.get(ATTR_GEWINN),           # float 3,2 in %
        }

    @property
    def icon(self) -> str:
        """Icon abhängig vom Alarm-Zustand."""
        data = self._stock_data
        if data.get(ATTR_ALARM_OBEN):
            return "mdi:trending-up"
        if data.get(ATTR_ALARM_UNTEN):
            return "mdi:trending-down"
        return "mdi:chart-line"

    @callback
    def _handle_coordinator_update(self) -> None:
        """Entitätsname aktualisieren wenn Bezeichnung/Kürzel geändert wurde."""
        new_name = self._display_name(self._stock_base)
        if new_name != self._attr_name:
            self._attr_name = new_name
        super()._handle_coordinator_update()


class PortfolioSummarySensor(CoordinatorEntity[MyPortfolioCoordinator], SensorEntity):
    """Ein Portfolio-Gesamt-Sensor (Gesamtinvest, Gesamtwert, Differenz, Prozent)."""

    _attr_has_entity_name = True
    _attr_state_class = SensorStateClass.MEASUREMENT

    # Konfiguration je Sensor-Typ
    _UNIT_MAP = {
        ATTR_GESAMT_INVEST:       "EUR",
        ATTR_GESAMT_WERT:         "EUR",
        ATTR_PORTFOLIO_DIFFERENZ: "EUR",
        ATTR_PORTFOLIO_PROZENT:   "%",
    }
    _DECIMALS_MAP = {
        ATTR_GESAMT_INVEST:       3,   # float 7,3
        ATTR_GESAMT_WERT:         3,   # float 7,3
        ATTR_PORTFOLIO_DIFFERENZ: 3,   # float 7,3
        ATTR_PORTFOLIO_PROZENT:   2,   # float 4,2
    }

    def __init__(
        self,
        coordinator: MyPortfolioCoordinator,
        entry: ConfigEntry,
        attr_key: str,
        display_name: str,
        icon: str,
        unit: str,
    ) -> None:
        super().__init__(coordinator)
        self._attr_key = attr_key
        self._attr_unique_id = f"{entry.entry_id}_summary_{attr_key}"
        self._attr_name = display_name
        self._attr_icon = icon
        self._attr_native_unit_of_measurement = self._UNIT_MAP.get(attr_key, unit)
        self._decimals = self._DECIMALS_MAP.get(attr_key, 2)

        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=f"{NAME} – {coordinator.portfolio_name}",
            manufacturer="Mein Portfolio",
            model="Yahoo Finance",
            entry_type=DeviceEntryType.SERVICE,
        )

    @property
    def native_value(self) -> float | None:
        """Berechneten Gesamtwert als Sensor-State zurückgeben."""
        val = self.coordinator.portfolio_summary.get(self._attr_key)
        if val is None:
            return None
        return round(float(val), self._decimals)

    @property
    def extra_state_attributes(self) -> dict:
        """Portfolio-Name als Attribut."""
        return {ATTR_PORTFOLIO_NAME: self.coordinator.portfolio_name}
