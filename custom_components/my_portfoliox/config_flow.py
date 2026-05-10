"""Config flow + vollständiger Options-Flow für My Portfolio X."""
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
    CONF_INFLUX_URL,
    CONF_INFLUX_TOKEN,
    CONF_INFLUX_ORG,
    CONF_INFLUX_BUCKET,
    CONF_STEUERSATZ,
    DEFAULT_SCAN_INTERVAL,
    DEFAULT_SOURCE,
    DEFAULT_STEUERSATZ,
    SOURCE_ING,
    SOURCE_YAHOO,
    ATTR_BEZEICHNUNG,
    ATTR_DATENQUELLE,
    ATTR_WKN,
    ATTR_ISIN,
    ATTR_KUERZEL,
    ATTR_PREIS,
    ATTR_STUECKZAHL,
    ATTR_KAUFDATUM,
    ATTR_LIMIT_OBEN,
    ATTR_LIMIT_UNTEN,
    ATTR_VERKAUFSKURS,
    ATTR_VERKAUFSDATUM,
)

_LOGGER = logging.getLogger(__name__)


# ── Hilfsfunktionen ───────────────────────────────────────────────────────────

def _source_label(source: str) -> str:
    return {
        SOURCE_ING:   "ING (via ISIN – aktuell, DE & internationale Aktien)",
        SOURCE_YAHOO: "Yahoo Finance (via Kürzel – US-Aktien, ETFs)",
    }.get(source, source)


