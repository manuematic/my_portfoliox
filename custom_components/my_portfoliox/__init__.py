"""Mein Portfolio – Home Assistant Integration."""
from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import (
    DOMAIN,
    PLATFORMS,
    CONF_PORTFOLIO_NAME,
    CONF_SCAN_INTERVAL,
    CONF_DATA_SOURCE,
    DEFAULT_SCAN_INTERVAL,
    DEFAULT_SOURCE,
)
from .coordinator import MyPortfolioCoordinator

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.setdefault(DOMAIN, {})

    portfolio_name = entry.data[CONF_PORTFOLIO_NAME]
    scan_interval = entry.options.get(
        CONF_SCAN_INTERVAL,
        entry.data.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
    )
    data_source = entry.options.get(
        CONF_DATA_SOURCE,
        entry.data.get(CONF_DATA_SOURCE, DEFAULT_SOURCE),
    )

    coordinator = MyPortfolioCoordinator(
        hass,
        portfolio_name=portfolio_name,
        entry_id=entry.entry_id,
        scan_interval=scan_interval,
        data_source=data_source,
    )

    await coordinator.async_setup()
    await coordinator.async_config_entry_first_refresh()

    hass.data[DOMAIN][entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_update_options))

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        coordinator: MyPortfolioCoordinator = hass.data[DOMAIN].pop(entry.entry_id)
        await coordinator.async_shutdown()
    return unload_ok


async def _async_update_options(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)
