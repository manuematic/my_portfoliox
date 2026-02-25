# 📈 Mein Portfolio – Home Assistant Integration

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![GitHub release](https://img.shields.io/github/release/manuematic/my_portfolio.svg)](https://github.com/manuematic/my_portfolio/releases)

Eine Home Assistant Integration zum Verwalten und Überwachen von Aktienportfolios mit Live-Kursen von Yahoo Finance. Irgendwie hat mir bisher keine Finanz-/Portfolioverwaltung gefallen also habe ich meine eigene geschrieben. Ich hoffe sie leistet euch gute Dienste und steigende Kurse ;-)

Ich fände es nett wenn ihr in GitHub unter "Issues" in dem Issue "User" kurz schreibt wenn ihr das nutzt. Müsst ihr nicht aber fände ich spannend.

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

## Erstellen eines Portfolios
1. **Einstellungen → Integrationen → Mein Portfolio**
2. Dann auf "Eintrag hinzufügen" klicken und dem Portfolio einen Namen geben. Kursquelle immer "Yahoo Finance"

## Hinzufügen einer Aktie
1. **Einstellungen → Integrationen → Mein Portfolio**
2. Dann auf das Zahnrad in Portfoliozeile klicken
3. Unten kann man dann Aktien hinzufügen, bearbeiten, löschen oder die Portfolioeinstellungen verwalten.
4. Für eine Aktie müssen mindestens der Name, das Yahoo Kürzel, der Kaufpreis und Stückzahl angegeben werden.

## Bearbeiten/Löschen einer Aktie
1. **Einstellungen → Integrationen → Mein Portfolio**
2. Dann auf das Zahnrad in Portfoliozeile klicken
3. Unten dann Aktie bearbeiten/löschen auswählen.
4. In der nächsten Box dann die Aktie auswählen und ganz unten bearbiten oder löschen auswählen.

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
      entity_id: sensor.mein_portfolio_PORTFOLIONAME_AKTIE1_KUERZEL
      attribute: alarmoben
      to: true
  action:
    - service: notify.mobile_app
      data:
        title: "📈 Kurs-Alarm!"
        message: >
          {{ state_attr('sensor.mein_portfolio_PORTFOLIONAME_AKTIEN_KUERZEL', 'kuerzel') }} hat das obere Limit
          ({{ state_attr('sensor.mein_portfolio_PORTFOLIONAME_AKTIEN_KUERZEL', 'limitoben') }}) überschritten.
          Aktueller Kurs: {{ states('sensor.mein_portfolio_PORTFOLIONAME_AKTIEN_KUERZEL') }}
```

---

## Lovelace-Dashboard

**Allgemein**
```yaml
type: entities
title: 📈 Mein Portfolio
entities:
  - entity: sensor.mein_portfolio_PORTFOLIONAME_AKTIE1_KUERZEL
    name: Apple Inc.
    icon: mdi:apple
  - entity: sensor.mein_portfolio_PORTFOLIONAME_AKTIE2_KUERZEL
    name: SAP SE
  - entity: sensor.mein_portfolio_PORTFOLIONAME_AKTIE3_KUERZEL
    name: Bitcoin
```

**Oder als History-Graph:**
```yaml
type: history-graph
title: Kursverlauf
entities:
  - entity: sensor.mein_portfolio_PORTFOLIONAME_AKTIE1_KUERZEL
hours_to_show: 48
```


**Custom Cards**
Mit der Integration werden 5 (bald 7) Custom Cards mitgeliefert. Für die Nutzung der Cards müssen diese aus dem Archiverzeichnis "/www" in das Verzeichnis "/config/www" in Home Assistant kopiert werden.
Dann unter **Einstellungen → Dashboards** oben rechts die drei Punkte anklicken, dann auf Resourcen klicken und im folgenden Dialog jeweils die einzelnen js Dateien angeben:

/local/my-portfolio-daily-all-card.js Typ: JavaScript-Modul
/local/my-portfolio-daily-topflop-card.js Typ: JavaScript-Modul
/local/my-portfolio-overview-card.js Typ: JavaScript-Modul
/local/my-portfolio-topflop-card.js Typ: JavaScript-Modul
/local/my-portfolio-total-performance-card.js Typ: Javascript-Modul

Wenn beim Update der Integration bei neuen Versionen der Cards die alten cards angezeigt werden kann es manchmal helfen die Resource zu löschen, Home Assistant neu zu starten und dann wieder hinzuzufügen. Ich habe da manchmal Probleme mit dem Home Assistant Cache gehabt.

1. Portfolio Zusammenfassung (
```yaml
type: custom:my-portfolio-overview-card (Summe Invest, Summe Wert, Wertsteigerung in %)
title: Meine Portfolios

2. Tages Beste und Schlechteste Aktien
```yaml
type: custom:my-portfolio-daily-topflop-card
title: Tages Top & Flop
max_items: 3

3. Gesamt Beste und Schlechteste Aktien
```yaml
type: custom:my-portfolio-topflop-card
title: Top & Flop Aktien
max_items: 3

4. Tages Performance alle Aktien - Sortierbar nach Prozent, Betrag und Aplhabetisch
```yaml
type: custom:my-portfolio-daily-all-card
sort: pct
order: desc

5. Gesamt Performance alle Aktien - Sortierbar nach Prozent, Betrag und Aplhabetisch
```yaml
type: custom:my-portfolio-total-performance-card
sort: eur
order: desc

Bei den letzten beiden Cards 4. und 5. lassen sich auch in Lovelace die Sortierungsoptionen im Browser umschalten, dazu dienen kleine Buttons über der Liste.

---

## Lovelace-Dashboard
## Hinweise

- Yahoo Finance kann gelegentlich das Scraping-Format ändern – bei leeren Kursen bitte ein Issue erstellen.
- Außerhalb der Handelszeiten wird der letzte verfügbare Kurs angezeigt.
- Das Aktualisierungsintervall kann in den Integrationsoptionen angepasst werden.

---

## Lizenz

GNU GPL V2