def _stock_schema(defaults: dict | None = None, data_source: str = SOURCE_YAHOO) -> vol.Schema:
    d = defaults or {}
    return vol.Schema({
        vol.Required(ATTR_BEZEICHNUNG, default=d.get(ATTR_BEZEICHNUNG, "")): selector.selector(
            {"text": {"type": "text"}}
        ),
        vol.Required(ATTR_KUERZEL, default=d.get(ATTR_KUERZEL, "")): selector.selector(
            {"text": {"type": "text"}}
        ),
        vol.Required(ATTR_DATENQUELLE, default=d.get(ATTR_DATENQUELLE, SOURCE_ING)): selector.selector({
            "select": {
                "options": [
                    {"value": SOURCE_ING,   "label": _source_label(SOURCE_ING)},
                    {"value": SOURCE_YAHOO, "label": _source_label(SOURCE_YAHOO)},
                ],
                "mode": "list",
            }
        }),
        vol.Optional(ATTR_WKN, default=d.get(ATTR_WKN, "")): selector.selector(
            {"text": {"type": "text"}}
        ),
        vol.Required(ATTR_ISIN, default=d.get(ATTR_ISIN, "")): selector.selector(
            {"text": {"type": "text"}}
        ),
        vol.Required(ATTR_PREIS, default=d.get(ATTR_PREIS, 0.0)): selector.selector(
            {"number": {"min": 0, "max": 999999, "step": 0.001, "mode": "box"}}
        ),
        vol.Required(ATTR_STUECKZAHL, default=d.get(ATTR_STUECKZAHL, 1)): selector.selector(
            {"number": {"min": 0.001, "max": 999999, "step": 0.001, "mode": "box"}}
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
    })


def _current_options(config_entry) -> dict:
    opts = {**config_entry.data, **config_entry.options}
    return {
        CONF_SCAN_INTERVAL:  opts.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
        CONF_DATA_SOURCE:    opts.get(CONF_DATA_SOURCE, DEFAULT_SOURCE),
        CONF_FMP_API_KEY:    opts.get(CONF_FMP_API_KEY, ""),
        CONF_INFLUX_URL:     opts.get(CONF_INFLUX_URL, ""),
        CONF_INFLUX_TOKEN:   opts.get(CONF_INFLUX_TOKEN, ""),
        CONF_INFLUX_ORG:     opts.get(CONF_INFLUX_ORG, ""),
        CONF_INFLUX_BUCKET:  opts.get(CONF_INFLUX_BUCKET, ""),
        CONF_STEUERSATZ:     opts.get(CONF_STEUERSATZ, DEFAULT_STEUERSATZ),
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
                        CONF_SCAN_INTERVAL:  user_input.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
                        CONF_DATA_SOURCE:    user_input.get(CONF_DATA_SOURCE, DEFAULT_SOURCE),
                    },
                )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({
                vol.Required(CONF_PORTFOLIO_NAME, default="My Portfolio X"): selector.selector(
                    {"text": {"type": "text"}}
                ),
                vol.Required(CONF_DATA_SOURCE, default=DEFAULT_SOURCE): selector.selector({
                    "select": {
                        "options": [
                            {"value": SOURCE_ING,   "label": _source_label(SOURCE_ING)},
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
        self._sell_result: dict | None = None

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
            if action == "sell":
                return await self.async_step_sell_select()
            if action == "settings":
                return await self.async_step_settings()

        actions = [selector.SelectOptionDict(value="add", label="➕ Aktie hinzufügen")]
        if stocks:
            actions.append(selector.SelectOptionDict(value="edit",     label="✏️  Aktie bearbeiten / löschen"))
            actions.append(selector.SelectOptionDict(value="sell",     label="💰 Aktie verkaufen"))
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
            isin    = str(user_input.get(ATTR_ISIN, "")).strip().upper()
            quelle  = user_input.get(ATTR_DATENQUELLE, SOURCE_ING)
            if not kuerzel:
                errors[ATTR_KUERZEL] = "invalid_kuerzel"
            elif quelle == SOURCE_ING and not isin:
                errors[ATTR_ISIN] = "isin_required"
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

    # ── Aktie auswählen (Bearbeiten/Löschen) ─────────────────────────────

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
                            selector.SelectOptionDict(value="edit",   label="✏️  Bearbeiten"),
                            selector.SelectOptionDict(value="delete", label="🗑️  Löschen (ohne Buchung)"),
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
            isin    = str(user_input.get(ATTR_ISIN, "")).strip().upper()
            quelle  = user_input.get(ATTR_DATENQUELLE, SOURCE_ING)
            if not kuerzel:
                errors[ATTR_KUERZEL] = "invalid_kuerzel"
            elif quelle == SOURCE_ING and not isin:
                errors[ATTR_ISIN] = "isin_required"
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
        stock  = stocks.get(self._selected_stock_id or "", {})
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

    # ── Aktie verkaufen: Auswahl ──────────────────────────────────────────

    async def async_step_sell_select(self, user_input=None):
        coordinator = self._get_coordinator()
        stocks = coordinator.get_stocks() if coordinator else {}

        if not stocks:
            return await self.async_step_init()

        if user_input is not None:
            self._selected_stock_id = user_input.get("stock_id")
            return await self.async_step_sell_details()

        options = [
            selector.SelectOptionDict(
                value=sid,
                label=(
                    f"{s.get(ATTR_BEZEICHNUNG,'').strip() or s.get(ATTR_KUERZEL,'?')}"
                    f" ({s.get(ATTR_KUERZEL,'?')})  —  "
                    f"{s.get(ATTR_STUECKZAHL,'?')} Stk. @ {s.get(ATTR_PREIS,'?')} €"
                )
            )
            for sid, s in stocks.items()
        ]

        return self.async_show_form(
            step_id="sell_select",
            data_schema=vol.Schema({
                vol.Required("stock_id"): selector.selector(
                    {"select": {"options": options, "mode": "list"}}
                ),
            }),
        )

    # ── Aktie verkaufen: Details ──────────────────────────────────────────

    async def async_step_sell_details(self, user_input=None):
        coordinator = self._get_coordinator()
        stocks = coordinator.get_stocks() if coordinator else {}
        stock  = stocks.get(self._selected_stock_id or "", {})

        from datetime import date as _date
        today = _date.today().isoformat()

        if user_input is not None:
            vkurs  = float(user_input.get(ATTR_VERKAUFSKURS, 0))
            vdatum = str(user_input.get(ATTR_VERKAUFSDATUM, today))
            if vkurs <= 0:
                return self.async_show_form(
                    step_id="sell_details",
                    description_placeholders={
                        "kuerzel":    stock.get(ATTR_KUERZEL, "?"),
                        "kaufkurs":   str(stock.get(ATTR_PREIS, "?")),
                        "stueckzahl": str(stock.get(ATTR_STUECKZAHL, "?")),
                    },
                    data_schema=vol.Schema({
                        vol.Required(ATTR_VERKAUFSKURS, default=0.0): selector.selector(
                            {"number": {"min": 0.001, "max": 999999, "step": 0.001, "mode": "box"}}
                        ),
                        vol.Required(ATTR_VERKAUFSDATUM, default=today): selector.selector(
                            {"date": {}}
                        ),
                    }),
                    errors={ATTR_VERKAUFSKURS: "invalid_kurs"},
                )

            # Vorberechnung für Bestätigungsschritt
            kaufkurs   = float(stock.get(ATTR_PREIS, 0))
            stueckzahl = float(stock.get(ATTR_STUECKZAHL, 0))
            steuersatz = coordinator._steuersatz() if coordinator else 26.375
            erloes     = round(vkurs * stueckzahl, 2)
            g_brutto   = round((vkurs - kaufkurs) * stueckzahl, 2)
            steuer     = round(max(0.0, g_brutto) * steuersatz / 100.0, 2)
            g_netto    = round(g_brutto - steuer, 2)

            self._sell_result = {
                "stock_id":      self._selected_stock_id,
                "verkaufskurs":  vkurs,
                "verkaufsdatum": vdatum,
                "kuerzel":       stock.get(ATTR_KUERZEL, "?"),
                "bezeichnung":   stock.get(ATTR_BEZEICHNUNG, ""),
                "kaufkurs":      kaufkurs,
                "stueckzahl":    stueckzahl,
                "erloes":        erloes,
                "gewinn_brutto": g_brutto,
                "steuer":        steuer,
                "gewinn_netto":  g_netto,
                "steuersatz":    steuersatz,
            }
            return await self.async_step_sell_confirm()

        return self.async_show_form(
            step_id="sell_details",
            description_placeholders={
                "kuerzel":    stock.get(ATTR_KUERZEL, "?"),
                "kaufkurs":   str(stock.get(ATTR_PREIS, "?")),
                "stueckzahl": str(stock.get(ATTR_STUECKZAHL, "?")),
            },
            data_schema=vol.Schema({
                vol.Required(ATTR_VERKAUFSKURS, default=0.0): selector.selector(
                    {"number": {"min": 0.001, "max": 999999, "step": 0.001, "mode": "box"}}
                ),
                vol.Required(ATTR_VERKAUFSDATUM, default=today): selector.selector(
                    {"date": {}}
                ),
            }),
        )

    # ── Aktie verkaufen: Bestätigung ──────────────────────────────────────

    async def async_step_sell_confirm(self, user_input=None):
        r = self._sell_result or {}

        sign = "+" if (r.get("gewinn_brutto") or 0) >= 0 else ""
        summary = (
            f"Aktie:           {r.get('bezeichnung') or r.get('kuerzel','?')} ({r.get('kuerzel','?')})\n"
            f"Kaufkurs:        {r.get('kaufkurs','?')} €  ×  {r.get('stueckzahl','?')} Stk.\n"
            f"Verkaufskurs:    {r.get('verkaufskurs','?')} €\n"
            f"Erlös gesamt:    {r.get('erloes','?')} €\n"
            f"Gewinn brutto:   {sign}{r.get('gewinn_brutto','?')} €\n"
            f"Steuer ({r.get('steuersatz','?')}%): -{r.get('steuer','?')} €\n"
            f"Gewinn netto:    {sign}{r.get('gewinn_netto','?')} €"
        )

        if user_input is not None:
            if user_input.get("confirm") and r.get("stock_id"):
                coordinator = self._get_coordinator()
                if coordinator:
                    from homeassistant.helpers.entity_registry import async_get as async_get_er
                    ent_reg = async_get_er(self.hass)
                    entity_id = ent_reg.async_get_entity_id("sensor", DOMAIN, r["stock_id"])
                    if entity_id:
                        ent_reg.async_remove(entity_id)
                    await coordinator.async_sell_stock(
                        r["stock_id"], r["verkaufskurs"], r["verkaufsdatum"]
                    )
            return self.async_create_entry(title="", data=_current_options(self.config_entry))

        return self.async_show_form(
            step_id="sell_confirm",
            description_placeholders={"summary": summary},
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
                # Kursabruf
                vol.Required(CONF_DATA_SOURCE, default=opts[CONF_DATA_SOURCE]): selector.selector({
                    "select": {
                        "options": [
                            {"value": SOURCE_ING,   "label": _source_label(SOURCE_ING)},
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
                # InfluxDB 2
                vol.Optional(CONF_INFLUX_URL, default=opts.get(CONF_INFLUX_URL, "")): selector.selector(
                    {"text": {"type": "url"}}
                ),
                vol.Optional(CONF_INFLUX_TOKEN, default=opts.get(CONF_INFLUX_TOKEN, "")): selector.selector(
                    {"text": {"type": "password"}}
                ),
                vol.Optional(CONF_INFLUX_ORG, default=opts.get(CONF_INFLUX_ORG, "")): selector.selector(
                    {"text": {"type": "text"}}
                ),
                vol.Optional(CONF_INFLUX_BUCKET, default=opts.get(CONF_INFLUX_BUCKET, "")): selector.selector(
                    {"text": {"type": "text"}}
                ),
                # Steuer
                vol.Optional(CONF_STEUERSATZ, default=opts.get(CONF_STEUERSATZ, DEFAULT_STEUERSATZ)): selector.selector(
                    {"number": {"min": 0, "max": 100, "step": 0.001, "mode": "box",
                                "unit_of_measurement": "%"}}
                ),
            }),
        )

    # ── Hilfsmethoden ─────────────────────────────────────────────────────

    def _get_coordinator(self):
        return self.hass.data.get(DOMAIN, {}).get(self.config_entry.entry_id)

    @staticmethod
    def _build_stock_data(user_input: dict, kuerzel: str) -> dict:
        limit_oben  = user_input.get(ATTR_LIMIT_OBEN)
        limit_unten = user_input.get(ATTR_LIMIT_UNTEN)
        return {
            ATTR_BEZEICHNUNG: str(user_input.get(ATTR_BEZEICHNUNG, "")).strip(),
            ATTR_DATENQUELLE: user_input.get(ATTR_DATENQUELLE, SOURCE_ING),
            ATTR_KUERZEL:     kuerzel,
            ATTR_WKN:         str(user_input.get(ATTR_WKN, "")).strip().upper(),
            ATTR_ISIN:        str(user_input.get(ATTR_ISIN, "")).strip().upper(),
            ATTR_PREIS:       round(float(user_input[ATTR_PREIS]), 3),
            ATTR_STUECKZAHL:  round(float(user_input[ATTR_STUECKZAHL]), 3),
            ATTR_KAUFDATUM:   user_input[ATTR_KAUFDATUM],
            ATTR_LIMIT_OBEN:  round(float(limit_oben),  3) if limit_oben  else None,
            ATTR_LIMIT_UNTEN: round(float(limit_unten), 3) if limit_unten else None,
        }
