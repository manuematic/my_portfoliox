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

# Stock attribute keys
ATTR_BEZEICHNUNG = "bezeichnung"   # NEU: sprechender Name der Aktie
ATTR_KUERZEL = "kuerzel"
ATTR_PREIS = "preis"
ATTR_STUECKZAHL = "stueckzahl"
ATTR_KAUFDATUM = "kaufdatum"
ATTR_LIMIT_OBEN = "limitoben"
ATTR_LIMIT_UNTEN = "limitunten"
ATTR_ALARM_OBEN = "alarmoben"
ATTR_ALARM_UNTEN = "alarmunten"
ATTR_GEWINN = "gewinn"             # float 3,2 – prozentualer Gewinn
ATTR_AKTUELLER_KURS = "aktueller_kurs"
ATTR_PORTFOLIO_NAME = "portfolio_name"

# Yahoo Finance
YAHOO_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8",
    "Referer": "https://finance.yahoo.com/",
    "Origin": "https://finance.yahoo.com",
}

# Platforms
PLATFORMS = ["sensor"]
