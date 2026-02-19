"""Config flow for Mein Portfolio."""
from __future__ import annotations

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback

from .const import (
    DOMAIN,
    CONF_PORTFOLIO_NAME,
    CONF_SCAN_INTERVAL,
    DEFAULT_SCAN_INTERVAL,
)


class MyPortfolioConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle the initial setup config flow."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the user step — create a portfolio."""
        errors: dict[str, str] = {}

        if user_input is not None:
            portfolio_name = user_input[CONF_PORTFOLIO_NAME].strip()
            if not portfolio_name:
                errors[CONF_PORTFOLIO_NAME] = "invalid_name"
            else:
                await self.async_set_unique_id(portfolio_name.lower())
                self._abort_if_unique_id_configured()

                return self.async_create_entry(
                    title=portfolio_name,
                    data={
                        CONF_PORTFOLIO_NAME: portfolio_name,
                        CONF_SCAN_INTERVAL: user_input.get(
                            CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL
                        ),
                    },
                )

        schema = vol.Schema(
            {
                vol.Required(CONF_PORTFOLIO_NAME, default="Mein Portfolio"): str,
                vol.Optional(CONF_SCAN_INTERVAL, default=DEFAULT_SCAN_INTERVAL): vol.All(
                    vol.Coerce(int), vol.Range(min=1, max=1440)
                ),
            }
        )

        return self.async_show_form(
            step_id="user",
            data_schema=schema,
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> "MyPortfolioOptionsFlow":
        """Return the options flow handler."""
        return MyPortfolioOptionsFlow()


class MyPortfolioOptionsFlow(config_entries.OptionsFlow):
    """Handle options — HA sets self.config_entry automatically (no __init__ needed)."""

    async def async_step_init(self, user_input=None):
        """Manage the options."""
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        current_interval = self.config_entry.options.get(
            CONF_SCAN_INTERVAL,
            self.config_entry.data.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
        )

        schema = vol.Schema(
            {
                vol.Optional(CONF_SCAN_INTERVAL, default=current_interval): vol.All(
                    vol.Coerce(int), vol.Range(min=1, max=1440)
                ),
            }
        )

        return self.async_show_form(step_id="init", data_schema=schema)
