/**
 * my-portfolio-topflop-card
 * Zeigt die besten 3 und schlechtesten 3 Aktien nach prozentualem Gewinn.
 *
 * Installation:
 *   1. Datei nach /config/www/my-portfolio-topflop-card.js kopieren
 *   2. Einstellungen → Dashboards → ⋮ → Ressourcen → + Hinzufügen
 *      URL: /local/my-portfolio-topflop-card.js  Typ: JavaScript-Modul
 *   3. Dashboard-Karte hinzufügen (Typ: Manuell / YAML):
 *
 *      type: custom:my-portfolio-topflop-card
 *      title: Top & Flop Aktien        # optional
 *      max_items: 3                    # optional, Standard: 3
 */

class MyPortfolioTopFlopCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    this._config = config;
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _getStocks() {
    const hass = this._hass;
    const stocks = [];

    for (const [entityId, state] of Object.entries(hass.states)) {
      if (!entityId.startsWith("sensor.")) continue;
      const attr = state.attributes;
      // Aktien-Entitäten haben kuerzel und gewinn
      if (attr.kuerzel === undefined || attr.gewinn === undefined) continue;
      if (attr.gesamtinvest !== undefined) continue; // Portfolio-Summary überspringen
      const gewinn = parseFloat(attr.gewinn);
      if (isNaN(gewinn)) continue;
      stocks.push({
        entityId,
        bezeichnung: attr.bezeichnung || attr.kuerzel || entityId,
        kuerzel: attr.kuerzel,
        gewinn,
        kurs: parseFloat(state.state) || null,
        portfolio: attr.portfolio_name || "",
      });
    }
    return stocks;
  }

  _render() {
    if (!this._hass) return;
    const config = this._config || {};
    const title = config.title || "Top & Flop Aktien";
    const maxItems = parseInt(config.max_items) || 3;

    const stocks = this._getStocks();
    if (stocks.length === 0) {
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; }
          .empty { padding: 1.5rem; text-align: center; color: var(--secondary-text-color); font-family: var(--primary-font-family); }
        </style>
        <ha-card><div class="empty">Keine Aktien-Sensoren gefunden.</div></ha-card>`;
      return;
    }

    const sorted = [...stocks].sort((a, b) => b.gewinn - a.gewinn);
    const top = sorted.slice(0, maxItems);
    const flop = [...sorted].reverse().slice(0, maxItems);

    const fmt = (v, decimals = 2) =>
      v !== null && v !== undefined
        ? v.toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : "–";

    const renderRow = (s, rank, isTop) => {
      const sign = s.gewinn >= 0 ? "+" : "";
      const color = s.gewinn >= 0 ? "#22c55e" : "#ef4444";
      const bar = Math.min(Math.abs(s.gewinn), 30); // max 30% für Balkenbreite
      const barDir = isTop ? "left" : "right";
      return `
        <div class="row">
          <div class="rank" style="color:${color}">${rank}</div>
          <div class="info">
            <div class="name">${s.bezeichnung}</div>
            <div class="meta">${s.kuerzel} · ${s.portfolio}</div>
            <div class="bar-wrap">
              <div class="bar" style="width:${bar * 3}px; background:${color}; margin-${barDir}:auto"></div>
            </div>
          </div>
          <div class="value" style="color:${color}">
            <span class="pct">${sign}${fmt(s.gewinn)}%</span>
            <span class="kurs">${fmt(s.kurs, 3)}</span>
          </div>
        </div>`;
    };

    this.shadowRoot.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Outfit:wght@400;600;700&display=swap');
        :host { display: block; }
        ha-card {
          background: var(--ha-card-background, var(--card-background-color, #1c1c27));
          border-radius: 16px;
          overflow: hidden;
          font-family: 'Outfit', sans-serif;
        }
        .header {
          padding: 1.1rem 1.4rem 0.5rem;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
        }
        .section-label {
          padding: 0.5rem 1.4rem 0.2rem;
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .section-label.top { color: #22c55e; }
        .section-label.flop { color: #ef4444; }
        .section-label::after {
          content: '';
          flex: 1;
          height: 1px;
          background: currentColor;
          opacity: 0.2;
        }
        .row {
          display: flex;
          align-items: center;
          gap: 0.8rem;
          padding: 0.55rem 1.4rem;
          transition: background 0.15s;
          animation: fadeIn 0.3s ease both;
        }
        .row:hover { background: rgba(255,255,255,0.04); }
        @keyframes fadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
        .rank {
          font-family: 'DM Mono', monospace;
          font-size: 1.1rem;
          font-weight: 500;
          width: 1.6rem;
          text-align: center;
          flex-shrink: 0;
        }
        .info { flex: 1; min-width: 0; }
        .name {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--primary-text-color);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .meta {
          font-size: 0.7rem;
          color: var(--secondary-text-color);
          margin-top: 0.1rem;
          font-family: 'DM Mono', monospace;
        }
        .bar-wrap { margin-top: 0.3rem; height: 3px; background: rgba(255,255,255,0.07); border-radius: 2px; overflow: hidden; }
        .bar { height: 3px; border-radius: 2px; transition: width 0.6s cubic-bezier(.4,0,.2,1); }
        .value {
          text-align: right;
          flex-shrink: 0;
        }
        .pct {
          display: block;
          font-family: 'DM Mono', monospace;
          font-size: 0.95rem;
          font-weight: 500;
        }
        .kurs {
          display: block;
          font-size: 0.7rem;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
          margin-top: 0.1rem;
        }
        .divider {
          height: 1px;
          margin: 0.4rem 1.4rem;
          background: rgba(255,255,255,0.06);
        }
        .footer {
          padding: 0.5rem 1.4rem 0.9rem;
          font-size: 0.62rem;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
          text-align: right;
        }
      </style>
      <ha-card>
        <div class="header">${title}</div>

        <div class="section-label top">▲ Top ${maxItems}</div>
        ${top.map((s, i) => renderRow(s, ["🥇","🥈","🥉"][i] || i+1, true)).join("")}

        <div class="divider"></div>

        <div class="section-label flop">▼ Flop ${maxItems}</div>
        ${flop.map((s, i) => renderRow(s, ["💀","📉","⚠️"][i] || i+1, false)).join("")}

        <div class="footer">Gewinn in % seit Kauf · ${stocks.length} Aktien gesamt</div>
      </ha-card>`;
  }

  getCardSize() { return 5; }

  static getConfigElement() {
    return document.createElement("my-portfolio-topflop-card-editor");
  }

  static getStubConfig() {
    return { title: "Top & Flop Aktien", max_items: 3 };
  }
}

customElements.define("my-portfolio-topflop-card", MyPortfolioTopFlopCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "my-portfolio-topflop-card",
  name: "Portfolio Top & Flop",
  description: "Zeigt die besten und schlechtesten Aktien nach prozentualem Gewinn.",
  preview: false,
});
