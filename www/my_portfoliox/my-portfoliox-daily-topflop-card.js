/**
 * my-portfolio-daily-topflop-card  v0.7.0
 * Top 3 / Flop 3 nach heutiger Tagesperformance.
 *
 * Installation:
 *   1. Nach /config/www/my-portfolio-daily-topflop-card.js kopieren
 *   2. Ressource: /local/my-portfolio-daily-topflop-card.js  (JavaScript-Modul)
 *   3. YAML:
 *      type: custom:my-portfolio-daily-topflop-card
 *      title: Tages Top & Flop   # optional
 *      max_items: 3              # optional
 */

class MyPortfolioDailyTopFlopCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) { this._config = config; }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _getStocks() {
    const stocks = [];
    for (const [entityId, state] of Object.entries(this._hass.states)) {
      if (!entityId.startsWith("sensor.")) continue;
      const attr = state.attributes || {};
      if (attr.kuerzel === undefined || attr.summary_key !== undefined) continue;
      if (attr.integration === "my_portfolio_candidate") continue;
      const pct = parseFloat(attr.tages_aenderung_pct);
      if (isNaN(pct)) continue;
      stocks.push({
        bezeichnung: (attr.bezeichnung || attr.kuerzel || "").trim(),
        kuerzel:     attr.kuerzel || "?",
        portfolio:   attr.portfolio_name || "",
        kurs:        parseFloat(state.state) || null,
        tages_pct:   pct,
        tages_abs:   parseFloat(attr.tages_aenderung_abs) || null,
        kurs_vortag: parseFloat(attr.kurs_vortag) || null,
      });
    }
    return stocks;
  }

  _render() {
    if (!this._hass) return;
    const config   = this._config || {};
    const title    = config.title || "Tages Top & Flop";
    const maxItems = parseInt(config.max_items) || 3;
    const stocks   = this._getStocks();

    const fmt = (v, dec = 2) =>
      v !== null && !isNaN(v)
        ? v.toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec })
        : "–";
    const sign  = v => (v !== null && !isNaN(v) && v >= 0) ? "+" : "";
    const color = v => (v >= 0) ? "#22c55e" : "#ef4444";

    const renderRow = (s, medal, delay) => {
      const bar = Math.min(Math.abs(s.tages_pct), 10) * 8; // px, max 80px bei 10%
      return `
        <div class="row" style="animation-delay:${delay}s">
          <div class="medal">${medal}</div>
          <div class="info">
            <div class="name">${s.bezeichnung}</div>
            <div class="meta">${s.kuerzel}${s.portfolio ? " · " + s.portfolio : ""}</div>
            <div class="bar-track">
              <div class="bar-fill" style="
                width:${bar}px;
                background:${color(s.tages_pct)};
                ${s.tages_pct < 0 ? "margin-left:auto;" : ""}
              "></div>
            </div>
          </div>
          <div class="values">
            <span class="pct" style="color:${color(s.tages_pct)}">
              ${sign(s.tages_pct)}${fmt(s.tages_pct)}%
            </span>
            <span class="abs" style="color:${color(s.tages_pct)}">
              ${sign(s.tages_abs)}${fmt(s.tages_abs, 3)} €
            </span>
            <span class="kurs">${fmt(s.kurs, 3)}</span>
          </div>
        </div>`;
    };

    const sorted     = [...stocks].sort((a, b) => b.tages_pct - a.tages_pct);
    const top        = sorted.slice(0, maxItems);
    const flop       = [...sorted].reverse().slice(0, maxItems);
    const topMedals  = ["🚀","⬆️","📈"];
    const flopMedals = ["💥","⬇️","📉"];

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
          padding: 1.4rem 1.6rem 0.3rem;
          display: flex;
          align-items: baseline;
          justify-content: space-between;
        }
        .header-title {
          font-size: 1.05rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
        }
        .header-sub {
          font-family: 'DM Mono', monospace;
          font-size: 0.82rem;
          color: var(--secondary-text-color);
        }
        .section-label {
          padding: 0.5rem 1.6rem 0.2rem;
          font-size: 0.85rem;
          font-weight: 700;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }
        .section-label.top  { color: #22c55e; }
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
          gap: 0.9rem;
          padding: 0.65rem 1.6rem;
          transition: background 0.15s;
          animation: fadeIn 0.35s ease both;
        }
        .row:hover { background: rgba(255,255,255,0.04); }
        @keyframes fadeIn {
          from { opacity:0; transform:translateY(5px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .medal { font-size: 1.6rem; width: 2rem; text-align: center; flex-shrink: 0; }
        .info  { flex: 1; min-width: 0; }
        .name {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--primary-text-color);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .meta {
          font-size: 0.82rem;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
          margin-top: 0.1rem;
        }
        .bar-track {
          margin-top: 0.4rem;
          height: 4px;
          background: rgba(255,255,255,0.07);
          border-radius: 2px;
          overflow: hidden;
          display: flex;
        }
        .bar-fill {
          height: 4px;
          border-radius: 2px;
          transition: width 0.7s cubic-bezier(.4,0,.2,1);
          min-width: 2px;
        }
        .values { text-align: right; flex-shrink: 0; }
        .pct {
          display: block;
          font-family: 'DM Mono', monospace;
          font-size: 1.15rem;
          font-weight: 500;
        }
        .abs {
          display: block;
          font-family: 'DM Mono', monospace;
          font-size: 0.88rem;
          margin-top: 0.05rem;
        }
        .kurs {
          display: block;
          font-size: 0.8rem;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
          margin-top: 0.1rem;
        }
        .divider {
          height: 1px;
          margin: 0.4rem 1.6rem;
          background: rgba(255,255,255,0.07);
        }
        .footer {
          padding: 0.4rem 1.6rem 1rem;
          font-size: 0.8rem;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
          text-align: right;
        }
        .empty {
          padding: 2.5rem;
          text-align: center;
          font-size: 1.05rem;
          color: var(--secondary-text-color);
        }
      </style>
      <ha-card>
        <div class="header">
          <div class="header-title">${title}</div>
          <div class="header-sub">heute</div>
        </div>

        ${stocks.length === 0
          ? `<div class="empty">Keine Tagesdaten verfügbar.<br>Bitte warte auf den nächsten Kursabruf.</div>`
          : `
            <div class="section-label top">▲ Top ${Math.min(maxItems, top.length)}</div>
            ${top.map((s, i) => renderRow(s, topMedals[i] || "▲", i * 0.07)).join("")}

            <div class="divider"></div>

            <div class="section-label flop">▼ Flop ${Math.min(maxItems, flop.length)}</div>
            ${flop.map((s, i) => renderRow(s, flopMedals[i] || "▼", i * 0.07)).join("")}

            <div class="footer">Tagesperformance · ${stocks.length} Aktien</div>
          `}
      </ha-card>`;
  }

  getCardSize() { return 6; }
  static getStubConfig() { return { title: "Tages Top & Flop", max_items: 3 }; }
}

customElements.define("my-portfolio-daily-topflop-card", MyPortfolioDailyTopFlopCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "my-portfolio-daily-topflop-card",
  name: "Portfolio Tages Top & Flop",
  description: "Top 3 / Flop 3 Aktien nach heutiger Tagesperformance.",
});
