"""Config flow + vollständiger Options-Flow für Mein Portfolio."""
from __future__ import annotations

import logging

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import (
    DOMAIN,
    CONF_PORTFOLIO_NAME,
    CONF_SCAN_INTERVAL,
    CONF_DATA_SOURCE,
    CONF_FMP_API_KEY,
    DEFAULT_SCAN_INTERVAL,
    DEFAULT_SOURCE,
    SOURCE_YAHOO,
    ATTR_BEZEICHNUNG,
    ATTR_WKN,
    ATTR_ISIN,
    ATTR_KUERZEL,
    ATTR_WKN,
    ATTR_ISIN,
    ATTR_PREIS,
    ATTR_STUECKZAHL,
    ATTR_KAUFDATUM,
    ATTR_LIMIT_OBEN,
    ATTR_LIMIT_UNTEN,
)

_LOGGER = logging.getLogger(__name__)

# ── Hilfsfunktionen ───────────────────────────────────────────────────────────

def _source_label(source: str) -> str:
    return {
        SOURCE_YAHOO: "Yahoo Finance (Kürzel wie AAPL, BAS.DE)",
    }.get(source, source)


def _stock_schema(defaults: dict | None = None, data_source: str = SOURCE_YAHOO) -> vol.Schema:
    d = defaults or {}
    schema_dict = {
        vol.Required(ATTR_BEZEICHNUNG, default=d.get(ATTR_BEZEICHNUNG, "")): selector.selector(
            {"text": {"type": "text"}}
        ),
        vol.Required(ATTR_KUERZEL, default=d.get(ATTR_KUERZEL, "")): selector.selector(
            {"text": {"type": "text"}}
        ),
        vol.Optional(ATTR_WKN, default=d.get(ATTR_WKN, "")): selector.selector(
            {"text": {"type": "text"}}
        ),
        vol.Optional(ATTR_ISIN, default=d.get(ATTR_ISIN, "")): selector.selector(
            {"text": {"type": "text"}}
        ),
        vol.Required(ATTR_PREIS, default=d.get(ATTR_PREIS, 0.0)): selector.selector(
            {"number": {"min": 0, "max": 999999, "step": 0.001, "mode": "box"}}
        ),
        vol.Required(ATTR_STUECKZAHL, default=d.get(ATTR_STUECKZAHL, 1)): selector.selector(
            {"number": {"min": 1, "max": 999999, "step": 1, "mode": "box"}}
        ),
        vol.Required(ATTR_KAUFDATUM, default=d.get(ATTR_KAUFDATUM, "")): selector.selector(
            {"date": {}}
        ),
        vol.Optional(ATTR_LIMIT_OBEN, default=d.get(ATTR_LIMIT_OBEN, 0.0)): selector.selector(
            {"number": {"min": 0, "max": 999999, "step": 0.001, "mode": "box"}}
        ),
        vol.Optional(ATTR_LIMIT_UNTEN, default=d.get(ATTR_LIMIT_UNTEN, 0.0)): selector.selector(
            {"number": {"min": 0, "max": 999999, "step": 0.001, "mode": "box"}}
        ),
    }


    return vol.Schema(schema_dict)


def _current_options(config_entry) -> dict:
    return {
        CONF_SCAN_INTERVAL: config_entry.options.get(
            CONF_SCAN_INTERVAL,
            config_entry.data.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
        ),
        CONF_DATA_SOURCE: config_entry.options.get(
            CONF_DATA_SOURCE,
            config_entry.data.get(CONF_DATA_SOURCE, DEFAULT_SOURCE),
        ),
        CONF_FMP_API_KEY: config_entry.options.get(
            CONF_FMP_API_KEY,
            config_entry.data.get(CONF_FMP_API_KEY, ""),
        ),
    }


# ── Config Flow (Ersteinrichtung) ─────────────────────────────────────────────

class MyPortfolioConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Erstellt ein neues Portfolio."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
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
                        CONF_SCAN_INTERVAL: user_input.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
                        CONF_DATA_SOURCE: user_input.get(CONF_DATA_SOURCE, DEFAULT_SOURCE),
                    },
                )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({
                vol.Required(CONF_PORTFOLIO_NAME, default="Mein Portfolio"): selector.selector(
                    {"text": {"type": "text"}}
                ),
                vol.Required(CONF_DATA_SOURCE, default=DEFAULT_SOURCE): selector.selector({
                    "select": {
                        "options": [
                            {"value": SOURCE_YAHOO, "label": _source_label(SOURCE_YAHOO)},
                        ],
                        "mode": "list",
                    }
                }),
                vol.Optional(CONF_SCAN_INTERVAL, default=DEFAULT_SCAN_INTERVAL): selector.selector(
                    {"number": {"min": 1, "max": 1440, "step": 1, "mode": "box",
                                "unit_of_measurement": "min"}}
                ),
            }),
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry) -> "MyPortfolioOptionsFlow":
        return MyPortfolioOptionsFlow()


