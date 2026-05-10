# 📈 My Portfolio X – Home Assistant Integration

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![GitHub release](https://img.shields.io/github/release/tuxoid/my_portfoliox.svg)](https://codeberg.org/tuxoid/my_portfoliox/releases)
[![HA Version](https://img.shields.io/badge/Home%20Assistant-2024.1%2B-blue.svg)](https://www.home-assistant.io/)

Eine Home Assistant Custom Integration zur Verwaltung und Überwachung von Aktienportfolios. Kursdaten werden primär von der **ING Wertpapiere API** bezogen – zuverlässig, aktuell und ohne API-Key. Optional können Analysten-Kursziele über **Financial Modeling Prep (FMP)** abgerufen werden.

---

## ✨ Features

### Kursdaten
- 📡 **ING Wertpapiere API** als primäre Kursquelle (via ISIN, kein Key erforderlich)
- 📊 **Yahoo Finance** als Alternative – ideal für US-Aktien und ETFs ohne ISIN
- ⚙️ **Datenquelle pro Aktie** wählbar – ING und Yahoo lassen sich mischen
- 🔄 **Automatische Aktualisierung** im konfigurierbaren Intervall (Standard: 15 Min.)

### Portfolio-Verwaltung
- 💼 **Mehrere Portfolios** gleichzeitig verwaltbar
- ➕ Aktien vollständig über die **HA-Benutzeroberfläche** hinzufügen, bearbeiten, löschen
- 🔢 **Stückzahl als Dezimalzahl** – Bruchteile für ETF-Sparpläne möglich (z.B. 2,50 Stück)
- 💾 **Persistente Speicherung** – Daten bleiben nach HA-Neustart erhalten

### Berechnungen & Alarme
- 📈 **Gewinn/Verlust** in % und € seit Kauf (Echtzeit)
- 📉 **Tagesperformance** absolut und prozentual
- 🔔 **Kurs-Alarme** – Limit oben / Limit unten mit Boolean-Sensoren
- 💹 **Portfolio-Gesamt-Sensoren** – Gesamtinvest, aktueller Wert, Rendite %

### Analysten-Kursziele (optional)
- 🎯 Kursziel Hoch / Tief / Mittel der letzten 12 Monate
- 🗳️ Konsens-Rating: Buy / Hold / Sell
- 🔢 Anzahl der Analysten

### Dashboard-Visualisierung
- 🃏 **9 spezialisierte Lovelace-Cards** – keine externe Card-Library nötig
- 📉 **Jahreschart** mit SMA 100/200, Trendlinie und Analysten-Kursziel
- 🌍 **4 Sprachen**: Deutsch, Englisch, Französisch, Spanisch

---

## 📋 Voraussetzungen

| Anforderung | Details |
|---|---|
| Home Assistant | Version 2024.1 oder neuer |
| HACS | Installiert und eingerichtet |
| Internetzugang | Für ING API und optional FMP |
| ING API-Key | Nicht erforderlich |
| FMP API-Key | Optional – kostenlos auf [financialmodelingprep.com](https://financialmodelingprep.com/register) |

---

## 🚀 Installation

### 1. Integration via HACS

1. HACS öffnen → **Integrationen** → **⋮** → **Benutzerdefinierte Repositories**
2. URL eingeben: `https://codeberg.org/tuxoid/my_portfoliox`
3. Kategorie: **Integration** → **Hinzufügen**
4. Integration suchen: **My Portfolio X** → **Installieren**
5. Home Assistant **neu starten**

### 2. Dashboard-Cards installieren

1. Alle `.js`-Dateien aus dem `www/`-Ordner nach `/config/www/` kopieren
2. **Einstellungen → Dashboards → Ressourcen → + Ressource hinzufügen**
3. Für jede Datei: `/local/dateiname.js` → Typ: **JavaScript-Modul**

> **Tipp bei Updates:** Nach dem Ersetzen einer `.js`-Datei den Browsercache umgehen,
> indem die Ressource-URL um eine Versionsnummer ergänzt wird: `/local/dateiname.js?v=2`

---

## ⚙️ Einrichtung

1. **Einstellungen → Integrationen → + Integration hinzufügen**
2. Nach **„My Portfolio X"** suchen und auswählen
3. Portfolio-Namen eingeben (z.B. „Technologie-Depot")
4. Aktualisierungsintervall wählen (Standard: 15 Minuten)
5. Optional: **FMP API-Key** für Analysten-Kursziele eintragen

---

## 📥 Aktien verwalten

Alle Aktien werden direkt über die HA-Benutzeroberfläche verwaltet:

**Einstellungen → Integrationen → My Portfolio X → Konfigurieren**

### Felder beim Hinzufügen

| Feld | Pflicht | Beschreibung |
|---|---|---|
| Kürzel | ✅ | Börsenkürzel (z.B. `AAPL`, `SAP.DE`) |
| Datenquelle | ✅ | **ING** (empfohlen) oder Yahoo Finance |
| ISIN | ✅ bei ING | z.B. `DE0007164600` für SAP |
| WKN | ☐ | z.B. `716460` |
| Bezeichnung | ✅ | Anzeigename (z.B. „SAP SE") |
| Kaufpreis | ✅ | Preis pro Stück in € (z.B. `182.500`) |
| Stückzahl | ✅ | Anzahl Stücke, Dezimalzahl möglich (z.B. `2.50`) |
| Kaufdatum | ✅ | Datum des Kaufs |
| Limit unten | ☐ | Alarm wenn Kurs diesen Wert unterschreitet |
| Limit oben | ☐ | Alarm wenn Kurs diesen Wert überschreitet |

### Kürzel- und ISIN-Beispiele

| Aktie | ISIN (für ING) | Kürzel (für Yahoo) |
|---|---|---|
| SAP SE | `DE0007164600` | `SAP.DE` |
| BASF | `DE000BASF111` | `BAS.DE` |
| Apple | `US0378331005` | `AAPL` |
| Microsoft | `US5949181045` | `MSFT` |
| Bitcoin | – | `BTC-USD` |
| iShares DAX ETF | `DE0005933931` | `EXS1.DE` |

---

## 🃏 Dashboard-Cards

### Übersicht
```yaml
type: custom:my-portfoliox-overview-card
title: My Portfolio X
```

### Top/Flop Gesamtperformance
```yaml
type: custom:my-portfoliox-topflop-card
```

### Gesamtperformance (alle Aktien, sortierbar)
```yaml
type: custom:my-portfoliox-total-performance-card
sort: pct      # pct | eur | alpha
order: desc    # desc | asc
```

### Tages Top/Flop
```yaml
type: custom:my-portfoliox-daily-topflop-card
```

### Tagesperformance (alle Aktien, sortierbar)
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
Kreisrunder Statusindikator pro Aktie:
- ⬜ Leerer Ring = innerhalb der Limits (oder kein Limit gesetzt)
- 🟢 Grüner Ring = Limit oben überschritten
- 🔴 Roter Ring = Limit unten unterschritten

### Limit-Alarme
```yaml
type: custom:my-portfoliox-alerts-card
```
Zeigt nur Aktien mit aktivem Alarm. Bei keinem Alarm: ✅ Bestätigungsmeldung.

### Kursverlauf (Chart)
```yaml
type: custom:my-portfoliox-chart-card
title: Kursverlauf
```
Jahreschart mit auswählbarer Aktie. Optionale Overlays:
100-Tage-Linie · 200-Tage-Linie · Trendlinie · Analysten-Kursziel

### Analysten-Kursziele
```yaml
type: custom:my-portfoliox-analyst-card
sort: upside   # upside | pct | alpha
order: desc
```
Erfordert FMP API-Key in den Integrationseinstellungen.

---

## 🔔 Automation-Beispiel: Kurs-Alarm

```yaml
automation:
  alias: "Portfolio Alarm – Limit überschritten"
  trigger:
    - platform: state
      entity_id: sensor.sap_se
      attribute: alarmoben
      to: true
  action:
    - service: notify.mobile_app
      data:
        title: "📈 Kurs-Alarm!"
        message: >
          {{ state_attr('sensor.sap_se', 'bezeichnung') }} hat das obere Limit
          ({{ state_attr('sensor.sap_se', 'limitoben') }} €) überschritten.
          Aktueller Kurs: {{ states('sensor.sap_se') }} €
```

---

## 📡 Datenquellen

| Quelle | Verwendung | API-Key | Limit |
|---|---|---|---|
| **ING Wertpapiere** | Aktuelle Kurse (Default) | Nein | Keine bekannte Begrenzung |
| **Yahoo Finance** | Kurse US-Aktien / Fallback | Nein | Inoffiziell, kann variieren |
| **Financial Modeling Prep** | Analysten-Kursziele | Ja (kostenlos) | 250 Req./Tag |

---

## 🏷️ Sensor-Attribute

| Attribut | Beschreibung |
|---|---|
| `kuerzel` | Börsenkürzel |
| `bezeichnung` | Name der Aktie |
| `isin` | ISIN |
| `wkn` | WKN |
| `preis` | Kaufpreis pro Stück in € |
| `stueckzahl` | Anzahl Stücke (Dezimal möglich) |
| `kaufdatum` | Kaufdatum |
| `datenquelle` | `ing` oder `yahoo_finance` |
| `limitoben` / `limitunten` | Kurslimits |
| `alarmoben` / `alarmunten` | Alarm-Boolean |
| `gewinn` | Performance seit Kauf in % |
| `kurs_vortag` | Vortages-Schlusskurs |
| `tages_aenderung_abs` | Tagesveränderung in € |
| `tages_aenderung_pct` | Tagesveränderung in % |
| `kursziel_hoch/tief/mittel` | Analysten-Kursziele (FMP) |
| `analysten_konsens` | Buy / Hold / Sell |
| `portfolio_name` | Zugehöriges Portfolio |

---

## 📝 Lizenz

MIT License
