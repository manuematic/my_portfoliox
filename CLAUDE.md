# CLAUDE.md – My Portfolio X · Maschinenlesbare Projektdokumentation

> Dieses Dokument ermöglicht es Claude, in einem neuen Chat sofort weiterzumachen.
> Einfach dieses Dokument lesen und schreiben: „Lies CLAUDE.md und mache weiter."

---

## META

| Feld | Wert |
|---|---|
| Projekt | My Portfolio X – Home Assistant Custom Integration |
| Version | 0.1.0 |
| Domain | `my_portfoliox` |
| Codeberg | `ssh://git@codeberg.org/tuxoid/my_portfoliox.git` (remote: `origin`) |
| Arbeitsverzeichnis | `/home/xgrdner/server/Projekte/claude-code/my_portfolio/my_portfolio/` |
| Stand | 2026-05-10 |
| Git-Branch | `main` |

---

## DATEISTRUKTUR

```
my_portfolio/                          ← Arbeitsverzeichnis
├── custom_components/my_portfoliox/   ← HA-Integration (Python)
│   ├── __init__.py                    # Setup, async_setup_entry
│   ├── manifest.json                  # domain, version, codeowners
│   ├── const.py                       # ALLE Konstanten – zuerst lesen!
│   ├── config_flow.py                 # UI-Konfiguration (mehrstufig)
│   ├── coordinator.py                 # DataUpdateCoordinator, Kurse, InfluxDB
│   ├── influx.py                      # InfluxDB-Client (aiohttp, kein extra-Paket)
│   ├── sensor.py                      # HA Sensor-Entities
│   ├── ing.py                         # ING Wertpapiere API (via ISIN)
│   ├── yahoo_finance.py               # Yahoo Finance JSON-API
│   ├── fmp.py                         # Financial Modeling Prep (Analysten-Kursziele)
│   ├── scraper.py                     # Veraltet, nicht mehr verwendet – drin lassen
│   ├── icons/icon.svg
│   ├── icons.json
│   ├── strings.json                   # = translations/de.json (Kopie)
│   └── translations/                  # de.json, en.json, fr.json, es.json
├── www/my_portfoliox/                 ← 10 Lovelace-Cards (JavaScript)
│   ├── my-portfoliox-overview-card.js
│   ├── my-portfoliox-topflop-card.js
│   ├── my-portfoliox-total-performance-card.js
│   ├── my-portfoliox-daily-topflop-card.js
│   ├── my-portfoliox-daily-all-card.js
│   ├── my-portfoliox-watchlist-card.js
│   ├── my-portfoliox-alerts-card.js
│   ├── my-portfoliox-chart-card.js
│   ├── my-portfoliox-analyst-card.js
│   └── my-portfoliox-bilanz-card.js
├── README.md                          # Human-readable Doku
└── CLAUDE.md                          # Diese Datei
```

---

## KONSTANTEN (const.py) – KRITISCH

