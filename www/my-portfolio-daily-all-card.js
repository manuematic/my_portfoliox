/**
 * my-portfolio-daily-all-card  v0.7.0
 * Alle Aktien sortiert nach heutiger Tagesperformance.
 *
 * Installation:
 *   1. Nach /config/www/my-portfolio-daily-all-card.js kopieren
 *   2. Ressource: /local/my-portfolio-daily-all-card.js  (JavaScript-Modul)
 *   3. YAML:
 *      type: custom:my-portfolio-daily-all-card
 *      title: Tagesperformance     # optional
 *      sort: pct                   # optional: pct (default) oder abs
 */

class MyPortfolioDailyAllCard extends HTMLElement {
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
        stueckzahl:  parseInt(attr.stueckzahl) || 0,
      });
    }
    return stocks;
  }

  _render() {
    if (!this._hass) return;
    const config = this._config || {};
    const title  = config.title || "Tagesperformance";
    const sortBy = config.sort === "abs" ? "tages_abs" : "tages_pct";
    const stocks = this._getStocks().sort((a, b) => b[sortBy] - a[sortBy]);

    const fmt = (v, dec = 2) =>
      v !== null && !isNaN(v)
        ? v.toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec })
        : "–";
    const sign  = v => (v !== null && !isNaN(v) && v >= 0) ? "+" : "";
    const color = v => v >= 0 ? "#22c55e" : "#ef4444";

    // Größte abs. Veränderung für Balken-Normalisierung
    const maxPct = stocks.length ? Math.max(...stocks.map(s => Math.abs(s.tages_pct))) : 1;

    const renderRow = (s, idx) => {
      const barW = maxPct > 0 ? (Math.abs(s.tages_pct) / maxPct) * 90 : 0;
      const isPos = s.tages_pct >= 0;
      // Tageswertänderung in € über Stückzahl
      const tages_wert = s.tages_abs !== null ? s.tages_abs * s.stueckzahl : null;

      return `
        <div class="row ${isPos ? "pos" : "neg"}" style="animation-delay:${idx * 0.04}s">
          <div class="rank">${idx + 1}</div>
          <div class="info">
            <div class="name-row">
              <span class="name">${s.bezeichnung}</span>
              <span class="kuerzel">${s.kuerzel}</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="
                width:${barW}%;
                background:${color(s.tages_pct)};
                ${!isPos ? "margin-left:auto;" : ""}
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
            ${tages_wert !== null ? `
            <span class="wert" style="color:${color(tages_wert)}">
              ${sign(tages_wert)}${fmt(tages_wert, 2)} €
            </span>` : ""}
          </div>
        </div>`;
    };

    // Gesamt-Tagesperformance
    const totalAbs = stocks.reduce((s, a) =>
      a.tages_abs !== null ? s + a.tages_abs * a.stueckzahl : s, 0);
    const totalClr = color(totalAbs);

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
        .header-total {
          font-family: 'DM Mono', monospace;
          font-size: 1.1rem;
          font-weight: 500;
          color: ${totalClr};
        }
        .sort-label {
          padding: 0 1.6rem 0.4rem;
          font-size: 0.75rem;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
        }
        .rows { padding: 0 0 0.5rem; }
        .row {
          display: flex;
          align-items: center;
          gap: 0.8rem;
          padding: 0.55rem 1.6rem;
          transition: background 0.15s;
          animation: fadeIn 0.3s ease both;
        }
        .row:hover { background: rgba(255,255,255,0.04); }
        .row.pos { border-left: 3px solid transparent; }
        .row.neg { border-left: 3px solid transparent; }
        @keyframes fadeIn {
          from { opacity:0; transform:translateX(-6px); }
          to   { opacity:1; transform:translateX(0); }
        }
        .rank {
          font-family: 'DM Mono', monospace;
          font-size: 0.88rem;
          color: var(--secondary-text-color);
          width: 1.5rem;
          text-align: right;
          flex-shrink: 0;
        }
        .info { flex: 1; min-width: 0; }
        .name-row {
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
        }
        .name {
          font-size: 1.05rem;
          font-weight: 600;
          color: var(--primary-text-color);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .kuerzel {
          font-size: 0.75rem;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
          flex-shrink: 0;
        }
        .bar-track {
          margin-top: 0.35rem;
          height: 3px;
          background: rgba(255,255,255,0.06);
          border-radius: 2px;
          overflow: hidden;
          display: flex;
        }
        .bar-fill {
          height: 3px;
          border-radius: 2px;
          transition: width 0.6s cubic-bezier(.4,0,.2,1);
          min-width: 1px;
        }
        .values { text-align: right; flex-shrink: 0; }
        .pct {
          display: block;
          font-family: 'DM Mono', monospace;
          font-size: 1.1rem;
          font-weight: 500;
        }
        .abs {
          display: block;
          font-family: 'DM Mono', monospace;
          font-size: 0.82rem;
        }
        .wert {
          display: block;
          font-family: 'DM Mono', monospace;
          font-size: 0.78rem;
          opacity: 0.75;
        }
        .divider {
          height: 1px;
          margin: 0.2rem 1.6rem;
          background: rgba(255,255,255,0.05);
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
          <div class="header-total">
            ${sign(totalAbs)}${fmt(totalAbs, 2)} € heute
          </div>
        </div>
        <div class="sort-label">sortiert nach ${sortBy === "tages_pct" ? "%" : "€ absolut"} · absteigend</div>

        ${stocks.length === 0
          ? `<div class="empty">Keine Tagesdaten verfügbar.<br>Bitte warte auf den nächsten Kursabruf.</div>`
          : `<div class="rows">
               ${stocks.map((s, i) => {
                 const html = renderRow(s, i);
                 // Trennlinie zwischen positiven und negativen
                 const next = stocks[i + 1];
                 const addDiv = next && s.tages_pct >= 0 && next.tages_pct < 0;
                 return html + (addDiv ? '<div class="divider"></div>' : "");
               }).join("")}
             </div>
             <div class="footer">Tagesperformance · ${stocks.length} Aktien</div>
          `}
      </ha-card>`;
  }

  getCardSize() { return Math.max(3, Math.ceil(this._getStocks().length * 0.6) + 2); }
  static getStubConfig() { return { title: "Tagesperformance", sort: "pct" }; }
}

customElements.define("my-portfolio-daily-all-card", MyPortfolioDailyAllCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "my-portfolio-daily-all-card",
  name: "Portfolio Tagesperformance (alle)",
  description: "Alle Aktien sortiert nach heutiger Tagesperformance.",
});
