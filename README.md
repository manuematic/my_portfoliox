# My Portfolio X

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![Version](https://img.shields.io/badge/Version-0.1.0-blue.svg)]()
[![HA Version](https://img.shields.io/badge/Home%20Assistant-2024.1%2B-blue.svg)](https://www.home-assistant.io/)

Eine Home Assistant Custom Integration zur Verwaltung und Überwachung von Aktienportfolios.

**Kursdaten** werden von der **ING Wertpapiere API** (via ISIN) oder **Yahoo Finance** (via Ticker) bezogen.  
**Kurshistorie, SMA-Werte und Transaktionen** werden in einer lokalen **InfluxDB 2** Datenbank gespeichert.

---

## Features

### Kursdaten & Portfolio
- **ING Wertpapiere API** als primäre Kursquelle (via ISIN, kein Key nötig)
- **Yahoo Finance** als Alternative (US-Aktien, ETFs via Ticker)
- Datenquelle pro Aktie einzeln wählbar
- Automatische Aktualisierung im konfigurierbaren Intervall (Standard: 15 Min.)
- Mehrere Portfolios gleichzeitig verwaltbar
- Stückzahl als Dezimalzahl (z.B. 2,50 für ETF-Sparpläne)
- Kurs-Alarme: Limit oben / Limit unten mit Boolean-Sensoren

### InfluxDB 2 Integration
- Jeder abgerufene Kurs wird automatisch in InfluxDB geschrieben
- **SMA 20 / SMA 50 / SMA 200** werden täglich aus InfluxDB berechnet (Cache: 23h)
- **Kurshistorie** (max. 200 Tage) als Sensor-Attribut für die Chart-Card
- Kauf-Transaktionen werden beim Hinzufügen einer Aktie geschrieben
- Verkauf-Transaktionen mit vollständiger P&L-Kalkulation (Brutto / Steuer / Netto)
- Bei Verkauf: automatisches Löschen der Kurshistorie aus InfluxDB

### Transaktions-Bilanz
- Konfigurierter **persönlicher Steuersatz** (z.B. 26,375 % dt. Abgeltungssteuer + Soli)
- Steuer wird nur auf **positive** Gewinne berechnet
- Bilanz-Card zeigt alle realisierten Verkäufe mit Brutto/Netto/Steuer

### Dashboard-Visualisierung
- **10 spezialisierte Lovelace-Cards** – keine externe Card-Library nötig
- Jahreschart mit **SMA 20 / 50 / 200**, Trendlinie und Analysten-Kursziel
- Analysten-Kursziele optional via **Financial Modeling Prep (FMP)**
- 4 Sprachen: Deutsch, Englisch, Französisch, Spanisch

---

## Voraussetzungen

| Anforderung | Details |
|---|---|
| Home Assistant | Version 2024.1 oder neuer |
| HACS | Installiert und eingerichtet |
| InfluxDB 2 | Lokal oder remote erreichbar (empfohlen: lokale HA-Installation) |
| FMP API-Key | Optional – kostenlos auf [financialmodelingprep.com](https://financialmodelingprep.com/register) |

---

## Installation

### 1. Integration via HACS

1. HACS öffnen → **Integrationen** → **⋮** → **Benutzerdefinierte Repositories**
2. URL eingeben: `https://codeberg.org/tuxoid/my_portfoliox`
3. Kategorie: **Integration** → **Hinzufügen**
4. Integration suchen: **My Portfolio X** → **Installieren**
5. Home Assistant **neu starten**

### 2. Dashboard-Cards installieren

1. Den Ordner `www/my_portfoliox/` nach `/config/www/my_portfoliox/` kopieren
2. **Einstellungen → Dashboards → Ressourcen → + Ressource hinzufügen**
3. Für jede Datei: `/local/my_portfoliox/dateiname.js` → Typ: **JavaScript-Modul**

> **Tipp bei Updates:** Cache-Busting durch Versionsnummer an der Ressource-URL: `/local/my_portfoliox/dateiname.js?v=2`

---

## Einrichtung

1. **Einstellungen → Integrationen → + Integration hinzufügen**
2. Nach **„My Portfolio X"** suchen und auswählen
3. Portfolio-Namen eingeben (z.B. „Technologie-Depot")
4. Kursquelle und Aktualisierungsintervall wählen
5. Danach unter **Konfigurieren → Einstellungen** die InfluxDB-Verbindung und den Steuersatz eintragen

### InfluxDB-Einstellungen

| Feld | Beispiel |
|---|---|
| URL | `http://192.168.1.10:8086` |
| Token | `mein-influx-token` |
| Organisation | `home` |
| Bucket | `portfolio` |
| Steuersatz | `26.375` (dt. Abgeltungssteuer + Soli) |

---

## Aktien verwalten

**Einstellungen → Integrationen → My Portfolio X → Konfigurieren**

### Aktie hinzufügen

| Feld | Pflicht | Beschreibung |
|---|---|---|
| Bezeichnung | ✅ | Anzeigename (z.B. „SAP SE") |
| Börsenkürzel | ✅ | z.B. `AAPL`, `SAP.DE` |
| Datenquelle | ✅ | ING (empfohlen) oder Yahoo Finance |
| ISIN | ✅ bei ING | z.B. `DE0007164600` |
| WKN | ☐ | z.B. `716460` |
| Kaufpreis | ✅ | Preis pro Stück in € |
| Stückzahl | ✅ | Dezimalzahl möglich (z.B. `2.5`) |
| Kaufdatum | ✅ | Datum des Kaufs |
| Limit unten / oben | ☐ | Kurs-Alarm-Schwellen |

### Aktie verkaufen (💰 Aktie verkaufen)

1. Aktie auswählen
2. Verkaufspreis und -datum eingeben
3. Vorschau prüfen (Erlös, Gewinn brutto, Steuer, Gewinn netto)
4. Bestätigen → Transaktion wird in InfluxDB gespeichert, Kurshistorie gelöscht, Aktie aus Portfolio entfernt

---

## Dashboard-Cards

### Übersicht
```yaml
type: custom:my-portfoliox-overview-card
title: Mein Portfolio
```

### Top/Flop Gesamtperformance
```yaml
type: custom:my-portfoliox-topflop-card
```

### Gesamtperformance (sortierbar)
```yaml
type: custom:my-portfoliox-total-performance-card
sort: pct      # pct | eur | alpha
order: desc
```

### Tages Top/Flop
```yaml
type: custom:my-portfoliox-daily-topflop-card
```

### Tagesperformance (sortierbar)
```yaml
type: custom:my-portfoliox-daily-all-card
sort: pct
order: desc
```

### Watchlist mit Limit-Status
```yaml
type: custom:my-portfoliox-watchlist-card
sort: alpha    # alpha | pct | kurs
order: asc
```

### Limit-Alarme
```yaml
type: custom:my-portfoliox-alerts-card
```

### Kursverlauf (Chart)
```yaml
type: custom:my-portfoliox-chart-card
title: Kursverlauf
```
Daten aus InfluxDB. Optionale Overlays: SMA 20 · SMA 50 · SMA 200 · Trendlinie · Analysten-Kursziel.  
Hinweis: Daten werden ab dem ersten Update gesammelt – der Chart füllt sich mit der Zeit.

### Analysten-Kursziele
```yaml
type: custom:my-portfoliox-analyst-card
sort: upside   # upside | pct | alpha
order: desc
```
Erfordert FMP API-Key in den Integrationseinstellungen.

### Bilanz (realisierte Verkäufe)
```yaml
type: custom:my-portfoliox-bilanz-card
title: Bilanz
rows: 10             # Anzahl angezeigter Transaktionen
portfolio: Mein Depot  # optional, filtert auf ein Portfolio
```
Zeigt Summenzeile (Erlös / Brutto / Steuer / Netto) und Tabelle aller Verkäufe sortiert nach Verkaufsdatum.

---

## Sensor-Attribute

### Aktien-Sensor
| Attribut | Beschreibung |
|---|---|
| `kuerzel` | Börsenkürzel |
| `bezeichnung` | Name der Aktie |
| `isin` / `wkn` | ISIN / WKN |
| `preis` | Kaufpreis pro Stück |
| `stueckzahl` | Anzahl Stücke (Dezimal) |
| `kaufdatum` | Kaufdatum |
| `datenquelle` | `ing` oder `yahoo_finance` |
| `limitoben` / `limitunten` | Kurslimits |
| `alarmoben` / `alarmunten` | Alarm-Boolean |
| `gewinn` | Performance seit Kauf in % |
| `kurs_vortag` | Vortages-Schlusskurs |
| `tages_aenderung_abs` / `tages_aenderung_pct` | Tagesveränderung |
| `sma_20` / `sma_50` / `sma_200` | Gleitende Durchschnitte (aus InfluxDB) |
| `preis_history` | Liste `[{date, kurs}]` – max. 200 Tageskurse |
| `kursziel_hoch/tief/mittel` | Analysten-Kursziele (FMP) |
| `analysten_konsens` | Buy / Hold / Sell |

### Bilanz-Sensor
Erkennbar an `summary_key: "bilanz"`. Attribute: `transaktionen` (Liste), `gesamt_brutto`, `gesamt_netto`, `gesamt_steuer`, `erloes_gesamt`.

---

## Lizenz

MIT License – © 2026 tuxoid
