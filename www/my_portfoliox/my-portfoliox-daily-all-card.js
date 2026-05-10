/**
 * my-portfoliox-daily-all-card  v0.1.0
 * Alle Aktien sortiert nach heutiger Tagesperformance.
 *
 * YAML:
 *   type: custom:my-portfoliox-daily-all-card
 *   title: Tagesperformance
 *   sort: pct       # pct | eur | alpha
 *   order: desc     # desc | asc
 */

// Zustandsspeicher außerhalb der Klasse (identisches Muster wie total-performance-card)
const _dailyAllCardState = new Map();
let   _dailyAllCardUid   = 0;

class MyPortfolioDailyAllCard extends HTMLElement {

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._uid = ++_dailyAllCardUid;
  }

  setConfig(config) {
    this._config = config;
    if (!_dailyAllCardState.has(this._uid)) {
      _dailyAllCardState.set(this._uid, {
        sortBy: config.sort  || "pct",
        order:  config.order || "desc",
      });
    }
  }

  get _sortBy()  { return (_dailyAllCardState.get(this._uid) || {}).sortBy || "pct"; }
  get _order()   { return (_dailyAllCardState.get(this._uid) || {}).order  || "desc"; }
  set _sortBy(v) { const s = _dailyAllCardState.get(this._uid) || {}; s.sortBy = v; _dailyAllCardState.set(this._uid, s); }
  set _order(v)  { const s = _dailyAllCardState.get(this._uid) || {}; s.order  = v; _dailyAllCardState.set(this._uid, s); }

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
      const pct = parseFloat(attr.tages_aenderung_pct);
      if (isNaN(pct)) continue;
      const stueckzahl  = parseFloat(attr.stueckzahl) || 0;
      const absRaw      = parseFloat(attr.tages_aenderung_abs);
      const tages_abs   = isNaN(absRaw) ? null : absRaw;
      stocks.push({
        bezeichnung: (attr.bezeichnung || attr.kuerzel || "").trim(),
        kuerzel:     attr.kuerzel || "?",
        portfolio:   attr.portfolio_name || "",
        kurs:        parseFloat(state.state) || null,
        tages_pct:   pct,
        tages_abs,
        tages_wert:  tages_abs !== null ? tages_abs * stueckzahl : null,
        stueckzahl,
      });
    }
    return stocks;
  }

  _sort(stocks) {
    const asc = this._order === "asc";
    return [...stocks].sort((a, b) => {
      let diff;
      if      (this._sortBy === "alpha") diff = a.bezeichnung.localeCompare(b.bezeichnung, "de");
      else if (this._sortBy === "eur")   diff = (a.tages_wert ?? -Infinity) - (b.tages_wert ?? -Infinity);
      else                               diff = a.tages_pct - b.tages_pct;
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
    if (!this._hass || !_dailyAllCardState.has(this._uid)) return;

    const title  = (this._config || {}).title || "Tagesperformance";
    const stocks = this._sort(this._getStocks());

    const fmt = (v, dec = 2) =>
      v !== null && !isNaN(v)
        ? v.toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec })
        : "–";
    const sign  = v => (v !== null && !isNaN(v) && v >= 0) ? "+" : "";
    const color = v => v >= 0 ? "#22c55e" : "#ef4444";
    const arrow = () => this._order === "desc" ? "↓" : "↑";
    const btn   = (f) => `sort-btn${this._sortBy === f ? " active" : ""}`;

    const maxAbs    = stocks.length ? Math.max(...stocks.map(s => Math.abs(s.tages_pct))) : 1;
    const totalWert = stocks.reduce((s, a) => a.tages_wert !== null ? s + a.tages_wert : s, 0);

    const renderRow = (s, i) => {
      const barW = maxAbs > 0 ? (Math.abs(s.tages_pct) / maxAbs) * 88 : 0;
      return `
        <div class="row" style="animation-delay:${i * 0.035}s">
          <div class="rank">${i + 1}</div>
          <div class="info">
            <div class="name-row">
              <span class="name">${s.bezeichnung}</span>
              <span class="ticker">${s.kuerzel}</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width:${barW}%;background:${color(s.tages_pct)};${s.tages_pct < 0 ? "margin-left:auto;" : ""}"></div>
            </div>
          </div>
          <div class="values">
            <span class="v-pct" style="color:${color(s.tages_pct)}">${sign(s.tages_pct)}${fmt(s.tages_pct)}%</span>
            <span class="v-eur" style="color:${color(s.tages_pct)}">${sign(s.tages_abs)}${fmt(s.tages_abs, 3)} €</span>
            ${s.tages_wert !== null
              ? `<span class="v-pos" style="color:${color(s.tages_wert)}">${sign(s.tages_wert)}${fmt(s.tages_wert, 2)} €</span>`
              : ""}
          </div>
        </div>`;
    };

    const needsDivider = (s, i) => {
      if (this._sortBy === "alpha" || this._order === "asc") return false;
      const next = stocks[i + 1];
      return next && s.tages_pct >= 0 && next.tages_pct < 0;
    };

    this.shadowRoot.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Outfit:wght@400;600;700&display=swap');
        :host{display:block}
        ha-card{background:var(--ha-card-background,var(--card-background-color,#1c1c27));border-radius:16px;overflow:hidden;font-family:'Outfit',sans-serif}
        .header{padding:1.4rem 1.6rem .3rem;display:flex;align-items:baseline;justify-content:space-between}
        .hdr-title{font-size:1.05rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--secondary-text-color)}
        .hdr-total{font-family:'DM Mono',monospace;font-size:1.1rem;font-weight:500;color:${color(totalWert)}}
        .toolbar{display:flex;align-items:center;gap:.4rem;padding:.3rem 1.6rem .6rem}
        .tb-label{font-size:.72rem;color:var(--secondary-text-color);font-family:'DM Mono',monospace;margin-right:.2rem;flex-shrink:0}
        .sort-btn{font-size:.72rem;font-family:'DM Mono',monospace;padding:.2rem .55rem;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:var(--secondary-text-color);cursor:pointer;transition:all .15s;user-select:none;white-space:nowrap}
        .sort-btn:hover{background:rgba(255,255,255,.1);color:var(--primary-text-color)}
        .sort-btn.active{background:rgba(59,130,246,.2);border-color:#3b82f6;color:#93c5fd;font-weight:700}
        .order-btn{font-size:.9rem;padding:.15rem .45rem;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:var(--secondary-text-color);cursor:pointer;transition:all .15s;margin-left:auto;user-select:none}
        .order-btn:hover{background:rgba(255,255,255,.1);color:var(--primary-text-color)}
        .rows{padding:0 0 .5rem}
        .row{display:flex;align-items:center;gap:.8rem;padding:.55rem 1.6rem;transition:background .15s;animation:fadeIn .3s ease both}
        .row:hover{background:rgba(255,255,255,.04)}
        @keyframes fadeIn{from{opacity:0;transform:translateX(-5px)}to{opacity:1;transform:translateX(0)}}
        .rank{font-family:'DM Mono',monospace;font-size:.85rem;color:var(--secondary-text-color);width:1.5rem;text-align:right;flex-shrink:0}
        .info{flex:1;min-width:0}
        .name-row{display:flex;align-items:baseline;gap:.5rem}
        .name{font-size:1.05rem;font-weight:600;color:var(--primary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .ticker{font-size:.72rem;color:var(--secondary-text-color);font-family:'DM Mono',monospace;flex-shrink:0}
        .bar-track{margin-top:.35rem;height:3px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden;display:flex}
        .bar-fill{height:3px;border-radius:2px;transition:width .6s cubic-bezier(.4,0,.2,1);min-width:1px}
        .values{text-align:right;flex-shrink:0}
        .v-pct{display:block;font-family:'DM Mono',monospace;font-size:1.1rem;font-weight:500}
        .v-eur{display:block;font-family:'DM Mono',monospace;font-size:.82rem}
        .v-pos{display:block;font-family:'DM Mono',monospace;font-size:.75rem;opacity:.7}
        .divider{height:1px;margin:.2rem 1.6rem;background:rgba(255,255,255,.07)}
        .footer{padding:.3rem 1.6rem .9rem;font-size:.78rem;color:var(--secondary-text-color);font-family:'DM Mono',monospace;text-align:right}
        .empty{padding:2.5rem;text-align:center;font-size:1.05rem;color:var(--secondary-text-color)}
      </style>
      <ha-card>
        <div class="header">
          <div class="hdr-title">${title}</div>
          <div class="hdr-total">${sign(totalWert)}${fmt(totalWert, 2)} € heute</div>
        </div>
        <div class="toolbar">
          <span class="tb-label">Sort:</span>
          <button class="${btn("pct")}"   onclick="this.getRootNode().host._toggleSort('pct')"  >% Tages</button>
          <button class="${btn("eur")}"   onclick="this.getRootNode().host._toggleSort('eur')"  >€ Tages</button>
          <button class="${btn("alpha")}" onclick="this.getRootNode().host._toggleSort('alpha')">A–Z</button>
          <button class="order-btn"      onclick="this.getRootNode().host._toggleSort('${this._sortBy}')">${arrow()}</button>
        </div>
        ${stocks.length === 0
          ? `<div class="empty">Keine Tagesdaten verfügbar.</div>`
          : `<div class="rows">
               ${stocks.map((s, i) => renderRow(s, i) + (needsDivider(s, i) ? '<div class="divider"></div>' : "")).join("")}
             </div>
             <div class="footer">Tagesperformance · ${stocks.length} Aktien</div>`}
      </ha-card>`;
  }

  getCardSize() { return Math.max(4, Math.ceil((this._getStocks()?.length || 0) * 0.65) + 3); }
  static getStubConfig() { return { title: "Tagesperformance", sort: "pct", order: "desc" }; }
}

customElements.define("my-portfoliox-daily-all-card", MyPortfolioDailyAllCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type:        "my-portfoliox-daily-all-card",
  name:        "Portfolio Tagesperformance (alle)",
  description: "Alle Aktien nach Tagesperformance – mit Sortier-Optionen.",
});