# ── Options Flow (Portfolio-Verwaltung) ───────────────────────────────────────

class MyPortfolioOptionsFlow(config_entries.OptionsFlow):
    """Mehrstufiges Menü: Aktien verwalten + Einstellungen."""

    def __init__(self) -> None:
        self._selected_stock_id: str | None = None

    # ── Hauptmenü ─────────────────────────────────────────────────────────

    async def async_step_init(self, user_input=None):
        coordinator = self._get_coordinator()
        stocks = coordinator.get_stocks() if coordinator else {}

        stock_lines = []
        for s in stocks.values():
            bezeichnung = s.get(ATTR_BEZEICHNUNG, "").strip()
            label = f"{bezeichnung} ({s.get(ATTR_KUERZEL,'?')})" if bezeichnung else s.get(ATTR_KUERZEL, "?")
            stock_lines.append(f"• {label}  —  {s.get(ATTR_STUECKZAHL,'?')} Stk. @ {s.get(ATTR_PREIS,'?')}")
        overview = "\n".join(stock_lines) if stock_lines else "–"

        if user_input is not None:
            action = user_input.get("action")
            if action == "add":
                return await self.async_step_add_stock()
            if action == "edit":
                return await self.async_step_select_stock()
            if action == "settings":
                return await self.async_step_settings()

        actions = [selector.SelectOptionDict(value="add", label="➕ Aktie hinzufügen")]
        if stocks:
            actions.append(selector.SelectOptionDict(value="edit", label="✏️  Aktie bearbeiten / löschen"))
        actions.append(selector.SelectOptionDict(value="settings", label="⚙️  Einstellungen"))

        return self.async_show_form(
            step_id="init",
            description_placeholders={"overview": overview},
            data_schema=vol.Schema({
                vol.Required("action"): selector.selector(
                    {"select": {"options": actions, "mode": "list"}}
                )
            }),
        )

    # ── Aktie hinzufügen ──────────────────────────────────────────────────

    async def async_step_add_stock(self, user_input=None):
        errors: dict[str, str] = {}
        coordinator = self._get_coordinator()
        data_source = coordinator.data_source if coordinator else SOURCE_YAHOO

        if user_input is not None:
            kuerzel = str(user_input.get(ATTR_KUERZEL, "")).strip().upper()
            if not kuerzel:
                errors[ATTR_KUERZEL] = "invalid_kuerzel"
            else:
                stock_data = self._build_stock_data(user_input, kuerzel)
                if coordinator:
                    await coordinator.async_add_stock(stock_data)
                return self.async_create_entry(title="", data=_current_options(self.config_entry))

        return self.async_show_form(
            step_id="add_stock",
            data_schema=_stock_schema(data_source=data_source),
            errors=errors,
        )

    # ── Aktie auswählen ───────────────────────────────────────────────────

    async def async_step_select_stock(self, user_input=None):
        coordinator = self._get_coordinator()
        stocks = coordinator.get_stocks() if coordinator else {}

        if not stocks:
            return await self.async_step_init()

        if user_input is not None:
            self._selected_stock_id = user_input.get("stock_id")
            action = user_input.get("action")
            if action == "edit":
                return await self.async_step_edit_stock()
            if action == "delete":
                return await self.async_step_confirm_delete()

        options = [
            selector.SelectOptionDict(
                value=sid,
                label=(
                    f"{s.get(ATTR_BEZEICHNUNG,'').strip() or s.get(ATTR_KUERZEL,'?')}"
                    f" ({s.get(ATTR_KUERZEL,'?')})  —  "
                    f"{s.get(ATTR_STUECKZAHL,'?')} Stk. @ {s.get(ATTR_PREIS,'?')}"
                    if s.get(ATTR_BEZEICHNUNG, "").strip()
                    else f"{s.get(ATTR_KUERZEL,'?')}  —  {s.get(ATTR_STUECKZAHL,'?')} Stk. @ {s.get(ATTR_PREIS,'?')}"
                )
            )
            for sid, s in stocks.items()
        ]

        return self.async_show_form(
            step_id="select_stock",
            data_schema=vol.Schema({
                vol.Required("stock_id"): selector.selector(
                    {"select": {"options": options, "mode": "list"}}
                ),
                vol.Required("action"): selector.selector({
                    "select": {
                        "options": [
                            selector.SelectOptionDict(value="edit", label="✏️  Bearbeiten"),
                            selector.SelectOptionDict(value="delete", label="🗑️  Löschen"),
                        ],
                        "mode": "list",
                    }
                }),
            }),
        )

    # ── Aktie bearbeiten ──────────────────────────────────────────────────

    async def async_step_edit_stock(self, user_input=None):
        errors: dict[str, str] = {}
        coordinator = self._get_coordinator()
        stocks = coordinator.get_stocks() if coordinator else {}
        stock = stocks.get(self._selected_stock_id or "", {})
        data_source = coordinator.data_source if coordinator else SOURCE_YAHOO

        if user_input is not None:
            kuerzel = str(user_input.get(ATTR_KUERZEL, "")).strip().upper()
            if not kuerzel:
                errors[ATTR_KUERZEL] = "invalid_kuerzel"
            else:
                stock_data = self._build_stock_data(user_input, kuerzel)
                if coordinator and self._selected_stock_id:
                    await coordinator.async_update_stock(self._selected_stock_id, stock_data)
                return self.async_create_entry(title="", data=_current_options(self.config_entry))

        return self.async_show_form(
            step_id="edit_stock",
            data_schema=_stock_schema(defaults=stock, data_source=data_source),
            description_placeholders={"kuerzel": stock.get(ATTR_KUERZEL, "?")},
            errors=errors,
        )

    # ── Löschen bestätigen ────────────────────────────────────────────────

    async def async_step_confirm_delete(self, user_input=None):
        coordinator = self._get_coordinator()
        stocks = coordinator.get_stocks() if coordinator else {}
        stock = stocks.get(self._selected_stock_id or "", {})
        kuerzel = stock.get(ATTR_KUERZEL, "?")

        if user_input is not None:
            if user_input.get("confirm") and coordinator and self._selected_stock_id:
                from homeassistant.helpers.entity_registry import async_get as async_get_er
                ent_reg = async_get_er(self.hass)
                entity_id = ent_reg.async_get_entity_id("sensor", DOMAIN, self._selected_stock_id)
                if entity_id:
                    ent_reg.async_remove(entity_id)
                await coordinator.async_remove_stock(self._selected_stock_id)
            return self.async_create_entry(title="", data=_current_options(self.config_entry))

        return self.async_show_form(
            step_id="confirm_delete",
            description_placeholders={"kuerzel": kuerzel},
            data_schema=vol.Schema({
                vol.Required("confirm", default=False): selector.selector({"boolean": {}})
            }),
        )

    # ── Einstellungen ─────────────────────────────────────────────────────

    async def async_step_settings(self, user_input=None):
        opts = _current_options(self.config_entry)

        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        return self.async_show_form(
            step_id="settings",
            data_schema=vol.Schema({
                vol.Required(CONF_DATA_SOURCE, default=opts[CONF_DATA_SOURCE]): selector.selector({
                    "select": {
                        "options": [
                            {"value": SOURCE_YAHOO, "label": _source_label(SOURCE_YAHOO)},
                        ],
                        "mode": "list",
                    }
                }),
                vol.Required(CONF_SCAN_INTERVAL, default=opts[CONF_SCAN_INTERVAL]): selector.selector(
                    {"number": {"min": 1, "max": 1440, "step": 1, "mode": "box",
                                "unit_of_measurement": "min"}}
                ),
                vol.Optional(CONF_FMP_API_KEY, default=opts.get(CONF_FMP_API_KEY, "")): selector.selector(
                    {"text": {"type": "password"}}
                ),
            }),
        )

    # ── Hilfsmethoden ─────────────────────────────────────────────────────

    def _get_coordinator(self):
        return self.hass.data.get(DOMAIN, {}).get(self.config_entry.entry_id)

    @staticmethod
    def _build_stock_data(user_input: dict, kuerzel: str) -> dict:
        limit_oben = user_input.get(ATTR_LIMIT_OBEN)
        limit_unten = user_input.get(ATTR_LIMIT_UNTEN)
        return {
            ATTR_BEZEICHNUNG:    str(user_input.get(ATTR_BEZEICHNUNG, "")).strip(),
            ATTR_KUERZEL:        kuerzel,
            ATTR_WKN:            str(user_input.get(ATTR_WKN, "")).strip().upper(),
            ATTR_ISIN:           str(user_input.get(ATTR_ISIN, "")).strip().upper(),
            ATTR_PREIS:          round(float(user_input[ATTR_PREIS]), 3),
            ATTR_STUECKZAHL:     round(float(user_input[ATTR_STUECKZAHL]), 2),
            ATTR_KAUFDATUM:      user_input[ATTR_KAUFDATUM],
            ATTR_LIMIT_OBEN:     round(float(limit_oben), 3) if limit_oben else None,
            ATTR_LIMIT_UNTEN:    round(float(limit_unten), 3) if limit_unten else None,
        }