```python
DOMAIN = "my_portfoliox"
NAME   = "My Portfolio X"
STORAGE_KEY = f"{DOMAIN}.portfolios"   # HA Storage Key

# Konfiguration
CONF_PORTFOLIO_NAME = "portfolio_name"
CONF_SCAN_INTERVAL  = "scan_interval"    # Default: 15 min
CONF_DATA_SOURCE    = "data_source"
CONF_FMP_API_KEY    = "fmp_api_key"
CONF_INFLUX_URL     = "influx_url"
CONF_INFLUX_TOKEN   = "influx_token"
CONF_INFLUX_ORG     = "influx_org"
CONF_INFLUX_BUCKET  = "influx_bucket"
CONF_STEUERSATZ     = "steuersatz"       # Default: 26.375 (dt. Abgeltungssteuer + Soli)

# Datenquellen
SOURCE_ING   = "ing"
SOURCE_YAHOO = "yahoo_finance"
DEFAULT_SOURCE = SOURCE_ING

# Aktien-Attribute (OHNE Unterstriche – kritisch für Cards!)
ATTR_BEZEICHNUNG = "bezeichnung"
ATTR_KUERZEL     = "kuerzel"
ATTR_WKN         = "wkn"
ATTR_ISIN        = "isin"
ATTR_PREIS       = "preis"          # Kaufpreis
ATTR_STUECKZAHL  = "stueckzahl"     # float, Bruchteile möglich
ATTR_KAUFDATUM   = "kaufdatum"
ATTR_DATENQUELLE = "datenquelle"
ATTR_LIMIT_OBEN  = "limitoben"      # KEIN Unterstrich!
ATTR_LIMIT_UNTEN = "limitunten"     # KEIN Unterstrich!
ATTR_ALARM_OBEN  = "alarmoben"      # KEIN Unterstrich!
ATTR_ALARM_UNTEN = "alarmunten"     # KEIN Unterstrich!
ATTR_GEWINN      = "gewinn"         # % seit Kauf
ATTR_KURS_VORTAG       = "kurs_vortag"
ATTR_TAGES_ABS         = "tages_aenderung_abs"
ATTR_TAGES_PCT         = "tages_aenderung_pct"
ATTR_AKTUELLER_KURS    = "aktueller_kurs"
ATTR_PORTFOLIO_NAME    = "portfolio_name"

# Portfolio-Gesamt-Sensoren
ATTR_GESAMT_INVEST       = "gesamtinvest"
ATTR_GESAMT_WERT         = "gesamtwert"
ATTR_PORTFOLIO_DIFFERENZ = "portfoliodifferenz"
ATTR_PORTFOLIO_PROZENT   = "portfolioprozent"

# InfluxDB SMA / Kurshistorie
ATTR_SMA_20        = "sma_20"
ATTR_SMA_50        = "sma_50"
ATTR_SMA_200       = "sma_200"
ATTR_PREIS_HISTORY = "preis_history"   # [{date: "YYYY-MM-DD", kurs: float}] max 200

# Bilanz / Transaktionen
ATTR_TRANSAKTIONEN     = "transaktionen"
ATTR_VERKAUFSKURS      = "verkaufskurs"
ATTR_VERKAUFSDATUM     = "verkaufsdatum"
ATTR_GEWINN_BRUTTO     = "gewinn_brutto"
ATTR_GEWINN_BRUTTO_PCT = "gewinn_brutto_pct"
ATTR_GEWINN_NETTO      = "gewinn_netto"
ATTR_STEUER_BETRAG     = "steuer_betrag"
ATTR_ERLOES_GESAMT     = "erloes_gesamt"

# FMP Analysten-Attribute
ATTR_KZ_HOCH    = "kursziel_hoch"
ATTR_KZ_TIEF    = "kursziel_tief"
ATTR_KZ_MITTEL  = "kursziel_mittel"
ATTR_KZ_ANZAHL  = "analysten_anzahl"
ATTR_KZ_KONSENS = "analysten_konsens"
ATTR_KZ_DATUM   = "kursziel_datum"
```

---

## COORDINATOR (coordinator.py) – KRITISCHE DETAILS

### Datenfluss pro Update-Zyklus
1. `_async_update_data()` iteriert `self._stocks` (dict stock_id → stock_dict)
2. `_fetch_price(stock)` → ING oder Yahoo → returns PriceData dict
3. Schreibt aktuellen Kurs via `influx.write_price()` in InfluxDB
4. `_get_sma_cached()` → SMA/History aus Cache (23h TTL) oder InfluxDB
5. Berechnet `portfolio_summary`
6. Optional: FMP Analysten-Daten (24h-Cache)
7. Returns `updated_data: dict[str, dict]`

### Wichtige Instanzvariablen
```python
self._stocks        # Stammdaten aus HA Storage (Kaufpreis, ISIN etc.)
self._sma_cache     # {kuerzel: {sma_20, sma_50, sma_200, preis_history, _ts}}
self._bilanz_data   # [{kuerzel, bezeichnung, kaufkurs, verkaufskurs, ...}]
self._bilanz_ts     # datetime – letzte Bilanz-Abfrage
self.portfolio_summary  # {gesamtinvest, gesamtwert, portfoliodifferenz, portfolioprozent}
self.data           # von HA intern gesetzt = Rückgabewert von _async_update_data
# ACHTUNG: self._stock_data EXISTIERT NICHT → historische Fehlerquelle!
```

### Verkauf-Flow: async_sell_stock(stock_id, verkaufskurs, verkaufsdatum)
1. Berechnet: `erloes = vk * stk`, `gewinn_brutto = (vk-kk)*stk`, `steuer = max(0,g)*satz/100`, `gewinn_netto = g - steuer`
2. `influx.write_transaction(... typ="verkauf" ...)` → InfluxDB
3. `influx.delete_stock_history(... kuerzel ...)` → löscht Kurshistorie
4. `self._sma_cache.pop(kuerzel)` → Cache-Invalidierung
5. `self._stocks.pop(stock_id)` → aus Portfolio entfernen
6. `_async_refresh_bilanz()` → Bilanz neu laden

### async_add_stock(stock_data)
- Schreibt auch Kauf-Transaktion in InfluxDB (`typ="kauf"`)

---

## INFLUX.PY – InfluxDB-Client

Direkter aiohttp-Client, **kein** `influxdb-client` Python-Paket nötig.

