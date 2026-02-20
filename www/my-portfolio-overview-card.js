/**
 * my-portfolio-overview-card
 * Zeigt eine Übersicht aller Portfolios mit Gesamtinvest, Gesamtwert,
 * Portfoliodifferenz und Portfolioprozent.
 *
 * Installation:
 *   1. Datei nach /config/www/my-portfolio-overview-card.js kopieren
 *   2. Einstellungen → Dashboards → ⋮ → Ressourcen → + Hinzufügen
 *      URL: /local/my-portfolio-overview-card.js  Typ: JavaScript-Modul
 *   3. Dashboard-Karte hinzufügen (Typ: Manuell / YAML):
 *
 *      type: custom:my-portfolio-overview-card
 *      title: Meine Portfolios          # optional
 */

class MyPortfolioOverviewCard extends HTMLElement {
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

  _getPortfolios() {
    const hass = this._hass;
    // Portfolio-Summary Sensoren erkennen an Attribut gesamtinvest
    const portfolioMap = {};

    for (const [entityId, state] of Object.entries(hass.states)) {
      if (!entityId.startsWith("sensor.")) continue;
      const attr = state.attributes;
      const portfolio = attr.portfolio_name;
      if (!portfolio) continue;

      if (!portfolioMap[portfolio]) {
        portfolioMap[portfolio] = {
          name: portfolio,
          gesamtinvest: null,
          gesamtwert: null,
          portfoliodifferenz: null,
          portfolioprozent: null,
          stockCount: 0,
        };
      }

      // Summary-Sensoren haben gesamtinvest direkt als state
      if (attr.gesamtinvest !== undefined) {
        // Das ist ein Summary-Sensor – state ist der Wert
        const val = parseFloat(state.state);
        const key = entityId.replace(/^sensor\./, "");

        if (!isNaN(val)) {
          // Anhand des Entity-Namens zuordnen
          const name = (state.attributes.friendly_name || "").toLowerCase();
          if (name.includes("gesamtinvest") || name.includes("invest"))
            portfolioMap[portfolio].gesamtinvest = val;
          else if (name.includes("gesamtwert") || name.includes("wert"))
            portfolioMap[portfolio].gesamtwert = val;
          else if (name.includes("differenz"))
            portfolioMap[portfolio].portfoliodifferenz = val;
          else if (name.includes("prozent") || name.includes("percent"))
            portfolioMap[portfolio].portfolioprozent = val;
        }
      } else if (attr.kuerzel !== undefined) {
        // Aktien-Sensor → zählen
        portfolioMap[portfolio].stockCount++;
      }
    }

    // Fallback: Summary direkt aus Sensor-Attributen lesen
    for (const [entityId, state] of Object.entries(hass.states)) {
      if (!entityId.startsWith("sensor.")) continue;
      const attr = state.attributes;
      const portfolio = attr.portfolio_name;
      if (!portfolio || !portfolioMap[portfolio]) continue;

      // Summary-Sensor hat eines der vier Felder direkt als Attribut
      ["gesamtinvest", "gesamtwert", "portfoliodifferenz", "portfolioprozent"].forEach(field => {
        if (attr[field] !== undefined && portfolioMap[portfolio][field] === null) {
          portfolioMap[portfolio][field] = parseFloat(attr[field]);
        }
      });
    }

    return Object.values(portfolioMap);
  }

  _render() {
    if (!this._hass) return;
    const config = this._config || {};
    const title = config.title || "Portfolio-Übersicht";

    const portfolios = this._getPortfolios();

    const fmt = (v, decimals = 2, suffix = "") => {
      if (v === null || v === undefined || isNaN(v)) return "–";
      return v.toLocaleString("de-DE", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }) + suffix;
    };

    const renderPortfolio = (p, idx) => {
      const diff = p.portfoliodifferenz;
      const pct = p.portfolioprozent;
      const diffColor = diff === null ? "var(--secondary-text-color)"
        : diff >= 0 ? "#22c55e" : "#ef4444";
      const pctColor = pct === null ? "var(--secondary-text-color)"
        : pct >= 0 ? "#22c55e" : "#ef4444";
      const sign = (v) => (v !== null && v >= 0 ? "+" : "");
      const delay = idx * 0.08;

      return `
        <div class="portfolio-card" style="animation-delay:${delay}s">
          <div class="portfolio-header">
            <div class="portfolio-icon">📂</div>
            <div class="portfolio-meta">
              <div class="portfolio-name">${p.name}</div>
              <div class="portfolio-stocks">${p.stockCount} Aktie${p.stockCount !== 1 ? "n" : ""}</div>
            </div>
            <div class="portfolio-pct" style="color:${pctColor}">
              ${sign(pct)}${fmt(pct, 2, "%")}
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

          <div class="diff-bar-wrap">
            <div class="diff-row">
              <span class="diff-label">Differenz</span>
              <span class="diff-value" style="color:${diffColor}">
                ${sign(diff)}${fmt(diff, 3)} €
              </span>
            </div>
            ${p.gesamtinvest && p.gesamtwert ? `
            <div class="progress-track">
              <div class="progress-fill" style="
                width: ${Math.min(Math.abs(pct || 0), 50) * 2}%;
                background: ${diffColor};
                ${diff < 0 ? "margin-left:auto;" : ""}
              "></div>
            </div>` : ""}
          </div>
        </div>`;
    };

