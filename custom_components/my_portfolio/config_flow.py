"""Config flow + vollständiger Options-Flow für Mein Portfolio."""
from __future__ import annotations

import uuid
import logging
from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import (
    DOMAIN,
    CONF_PORTFOLIO_NAME,
    CONF_SCAN_INTERVAL,
    DEFAULT_SCAN_INTERVAL,
    ATTR_KUERZEL,
    ATTR_PREIS,
    ATTR_STUECKZAHL,
    ATTR_KAUFDATUM,
    ATTR_LIMIT_OBEN,
    ATTR_LIMIT_UNTEN,
)

_LOGGER = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Hilfsfunktionen für Formulare
# ---------------------------------------------------------------------------

def _stock_schema(defaults: dict | None = None) -> vol.Schema:
    """Erstellt das Formular-Schema für eine Aktie."""
    d = defaults or {}
    return vol.Schema(
        {
            vol.Required(ATTR_KUERZEL, default=d.get(ATTR_KUERZEL, "")): selector.selector(
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
    )


# ---------------------------------------------------------------------------
# Config Flow (Ersteinrichtung: Portfolio-Name + Intervall)
# ---------------------------------------------------------------------------

class MyPortfolioConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Erstellt ein neues Portfolio."""

    VERSION = 1

    async def async_step_user(self, user_input: dict | None = None):
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
                    },
                )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_PORTFOLIO_NAME, default="Mein Portfolio"): selector.selector(
                        {"text": {"type": "text"}}
                    ),
                    vol.Optional(CONF_SCAN_INTERVAL, default=DEFAULT_SCAN_INTERVAL): selector.selector(
                        {"number": {"min": 1, "max": 1440, "step": 1, "mode": "box", "unit_of_measurement": "min"}}
                    ),
                }
            ),
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> "MyPortfolioOptionsFlow":
        return MyPortfolioOptionsFlow()


# ---------------------------------------------------------------------------
# Options Flow – vollständige Portfolio-Verwaltung per UI
# ---------------------------------------------------------------------------

class MyPortfolioOptionsFlow(config_entries.OptionsFlow):
    """
    Mehrstufiges Menü:
      init        → Übersicht mit Liste aller Aktien + Aktionen
      add_stock   → Neue Aktie hinzufügen
      select_stock→ Aktie aus Liste wählen (Bearbeiten/Löschen)
      edit_stock  → Gewählte Aktie bearbeiten
      confirm_delete → Löschen bestätigen
      settings    → Aktualisierungsintervall
    """

    def __init__(self) -> None:
        self._selected_stock_id: str | None = None

    # ------------------------------------------------------------------
    # Schritt 1: Hauptmenü
    # ------------------------------------------------------------------
    async def async_step_init(self, user_input: dict | None = None):
        """Hauptmenü: Was möchtest du tun?"""
        coordinator = self._get_coordinator()
        stocks = coordinator.get_stocks() if coordinator else {}

        # Aktien-Übersicht für die Beschreibung aufbereiten
        stock_lines = []
        for sid, s in stocks.items():
            stock_lines.append(f"• {s.get(ATTR_KUERZEL,'?')}  —  {s.get(ATTR_STUECKZAHL,'?')} Stk. @ {s.get(ATTR_PREIS,'?')}")
        overview = "\n".join(stock_lines) if stock_lines else "Noch keine Aktien im Portfolio."

        if user_input is not None:
            action = user_input.get("action")
            if action == "add":
                return await self.async_step_add_stock()
            if action == "edit":
                return await self.async_step_select_stock()
            if action == "settings":
                return await self.async_step_settings()
            # Nichts gewählt → Menü erneut zeigen
            return await self.async_step_init()

        actions = [
            selector.SelectOptionDict(value="add", label="➕ Aktie hinzufügen"),
        ]
        if stocks:
            actions.append(selector.SelectOptionDict(value="edit", label="✏️  Aktie bearbeiten / löschen"))
        actions.append(selector.SelectOptionDict(value="settings", label="⚙️  Einstellungen"))

        return self.async_show_form(
            step_id="init",
            description_placeholders={"overview": overview},
            data_schema=vol.Schema(
                {
                    vol.Required("action"): selector.selector(
                        {"select": {"options": actions, "mode": "list"}}
                    )
                }
            ),
        )

    # ------------------------------------------------------------------
    # Schritt 2a: Neue Aktie hinzufügen
    # ------------------------------------------------------------------
    async def async_step_add_stock(self, user_input: dict | None = None):
        errors: dict[str, str] = {}

        if user_input is not None:
            kuerzel = str(user_input.get(ATTR_KUERZEL, "")).strip().upper()
            if not kuerzel:
                errors[ATTR_KUERZEL] = "invalid_kuerzel"
            else:
                stock_data = self._build_stock_data(user_input, kuerzel)
                coordinator = self._get_coordinator()
                if coordinator:
                    await coordinator.async_add_stock(stock_data)
                    _LOGGER.info("Aktie %s über UI hinzugefügt", kuerzel)
                # Zurück zum Hauptmenü (Flow schließen mit aktualisierten Options)
                return self.async_create_entry(title="", data={
                    CONF_SCAN_INTERVAL: self.config_entry.options.get(
                        CONF_SCAN_INTERVAL,
                        self.config_entry.data.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)
                    )
                })

        return self.async_show_form(
            step_id="add_stock",
            data_schema=_stock_schema(),
            errors=errors,
        )

    # ------------------------------------------------------------------
    # Schritt 2b: Aktie aus Liste wählen
    # ------------------------------------------------------------------
    async def async_step_select_stock(self, user_input: dict | None = None):
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
            return await self.async_step_select_stock()

        options = [
            selector.SelectOptionDict(
                value=sid,
                label=f"{s.get(ATTR_KUERZEL,'?')}  ({s.get(ATTR_STUECKZAHL,'?')} Stk. @ {s.get(ATTR_PREIS,'?')})"
            )
            for sid, s in stocks.items()
        ]

        return self.async_show_form(
            step_id="select_stock",
            data_schema=vol.Schema(
                {
                    vol.Required("stock_id"): selector.selector(
                        {"select": {"options": options, "mode": "list"}}
                    ),
                    vol.Required("action"): selector.selector(
                        {"select": {
                            "options": [
                                selector.SelectOptionDict(value="edit", label="✏️  Bearbeiten"),
                                selector.SelectOptionDict(value="delete", label="🗑️  Löschen"),
                            ],
                            "mode": "list",
                        }}
                    ),
                }
            ),
        )

    # ------------------------------------------------------------------
    # Schritt 2c: Gewählte Aktie bearbeiten
    # ------------------------------------------------------------------
    async def async_step_edit_stock(self, user_input: dict | None = None):
        errors: dict[str, str] = {}
        coordinator = self._get_coordinator()
        stocks = coordinator.get_stocks() if coordinator else {}
        stock = stocks.get(self._selected_stock_id or "", {})

        if user_input is not None:
            kuerzel = str(user_input.get(ATTR_KUERZEL, "")).strip().upper()
            if not kuerzel:
                errors[ATTR_KUERZEL] = "invalid_kuerzel"
            else:
                stock_data = self._build_stock_data(user_input, kuerzel)
                if coordinator and self._selected_stock_id:
                    await coordinator.async_update_stock(self._selected_stock_id, stock_data)
                    _LOGGER.info("Aktie %s über UI aktualisiert", kuerzel)
                return self.async_create_entry(title="", data={
                    CONF_SCAN_INTERVAL: self.config_entry.options.get(
                        CONF_SCAN_INTERVAL,
                        self.config_entry.data.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)
                    )
                })

        return self.async_show_form(
            step_id="edit_stock",
            data_schema=_stock_schema(defaults=stock),
            errors=errors,
            description_placeholders={
                "kuerzel": stock.get(ATTR_KUERZEL, "?")
            },
        )

    # ------------------------------------------------------------------
    # Schritt 2d: Löschen bestätigen
    # ------------------------------------------------------------------
    async def async_step_confirm_delete(self, user_input: dict | None = None):
        coordinator = self._get_coordinator()
        stocks = coordinator.get_stocks() if coordinator else {}
        stock = stocks.get(self._selected_stock_id or "", {})
        kuerzel = stock.get(ATTR_KUERZEL, "?")

        if user_input is not None:
            if user_input.get("confirm"):
                if coordinator and self._selected_stock_id:
                    # Entity aus Registry entfernen
                    from homeassistant.helpers.entity_registry import async_get as async_get_er
                    ent_reg = async_get_er(self.hass)
                    entity_id = ent_reg.async_get_entity_id("sensor", DOMAIN, self._selected_stock_id)
                    if entity_id:
                        ent_reg.async_remove(entity_id)
                    await coordinator.async_remove_stock(self._selected_stock_id)
                    _LOGGER.info("Aktie %s über UI gelöscht", kuerzel)
            return self.async_create_entry(title="", data={
                CONF_SCAN_INTERVAL: self.config_entry.options.get(
                    CONF_SCAN_INTERVAL,
                    self.config_entry.data.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)
                )
            })

        return self.async_show_form(
            step_id="confirm_delete",
            description_placeholders={"kuerzel": kuerzel},
            data_schema=vol.Schema(
                {
                    vol.Required("confirm", default=False): selector.selector(
                        {"boolean": {}}
                    )
                }
            ),
        )

    # ------------------------------------------------------------------
    # Schritt 3: Einstellungen (Aktualisierungsintervall)
    # ------------------------------------------------------------------
    async def async_step_settings(self, user_input: dict | None = None):
        if user_input is not None:
            return self.async_create_entry(title="", data={
                CONF_SCAN_INTERVAL: user_input[CONF_SCAN_INTERVAL]
            })

        current = self.config_entry.options.get(
            CONF_SCAN_INTERVAL,
            self.config_entry.data.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
        )

        return self.async_show_form(
            step_id="settings",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_SCAN_INTERVAL, default=current): selector.selector(
                        {"number": {"min": 1, "max": 1440, "step": 1, "mode": "box", "unit_of_measurement": "min"}}
                    ),
                }
            ),
        )

    # ------------------------------------------------------------------
    # Hilfsmethoden
    # ------------------------------------------------------------------

    def _get_coordinator(self):
        """Gibt den Coordinator für diesen Config Entry zurück."""
        from homeassistant.helpers import entity_registry  # noqa
        hass_data = self.hass.data.get(DOMAIN, {})
        return hass_data.get(self.config_entry.entry_id)

    @staticmethod
    def _build_stock_data(user_input: dict, kuerzel: str) -> dict:
        """Bereitet die Aktien-Daten für den Coordinator auf."""
        limit_oben = user_input.get(ATTR_LIMIT_OBEN)
        limit_unten = user_input.get(ATTR_LIMIT_UNTEN)
        return {
            ATTR_KUERZEL: kuerzel,
            ATTR_PREIS: round(float(user_input[ATTR_PREIS]), 3),
            ATTR_STUECKZAHL: int(user_input[ATTR_STUECKZAHL]),
            ATTR_KAUFDATUM: user_input[ATTR_KAUFDATUM],
            ATTR_LIMIT_OBEN: round(float(limit_oben), 3) if limit_oben else None,
            ATTR_LIMIT_UNTEN: round(float(limit_unten), 3) if limit_unten else None,
        }
