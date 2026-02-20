# 📈 Mein Portfolio – Home Assistant Integration

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![GitHub release](https://img.shields.io/github/release/manuematic/my_portfolio.svg)](https://github.com/manuematic/my_portfolio/releases)

Eine Home Assistant Integration zum Verwalten und Überwachen von Aktienportfolios mit Live-Kursen von Yahoo Finance.

---

## Features

- 📊 **Live-Börsenkurse** via Yahoo Finance (automatische Aktualisierung)
- 💼 **Mehrere Portfolios** gleichzeitig verwaltbar
- 📉 **Gewinn/Verlust-Berechnung** in Echtzeit
- 🔔 **Kurs-Alarme** (Limit oben / Limit unten)
- 💾 **Persistente Speicherung** – Daten bleiben nach Neustart erhalten
- 🔧 Konfigurierbar über **HA Services** und **Automationen**

---

## Installation via HACS

1. HACS in Home Assistant öffnen
2. **Integrationen** → **⋮** → **Benutzerdefinierte Repositories**
3. URL eingeben: `https://github.com/manuematic/my_portfolio`
4. Kategorie: **Integration** → **Hinzufügen**
5. Integration suchen: **Mein Portfolio** → **Installieren**
6. Home Assistant **neu starten**

---

## Einrichtung

1. **Einstellungen → Integrationen → + Integration hinzufügen**
2. Nach **"Mein Portfolio"** suchen
3. Portfolio-Namen eingeben (z.B. "Technologie-Depot")
4. Aktualisierungsintervall wählen (Standard: 15 Minuten)
5. **Speichern**

Die **Config Entry ID** findest du unter:  
`Einstellungen → Integrationen → Mein Portfolio → ⋮ → Informationen`

---

## Aktien verwalten

### Aktie hinzufügen

Über **Entwicklerwerkzeuge → Services → `my_portfolio.add_stock`**:

```yaml
service: my_portfolio.add_stock
data:
  entry_id: "abc123def456"   # Deine Portfolio-ID
  kuerzel: "AAPL"
  preis: 182.500             # Kaufpreis pro Stück
  stueckzahl: 10
  kaufdatum: "2024-01-15"
  limitoben: 200.000         # optional: Alarm wenn Kurs > 200
  limitunten: 160.000        # optional: Alarm wenn Kurs < 160
```

**Beispiele für Kürzel:**
| Aktie | Kürzel |
|---|---|
| Apple | `AAPL` |
| SAP (Xetra) | `SAP.DE` |
| Bitcoin | `BTC-USD` |
| DAX ETF | `EXS1.DE` |

### Aktie aktualisieren

```yaml
service: my_portfolio.update_stock
data:
  entry_id: "abc123def456"
  stock_id: "550e8400-e29b-41d4-a716-446655440000"  # aus Entity-Attributen
  stueckzahl: 15
  limitoben: 220.000
```

### Aktie entfernen

```yaml
service: my_portfolio.remove_stock
data:
  entry_id: "abc123def456"
  stock_id: "550e8400-e29b-41d4-a716-446655440000"
```

---

## Entitäten & Attribute

Für jede Aktie wird eine **Sensor-Entität** erstellt mit:

| Attribut | Typ | Beschreibung |
|---|---|---|
| **State** | float | Aktueller Kurs (Yahoo Finance) |
| `kuerzel` | text | Börsenkürzel |
| `preis` | float (5,3) | Kaufpreis pro Stück |
| `stueckzahl` | integer (6) | Anzahl der Stücke |
| `kaufdatum` | date | Kaufdatum |
| `limitoben` | float (5,3) | Oberes Kurslimit |
| `limitunten` | float (5,3) | Unteres Kurslimit |
| `aktueller_kurs` | float | Live-Kurs |
| `alarmoben` | boolean | `true` wenn Kurs ≥ limitoben |
| `alarmunten` | boolean | `true` wenn Kurs ≤ limitunten |
| `gewinn` | float (4,3) | (Kurs − Kaufpreis) × Stückzahl |

---

## Automation-Beispiel: Kurs-Alarm per Push

```yaml
automation:
  alias: "Portfolio Alarm – Apple überschreitet 200€"
  trigger:
    - platform: state
      entity_id: sensor.aapl
      attribute: alarmoben
      to: true
  action:
    - service: notify.mobile_app
      data:
        title: "📈 Kurs-Alarm!"
        message: >
          {{ state_attr('sensor.aapl', 'kuerzel') }} hat das obere Limit
          ({{ state_attr('sensor.aapl', 'limitoben') }}) überschritten.
          Aktueller Kurs: {{ states('sensor.aapl') }}
```

---

## Lovelace-Dashboard Beispiel

```yaml
type: entities
title: 📈 Mein Portfolio
entities:
  - entity: sensor.aapl
    name: Apple Inc.
    icon: mdi:apple
  - entity: sensor.sap_de
    name: SAP SE
  - entity: sensor.btc_usd
    name: Bitcoin
```

**Oder als History-Graph:**
```yaml
type: history-graph
title: Kursverlauf
entities:
  - entity: sensor.aapl
hours_to_show: 48
```

---

## Hinweise

- Yahoo Finance kann gelegentlich das Scraping-Format ändern – bei leeren Kursen bitte ein Issue erstellen.
- Außerhalb der Handelszeiten wird der letzte verfügbare Kurs angezeigt.
- Das Aktualisierungsintervall kann in den Integrationsoptionen angepasst werden.

---

## Lizenz

MIT License
