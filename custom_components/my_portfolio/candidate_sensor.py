"""Sensoren für Kaufkandidaten."""
from __future__ import annotations
from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo, DeviceEntryType
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    DOMAIN, NAME,
    ATTR_BEZEICHNUNG, ATTR_KUERZEL, ATTR_WKN, ATTR_ISIN,
    ATTR_ZIELKURS, ATTR_AKTUELLER_KURS, ATTR_KAUFSIGNAL, ATTR_KANDIDAT_NOTIZ,
)
from .candidate_coordinator import CandidateCoordinator


class CandidateSensor(CoordinatorEntity, SensorEntity):
    """Ein Sensor pro Kaufkandidat."""

    _attr_icon = "mdi:magnify"
    _attr_native_unit_of_measurement = "EUR"

    def __init__(
        self,
        coordinator: CandidateCoordinator,
        entry: ConfigEntry,
        candidate_id: str,
    ) -> None:
        super().__init__(coordinator)
        self._cid  = candidate_id
        self._attr_unique_id = f"candidate_{candidate_id}"
        bezeichnung = coordinator.get_candidates().get(candidate_id, {}).get(ATTR_BEZEICHNUNG, "?")
        self._attr_name = f"Kandidat {bezeichnung}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=f"{NAME} – {coordinator._entry.title}",
            manufacturer="Mein Portfolio",
            model="Kaufkandidaten",
            entry_type=DeviceEntryType.SERVICE,
        )

    @property
    def _data(self) -> dict:
        if self.coordinator.data is None:
            return {}
        return self.coordinator.data.get(self._cid, {})

    @property
    def native_value(self):
        v = self._data.get(ATTR_AKTUELLER_KURS)
        return round(float(v), 3) if v is not None else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        d = self._data
        return {
            "kandidat":            True,
            ATTR_BEZEICHNUNG:      d.get(ATTR_BEZEICHNUNG, ""),
            ATTR_KUERZEL:          d.get(ATTR_KUERZEL, ""),
            ATTR_WKN:              d.get(ATTR_WKN, ""),
            ATTR_ISIN:             d.get(ATTR_ISIN, ""),
            ATTR_ZIELKURS:         d.get(ATTR_ZIELKURS),
            ATTR_KAUFSIGNAL:       d.get(ATTR_KAUFSIGNAL, False),
            ATTR_AKTUELLER_KURS:   d.get(ATTR_AKTUELLER_KURS),
            ATTR_KANDIDAT_NOTIZ:   d.get(ATTR_KANDIDAT_NOTIZ, ""),
            "datenquelle":         d.get("datenquelle", ""),
        }
