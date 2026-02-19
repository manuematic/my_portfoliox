"""Constants for Mein Portfolio integration."""

DOMAIN = "my_portfolio"
NAME = "Mein Portfolio"

# Storage
STORAGE_KEY = f"{DOMAIN}.portfolios"
STORAGE_VERSION = 1

# Config keys
CONF_PORTFOLIO_NAME = "portfolio_name"
CONF_SCAN_INTERVAL = "scan_interval"
DEFAULT_SCAN_INTERVAL = 15  # minutes

# Stock data keys
ATTR_KUERZEL = "kuerzel"
ATTR_PREIS = "preis"
ATTR_STUECKZAHL = "stueckzahl"
ATTR_KAUFDATUM = "kaufdatum"
ATTR_LIMIT_OBEN = "limitoben"
ATTR_LIMIT_UNTEN = "limitunten"
ATTR_ALARM_OBEN = "alarmoben"
ATTR_ALARM_UNTEN = "alarmunten"
ATTR_GEWINN = "gewinn"
ATTR_AKTUELLER_KURS = "aktueller_kurs"
ATTR_PORTFOLIO_NAME = "portfolio_name"

# Yahoo Finance
YAHOO_BASE_URL = "https://finance.yahoo.com/quote/{}"
YAHOO_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
}

# Services
SERVICE_ADD_STOCK = "add_stock"
SERVICE_REMOVE_STOCK = "remove_stock"
SERVICE_UPDATE_STOCK = "update_stock"

# Platforms
PLATFORMS = ["sensor"]
