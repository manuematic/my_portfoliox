/**
 * my-portfolio-buywatchlist-card  v0.9.8
 * Zeigt Kaufkandidaten – nur solche mit aktivem Kaufsignal (Kurs <= Zielkurs).
 *
 * YAML:
 *   type: custom:my-portfolio-buywatchlist-card
 *   title: Kaufkandidaten
 *   show_all: false   # true = alle Kandidaten, false = nur aktive Signale
 */

class MyPortfolioBuywatchlistCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._showAll = false;
  }

  setConfig(config) {
    this._config   = config;
    this._showAll  = config.show_all === true;
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _getCandidates() {
    const all = [];
    for (const [, state] of Object.entries(this._hass.states)) {
      const attr = state.attributes || {};
      if (attr.kandidat !== true) continue;
      const kurs     = parseFloat(state.state);
      const zielkurs = parseFloat(attr.zielkurs);
      all.push({
        bezeichnung: (attr.bezeichnung || attr.kuerzel || "").trim(),
        kuerzel:     attr.kuerzel  || "",
        isin:        attr.isin     || null,
        wkn:         attr.wkn      || null,
        zielkurs:    isNaN(zielkurs) ? null : zielkurs,
        kurs:        isNaN(kurs)     ? null : kurs,
        kaufsignal:  attr.kaufsignal === true,
        notiz:       attr.notiz      || "",
        datenquelle: attr.datenquelle || "",
      });
    }
    // Sortierung: Kaufsignale zuerst, dann alphabetisch
    return all
      .filter(c => this._showAll || c.kaufsignal)
      .sort((a, b) => {
        if (a.kaufsignal && !b.kaufsignal) return -1;
        if (!a.kaufsignal && b.kaufsignal) return 1;
        return a.bezeichnung.localeCompare(b.bezeichnung, "de");
      });
  }

  _render() {
    if (!this._hass) return;
    const title       = (this._config || {}).title || "Kaufkandidaten";
    const candidates  = this._getCandidates();
    const allCount    = Object.values(this._hass.states)
      .filter(s => s.attributes?.kandidat === true).length;
    const signalCount = Object.values(this._hass.states)
      .filter(s => s.attributes?.kandidat === true && s.attributes?.kaufsignal === true).length;

    const fmt = (v, d = 2) =>
      v !== null && !isNaN(v)
        ? v.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d })
        : "–";

    const renderRow = (c, i) => {
      const diff     = (c.kurs !== null && c.zielkurs !== null) ? c.kurs - c.zielkurs : null;
      const diffPct  = (diff !== null && c.zielkurs > 0) ? (diff / c.zielkurs) * 100 : null;
      const abstand  = diff !== null ? Math.abs(diff) : null;
      const abstandP = diffPct !== null ? Math.abs(diffPct) : null;

      const clr      = c.kaufsignal ? "#22c55e" : "var(--secondary-text-color)";
      const bgClr    = c.kaufsignal ? "rgba(34,197,94,0.06)" : "transparent";

      // Balken: wie nah ist der Kurs am Zielkurs (0–200% des Zielkurses als Skala)
      const barPct = (c.kurs !== null && c.zielkurs !== null && c.zielkurs > 0)
        ? Math.min((c.kurs / (c.zielkurs * 1.5)) * 100, 100) : 0;
      const barClr = c.kaufsignal ? "#22c55e"
        : (diffPct !== null && diffPct < 5) ? "#f59e0b"
        : "rgba(255,255,255,0.15)";

      return `
        <div class="row" style="animation-delay:${i * 0.05}s;background:${bgClr}">
          <!-- Status-Indikator -->
          <div class="status-dot ${c.kaufsignal ? "dot-active" : ""}">
            ${c.kaufsignal
              ? `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="none" stroke="#22c55e" stroke-width="2.5"/>
                 <circle cx="10" cy="10" r="4.5" fill="#22c55e"/></svg>`
              : `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2"/></svg>`}
          </div>

          <!-- Info -->
          <div class="info">
            <div class="name-row">
              <span class="name">${c.isin
                ? `<a href="https://wertpapiere.ing.de/investieren/aktienportrait/${c.isin}" target="_blank" rel="noopener">${c.bezeichnung}</a>`
                : c.bezeichnung}</span>
              ${c.kuerzel ? `<span class="ticker">${c.kuerzel}</span>` : ""}
              ${c.wkn     ? `<span class="wkn">WKN ${c.wkn}</span>` : ""}
            </div>
            <!-- Fortschrittsbalken: Kurs → Zielkurs -->
            <div class="bar-row">
              <span class="bar-lbl">${fmt(c.zielkurs, 3)} €</span>
              <div class="bar-track">
                <div class="bar-fill" style="width:${barPct}%;background:${barClr}"></div>
                <!-- Zielkurs-Marker -->
                <div class="bar-target" style="left:${Math.min((1/1.5)*100,100)}%"></div>
              </div>
              <span class="bar-lbl-r" style="color:${c.kurs !== null ? (c.kaufsignal ? "#22c55e" : "var(--primary-text-color)") : "var(--secondary-text-color)"}">
                ${fmt(c.kurs, 3)} €
              </span>
            </div>
            ${c.notiz ? `<div class="notiz">${c.notiz}</div>` : ""}
          </div>

          <!-- Werte rechts -->
          <div class="values">
            ${c.kaufsignal
              ? `<div class="signal-badge">KAUFEN</div>`
              : `<div class="abstand" style="color:${diffPct !== null && diffPct < 5 ? "#f59e0b" : "var(--secondary-text-color)"}">
                   noch ${abstandP !== null ? fmt(abstandP) + "%" : "–"}
                 </div>`}
            <div class="diff" style="color:${c.kaufsignal ? "#22c55e" : "var(--secondary-text-color)"}">
              ${diff !== null ? (diff >= 0 ? "+" : "") + fmt(diff, 3) + " €" : "–"}
            </div>
          </div>
        </div>`;
    };

    this.shadowRoot.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Outfit:wght@400;600;700&display=swap');
        :host{display:block}
        ha-card{
          background:var(--ha-card-background,var(--card-background-color,#1c1c27));
          border-radius:16px;overflow:hidden;font-family:'Outfit',sans-serif
        }
        /* Header */
        .header{padding:1.4rem 1.6rem .3rem;display:flex;align-items:center;justify-content:space-between;gap:.8rem}
        .hdr-title{font-size:1.05rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--secondary-text-color)}
        .hdr-badges{display:flex;gap:.35rem;flex-shrink:0}
        .badge{font-family:'DM Mono',monospace;font-size:.72rem;padding:.15rem .45rem;border-radius:20px;font-weight:600}
        .badge-total{background:rgba(255,255,255,.06);color:var(--secondary-text-color)}
        .badge-signal{background:rgba(34,197,94,.15);color:#22c55e;border:1px solid rgba(34,197,94,.3)}
        /* Toggle */
        .toggle-row{padding:.1rem 1.6rem .4rem;display:flex;align-items:center;gap:.5rem}
        .toggle-btn{font-size:.72rem;font-family:'DM Mono',monospace;padding:.2rem .55rem;border-radius:6px;
          border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:var(--secondary-text-color);
          cursor:pointer;transition:all .15s;user-select:none}
        .toggle-btn:hover{background:rgba(255,255,255,.1);color:var(--primary-text-color)}
        .toggle-btn.active{background:rgba(59,130,246,.2);border-color:#3b82f6;color:#93c5fd;font-weight:700}
        /* Rows */
        .rows{padding:0 0 .8rem}
        .row{display:flex;align-items:center;gap:.9rem;padding:.65rem 1.6rem;
          transition:background .15s;animation:fadeIn .35s ease both;border-radius:0}
        .row:hover{background:rgba(255,255,255,.03) !important}
        @keyframes fadeIn{from{opacity:0;transform:translateX(-5px)}to{opacity:1;transform:translateX(0)}}
        /* Statuskreis */
        .status-dot{width:2rem;height:2rem;flex-shrink:0}
        .status-dot svg{width:100%;height:100%}
        .dot-active circle:last-child{animation:pulse 2.5s ease-out infinite}
        @keyframes pulse{0%,100%{r:4.5;opacity:1}50%{r:6;opacity:.7}}
        /* Info */
        .info{flex:1;min-width:0}
        .name-row{display:flex;align-items:baseline;gap:.45rem;flex-wrap:wrap}
        .name{font-size:1.0rem;font-weight:600;color:var(--primary-text-color);
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .name a{color:inherit;text-decoration:none;border-bottom:1px dashed rgba(96,165,250,0.4);
          transition:color .15s,border-color .15s}
        .name a:hover{color:#93c5fd;border-bottom-color:#93c5fd}
        .ticker{font-size:.7rem;color:var(--secondary-text-color);font-family:'DM Mono',monospace;flex-shrink:0}
        .wkn{font-size:.65rem;color:var(--secondary-text-color);font-family:'DM Mono',monospace;
          opacity:.6;flex-shrink:0}
        /* Fortschrittsbalken */
        .bar-row{display:flex;align-items:center;gap:.35rem;margin-top:.3rem}
        .bar-lbl,.bar-lbl-r{font-family:'DM Mono',monospace;font-size:.65rem;
          color:var(--secondary-text-color);flex-shrink:0;white-space:nowrap}
        .bar-lbl-r{min-width:4.5rem;text-align:right}
        .bar-track{flex:1;height:5px;background:rgba(255,255,255,.07);border-radius:3px;
          position:relative;overflow:visible}
        .bar-fill{height:5px;border-radius:3px;transition:width .6s cubic-bezier(.4,0,.2,1)}
        .bar-target{position:absolute;top:-3px;width:2px;height:11px;background:rgba(255,255,255,.4);
          border-radius:1px;transform:translateX(-50%)}
        .notiz{font-size:.72rem;color:var(--secondary-text-color);margin-top:.2rem;
          font-style:italic;opacity:.7}
        /* Values */
        .values{text-align:right;flex-shrink:0;min-width:5rem}
        .signal-badge{font-family:'DM Mono',monospace;font-size:.7rem;font-weight:700;
          background:rgba(34,197,94,.2);border:1px solid rgba(34,197,94,.4);
          color:#22c55e;padding:.2rem .5rem;border-radius:6px;letter-spacing:.08em;
          animation:glow 2s ease-in-out infinite}
        @keyframes glow{0%,100%{box-shadow:0 0 4px rgba(34,197,94,.3)}50%{box-shadow:0 0 10px rgba(34,197,94,.6)}}
        .abstand{font-family:'DM Mono',monospace;font-size:.78rem}
        .diff{font-family:'DM Mono',monospace;font-size:.72rem;margin-top:.1rem;opacity:.7}
        /* Leer */
        .empty{padding:2.5rem 1.6rem;text-align:center}
        .empty-icon{font-size:2.5rem;margin-bottom:.8rem}
        .empty-text{font-size:1rem;color:var(--secondary-text-color);font-family:'DM Mono',monospace}
        .empty-sub{font-size:.8rem;color:var(--secondary-text-color);opacity:.6;margin-top:.3rem}
        /* Footer */
        .footer{padding:.1rem 1.6rem .9rem;font-size:.72rem;color:var(--secondary-text-color);
          font-family:'DM Mono',monospace;text-align:right;opacity:.6}
      </style>
      <ha-card>
        <div class="header">
          <div class="hdr-title">${title}</div>
          <div class="hdr-badges">
            ${allCount > 0 ? `<span class="badge badge-total">${allCount} gesamt</span>` : ""}
            ${signalCount > 0 ? `<span class="badge badge-signal">▲ ${signalCount} Signal${signalCount !== 1 ? "e" : ""}</span>` : ""}
          </div>
        </div>

        <div class="toggle-row">
          <button class="toggle-btn ${!this._showAll ? "active" : ""}"
            onclick="this.getRootNode().host._setShowAll(false)">Nur Signale</button>
          <button class="toggle-btn ${this._showAll ? "active" : ""}"
            onclick="this.getRootNode().host._setShowAll(true)">Alle</button>
        </div>

        ${candidates.length === 0
          ? `<div class="empty">
               <div class="empty-icon">${signalCount === 0 && allCount > 0 ? "⏳" : "📋"}</div>
               <div class="empty-text">${allCount === 0
                 ? "Keine Kaufkandidaten erfasst"
                 : "Kein aktives Kaufsignal"}</div>
               <div class="empty-sub">${allCount === 0
                 ? "Kandidaten über HA-Integration hinzufügen"
                 : `${allCount} Kandidat${allCount !== 1 ? "en" : ""} beobachtet – noch kein Zielkurs erreicht`}</div>
             </div>`
          : `<div class="rows">
               ${candidates.map((c, i) => renderRow(c, i)).join("")}
             </div>
             <div class="footer">
               ${candidates.length} von ${allCount} Kandidat${allCount !== 1 ? "en" : ""} angezeigt
             </div>`}
      </ha-card>`;
  }

  _setShowAll(val) {
    this._showAll = val;
    this._render();
  }

  getCardSize() { return Math.max(3, this._getCandidates().length + 2); }

  static getStubConfig() {
    return { title: "Kaufkandidaten", show_all: false };
  }
}

customElements.define("my-portfolio-buywatchlist-card", MyPortfolioBuywatchlistCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type:        "my-portfolio-buywatchlist-card",
  name:        "Portfolio Kaufkandidaten",
  description: "Zeigt Kaufkandidaten mit Kaufsignal wenn Kurs den Zielkurs erreicht.",
});
