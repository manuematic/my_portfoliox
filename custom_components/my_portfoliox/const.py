"""Constants for My Portfolio X integration."""

DOMAIN = "my_portfoliox"
NAME = "My Portfolio X"

# Storage
STORAGE_KEY = f"{DOMAIN}.portfolios"
STORAGE_VERSION = 1

# Config keys
CONF_PORTFOLIO_NAME = "portfolio_name"
CONF_SCAN_INTERVAL = "scan_interval"
CONF_DATA_SOURCE = "data_source"
DEFAULT_SCAN_INTERVAL = 15  # minutes

# Data sources
SOURCE_ING   = "ing"
SOURCE_YAHOO = "yahoo_finance"
DEFAULT_SOURCE = SOURCE_ING

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
ATTR_KURS_VORTAG = "kurs_vortag"
ATTR_TAGES_ABS = "tages_aenderung_abs"
ATTR_TAGES_PCT = "tages_aenderung_pct"
ATTR_AKTUELLER_KURS = "aktueller_kurs"
ATTR_PORTFOLIO_NAME = "portfolio_name"
ATTR_DATENQUELLE    = "datenquelle"     # "ing" oder "yahoo_finance" pro Aktie

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

# Financial Modeling Prep (FMP)
CONF_FMP_API_KEY = "fmp_api_key"
FMP_BASE_URL     = "https://financialmodelingprep.com/api/v3"

# InfluxDB 2
CONF_INFLUX_URL    = "influx_url"
CONF_INFLUX_TOKEN  = "influx_token"
CONF_INFLUX_ORG    = "influx_org"
CONF_INFLUX_BUCKET = "influx_bucket"
CONF_STEUERSATZ    = "steuersatz"
DEFAULT_STEUERSATZ = 26.375  # dt. Abgeltungssteuer + Soli

# SMA / Kurshistorie
ATTR_SMA_20        = "sma_20"
ATTR_SMA_50        = "sma_50"
ATTR_SMA_200       = "sma_200"
ATTR_PREIS_HISTORY = "preis_history"   # [{date, kurs}] – max 200 Tageskurse

# Bilanz / Transaktionen
ATTR_TRANSAKTIONEN     = "transaktionen"
ATTR_VERKAUFSKURS      = "verkaufskurs"
ATTR_VERKAUFSDATUM     = "verkaufsdatum"
ATTR_GEWINN_BRUTTO     = "gewinn_brutto"
ATTR_GEWINN_BRUTTO_PCT = "gewinn_brutto_pct"
ATTR_GEWINN_NETTO      = "gewinn_netto"
ATTR_STEUER_BETRAG     = "steuer_betrag"
ATTR_ERLOES_GESAMT     = "erloes_gesamt"   # verkaufskurs * stueckzahl

# Analysten-Attribute
ATTR_KZ_HOCH      = "kursziel_hoch"
ATTR_KZ_TIEF      = "kursziel_tief"
ATTR_KZ_MITTEL    = "kursziel_mittel"
ATTR_KZ_ANZAHL    = "analysten_anzahl"
ATTR_KZ_KONSENS   = "analysten_konsens"   # buy / hold / sell
ATTR_KZ_DATUM     = "kursziel_datum"
