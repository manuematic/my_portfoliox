/**
 * my-portfolio-alerts-card  v0.9.0
 * Zeigt nur Aktien die ein Limit unter- oder überschritten haben.
 *
 * YAML:
 *   type: custom:my-portfolio-alerts-card
 *   title: Limit-Alarme   # optional
 */

class MyPortfolioAlertsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) { this._config = config; }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _getAlerts() {
    const alerts = [];
    for (const [entityId, state] of Object.entries(this._hass.states)) {
      if (!entityId.startsWith("sensor.")) continue;
      const attr = state.attributes || {};
      if (attr.kuerzel === undefined || attr.summary_key !== undefined) continue;
      const oben   = attr.alarm_oben  === true;
      const unten  = attr.alarm_unten === true;
      if (!oben && !unten) continue;
      const kurs   = parseFloat(state.state);
      const preis  = parseFloat(attr.preis);
      const gewinn = parseFloat(attr.gewinn);
      alerts.push({
        bezeichnung: (attr.bezeichnung || attr.kuerzel || "").trim(),
        kuerzel:     attr.kuerzel || "?",
        portfolio:   attr.portfolio_name || "",
        kurs:        isNaN(kurs)   ? null : kurs,
        preis:       isNaN(preis)  ? null : preis,
        gewinn:      isNaN(gewinn) ? null : gewinn,
        limit_oben:  parseFloat(attr.limit_oben)  || null,
        limit_unten: parseFloat(attr.limit_unten) || null,
        alarm_oben:  oben,
        alarm_unten: unten,
      });
    }
    // Erst oben-Alarme, dann unten-Alarme, alphabetisch
    return alerts.sort((a, b) => {
      if (a.alarm_oben && !b.alarm_oben) return -1;
      if (!a.alarm_oben && b.alarm_oben) return 1;
      return a.bezeichnung.localeCompare(b.bezeichnung, "de");
    });
  }

  _render() {
    if (!this._hass) return;
    const title  = (this._config || {}).title || "Limit-Alarme";
    const alerts = this._getAlerts();

    const fmt = (v, dec = 2) =>
      v !== null && !isNaN(v)
        ? v.toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec })
        : "–";
    const sign = v => (v !== null && !isNaN(v) && v >= 0) ? "+" : "";

    const renderAlert = (s, idx) => {
      const isOben = s.alarm_oben;
      const clr    = isOben ? "#22c55e" : "#ef4444";
      const pulse  = isOben ? "pulse-green" : "pulse-red";
      const icon   = isOben ? "▲" : "▼";
      const label  = isOben ? "LIMIT OBEN" : "LIMIT UNTEN";
      const limit  = isOben ? s.limit_oben : s.limit_unten;
      const diff   = (s.kurs !== null && limit !== null) ? s.kurs - limit : null;

      return `
        <div class="alert-row" style="animation-delay:${idx * 0.08}s; border-left-color:${clr}">
          <div class="alert-indicator">
            <div class="pulse-ring ${pulse}"></div>
            <div class="dot" style="background:${clr}">${icon}</div>
          </div>
          <div class="alert-info">
            <div class="alert-name">${s.bezeichnung}</div>
            <div class="alert-meta">
              <span class="ticker">${s.kuerzel}</span>
              ${s.portfolio ? `<span class="sep">·</span><span class="portfolio">${s.portfolio}</span>` : ""}
            </div>
            <div class="alert-label" style="color:${clr}">${label} ${fmt(limit, 3)} €</div>
          </div>
          <div class="alert-values">
            <div class="kurs-now" style="color:${clr}">${fmt(s.kurs, 3)} €</div>
            <div class="kurs-diff" style="color:${clr}">${sign(diff)}${fmt(diff, 3)} €</div>
            <div class="gewinn" style="color:${s.gewinn >= 0 ? "#22c55e" : "#ef4444"}">
              ${sign(s.gewinn)}${fmt(s.gewinn)}%
            </div>
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
          padding: 1.4rem 1.6rem 0.2rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .hdr-title {
          font-size: 1.05rem;
          font-weight: 700;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
        }
        .hdr-count {
          font-family: 'DM Mono', monospace;
          font-size: 0.85rem;
          padding: .15rem .5rem;
          border-radius: 20px;
          background: ${alerts.length > 0 ? "rgba(239,68,68,.15)" : "rgba(255,255,255,.06)"};
          color: ${alerts.length > 0 ? "#ef4444" : "var(--secondary-text-color)"};
          border: 1px solid ${alerts.length > 0 ? "rgba(239,68,68,.3)" : "rgba(255,255,255,.08)"};
        }
        .list { padding: .4rem 0 .6rem; }
        .alert-row {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: .85rem 1.6rem;
          border-left: 3px solid transparent;
          transition: background .15s;
          animation: slideIn .4s ease both;
        }
        .alert-row:hover { background: rgba(255,255,255,.03); }
        @keyframes slideIn {
          from { opacity:0; transform:translateX(-8px); }
          to   { opacity:1; transform:translateX(0); }
        }
        .alert-indicator {
          position: relative;
          width: 2.2rem;
          height: 2.2rem;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .dot {
          width: 1.6rem;
          height: 1.6rem;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: .75rem;
          font-weight: 700;
          color: #fff;
          position: relative;
          z-index: 1;
        }
        .pulse-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          animation: pulse 2s ease-out infinite;
        }
        .pulse-green { background: rgba(34,197,94,.25); }
        .pulse-red   { background: rgba(239,68,68,.25); }
        @keyframes pulse {
          0%   { transform: scale(.8); opacity: .9; }
          70%  { transform: scale(1.5); opacity: 0; }
          100% { transform: scale(.8); opacity: 0; }
        }
        .alert-info { flex: 1; min-width: 0; }
        .alert-name {
          font-size: 1.05rem;
          font-weight: 600;
          color: var(--primary-text-color);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .alert-meta {
          display: flex;
          gap: .4rem;
          margin-top: .1rem;
        }
        .ticker, .sep, .portfolio {
          font-size: .75rem;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
        }
        .alert-label {
          font-size: .72rem;
          font-weight: 700;
          letter-spacing: .08em;
          margin-top: .25rem;
          font-family: 'DM Mono', monospace;
        }
        .alert-values { text-align: right; flex-shrink: 0; }
        .kurs-now {
          font-family: 'DM Mono', monospace;
          font-size: 1.1rem;
          font-weight: 500;
        }
        .kurs-diff {
          font-family: 'DM Mono', monospace;
          font-size: .8rem;
          margin-top: .05rem;
        }
        .gewinn {
          font-family: 'DM Mono', monospace;
          font-size: .8rem;
        }
        .divider {
          height: 1px;
          margin: 0 1.6rem;
          background: rgba(255,255,255,.06);
        }
        .empty {
          padding: 2.5rem 1.6rem;
          text-align: center;
        }
        .empty-icon { font-size: 2.5rem; margin-bottom: .8rem; }
        .empty-text {
          font-size: 1rem;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
        }
        .empty-sub {
          font-size: .8rem;
          color: var(--secondary-text-color);
          opacity: .6;
          margin-top: .3rem;
        }
      </style>
      <ha-card>
        <div class="header">
          <div class="hdr-title">${title}</div>
          <div class="hdr-count">${alerts.length} Alarm${alerts.length !== 1 ? "e" : ""}</div>
        </div>

        ${alerts.length === 0
          ? `<div class="empty">
               <div class="empty-icon">✅</div>
               <div class="empty-text">Keine aktiven Alarme</div>
               <div class="empty-sub">Alle Positionen innerhalb der Limits</div>
             </div>`
          : `<div class="list">
               ${alerts.map((s, i) =>
                 renderAlert(s, i) +
                 (i < alerts.length - 1 ? '<div class="divider"></div>' : "")
               ).join("")}
             </div>`}
      </ha-card>`;
  }

  getCardSize() { return Math.max(2, this._getAlerts().length + 1); }
  static getStubConfig() { return { title: "Limit-Alarme" }; }
}

customElements.define("my-portfolio-alerts-card", MyPortfolioAlertsCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type:        "my-portfolio-alerts-card",
  name:        "Portfolio Limit-Alarme",
  description: "Zeigt nur Aktien die ein Limit unter- oder überschritten haben.",
});
