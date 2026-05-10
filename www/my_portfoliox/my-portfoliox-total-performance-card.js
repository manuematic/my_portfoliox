/**
 * my-portfoliox-total-performance-card  v0.8.0
 * Gesamtperformance aller Aktien seit Kauf – sortierbar.
 *
 * YAML-Konfiguration:
 *   type: custom:my-portfoliox-total-performance-card
 *   title: Gesamtperformance       # optional
 *   sort: pct                      # pct | eur | alpha  (Standard: pct)
 *   order: desc                    # desc | asc         (Standard: desc)
 */

// Sortierstatus außerhalb der Klasse – überlebt Neuinstanziierungen durch HA
const _totalPerfState = new Map();
let _totalPerfIdCounter = 0;

class MyPortfolioTotalPerformanceCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._uid = ++_totalPerfIdCounter;
  }

  setConfig(config) {
    this._config = config;
    if (!_totalPerfState.has(this._uid)) {
      _totalPerfState.set(this._uid, {
        sortBy: config.sort  || "pct",
        order:  config.order || "desc",
      });
    }
  }

  get _sortBy()  { return (_totalPerfState.get(this._uid) || {}).sortBy || "pct"; }
  get _order()   { return (_totalPerfState.get(this._uid) || {}).order  || "desc"; }
  set _sortBy(v) { const s = _totalPerfState.get(this._uid) || {}; s.sortBy = v; _totalPerfState.set(this._uid, s); }
  set _order(v)  { const s = _totalPerfState.get(this._uid) || {}; s.order  = v; _totalPerfState.set(this._uid, s); }

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
      if (attr.integration === "my_portfoliox_candidate") continue;

      const kurs     = parseFloat(state.state);
      const preis    = parseFloat(attr.preis);
      const stueck   = parseFloat(attr.stueckzahl) || 0;
      const gewinn   = parseFloat(attr.gewinn);  // % seit Kauf

      if (isNaN(kurs) || isNaN(preis) || isNaN(gewinn)) continue;

      // Absoluter Gewinn in € = (Kurs - Kaufpreis) * Stückzahl
      const gewinn_eur = (kurs - preis) * stueck;

      stocks.push({
        bezeichnung: (attr.bezeichnung || attr.kuerzel || "").trim(),
        kuerzel:     attr.kuerzel || "?",
        portfolio:   attr.portfolio_name || "",
        kurs,
        preis,
        stueck,
        gewinn_pct:  gewinn,
        gewinn_eur:  round2(gewinn_eur),
        kaufdatum:   attr.kaufdatum || "",
      });
    }
    return stocks;
  }

  _sort(stocks) {
    const asc = this._order === "asc";
    return [...stocks].sort((a, b) => {
      let diff;
      if (this._sortBy === "alpha") {
        diff = a.bezeichnung.localeCompare(b.bezeichnung, "de");
      } else if (this._sortBy === "eur") {
        diff = a.gewinn_eur - b.gewinn_eur;
      } else {
        diff = a.gewinn_pct - b.gewinn_pct;
      }
      return asc ? diff : -diff;
    });
  }

  _toggleSort(field) {
    if (this._sortBy === field) {
      this._order = this._order === "desc" ? "asc" : "desc";
    } else {
      this._sortBy = field;
      this._order  = field === "alpha" ? "asc" : "desc";
    }
    this._render();
  }

  _render() {
    if (!this._hass || !_totalPerfState.has(this._uid)) return;
    const config = this._config || {};
    const title  = config.title || "Gesamtperformance";
    const stocks = this._sort(this._getStocks());

    const fmt = (v, dec = 2) =>
      v !== null && !isNaN(v)
        ? v.toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec })
        : "–";
    const sign  = v => (v !== null && !isNaN(v) && v >= 0) ? "+" : "";
    const color = v => v >= 0 ? "#22c55e" : "#ef4444";
    const arrow = () => this._order === "desc" ? "↓" : "↑";

    // Gesamtsummen
    const totalInvest  = stocks.reduce((s, a) => s + a.preis  * a.stueck, 0);
    const totalWert    = stocks.reduce((s, a) => s + a.kurs   * a.stueck, 0);
    const totalEur     = totalWert - totalInvest;
    const totalPct     = totalInvest ? (totalWert - totalInvest) / totalInvest * 100 : 0;

    // Normalisierung für Balken
    const maxAbs = stocks.length
      ? Math.max(...stocks.map(s =>
          this._sortBy === "eur" ? Math.abs(s.gewinn_eur) : Math.abs(s.gewinn_pct)
        ))
      : 1;

    const btnClass = (f) => `sort-btn${this._sortBy === f ? " active" : ""}`;

    const renderRow = (s, idx) => {
      const val    = this._sortBy === "eur" ? s.gewinn_eur : s.gewinn_pct;
      const barW   = maxAbs > 0 ? (Math.abs(val) / maxAbs) * 88 : 0;
      const isPos  = s.gewinn_pct >= 0;
      // Kaufdatum formatieren
      const datum  = s.kaufdatum
        ? new Date(s.kaufdatum).toLocaleDateString("de-DE", { day:"2-digit", month:"2-digit", year:"2-digit" })
        : "";

      return `
        <div class="row" style="animation-delay:${idx * 0.035}s">
          <div class="rank">${idx + 1}</div>
          <div class="info">
            <div class="name-row">
              <span class="name">${s.bezeichnung}</span>
              <span class="ticker">${s.kuerzel}</span>
            </div>
            <div class="sub-row">
              <span class="kaufpreis">Kauf ${fmt(s.preis, 3)} €${datum ? " · " + datum : ""}</span>
              <span class="kurs-aktuell">${fmt(s.kurs, 3)} €</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="
                width:${barW}%;
                background:${color(s.gewinn_pct)};
                ${!isPos ? "margin-left:auto;" : ""}
              "></div>
            </div>
          </div>
          <div class="values">
            <span class="pct" style="color:${color(s.gewinn_pct)}">
              ${sign(s.gewinn_pct)}${fmt(s.gewinn_pct)}%
            </span>
            <span class="eur" style="color:${color(s.gewinn_eur)}">
              ${sign(s.gewinn_eur)}${fmt(s.gewinn_eur, 2)} €
            </span>
          </div>
        </div>`;
    };

    const addDivider = (s, i) => {
      if (this._sortBy === "alpha" || this._order === "asc") return false;
      const next = stocks[i + 1];
      const val  = this._sortBy === "eur" ? s.gewinn_eur : s.gewinn_pct;
      const nval = next ? (this._sortBy === "eur" ? next.gewinn_eur : next.gewinn_pct) : null;
      return nval !== null && val >= 0 && nval < 0;
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
        /* ── Header ── */
        .header {
          padding: 1.4rem 1.6rem 0;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
        }
        .header-left {}
        .header-title {
          font-size: 1.05rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
        }
        .header-summary {
          display: flex;
          gap: 1.2rem;
          margin-top: 0.5rem;
        }
        .summary-item {}
        .summary-label {
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--secondary-text-color);
          font-weight: 600;
        }
        .summary-value {
          font-family: 'DM Mono', monospace;
          font-size: 1.0rem;
          font-weight: 500;
          margin-top: 0.1rem;
        }
        .header-pct {
          font-family: 'DM Mono', monospace;
          font-size: 2rem;
          font-weight: 700;
          color: ${color(totalPct)};
          line-height: 1;
          padding-top: 0.2rem;
          flex-shrink: 0;
        }
        /* ── Toolbar ── */
        .toolbar {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.7rem 1.6rem 0.5rem;
        }
        .toolbar-label {
          font-size: 0.72rem;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
          margin-right: 0.2rem;
          flex-shrink: 0;
        }
        .sort-btn {
          font-size: 0.72rem;
          font-family: 'DM Mono', monospace;
          padding: 0.2rem 0.55rem;
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          color: var(--secondary-text-color);
          cursor: pointer;
          transition: all 0.15s;
          user-select: none;
          white-space: nowrap;
        }
        .sort-btn:hover {
          background: rgba(255,255,255,0.1);
          color: var(--primary-text-color);
        }
        .sort-btn.active {
          background: rgba(59,130,246,0.2);
          border-color: #3b82f6;
          color: #93c5fd;
          font-weight: 700;
        }
        .order-btn {
          font-size: 0.9rem;
          padding: 0.15rem 0.45rem;
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          color: var(--secondary-text-color);
          cursor: pointer;
          transition: all 0.15s;
          margin-left: auto;
          user-select: none;
        }
        .order-btn:hover {
          background: rgba(255,255,255,0.1);
          color: var(--primary-text-color);
        }
        /* ── Rows ── */
        .rows { padding: 0 0 0.4rem; }
        .row {
          display: flex;
          align-items: center;
          gap: 0.8rem;
          padding: 0.6rem 1.6rem;
          transition: background 0.15s;
          animation: fadeIn 0.3s ease both;
        }
        .row:hover { background: rgba(255,255,255,0.04); }
        @keyframes fadeIn {
          from { opacity:0; transform:translateX(-5px); }
          to   { opacity:1; transform:translateX(0); }
        }
        .rank {
          font-family: 'DM Mono', monospace;
          font-size: 0.85rem;
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
        .ticker {
          font-size: 0.72rem;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
          flex-shrink: 0;
        }
        .sub-row {
          display: flex;
          justify-content: space-between;
          margin-top: 0.1rem;
        }
        .kaufpreis {
          font-size: 0.72rem;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
        }
        .kurs-aktuell {
          font-size: 0.72rem;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
        }
        .bar-track {
          margin-top: 0.3rem;
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
        .eur {
          display: block;
          font-family: 'DM Mono', monospace;
          font-size: 0.85rem;
          margin-top: 0.05rem;
        }
        .divider {
          height: 1px;
          margin: 0.2rem 1.6rem;
          background: rgba(255,255,255,0.07);
        }
        .footer {
          padding: 0.3rem 1.6rem 0.9rem;
          font-size: 0.78rem;
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
          <div class="header-left">
            <div class="header-title">${title}</div>
            <div class="header-summary">
              <div class="summary-item">
                <div class="summary-label">Invest</div>
                <div class="summary-value">${fmt(totalInvest, 2)} €</div>
              </div>
              <div class="summary-item">
                <div class="summary-label">Aktuell</div>
                <div class="summary-value">${fmt(totalWert, 2)} €</div>
              </div>
              <div class="summary-item">
                <div class="summary-label">Gewinn</div>
                <div class="summary-value" style="color:${color(totalEur)}">
                  ${sign(totalEur)}${fmt(totalEur, 2)} €
                </div>
              </div>
            </div>
          </div>
          <div class="header-pct">
            ${sign(totalPct)}${fmt(totalPct)}%
          </div>
        </div>

        <div class="toolbar">
          <span class="toolbar-label">Sort:</span>
          <button class="${btnClass("pct")}"
            onclick="this.getRootNode().host._toggleSort('pct')">% Gesamt</button>
          <button class="${btnClass("eur")}"
            onclick="this.getRootNode().host._toggleSort('eur')">€ Gesamt</button>
          <button class="${btnClass("alpha")}"
            onclick="this.getRootNode().host._toggleSort('alpha')">A–Z</button>
          <button class="order-btn"
            onclick="this.getRootNode().host._toggleSort('${this._sortBy}')">
            ${arrow()}
          </button>
        </div>

        ${stocks.length === 0
          ? `<div class="empty">Keine Aktien-Sensoren gefunden.</div>`
          : `<div class="rows">
               ${stocks.map((s, i) => {
                 const row = renderRow(s, i);
                 const div = addDivider(s, i) ? '<div class="divider"></div>' : "";
                 return row + div;
               }).join("")}
             </div>
             <div class="footer">Performance seit Kauf · ${stocks.length} Aktien</div>
          `}
      </ha-card>`;
  }

  getCardSize() { return Math.max(5, Math.ceil((this._getStocks()?.length || 0) * 0.8) + 4); }
  static getStubConfig() { return { title: "Gesamtperformance", sort: "pct", order: "desc" }; }
}

// Hilfs-Rundung
function round2(v) { return Math.round(v * 100) / 100; }

customElements.define("my-portfoliox-total-performance-card", MyPortfolioTotalPerformanceCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "my-portfoliox-total-performance-card",
  name: "Portfolio Gesamtperformance",
  description: "Alle Aktien nach Gesamtperformance seit Kauf – sortierbar.",
});
