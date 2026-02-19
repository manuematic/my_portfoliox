"""Mein Portfolio – Home Assistant Integration."""
from __future__ import annotations

import logging
from datetime import date

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.entity_registry import async_get as async_get_entity_registry

from .const import (
    DOMAIN,
    PLATFORMS,
    CONF_PORTFOLIO_NAME,
    CONF_SCAN_INTERVAL,
    DEFAULT_SCAN_INTERVAL,
    SERVICE_ADD_STOCK,
    SERVICE_REMOVE_STOCK,
    SERVICE_UPDATE_STOCK,
    ATTR_KUERZEL,
    ATTR_PREIS,
    ATTR_STUECKZAHL,
    ATTR_KAUFDATUM,
    ATTR_LIMIT_OBEN,
    ATTR_LIMIT_UNTEN,
)
from .coordinator import MyPortfolioCoordinator

_LOGGER = logging.getLogger(__name__)

# ------------------------------------------------------------------ #
#  Service schemas                                                     #
# ------------------------------------------------------------------ #

STOCK_BASE_SCHEMA = {
    vol.Required(ATTR_KUERZEL): cv.string,
    vol.Required(ATTR_PREIS): vol.All(vol.Coerce(float), vol.Range(min=0)),
    vol.Required(ATTR_STUECKZAHL): vol.All(vol.Coerce(int), vol.Range(min=1)),
    vol.Required(ATTR_KAUFDATUM): cv.date,
    vol.Optional(ATTR_LIMIT_OBEN): vol.All(vol.Coerce(float), vol.Range(min=0)),
    vol.Optional(ATTR_LIMIT_UNTEN): vol.All(vol.Coerce(float), vol.Range(min=0)),
}

ADD_STOCK_SCHEMA = vol.Schema(
    {
        vol.Required("entry_id"): cv.string,
        **STOCK_BASE_SCHEMA,
    }
)

UPDATE_STOCK_SCHEMA = vol.Schema(
    {
        vol.Required("entry_id"): cv.string,
        vol.Required("stock_id"): cv.string,
        **{k: v for k, v in STOCK_BASE_SCHEMA.items() if isinstance(k, vol.Optional)},
        vol.Optional(ATTR_KUERZEL): cv.string,
        vol.Optional(ATTR_PREIS): vol.All(vol.Coerce(float), vol.Range(min=0)),
        vol.Optional(ATTR_STUECKZAHL): vol.All(vol.Coerce(int), vol.Range(min=1)),
        vol.Optional(ATTR_KAUFDATUM): cv.date,
    }
)

REMOVE_STOCK_SCHEMA = vol.Schema(
    {
        vol.Required("entry_id"): cv.string,
        vol.Required("stock_id"): cv.string,
    }
)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Mein Portfolio from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    portfolio_name = entry.data[CONF_PORTFOLIO_NAME]
    scan_interval = entry.options.get(
        CONF_SCAN_INTERVAL,
        entry.data.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
    )

    coordinator = MyPortfolioCoordinator(
        hass,
        portfolio_name=portfolio_name,
        entry_id=entry.entry_id,
        scan_interval=scan_interval,
    )

    await coordinator.async_setup()
    await coordinator.async_config_entry_first_refresh()

    hass.data[DOMAIN][entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # Register options listener
    entry.async_on_unload(entry.add_update_listener(_async_update_options))

    # ---------------------------------------------------------------- #
    #  Register services (only once)                                    #
    # ---------------------------------------------------------------- #
    if not hass.services.has_service(DOMAIN, SERVICE_ADD_STOCK):

        async def handle_add_stock(call: ServiceCall) -> None:
            """Add a stock to a portfolio."""
            entry_id = call.data["entry_id"]
            coord: MyPortfolioCoordinator | None = hass.data[DOMAIN].get(entry_id)
            if coord is None:
                _LOGGER.error("Portfolio entry_id '%s' not found", entry_id)
                return

            stock_data = {
                ATTR_KUERZEL: call.data[ATTR_KUERZEL].upper(),
                ATTR_PREIS: round(float(call.data[ATTR_PREIS]), 3),
                ATTR_STUECKZAHL: int(call.data[ATTR_STUECKZAHL]),
                ATTR_KAUFDATUM: call.data[ATTR_KAUFDATUM].isoformat()
                if isinstance(call.data[ATTR_KAUFDATUM], date)
                else call.data[ATTR_KAUFDATUM],
                ATTR_LIMIT_OBEN: round(float(call.data[ATTR_LIMIT_OBEN]), 3)
                if call.data.get(ATTR_LIMIT_OBEN) is not None
                else None,
                ATTR_LIMIT_UNTEN: round(float(call.data[ATTR_LIMIT_UNTEN]), 3)
                if call.data.get(ATTR_LIMIT_UNTEN) is not None
                else None,
            }
            stock_id = await coord.async_add_stock(stock_data)
            _LOGGER.info("Added stock %s (id=%s) to portfolio '%s'",
                         stock_data[ATTR_KUERZEL], stock_id, coord.portfolio_name)
            # Coordinator listener in sensor.py handles the new entity automatically

        hass.services.async_register(
            DOMAIN, SERVICE_ADD_STOCK, handle_add_stock, schema=ADD_STOCK_SCHEMA
        )

        async def handle_update_stock(call: ServiceCall) -> None:
            """Update an existing stock."""
            entry_id = call.data["entry_id"]
            coord: MyPortfolioCoordinator | None = hass.data[DOMAIN].get(entry_id)
            if coord is None:
                _LOGGER.error("Portfolio entry_id '%s' not found", entry_id)
                return

            stock_id = call.data["stock_id"]
            update_data = {}
            for field in [ATTR_KUERZEL, ATTR_PREIS, ATTR_STUECKZAHL, ATTR_KAUFDATUM,
                          ATTR_LIMIT_OBEN, ATTR_LIMIT_UNTEN]:
                if field in call.data:
                    val = call.data[field]
                    if field == ATTR_KAUFDATUM and isinstance(val, date):
                        val = val.isoformat()
                    update_data[field] = val

            await coord.async_update_stock(stock_id, update_data)
            _LOGGER.info("Updated stock %s in portfolio '%s'", stock_id, coord.portfolio_name)

        hass.services.async_register(
            DOMAIN, SERVICE_UPDATE_STOCK, handle_update_stock, schema=UPDATE_STOCK_SCHEMA
        )

        async def handle_remove_stock(call: ServiceCall) -> None:
            """Remove a stock from a portfolio."""
            entry_id = call.data["entry_id"]
            coord: MyPortfolioCoordinator | None = hass.data[DOMAIN].get(entry_id)
            if coord is None:
                _LOGGER.error("Portfolio entry_id '%s' not found", entry_id)
                return

            stock_id = call.data["stock_id"]

            # Remove entity from registry
            ent_reg = async_get_entity_registry(hass)
            entity_id = ent_reg.async_get_entity_id("sensor", DOMAIN, stock_id)
            if entity_id:
                ent_reg.async_remove(entity_id)

            await coord.async_remove_stock(stock_id)
            _LOGGER.info("Removed stock %s from portfolio '%s'", stock_id, coord.portfolio_name)

        hass.services.async_register(
            DOMAIN, SERVICE_REMOVE_STOCK, handle_remove_stock, schema=REMOVE_STOCK_SCHEMA
        )

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

    if unload_ok:
        coordinator: MyPortfolioCoordinator = hass.data[DOMAIN].pop(entry.entry_id)
        await coordinator.async_shutdown()

    return unload_ok


async def _async_update_options(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Handle options update — reload the entry."""
    await hass.config_entries.async_reload(entry.entry_id)