### InfluxDB Measurements
```
kurshistorie  tags: kuerzel, portfolio, isin   fields: kurs (float)
transaktionen tags: kuerzel, portfolio, typ    fields: alle Transaktionsdaten
```

### Funktionen
```python
write_price(session, base_url, token, org, bucket, kuerzel, isin, portfolio, kurs)
write_transaction(session, base_url, token, org, bucket, kuerzel, portfolio, typ, fields)
query_smas(session, base_url, token, org, bucket, kuerzel)
  → {"sma_20": float|None, "sma_50": float|None, "sma_200": float|None}
query_price_history(session, base_url, token, org, bucket, kuerzel, days=200)
  → [{"date": "YYYY-MM-DD", "kurs": float}]
query_transactions(session, base_url, token, org, bucket, portfolio)
  → [{"kuerzel": ..., "kaufkurs": ..., "verkaufskurs": ..., ...}]
delete_stock_history(session, base_url, token, org, bucket, kuerzel)
  → löscht via InfluxDB Delete API (predicate: _measurement="kurshistorie" AND kuerzel="X")
```

### InfluxDB CSV-Parser: _parse_annotated_csv(text) → list[dict]
- Überspringt `#`-Zeilen
- Header-Zeile: erstes Feld leer, zweites `"result"`
- Gibt alle Datenzeilen als Dicts zurück

---

## CONFIG FLOW (config_flow.py)

### Menü-Struktur (OptionsFlow)
```
init → add        → async_step_add_stock
     → edit       → async_step_select_stock → edit | delete → confirm_delete
     → sell       → async_step_sell_select → sell_details → sell_confirm
     → settings
```

### Settings-Felder
- `CONF_DATA_SOURCE`, `CONF_SCAN_INTERVAL`, `CONF_FMP_API_KEY`
- `CONF_INFLUX_URL`, `CONF_INFLUX_TOKEN`, `CONF_INFLUX_ORG`, `CONF_INFLUX_BUCKET`
- `CONF_STEUERSATZ` (Default: 26.375)

### _current_options() gibt zurück:
Alle obigen CONF_* Felder aus `{**entry.data, **entry.options}` – immer als vollständiges Dict.

### _build_stock_data → dict
Alle Aktien-Attribute ohne `ATTR_AKTUELLER_KURS` – der kommt vom Coordinator.

---

## SENSOR (sensor.py) – Entitätstypen

### StockSensor (eine pro Aktie)
- `state = aktueller_kurs` (float)
- `unique_id = stock_id` (UUID)
- `extra_state_attributes`: alle Aktien-Attribute + SMA + preis_history + FMP

### PortfolioSummarySensor (4 Stück pro Portfolio)
- Keys: `gesamtinvest`, `gesamtwert`, `portfoliodifferenz`, `portfolioprozent`
- Erkennungsmuster: `attr.summary_key !== undefined && attr.summary_key !== "bilanz"`

### PortfolioBilanzSensor (1 pro Portfolio)
- `state = Anzahl Transaktionen` (int)
- `unique_id = {entry_id}_bilanz`
- `attr.summary_key = "bilanz"`
- `attr.transaktionen = [...]` – Liste aller Verkauf-Transaktionen
- `attr.gesamt_brutto/netto/steuer/erloes_gesamt`

### Erkennungsmuster in JS-Cards
```javascript
// Aktien-Sensor:
attr.kuerzel !== undefined && attr.summary_key === undefined
// Portfolio-Gesamt-Sensor:
attr.summary_key !== undefined && attr.summary_key !== "bilanz"
// Bilanz-Sensor:
attr.summary_key === "bilanz"
```

---

## CARDS – GEMEINSAME PATTERNS

### Sortierstatus-Persistenz (daily-all, total-performance, watchlist, analyst)
```javascript
const _xyzState = new Map();
let   _xyzUid   = 0;
class MyPortfolioXyzCard extends HTMLElement {
  constructor() { this._uid = ++_xyzUid; }
  setConfig(config) {
    if (!_xyzState.has(this._uid))
      _xyzState.set(this._uid, { sortBy: config.sort || "default", order: config.order || "desc" });
  }
  get _sortBy() { return (_xyzState.get(this._uid)||{}).sortBy || "default"; }
  set _sortBy(v) { const s=_xyzState.get(this._uid)||{}; s.sortBy=v; _xyzState.set(this._uid,s); }
}
```

