/**
 * my-portfolio-overview-card  v0.6.1
 * Zeigt eine Übersicht aller Portfolios mit Gesamtinvest, Gesamtwert,
 * Portfoliodifferenz und Portfolioprozent.
 *
 * Installation:
 *   1. Datei nach /config/www/my-portfolio-overview-card.js kopieren
 *   2. Einstellungen → Dashboards → ⋮ → Ressourcen → + Hinzufügen
 *      URL: /local/my-portfolio-overview-card.js  Typ: JavaScript-Modul
 *   3. Dashboard-Karte (YAML):
 *      type: custom:my-portfolio-overview-card
 *      title: Meine Portfolios   # optional
 */

const SUMMARY_KEYS = ["gesamtinvest", "gesamtwert", "portfoliodifferenz", "portfolioprozent"];

class MyPortfolioOverviewCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) { this._config = config; }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _getPortfolios() {
    const portfolioMap = {};

    for (const [entityId, state] of Object.entries(this._hass.states)) {
      if (!entityId.startsWith("sensor.")) continue;
      const attr = state.attributes || {};
      const portfolio = attr.portfolio_name;
      if (!portfolio) continue;

      // Portfolio-Eintrag anlegen falls noch nicht vorhanden
      if (!portfolioMap[portfolio]) {
        portfolioMap[portfolio] = {
          name:               portfolio,
          gesamtinvest:       null,
          gesamtwert:         null,
          portfoliodifferenz: null,
          portfolioprozent:   null,
          stockCount:         0,
        };
      }
      const p = portfolioMap[portfolio];

      const summaryKey = attr.summary_key;

      if (summaryKey && SUMMARY_KEYS.includes(summaryKey)) {
        // Summary-Sensor: Wert direkt aus state.state lesen
        const raw = state.state;
        if (raw !== "unavailable" && raw !== "unknown" && raw !== null) {
          const val = parseFloat(raw);
          if (!isNaN(val)) {
            p[summaryKey] = val;
          }
        }
      } else if (attr.kuerzel !== undefined && !summaryKey && attr.integration !== "my_portfolio_candidate") {
        // Aktien-Sensor
        p.stockCount++;
      }
    }