    // Gesamtsumme über alle Portfolios
    const totalInvest = portfolios.reduce((s, p) => s + (p.gesamtinvest || 0), 0);
    const totalWert = portfolios.reduce((s, p) => {
      return p.gesamtwert !== null ? s + p.gesamtwert : s;
    }, 0);
    const totalDiff = totalWert - totalInvest;
    const totalPct = totalInvest ? (totalWert - totalInvest) * 100 / totalInvest : null;
    const totalColor = totalDiff >= 0 ? "#22c55e" : "#ef4444";

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
          padding: 1.1rem 1.4rem 0.3rem;
          display: flex;
          align-items: baseline;
          justify-content: space-between;
        }
        .card-title {
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
        }
        .card-total {
          font-family: 'DM Mono', monospace;
          font-size: 0.75rem;
          font-weight: 500;
        }
        .portfolio-list {
          padding: 0.4rem 1rem 0.6rem;
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
        }
        .portfolio-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px;
          padding: 1rem 1.1rem 0.8rem;
          animation: slideIn 0.4s ease both;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .portfolio-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .portfolio-header {
          display: flex;
          align-items: center;
          gap: 0.7rem;
          margin-bottom: 0.8rem;
        }
        .portfolio-icon { font-size: 1.3rem; }
        .portfolio-meta { flex: 1; }
        .portfolio-name {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--primary-text-color);
        }
        .portfolio-stocks {
          font-size: 0.68rem;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
          margin-top: 0.1rem;
        }
        .portfolio-pct {
          font-family: 'DM Mono', monospace;
          font-size: 1.2rem;
          font-weight: 500;
        }
        .metrics {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem;
          margin-bottom: 0.7rem;
        }
        .metric {
          background: rgba(0,0,0,0.2);
          border-radius: 8px;
          padding: 0.5rem 0.7rem;
        }
        .metric-label {
          font-size: 0.62rem;
          color: var(--secondary-text-color);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-weight: 600;
          margin-bottom: 0.2rem;
        }
        .metric-value {
          font-family: 'DM Mono', monospace;
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--primary-text-color);
        }
        .diff-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.35rem;
        }
        .diff-label {
          font-size: 0.65rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--secondary-text-color);
          font-weight: 600;
        }
        .diff-value {
          font-family: 'DM Mono', monospace;
          font-size: 0.85rem;
          font-weight: 500;
        }
        .progress-track {
          height: 4px;
          background: rgba(255,255,255,0.07);
          border-radius: 2px;
          overflow: hidden;
        }
        .progress-fill {
          height: 4px;
          border-radius: 2px;
          transition: width 0.8s cubic-bezier(.4,0,.2,1);
          min-width: 2px;
        }
        .total-bar {
          margin: 0.2rem 1rem 1rem;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 10px;
          padding: 0.7rem 1rem;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.5rem;
          text-align: center;
        }
        .total-item {}
        .total-label {
          font-size: 0.58rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--secondary-text-color);
          font-weight: 600;
          margin-bottom: 0.2rem;
        }
        .total-value {
          font-family: 'DM Mono', monospace;
          font-size: 0.8rem;
          font-weight: 500;
          color: var(--primary-text-color);
        }
        .empty {
          padding: 2rem;
          text-align: center;
          color: var(--secondary-text-color);
        }
      </style>
      <ha-card>
        <div class="card-header">
          <div class="card-title">${title}</div>
          <div class="card-total" style="color:${totalColor}">
            ${totalDiff >= 0 ? "+" : ""}${fmt(totalDiff, 3)} €
          </div>
        </div>

        ${portfolios.length === 0
          ? `<div class="empty">Keine Portfolio-Sensoren gefunden.</div>`
          : `<div class="portfolio-list">
              ${portfolios.map((p, i) => renderPortfolio(p, i)).join("")}
            </div>

            ${portfolios.length > 1 ? `
            <div class="total-bar">
              <div class="total-item">
                <div class="total-label">Invest gesamt</div>
                <div class="total-value">${fmt(totalInvest, 3)} €</div>
              </div>
              <div class="total-item">
                <div class="total-label">Wert gesamt</div>
                <div class="total-value">${fmt(totalWert, 3)} €</div>
              </div>
              <div class="total-item">
                <div class="total-label">Gesamt %</div>
                <div class="total-value" style="color:${totalColor}">
                  ${totalPct !== null ? (totalPct >= 0 ? "+" : "") + fmt(totalPct, 2) + "%" : "–"}
                </div>
              </div>
            </div>` : ""}
          `}
      </ha-card>`;
  }

  getCardSize() { return 4; }

  static getStubConfig() {
    return { title: "Portfolio-Übersicht" };
  }
}

customElements.define("my-portfolio-overview-card", MyPortfolioOverviewCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "my-portfolio-overview-card",
  name: "Portfolio Übersicht",
  description: "Zeigt alle Portfolios mit Gesamtinvest, Gesamtwert, Differenz und Prozent.",
  preview: false,
});
