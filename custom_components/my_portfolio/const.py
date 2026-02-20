"""Constants for Mein Portfolio integration."""

DOMAIN = "my_portfolio"
NAME = "Mein Portfolio"

# Storage
STORAGE_KEY = f"{DOMAIN}.portfolios"
STORAGE_VERSION = 1

# Config keys
CONF_PORTFOLIO_NAME = "portfolio_name"
CONF_SCAN_INTERVAL = "scan_interval"
CONF_DATA_SOURCE = "data_source"
DEFAULT_SCAN_INTERVAL = 15  # minutes

# Data sources
SOURCE_YAHOO = "yahoo_finance"
SOURCE_FINANZEN_NET = "finanzen_net"
SOURCE_FINANZEN100 = "finanzen100"
DEFAULT_SOURCE = SOURCE_YAHOO

# Stock attribute keys
ATTR_BEZEICHNUNG = "bezeichnung"
ATTR_KUERZEL = "kuerzel"
ATTR_WKN = "wkn"
ATTR_ISIN = "isin"
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
ATTR_KURSQUELLE_URL = "kursquelle_url"  # Benutzerdefinierte URL für finanzen.net / finanzen100

# Portfolio-Gesamt-Sensoren
ATTR_GESAMT_INVEST = "gesamtinvest"
ATTR_GESAMT_WERT = "gesamtwert"
ATTR_PORTFOLIO_DIFFERENZ = "portfoliodifferenz"
ATTR_PORTFOLIO_PROZENT = "portfolioprozent"

# Yahoo Finance JSON-API
YAHOO_API_HOSTS = [
    "query1.finance.yahoo.com",
    "query2.finance.yahoo.com",
]

# Gemeinsame HTTP-Headers
HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8",
    "Referer": "https://finance.yahoo.com/",
}

# Platforms
PLATFORMS = ["sensor"]
