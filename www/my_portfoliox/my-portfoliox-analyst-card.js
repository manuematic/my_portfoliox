/**
 * my-portfoliox-analyst-card  v0.1.0
 * Analysten-Kursziele aller Aktien – via FMP API.
 *
 * YAML:
 *   type: custom:my-portfoliox-analyst-card
 *   title: Analysten-Kursziele   # optional
 *   sort: upside                 # upside | alpha | pct  (Standard: upside)
 *   order: desc                  # desc | asc
 */

const _analystState = new Map();
let   _analystUid   = 0;

class MyPortfolioAnalystCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._uid = ++_analystUid;
  }

  setConfig(config) {
    this._config = config;
    if (!_analystState.has(this._uid)) {
      _analystState.set(this._uid, {
        sortBy: config.sort  || "upside",
        order:  config.order || "desc",
      });
    }
  }

  get _sortBy()  { return (_analystState.get(this._uid) || {}).sortBy || "upside"; }
  get _order()   { return (_analystState.get(this._uid) || {}).order  || "desc"; }
  set _sortBy(v) { const s = _analystState.get(this._uid) || {}; s.sortBy = v; _analystState.set(this._uid, s); }
  set _order(v)  { const s = _analystState.get(this._uid) || {}; s.order  = v; _analystState.set(this._uid, s); }

  set hass(hass) { this._hass = hass; this._render(); }

  _getStocks() {
    const stocks = [];
    for (const [, state] of Object.entries(this._hass.states)) {
      const attr = state.attributes || {};
      if (attr.kuerzel === undefined || attr.summary_key !== undefined) continue;
      const kurs   = parseFloat(state.state);
      const kzm    = parseFloat(attr.kursziel_mittel);
      const kzh    = parseFloat(attr.kursziel_hoch);
      const kzt    = parseFloat(attr.kursziel_tief);
      const gewinn = parseFloat(attr.gewinn);
      const upside = (!isNaN(kurs) && !isNaN(kzm) && kurs > 0)
        ? ((kzm - kurs) / kurs) * 100 : null;
      stocks.push({
        bezeichnung: (attr.bezeichnung || attr.kuerzel || "").trim(),
        kuerzel:     attr.kuerzel,
        portfolio:   attr.portfolio_name || "",
        kurs:        isNaN(kurs)   ? null : kurs,
        kzm:         isNaN(kzm)    ? null : kzm,
        kzh:         isNaN(kzh)    ? null : kzh,
        kzt:         isNaN(kzt)    ? null : kzt,
        konsens:     attr.analysten_konsens || null,
        anzahl:      parseInt(attr.analysten_anzahl) || null,
        datum:       attr.kursziel_datum || null,
        gewinn:      isNaN(gewinn) ? null : gewinn,
        upside,
      });
    }
    return this._sort(stocks);
  }

  _sort(stocks) {
    const asc = this._order === "asc";
    return [...stocks].sort((a, b) => {
      let diff;
      if      (this._sortBy === "alpha")  diff = a.bezeichnung.localeCompare(b.bezeichnung, "de");
      else if (this._sortBy === "pct")    diff = (a.gewinn  ?? -Infinity) - (b.gewinn  ?? -Infinity);
      else                                diff = (a.upside  ?? -Infinity) - (b.upside  ?? -Infinity);
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
    if (!this._hass || !_analystState.has(this._uid)) return;

    const title  = (this._config || {}).title || "Analysten-Kursziele";
    const stocks = this._getStocks();
    const hasAny = stocks.some(s => s.kzm !== null);

    const fmt = (v, dec = 2) =>
      v !== null && !isNaN(v)
        ? v.toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec })
        : "–";
    const sign  = v => (v !== null && !isNaN(v) && v >= 0) ? "+" : "";
    const arrow = () => this._order === "desc" ? "↓" : "↑";
    const btn   = (f) => `sort-btn${this._sortBy === f ? " active" : ""}`;

    const konsensColor = (k) => {
      if (!k) return "var(--secondary-text-color)";
      const kl = k.toLowerCase();
      if (kl.includes("buy"))  return "#22c55e";
      if (kl.includes("sell")) return "#ef4444";
      return "#f59e0b";
    };
    const konsensLabel = (k) => {
      if (!k) return "–";
      const kl = k.toLowerCase();
      if (kl.includes("strong buy"))  return "Strong Buy ★";
      if (kl.includes("buy"))         return "Buy ▲";
      if (kl.includes("strong sell")) return "Strong Sell ★";
      if (kl.includes("sell"))        return "Sell ▼";
      return "Hold ◆";
    };

    const renderRow = (s, i) => {
      if (s.kzm === null) {
        // Kein Kursziel – kompakte graue Zeile
        return `
          <div class="row row-empty" style="animation-delay:${i * 0.03}s">
            <div class="no-data-dot"></div>
            <div class="info">
              <span class="name">${s.bezeichnung}</span>
              <span class="ticker">${s.kuerzel}</span>
            </div>
            <div class="values">
              <span class="no-kz">Kein Kursziel</span>
            </div>
          </div>`;
      }

      const upsideClr = s.upside !== null
        ? (s.upside >= 0 ? "#22c55e" : "#ef4444") : "var(--secondary-text-color)";

      // Balken: zeigt Kurs relativ zu Tief–Hoch
      let barKurs = 50, barMid = 50;
      if (s.kzt !== null && s.kzh !== null && s.kzh > s.kzt) {
        const rng = s.kzh - s.kzt;
        barKurs = Math.max(0, Math.min(100, ((s.kurs - s.kzt) / rng) * 100));
        barMid  = Math.max(0, Math.min(100, ((s.kzm - s.kzt) / rng) * 100));
      }

      return `
        <div class="row" style="animation-delay:${i * 0.03}s">
          <div class="konsens-badge" style="color:${konsensColor(s.konsens)};border-color:${konsensColor(s.konsens)}30">
            ${konsensLabel(s.konsens)}
          </div>
          <div class="info">
            <div class="name-row">
              <span class="name">${s.bezeichnung}</span>
              <span class="ticker">${s.kuerzel}</span>
              ${s.anzahl ? `<span class="analysts">${s.anzahl} Analysten</span>` : ""}
            </div>
            <!-- Kursziel-Balken: Tief ── ●Kurs ── ◆Mittel ── Hoch -->
            <div class="kz-bar-wrap">
              <span class="kz-label-l" title="Kursziel Tief">${fmt(s.kzt, 2)}</span>
              <div class="kz-bar">
                <!-- Zielband -->
                <div class="kz-band"></div>
                <!-- Mittelziel-Marker -->
                <div class="kz-mid" style="left:${barMid}%" title="Ø ${fmt(s.kzm,2)} €"></div>
                <!-- Aktueller Kurs -->
                <div class="kz-kurs" style="left:${barKurs}%" title="Kurs ${fmt(s.kurs,3)} €"></div>
              </div>
              <span class="kz-label-r" title="Kursziel Hoch">${fmt(s.kzh, 2)}</span>
            </div>
          </div>
          <div class="values">
            <div class="upside" style="color:${upsideClr}">
              ${sign(s.upside)}${fmt(s.upside)}%
            </div>
            <div class="kzm">${fmt(s.kzm, 2)} €</div>
            ${s.datum ? `<div class="datum">${s.datum}</div>` : ""}
          </div>
        </div>`;
    };

    this.shadowRoot.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Outfit:wght@400;600;700&display=swap');
        :host{display:block}
        ha-card{background:var(--ha-card-background,var(--card-background-color,#1c1c27));border-radius:16px;overflow:hidden;font-family:'Outfit',sans-serif}
        .header{padding:1.4rem 1.6rem .3rem;display:flex;align-items:center;justify-content:space-between;gap:.8rem}
        .hdr-title{font-size:1.05rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--secondary-text-color)}
        .hdr-info{font-family:'DM Mono',monospace;font-size:.75rem;color:var(--secondary-text-color);flex-shrink:0}
        .toolbar{display:flex;align-items:center;gap:.4rem;padding:.2rem 1.6rem .5rem}
        .tb-label{font-size:.72rem;color:var(--secondary-text-color);font-family:'DM Mono',monospace;margin-right:.2rem;flex-shrink:0}
        .sort-btn{font-size:.72rem;font-family:'DM Mono',monospace;padding:.2rem .55rem;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:var(--secondary-text-color);cursor:pointer;transition:all .15s;user-select:none;white-space:nowrap}
        .sort-btn:hover{background:rgba(255,255,255,.1);color:var(--primary-text-color)}
        .sort-btn.active{background:rgba(59,130,246,.2);border-color:#3b82f6;color:#93c5fd;font-weight:700}
        .order-btn{font-size:.9rem;padding:.15rem .45rem;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:var(--secondary-text-color);cursor:pointer;transition:all .15s;margin-left:auto;user-select:none}
        .order-btn:hover{background:rgba(255,255,255,.1);color:var(--primary-text-color)}
        .rows{padding:0 0 .6rem}
        .row{display:flex;align-items:center;gap:.8rem;padding:.65rem 1.6rem;transition:background .15s;animation:fadeIn .3s ease both}
        .row:hover{background:rgba(255,255,255,.03)}
        .row-empty{opacity:.45}
        @keyframes fadeIn{from{opacity:0;transform:translateX(-4px)}to{opacity:1;transform:translateX(0)}}
        /* Konsens Badge */
        .konsens-badge{font-size:.68rem;font-family:'DM Mono',monospace;font-weight:700;padding:.2rem .45rem;border-radius:6px;border:1px solid;white-space:nowrap;flex-shrink:0;min-width:6.5rem;text-align:center}
        .no-data-dot{width:.6rem;height:.6rem;border-radius:50%;background:rgba(255,255,255,.15);flex-shrink:0;margin:0 .2rem}
        /* Info */
        .info{flex:1;min-width:0}
        .name-row{display:flex;align-items:baseline;gap:.5rem;flex-wrap:wrap}
        .name{font-size:1.0rem;font-weight:600;color:var(--primary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .ticker{font-size:.7rem;color:var(--secondary-text-color);font-family:'DM Mono',monospace;flex-shrink:0}
        .analysts{font-size:.65rem;color:var(--secondary-text-color);font-family:'DM Mono',monospace;flex-shrink:0;opacity:.7}
        /* Kursziel-Balken */
        .kz-bar-wrap{display:flex;align-items:center;gap:.4rem;margin-top:.4rem}
        .kz-label-l,.kz-label-r{font-family:'DM Mono',monospace;font-size:.65rem;color:var(--secondary-text-color);flex-shrink:0;white-space:nowrap}
        .kz-bar{flex:1;height:6px;background:rgba(255,255,255,.07);border-radius:3px;position:relative;overflow:visible}
        .kz-band{position:absolute;inset:0;border-radius:3px;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.2)}
        .kz-mid{position:absolute;top:50%;transform:translate(-50%,-50%);width:10px;height:10px;border-radius:2px;background:#3b82f6;border:2px solid #1c1c27;rotate:45deg;z-index:2}
        .kz-kurs{position:absolute;top:50%;transform:translate(-50%,-50%);width:8px;height:8px;border-radius:50%;background:var(--primary-text-color);border:2px solid #1c1c27;z-index:3}
        /* Values */
        .values{text-align:right;flex-shrink:0;min-width:4.5rem}
        .upside{font-family:'DM Mono',monospace;font-size:1.05rem;font-weight:600}
        .kzm{font-family:'DM Mono',monospace;font-size:.82rem;color:var(--secondary-text-color);margin-top:.05rem}
        .datum{font-family:'DM Mono',monospace;font-size:.65rem;color:var(--secondary-text-color);opacity:.6;margin-top:.05rem}
        .no-kz{font-family:'DM Mono',monospace;font-size:.75rem;color:var(--secondary-text-color);opacity:.5}
        .no-data-msg{padding:2rem 1.6rem;text-align:center;color:var(--secondary-text-color);font-family:'DM Mono',monospace}
        .no-data-msg a{color:#3b82f6}
        .footer{padding:.2rem 1.6rem .9rem;font-size:.75rem;color:var(--secondary-text-color);font-family:'DM Mono',monospace;text-align:right}
      </style>
      <ha-card>
        <div class="header">
          <div class="hdr-title">${title}</div>
          <div class="hdr-info">${stocks.filter(s=>s.kzm!==null).length} / ${stocks.length} mit Daten</div>
        </div>
        <div class="toolbar">
          <span class="tb-label">Sort:</span>
          <button class="${btn("upside")}" onclick="this.getRootNode().host._toggleSort('upside')">Upside</button>
          <button class="${btn("pct")}"    onclick="this.getRootNode().host._toggleSort('pct')"   >% Ges.</button>
          <button class="${btn("alpha")}"  onclick="this.getRootNode().host._toggleSort('alpha')" >A–Z</button>
          <button class="order-btn"        onclick="this.getRootNode().host._toggleSort('${this._sortBy}')">${arrow()}</button>
        </div>

        ${!hasAny
          ? `<div class="no-data-msg">
               Noch keine Analysten-Daten.<br>
               FMP API-Key in den <b>Einstellungen</b> der Integration hinterlegen.
             </div>`
          : `<div class="rows">
               ${stocks.map((s, i) => renderRow(s, i)).join("")}
             </div>
             <div class="footer">Daten: Financial Modeling Prep · letzte 12 Monate</div>`}
      </ha-card>`;
  }

  getCardSize() { return Math.max(4, Math.ceil((this._getStocks()?.length || 0) * 0.75) + 3); }
  static getStubConfig() { return { title: "Analysten-Kursziele", sort: "upside", order: "desc" }; }
}

customElements.define("my-portfoliox-analyst-card", MyPortfolioAnalystCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type:        "my-portfoliox-analyst-card",
  name:        "Portfolio Analysten-Kursziele",
  description: "Analysten-Kursziele und Konsens via FMP API.",
});