    return Object.values(portfolioMap);
  }

  _render() {
    if (!this._hass) return;
    const config     = this._config || {};
    const title      = config.title || "Portfolio-Übersicht";
    const portfolios = this._getPortfolios();

    const fmt = (v, decimals = 2, suffix = "") => {
      if (v === null || v === undefined || isNaN(v)) return "–";
      return v.toLocaleString("de-DE", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }) + suffix;
    };
    const sign = v => (v !== null && !isNaN(v) && v >= 0) ? "+" : "";
    const clr  = v => (v === null || isNaN(v)) ? "var(--secondary-text-color)"
                    : v >= 0 ? "#22c55e" : "#ef4444";

    const renderPortfolio = (p, idx) => `
      <div class="portfolio-card" style="animation-delay:${idx * 0.08}s">
        <div class="portfolio-header">
          <div class="portfolio-icon">📂</div>
          <div class="portfolio-meta">
            <div class="portfolio-name">${p.name}</div>
            <div class="portfolio-stocks">${p.stockCount} Aktie${p.stockCount !== 1 ? "n" : ""}</div>
          </div>
          <div class="portfolio-pct" style="color:${clr(p.portfolioprozent)}">
            ${sign(p.portfolioprozent)}${fmt(p.portfolioprozent, 2, "%")}
          </div>
        </div>

        <div class="metrics">
          <div class="metric">
            <div class="metric-label">Gesamtinvest</div>
            <div class="metric-value">${fmt(p.gesamtinvest, 3)} €</div>
          </div>
          <div class="metric">
            <div class="metric-label">Gesamtwert</div>
            <div class="metric-value">${fmt(p.gesamtwert, 3)} €</div>
          </div>
        </div>

        <div class="diff-row">
          <span class="diff-label">Differenz</span>
          <span class="diff-value" style="color:${clr(p.portfoliodifferenz)}">
            ${sign(p.portfoliodifferenz)}${fmt(p.portfoliodifferenz, 3)} €
          </span>
        </div>
        ${p.portfolioprozent !== null ? `
        <div class="progress-track">
          <div class="progress-fill" style="
            width: ${Math.min(Math.abs(p.portfolioprozent), 50) * 2}%;
            background: ${clr(p.portfoliodifferenz)};
            ${(p.portfoliodifferenz !== null && p.portfoliodifferenz < 0) ? "margin-left:auto;" : ""}
          "></div>
        </div>` : ""}
      </div>`;

    // Gesamtsumme über alle Portfolios
    const totalInvest = portfolios.reduce((s, p) => s + (p.gesamtinvest ?? 0), 0);
    const totalWert   = portfolios.reduce((s, p) => s + (p.gesamtwert   ?? 0), 0);
    const totalDiff   = totalWert - totalInvest;
    const totalPct    = totalInvest ? (totalWert - totalInvest) * 100 / totalInvest : null;

    this.shadowRoot.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;600;700&display=swap');
        :host { display: block; }
        ha-card {
          background: var(--ha-card-background, var(--card-background-color, #1c1c27));
          border-radius: 16px;
          overflow: hidden;
          font-family: 'Outfit', sans-serif;
        }
        .card-header {
          padding: 1.4rem 1.6rem 0.4rem;
          display: flex;
          align-items: baseline;
          justify-content: space-between;
        }
        .card-title {
          font-size: 1.05rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
        }
        .card-total {
          font-family: 'DM Mono', monospace;
          font-size: 1.1rem;
          font-weight: 500;
          color: ${clr(totalDiff)};
        }
        .portfolio-list {
          padding: 0.5rem 1.1rem 0.8rem;
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
        }
        .portfolio-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          padding: 1.1rem 1.2rem 0.9rem;
          animation: slideIn 0.4s ease both;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .portfolio-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 24px rgba(0,0,0,0.25);
        }
        @keyframes slideIn {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .portfolio-header {
          display: flex;
          align-items: center;
          gap: 0.8rem;
          margin-bottom: 0.9rem;
        }
        .portfolio-icon { font-size: 1.8rem; }
        .portfolio-meta { flex: 1; }
        .portfolio-name {
          font-size: 1.2rem;
          font-weight: 600;
          color: var(--primary-text-color);
        }
        .portfolio-stocks {
          font-size: 0.9rem;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
          margin-top: 0.15rem;
        }
        .portfolio-pct {
          font-family: 'DM Mono', monospace;
          font-size: 1.6rem;
          font-weight: 500;
        }
        .metrics {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.6rem;
          margin-bottom: 0.8rem;
        }
        .metric {
          background: rgba(0,0,0,0.2);
          border-radius: 8px;
          padding: 0.6rem 0.8rem;
        }
        .metric-label {
          font-size: 0.78rem;
          color: var(--secondary-text-color);
          text-transform: uppercase;
          letter-spacing: 0.09em;
          font-weight: 600;
          margin-bottom: 0.25rem;
        }
        .metric-value {
          font-family: 'DM Mono', monospace;
          font-size: 1.05rem;
          font-weight: 500;
          color: var(--primary-text-color);
        }
        .diff-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.4rem;
        }
        .diff-label {
          font-size: 0.82rem;
          text-transform: uppercase;
          letter-spacing: 0.09em;
          color: var(--secondary-text-color);
          font-weight: 600;
        }
        .diff-value {
          font-family: 'DM Mono', monospace;
          font-size: 1.05rem;
          font-weight: 500;
        }
        .progress-track {
          height: 5px;
          background: rgba(255,255,255,0.07);
          border-radius: 3px;
          overflow: hidden;
          display: flex;
        }
        .progress-fill {
          height: 5px;
          border-radius: 3px;
          transition: width 0.8s cubic-bezier(.4,0,.2,1);
          min-width: 3px;
        }
        .total-bar {
          margin: 0.2rem 1.1rem 1.1rem;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 10px;
          padding: 0.8rem 1.1rem;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.5rem;
          text-align: center;
        }
        .total-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--secondary-text-color);
          font-weight: 600;
          margin-bottom: 0.25rem;
        }
        .total-value {
          font-family: 'DM Mono', monospace;
          font-size: 1.0rem;
          font-weight: 500;
          color: var(--primary-text-color);
        }
        .empty {
          padding: 2.5rem;
          text-align: center;
          font-size: 1.05rem;
          color: var(--secondary-text-color);
        }
        .debug {
          padding: 0.5rem 1.1rem;
          font-size: 0.75rem;
          font-family: monospace;
          color: var(--secondary-text-color);
          opacity: 0.5;
        }
      </style>
      <ha-card>
        <div class="card-header">
          <div class="card-title">${title}</div>
          <div class="card-total">${sign(totalDiff)}${fmt(totalDiff, 3)} €</div>
        </div>

        ${portfolios.length === 0
          ? `<div class="empty">Keine Portfolio-Sensoren gefunden.</div>`
          : `<div class="portfolio-list">
               ${portfolios.map((p, i) => renderPortfolio(p, i)).join("")}
             </div>
             ${portfolios.length > 1 ? `
             <div class="total-bar">
               <div>
                 <div class="total-label">Invest gesamt</div>
                 <div class="total-value">${fmt(totalInvest, 3)} €</div>
               </div>
               <div>
                 <div class="total-label">Wert gesamt</div>
                 <div class="total-value">${fmt(totalWert, 3)} €</div>
               </div>
               <div>
                 <div class="total-label">Gesamt %</div>
                 <div class="total-value" style="color:${clr(totalPct)}">
                   ${totalPct !== null ? sign(totalPct) + fmt(totalPct, 2) + "%" : "–"}
                 </div>
               </div>
             </div>` : ""}
          `}
      </ha-card>`;
  }

  getCardSize() { return 4; }
  static getStubConfig() { return { title: "Portfolio-Übersicht" }; }
}

customElements.define("my-portfolio-overview-card", MyPortfolioOverviewCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "my-portfolio-overview-card",
  name: "Portfolio Übersicht",
  description: "Zeigt alle Portfolios mit Gesamtinvest, Gesamtwert, Differenz und Prozent.",
});
