/**
 * my-portfolio-watchlist-card  v0.9.0
 * Gesamtübersicht aller Aktien mit kreisrundem Limit-Status-Indikator.
 *
 * YAML:
 *   type: custom:my-portfolio-watchlist-card
 *   title: Watchlist         # optional
 *   sort: alpha              # alpha | pct | kurs  (Standard: alpha)
 *   order: asc               # asc | desc          (Standard: asc)
 */

const _watchlistState = new Map();
let   _watchlistUid   = 0;

class MyPortfolioWatchlistCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._uid = ++_watchlistUid;
  }

  setConfig(config) {
    this._config = config;
    if (!_watchlistState.has(this._uid)) {
      _watchlistState.set(this._uid, {
        sortBy: config.sort  || "alpha",
        order:  config.order || "asc",
      });
    }
  }

  get _sortBy()  { return (_watchlistState.get(this._uid) || {}).sortBy || "alpha"; }
  get _order()   { return (_watchlistState.get(this._uid) || {}).order  || "asc"; }
  set _sortBy(v) { const s = _watchlistState.get(this._uid) || {}; s.sortBy = v; _watchlistState.set(this._uid, s); }
  set _order(v)  { const s = _watchlistState.get(this._uid) || {}; s.order  = v; _watchlistState.set(this._uid, s); }

  set hass(hass) { this._hass = hass; this._render(); }

  _getStocks() {
    const stocks = [];
    for (const [entityId, state] of Object.entries(this._hass.states)) {
      if (!entityId.startsWith("sensor.")) continue;
      const attr = state.attributes || {};
      if (attr.kuerzel === undefined || attr.summary_key !== undefined) continue;
      const kurs   = parseFloat(state.state);
      const preis  = parseFloat(attr.preis);
      const gewinn = parseFloat(attr.gewinn);
      stocks.push({
        bezeichnung: (attr.bezeichnung || attr.kuerzel || "").trim(),
        kuerzel:     attr.kuerzel || "?",
        portfolio:   attr.portfolio_name || "",
        kurs:        isNaN(kurs)   ? null : kurs,
        preis:       isNaN(preis)  ? null : preis,
        gewinn:      isNaN(gewinn) ? null : gewinn,
        limit_oben:  parseFloat(attr.limit_oben)  || 0,
        limit_unten: parseFloat(attr.limit_unten) || 0,
        alarm_oben:  attr.alarm_oben  === true,
        alarm_unten: attr.alarm_unten === true,
        stueckzahl:  parseFloat(attr.stueckzahl) || 0,
      });
    }
    return this._sort(stocks);
  }

  _sort(stocks) {
    const asc = this._order === "asc";
    return [...stocks].sort((a, b) => {
      let diff;
      if      (this._sortBy === "pct")  diff = (a.gewinn  ?? -Infinity) - (b.gewinn  ?? -Infinity);
      else if (this._sortBy === "kurs") diff = (a.kurs    ?? -Infinity) - (b.kurs    ?? -Infinity);
      else                              diff = a.bezeichnung.localeCompare(b.bezeichnung, "de");
      return asc ? diff : -diff;
    });
  }

  _toggleSort(field) {
    if (this._sortBy === field) {
      this._order = this._order === "asc" ? "desc" : "asc";
    } else {
      this._sortBy = field;
      this._order  = field === "alpha" ? "asc" : "desc";
    }
    this._render();
  }

  _render() {
    if (!this._hass || !_watchlistState.has(this._uid)) return;
    const title  = (this._config || {}).title || "Watchlist";
    const stocks = this._getStocks();

    const fmt = (v, dec = 2) =>
      v !== null && !isNaN(v)
        ? v.toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec })
        : "–";
    const sign  = v => (v !== null && !isNaN(v) && v >= 0) ? "+" : "";
    const arrow = () => this._order === "asc" ? "↑" : "↓";
    const btn   = (f) => `sort-btn${this._sortBy === f ? " active" : ""}`;

    // Statuszähler für Header-Badge
    const nOben  = stocks.filter(s => s.alarm_oben).length;
    const nUnten = stocks.filter(s => s.alarm_unten).length;
    const nOk    = stocks.length - nOben - nUnten;

    // SVG-Kreis: leer = grau, grün = oben, rot = unten
    const statusDot = (s) => {
      if (s.alarm_oben)  return `<svg viewBox="0 0 20 20" class="dot-svg">
        <circle cx="10" cy="10" r="8" fill="none" stroke="#22c55e" stroke-width="2.5"/>
        <circle cx="10" cy="10" r="4.5" fill="#22c55e"/>
        <text x="10" y="14" text-anchor="middle" font-size="8" fill="#fff" font-weight="700">▲</text>
      </svg>`;
      if (s.alarm_unten) return `<svg viewBox="0 0 20 20" class="dot-svg">
        <circle cx="10" cy="10" r="8" fill="none" stroke="#ef4444" stroke-width="2.5"/>
        <circle cx="10" cy="10" r="4.5" fill="#ef4444"/>
        <text x="10" y="14" text-anchor="middle" font-size="8" fill="#fff" font-weight="700">▼</text>
      </svg>`;
      // Kein Alarm – leerer Ring
      const hasLimit = (s.limit_oben > 0 || s.limit_unten > 0);
      const stroke   = hasLimit ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)";
      return `<svg viewBox="0 0 20 20" class="dot-svg">
        <circle cx="10" cy="10" r="8" fill="none" stroke="${stroke}" stroke-width="2"/>
      </svg>`;
    };

    // Limit-Balken: zeigt wie nah der Kurs am Limit ist (0–100%)
    const limitBar = (s) => {
      if (!s.kurs || (!s.limit_oben && !s.limit_unten)) return "";
      const parts = [];
      if (s.limit_unten > 0) {
        const dist = s.kurs > 0 ? Math.min(((s.kurs - s.limit_unten) / s.kurs) * 100, 100) : 0;
        const clr  = s.alarm_unten ? "#ef4444" : dist < 5 ? "#f97316" : "rgba(239,68,68,.3)";
        parts.push(`<div class="limit-seg" title="Limit ↓ ${fmt(s.limit_unten,3)} €" style="background:${clr};width:${Math.max(3,dist)}%"></div>`);
      }
      if (s.limit_oben > 0) {
        const dist = s.limit_oben > 0 ? Math.min(((s.limit_oben - s.kurs) / s.limit_oben) * 100, 100) : 0;
        const clr  = s.alarm_oben ? "#22c55e" : dist < 5 ? "#86efac" : "rgba(34,197,94,.3)";
        parts.push(`<div class="limit-seg" title="Limit ↑ ${fmt(s.limit_oben,3)} €" style="background:${clr};width:${Math.max(3,dist)}%"></div>`);
      }
      return `<div class="limit-bar">${parts.join("")}</div>`;
    };

    const renderRow = (s, i) => {
      const gwClr = s.gewinn >= 0 ? "#22c55e" : "#ef4444";
      return `
        <div class="row" style="animation-delay:${i * 0.03}s">
          <div class="dot-wrap ${s.alarm_oben ? "anim-green" : s.alarm_unten ? "anim-red" : ""}">
            ${statusDot(s)}
          </div>
          <div class="info">
            <div class="name-row">
              <span class="name">${s.bezeichnung}</span>
              <span class="ticker">${s.kuerzel}</span>
            </div>
            <div class="limits-row">
              ${s.limit_unten > 0
                ? `<span class="lim lim-down ${s.alarm_unten ? "active" : ""}">↓ ${fmt(s.limit_unten, 3)}</span>`
                : `<span class="lim lim-none">–</span>`}
              ${limitBar(s)}
              ${s.limit_oben > 0
                ? `<span class="lim lim-up ${s.alarm_oben ? "active" : ""}">↑ ${fmt(s.limit_oben, 3)}</span>`
                : `<span class="lim lim-none">–</span>`}
            </div>
          </div>
          <div class="values">
            <div class="kurs">${fmt(s.kurs, 3)} €</div>
            <div class="gewinn" style="color:${gwClr}">${sign(s.gewinn)}${fmt(s.gewinn)}%</div>
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
        /* ── Header ── */
        .header {
          padding: 1.4rem 1.6rem .3rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: .8rem;
        }
        .hdr-title {
          font-size: 1.05rem;
          font-weight: 700;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
          flex: 1;
        }
        .hdr-badges {
          display: flex;
          gap: .35rem;
          flex-shrink: 0;
        }
        .badge {
          font-family: 'DM Mono', monospace;
          font-size: .72rem;
          padding: .15rem .45rem;
          border-radius: 20px;
          font-weight: 600;
        }
        .badge-ok    { background:rgba(255,255,255,.06); color:var(--secondary-text-color); }
        .badge-green { background:rgba(34,197,94,.15); color:#22c55e; border:1px solid rgba(34,197,94,.3); }
        .badge-red   { background:rgba(239,68,68,.15); color:#ef4444; border:1px solid rgba(239,68,68,.3); }
        /* ── Toolbar ── */
        .toolbar {
          display: flex;
          align-items: center;
          gap: .4rem;
          padding: .2rem 1.6rem .5rem;
        }
        .tb-label {
          font-size: .72rem;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
          margin-right: .2rem;
          flex-shrink: 0;
        }
        .sort-btn {
          font-size: .72rem;
          font-family: 'DM Mono', monospace;
          padding: .2rem .55rem;
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,.12);
          background: rgba(255,255,255,.05);
          color: var(--secondary-text-color);
          cursor: pointer;
          transition: all .15s;
          user-select: none;
          white-space: nowrap;
        }
        .sort-btn:hover { background:rgba(255,255,255,.1); color:var(--primary-text-color); }
        .sort-btn.active { background:rgba(59,130,246,.2); border-color:#3b82f6; color:#93c5fd; font-weight:700; }
        .order-btn {
          font-size: .9rem;
          padding: .15rem .45rem;
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,.12);
          background: rgba(255,255,255,.05);
          color: var(--secondary-text-color);
          cursor: pointer;
          transition: all .15s;
          margin-left: auto;
          user-select: none;
        }
        .order-btn:hover { background:rgba(255,255,255,.1); color:var(--primary-text-color); }
        /* ── Rows ── */
        .rows { padding: 0 0 .6rem; }
        .row {
          display: flex;
          align-items: center;
          gap: .9rem;
          padding: .6rem 1.6rem;
          transition: background .15s;
          animation: fadeIn .3s ease both;
        }
        .row:hover { background: rgba(255,255,255,.03); }
        @keyframes fadeIn {
          from { opacity:0; transform:translateX(-4px); }
          to   { opacity:1; transform:translateX(0); }
        }
        /* ── Statuskreis ── */
        .dot-wrap {
          width: 2rem;
          height: 2rem;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .dot-svg { width: 100%; height: 100%; }
        .anim-green circle:last-child { animation: pulse-g 2.5s ease-out infinite; }
        .anim-red   circle:last-child { animation: pulse-r 2.5s ease-out infinite; }
        @keyframes pulse-g {
          0%,100% { r:4.5; opacity:1; }
          50%      { r:6;   opacity:.7; }
        }
        @keyframes pulse-r {
          0%,100% { r:4.5; opacity:1; }
          50%      { r:6;   opacity:.7; }
        }
        /* ── Info ── */
        .info { flex: 1; min-width: 0; }
        .name-row { display:flex; align-items:baseline; gap:.5rem; }
        .name {
          font-size: 1.0rem;
          font-weight: 600;
          color: var(--primary-text-color);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ticker {
          font-size: .7rem;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
          flex-shrink: 0;
        }
        /* ── Limit-Balken ── */
        .limits-row {
          display: flex;
          align-items: center;
          gap: .35rem;
          margin-top: .3rem;
        }
        .lim {
          font-family: 'DM Mono', monospace;
          font-size: .68rem;
          color: var(--secondary-text-color);
          flex-shrink: 0;
          white-space: nowrap;
        }
        .lim-none { opacity: .35; }
        .lim-down.active { color: #ef4444; font-weight: 700; }
        .lim-up.active   { color: #22c55e; font-weight: 700; }
        .limit-bar {
          flex: 1;
          height: 4px;
          background: rgba(255,255,255,.06);
          border-radius: 2px;
          display: flex;
          overflow: hidden;
          gap: 1px;
        }
        .limit-seg {
          height: 4px;
          border-radius: 2px;
          transition: width .6s cubic-bezier(.4,0,.2,1);
          min-width: 3px;
        }
        /* ── Values ── */
        .values { text-align: right; flex-shrink: 0; }
        .kurs {
          font-family: 'DM Mono', monospace;
          font-size: 1.0rem;
          font-weight: 500;
          color: var(--primary-text-color);
        }
        .gewinn {
          font-family: 'DM Mono', monospace;
          font-size: .82rem;
          margin-top: .05rem;
        }
        .footer {
          padding: .2rem 1.6rem .9rem;
          font-size: .75rem;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
          text-align: right;
        }
        .empty {
          padding: 2rem;
          text-align: center;
          font-size: 1rem;
          color: var(--secondary-text-color);
        }
      </style>
      <ha-card>
        <div class="header">
          <div class="hdr-title">${title}</div>
          <div class="hdr-badges">
            ${nOk    > 0 ? `<span class="badge badge-ok">✓ ${nOk}</span>` : ""}
            ${nOben  > 0 ? `<span class="badge badge-green">▲ ${nOben}</span>` : ""}
            ${nUnten > 0 ? `<span class="badge badge-red">▼ ${nUnten}</span>` : ""}
          </div>
        </div>

        <div class="toolbar">
          <span class="tb-label">Sort:</span>
          <button class="${btn("alpha")}" onclick="this.getRootNode().host._toggleSort('alpha')">A–Z</button>
          <button class="${btn("pct")}"   onclick="this.getRootNode().host._toggleSort('pct')"  >% Ges.</button>
          <button class="${btn("kurs")}"  onclick="this.getRootNode().host._toggleSort('kurs')" >Kurs</button>
          <button class="order-btn"       onclick="this.getRootNode().host._toggleSort('${this._sortBy}')">${arrow()}</button>
        </div>

        ${stocks.length === 0
          ? `<div class="empty">Keine Aktien-Sensoren gefunden.</div>`
          : `<div class="rows">
               ${stocks.map((s, i) => renderRow(s, i)).join("")}
             </div>
             <div class="footer">${stocks.length} Positionen · ${nOben + nUnten} Alarm${(nOben + nUnten) !== 1 ? "e" : ""}</div>`}
      </ha-card>`;
  }

  getCardSize() { return Math.max(4, Math.ceil((this._getStocks()?.length || 0) * 0.7) + 3); }
  static getStubConfig() { return { title: "Watchlist", sort: "alpha", order: "asc" }; }
}

customElements.define("my-portfolio-watchlist-card", MyPortfolioWatchlistCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type:        "my-portfolio-watchlist-card",
  name:        "Portfolio Watchlist",
  description: "Alle Aktien mit kreisrundem Limit-Status-Indikator.",
});
