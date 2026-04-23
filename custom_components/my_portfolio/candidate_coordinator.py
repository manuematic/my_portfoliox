"""Koordinator für Kaufkandidaten."""
from __future__ import annotations
import logging
from datetime import timedelta

from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.helpers.storage import Store

from .const import (
    DOMAIN,
    ATTR_BEZEICHNUNG, ATTR_KUERZEL, ATTR_WKN, ATTR_ISIN,
    ATTR_ZIELKURS, ATTR_AKTUELLER_KURS, ATTR_KAUFSIGNAL, ATTR_KANDIDAT_NOTIZ,
    SOURCE_ING, SOURCE_YAHOO,
)
from .ing import fetch_price_ing
from .yahoo_finance import fetch_price_yahoo

_LOGGER = logging.getLogger(__name__)
STORAGE_VERSION_CAND = 1
STORAGE_KEY_CAND     = "my_portfolio.candidates"


class CandidateCoordinator(DataUpdateCoordinator):
    """Verwaltet Kaufkandidaten und prüft ob Zielkurs erreicht ist."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, session) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN}_candidates_{entry.entry_id}",
            update_interval=timedelta(minutes=15),
        )
        self._entry   = entry
        self._session = session
        self._store   = Store(hass, STORAGE_VERSION_CAND,
                              f"{STORAGE_KEY_CAND}.{entry.entry_id}")
        self._candidates: dict[str, dict] = {}

    async def async_load(self) -> None:
        stored = await self._store.async_load()
        if stored and isinstance(stored.get("candidates"), dict):
            self._candidates = stored["candidates"]
        _LOGGER.debug("Kandidaten geladen: %d", len(self._candidates))

    async def _async_update_data(self) -> dict:
        updated = {}
        for cid, cand in self._candidates.items():
            isin   = (cand.get(ATTR_ISIN)    or "").strip()
            kuerzel = (cand.get(ATTR_KUERZEL) or "").strip()
            quelle  = cand.get("datenquelle", SOURCE_ING)

            price_data = None
            if quelle == SOURCE_ING and isin:
                price_data = await fetch_price_ing(self._session, isin)
            elif kuerzel:
                price_data = await fetch_price_yahoo(self._session, kuerzel)

            kurs = price_data.get(ATTR_AKTUELLER_KURS) if price_data else None
            ziel = cand.get(ATTR_ZIELKURS)

            kaufsignal = False
            if kurs is not None and ziel is not None:
                try:
                    kaufsignal = float(kurs) <= float(ziel)
                except (TypeError, ValueError):
                    pass

            updated[cid] = {
                **cand,
                ATTR_AKTUELLER_KURS: kurs,
                ATTR_KAUFSIGNAL:     kaufsignal,
            }
        return updated

    # ── CRUD ────────────────────────────────────────────────────────────────

    def get_candidates(self) -> dict:
        return self._candidates

    async def async_add_candidate(self, data: dict) -> None:
        import uuid
        cid = str(uuid.uuid4())
        self._candidates[cid] = data
        await self._save()
        await self.async_refresh()

    async def async_update_candidate(self, cid: str, data: dict) -> None:
        if cid in self._candidates:
            self._candidates[cid].update(data)
            await self._save()
            await self.async_refresh()

    async def async_remove_candidate(self, cid: str) -> None:
        self._candidates.pop(cid, None)
        await self._save()
        await self.async_refresh()

    async def _save(self) -> None:
        await self._store.async_save({"candidates": self._candidates})