### Chart-Card – Datenquelle
- **KEIN** externer Fetch mehr (Yahoo/ING entfernt)
- `preis_history`-Attribut des StockSensors → direkt aus HA states
- SMA 20/50/200: numerische Attributwerte für Info-Panel; Linien werden lokal aus `preis_history` berechnet
- Bei leerem `preis_history`: Meldung „Noch keine Daten – warte auf InfluxDB-Befüllung"

### Attributnamen in Cards (OHNE Unterstrich!)
```javascript
attr.alarmoben   // nicht alarm_oben
attr.alarmunten  // nicht alarm_unten
attr.limitoben   // nicht limit_oben
attr.limitunten  // nicht limit_unten
```

---

## DESIGN-SYSTEM (alle Cards)

```css
/* Fonts */
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Outfit:wght@400;600;700&display=swap');

/* Farben */
--blau-akzent:  #3b82f6   /* Buttons aktiv */
--gruen-sma20:  #34d399   /* SMA 20-Linie */
--blau-sma50:   #60a5fa   /* SMA 50-Linie */
--lila-sma200:  #a78bfa   /* SMA 200-Linie */
--gold:         #f59e0b   /* Trendlinie, Kaufkurs-Linie */
--gruen:        #22c55e   /* Gewinn, Alarm oben */
--rot:          #ef4444   /* Verlust, Alarm unten */
--bg-card:      var(--ha-card-background, #1c1c27)

/* Animationen */
animation: slideIn/fadeIn .3-.4s ease both + animation-delay: i * 0.03-0.08s
```

---

## BEKANNTE BUGGESCHICHTE

| Version | Bug | Ursache | Fix |
|---|---|---|---|
| 0.9.0 | Alerts/Watchlist leer | Cards suchten `alarm_oben` statt `alarmoben` | Attributnamen ohne Unterstrich |
| 0.9.3 | Alle Sensoren unavailable | `_update_analyst_data` griff auf `self._stock_data` zu (existiert nicht) | Parameter `stock_data: dict` eingeführt |
| 0.9.3 | Chart lädt endlos | `_render()` triggerte bei jedem HA-Update neuen Ladevorgang | `_loadedSymbol` sofort setzen (inzwischen obsolet: kein Fetch mehr) |
| 0.9.4 | Import-Fehler | `ATTR_KURSQUELLE_URL` noch in config_flow.py importiert | Alle Reste entfernt |

---

## OFFENE PUNKTE / NÄCHSTE SCHRITTE

- [ ] ING-Kurshistorie initial befüllen (Backfill für Chart bei Erstinstallation)
- [ ] Dividenden-Tracking (eigenes InfluxDB-Measurement + Card)
- [ ] Historische Portfolio-Performance über Zeit (aus InfluxDB aggregiert)
- [ ] CSV-Export der Positionen und Transaktionen
- [ ] Multiple Portfolios in der Bilanz-Card zusammengefasst anzeigen
- [ ] `en.json`, `fr.json`, `es.json` mit neuen Strings (sell_select, sell_details, sell_confirm, settings) aktualisieren

---

## YAML-BEISPIELE ALLER CARDS

```yaml
type: custom:my-portfoliox-overview-card
title: Mein Portfolio

type: custom:my-portfoliox-topflop-card

type: custom:my-portfoliox-total-performance-card
sort: pct    # pct | eur | alpha
order: desc

type: custom:my-portfoliox-daily-topflop-card

type: custom:my-portfoliox-daily-all-card
sort: pct
order: desc

type: custom:my-portfoliox-watchlist-card
sort: alpha  # alpha | pct | kurs
order: asc

type: custom:my-portfoliox-alerts-card

type: custom:my-portfoliox-chart-card
title: Kursverlauf

type: custom:my-portfoliox-analyst-card
sort: upside  # upside | pct | alpha
order: desc

type: custom:my-portfoliox-bilanz-card
title: Bilanz
rows: 10
# portfolio: Mein Depot   # optional, filtert auf ein Portfolio
```

---

## INSTALLATIONSHINWEISE

### Backend
1. HACS → Benutzerdefinierte Repositories → `https://codeberg.org/tuxoid/my_portfoliox`
2. Integration installieren, HA neu starten
3. Einstellungen → Integrationen → + → „My Portfolio X"
4. Konfigurieren → Einstellungen → InfluxDB-Daten + Steuersatz eintragen

### Frontend
1. `www/my_portfoliox/` komplett nach `/config/www/my_portfoliox/` kopieren
2. Alle 10 JS-Dateien als Ressource registrieren: `/local/my_portfoliox/dateiname.js` (Typ: JavaScript-Modul)
3. Nach Updates: `?v=2` an Ressource-URL anhängen

### InfluxDB-Bucket vorbereiten (einmalig)
```bash
influx bucket create --name portfolio --org home --retention 0
```
