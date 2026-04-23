/**
 * my-portfolio-candidates-card  v0.9.8
 * Kaufkandidaten – zeigt alle Kandidaten, hebt Kaufsignale hervor.
 *
 * YAML:
 *   type: custom:my-portfolio-candidates-card
 *   title: Kaufkandidaten   # optional
 *   show_all: true          # false = nur Kandidaten mit Kaufsignal
 */

class MyPortfolioCandidatesCard extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); }

  setConfig(config) { this._config = config; }

  set hass(hass) { this._hass = hass; this._render(); }

  _getCandidates() {
    const all = [];
    for (const [, state] of Object.entries(this._hass.states)) {
      const a = state.attributes || {};
      if (a.kandidat !== true) continue;
      const kurs = parseFloat(state.state);
      const ziel = parseFloat(a.zielkurs);
      all.push({
        bezeichnung: (a.bezeichnung || a.kuerzel || "").trim(),
        kuerzel:     a.kuerzel || "?",
        wkn:         a.wkn || "",
        isin:        a.isin || "",
        zielkurs:    isNaN(ziel) ? null : ziel,
        kurs:        isNaN(kurs) ? null : kurs,
        kaufsignal:  a.kaufsignal === true,
        notiz:       a.notiz || "",
        datenquelle: a.datenquelle || "",
      });
    }
    // Kaufsignale zuerst, dann alphabetisch
    return all.sort((a, b) => {
      if (a.kaufsignal && !b.kaufsignal) return -1;
      if (!a.kaufsignal && b.kaufsignal) return 1;
      return a.bezeichnung.localeCompare(b.bezeichnung, "de");
    });
  }

  _render() {
    if (!this._hass) return;
    const title    = (this._config || {}).title || "Kaufkandidaten";
    const showAll  = (this._config || {}).show_all !== false;
    let   cands    = this._getCandidates();
    if (!showAll) cands = cands.filter(c => c.kaufsignal);

    const nSignal  = cands.filter(c => c.kaufsignal).length;
    const fmt      = (v, d=2) => v != null && !isNaN(v)
      ? v.toLocaleString("de-DE", {minimumFractionDigits:d, maximumFractionDigits:d}) : "–";

    const renderRow = (c, i) => {
      const diff     = (c.kurs != null && c.zielkurs != null) ? c.kurs - c.zielkurs : null;
      const diffPct  = (diff != null && c.zielkurs > 0) ? (diff / c.zielkurs) * 100 : null;
      const abstand  = diff != null ? `${diff >= 0 ? "+" : ""}${fmt(diff, 3)} € (${diff >= 0 ? "+" : ""}${fmt(diffPct)}%)` : "–";
      const abstandClr = diff == null ? "var(--secondary-text-color)"
        : (diff <= 0 ? "#22c55e" : "#ef4444");

      const ingUrl   = c.isin
        ? `https://wertpapiere.ing.de/investieren/aktienportrait/${c.isin}` : null;

      return `
        <div class="row ${c.kaufsignal ? "row-signal" : ""}" style="animation-delay:${i*0.05}s">
          <div class="signal-dot ${c.kaufsignal ? "dot-active" : "dot-idle"}">
            ${c.kaufsignal ? "🟢" : "⭕"}
          </div>
          <div class="info">
            <div class="name-row">
              ${ingUrl
                ? `<a class="name name-link" href="${ingUrl}" target="_blank" rel="noopener">${c.bezeichnung}</a>`
                : `<span class="name">${c.bezeichnung}</span>`}
              <span class="ticker">${c.kuerzel}</span>
              ${c.wkn  ? `<span class="meta">${c.wkn}</span>`  : ""}
            </div>
            ${c.notiz ? `<div class="notiz">${c.notiz}</div>` : ""}
            <div class="abstand-row">
              <span class="abstand-label">Abstand:</span>
              <span class="abstand-val" style="color:${abstandClr}">${abstand}</span>
            </div>
          </div>
          <div class="values">
            <div class="kurs ${c.kaufsignal ? "kurs-signal" : ""}">${fmt(c.kurs, 3)} €</div>
            <div class="ziel">Ziel: ${fmt(c.zielkurs, 3)} €</div>
          </div>
        </div>`;
    };

    this.shadowRoot.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Outfit:wght@400;600;700&display=swap');
        :host{display:block}
        ha-card{background:var(--ha-card-background,var(--card-background-color,#1c1c27));
          border-radius:16px;overflow:hidden;font-family:'Outfit',sans-serif}
        .header{padding:1.3rem 1.6rem .3rem;display:flex;align-items:center;justify-content:space-between;gap:.8rem}
        .hdr-title{font-size:1.05rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--secondary-text-color)}
        .hdr-badge{font-family:'DM Mono',monospace;font-size:.75rem;padding:.15rem .5rem;border-radius:20px;
          font-weight:600;flex-shrink:0}
        .badge-signal{background:rgba(34,197,94,.15);color:#22c55e;border:1px solid rgba(34,197,94,.3)}
        .badge-ok{background:rgba(255,255,255,.06);color:var(--secondary-text-color)}
        .rows{padding:.3rem 0 .6rem}
        .row{display:flex;align-items:center;gap:.9rem;padding:.7rem 1.6rem;
          transition:background .15s;animation:fadeIn .3s ease both;border-left:3px solid transparent}
        .row:hover{background:rgba(255,255,255,.03)}
        .row-signal{border-left-color:#22c55e;background:rgba(34,197,94,.04)}
        @keyframes fadeIn{from{opacity:0;transform:translateX(-4px)}to{opacity:1;transform:translateX(0)}}
        .signal-dot{font-size:1.2rem;flex-shrink:0;width:1.6rem;text-align:center}
        .info{flex:1;min-width:0}
        .name-row{display:flex;align-items:baseline;gap:.5rem;flex-wrap:wrap}
        .name{font-size:1.0rem;font-weight:600;color:var(--primary-text-color);
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .name-link{text-decoration:none;border-bottom:1px dashed rgba(96,165,250,0.4);transition:color .15s,border-color .15s}
        .name-link:hover{color:#93c5fd;border-bottom-color:#93c5fd}
        .ticker,.meta{font-size:.7rem;color:var(--secondary-text-color);font-family:'DM Mono',monospace;flex-shrink:0}
        .notiz{font-size:.75rem;color:var(--secondary-text-color);margin-top:.15rem;font-style:italic}
        .abstand-row{display:flex;gap:.4rem;align-items:baseline;margin-top:.2rem}
        .abstand-label{font-size:.7rem;color:var(--secondary-text-color);font-family:'DM Mono',monospace}
        .abstand-val{font-size:.78rem;font-family:'DM Mono',monospace;font-weight:500}
        .values{text-align:right;flex-shrink:0}
        .kurs{font-family:'DM Mono',monospace;font-size:1.05rem;font-weight:500;color:var(--primary-text-color)}
        .kurs-signal{color:#22c55e}
        .ziel{font-family:'DM Mono',monospace;font-size:.78rem;color:var(--secondary-text-color);margin-top:.1rem}
        .divider{height:1px;margin:0 1.6rem;background:rgba(255,255,255,.05)}
        .empty{padding:2rem 1.6rem;text-align:center;color:var(--secondary-text-color);font-family:'DM Mono',monospace}
        .footer{padding:.2rem 1.6rem .8rem;font-size:.72rem;color:var(--secondary-text-color);
          font-family:'DM Mono',monospace;text-align:right}
      </style>
      <ha-card>
        <div class="header">
          <div class="hdr-title">${title}</div>
          <span class="hdr-badge ${nSignal > 0 ? "badge-signal" : "badge-ok"}">
            ${nSignal > 0 ? `🟢 ${nSignal} Kaufsignal${nSignal > 1 ? "e" : ""}` : `${cands.length} Kandidaten`}
          </span>
        </div>

        ${cands.length === 0
          ? `<div class="empty">${showAll ? "Keine Kaufkandidaten erfasst." : "Kein Kaufsignal aktiv."}</div>`
          : `<div class="rows">
               ${cands.map((c, i) =>
                 renderRow(c, i) + (i < cands.length - 1 ? '<div class="divider"></div>' : "")
               ).join("")}
             </div>
             <div class="footer">${cands.length} Kandidat${cands.length !== 1 ? "en" : ""}${nSignal > 0 ? ` · ${nSignal} unter Zielkurs` : ""}</div>`}
      </ha-card>`;
  }

  getCardSize() { return Math.max(3, this._getCandidates().length + 2); }
  static getStubConfig() { return { title: "Kaufkandidaten", show_all: true }; }
}

customElements.define("my-portfolio-candidates-card", MyPortfolioCandidatesCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type:        "my-portfolio-candidates-card",
  name:        "Portfolio Kaufkandidaten",
  description: "Kaufkandidaten mit Zielkurs-Alarm.",
});
