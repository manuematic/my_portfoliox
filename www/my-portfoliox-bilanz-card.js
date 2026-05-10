/**
 * my-portfoliox-bilanz-card  v0.1.0
 * Realisierte Verkaufs-Transaktionen mit Brutto/Netto-Gewinn und Steuerausweis
 *
 * YAML:
 *   type: custom:my-portfoliox-bilanz-card
 *   title: Bilanz             # optional
 *   rows: 10                  # Anzahl angezeigte Transaktionen (Standard: 10)
 *   portfolio: Mein Depot     # optional, filtert auf ein Portfolio
 */

class MyPortfolioBilanzCard extends HTMLElement {
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

  // ── Bilanz-Sensor finden ──────────────────────────────────────────────────

  _getBilanzSensor() {
    if (!this._hass) return null;
    const wantPortfolio = (this._config || {}).portfolio || null;
    for (const [, state] of Object.entries(this._hass.states)) {
      const a = state.attributes || {};
      if (a.summary_key !== "bilanz") continue;
      if (wantPortfolio && a.portfolio_name !== wantPortfolio) continue;
      return a;
    }
    return null;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  _render() {
    if (!this._hass) return;

    const cfg        = this._config || {};
    const title      = cfg.title || "Bilanz";
    const maxRows    = parseInt(cfg.rows || 10, 10);

    const bilanz     = this._getBilanzSensor();
    const txAll      = bilanz?.transaktionen || [];

    // Sortieren: neuestes Verkaufsdatum zuerst
    const txSorted = [...txAll].sort((a, b) => {
      const da = a.verkaufsdatum || "";
      const db = b.verkaufsdatum || "";
      return db.localeCompare(da);
    });
    const txVisible = txSorted.slice(0, maxRows);

    const fmt = (v, d=2) => v != null && !isNaN(v)
      ? Number(v).toLocaleString("de-DE", {minimumFractionDigits:d, maximumFractionDigits:d})
      : "–";
    const sign = v => (v != null && !isNaN(v) && v >= 0) ? "+" : "";
    const clr  = v => (v != null && !isNaN(v) && v >= 0) ? "#22c55e" : "#ef4444";

    // Summenzeile
    const gBrutto = bilanz?.gesamt_brutto ?? 0;
    const gNetto  = bilanz?.gesamt_netto  ?? 0;
    const gSteuer = bilanz?.gesamt_steuer ?? 0;
    const gErloes = bilanz?.erloes_gesamt ?? 0;

    const summaryRow = `
      <div class="summary-row">
        <div class="sum-block">
          <div class="sum-label">Erlös gesamt</div>
          <div class="sum-value">${fmt(gErloes)} €</div>
        </div>
        <div class="sum-block">
          <div class="sum-label">Gewinn brutto</div>
          <div class="sum-value" style="color:${clr(gBrutto)}">${sign(gBrutto)}${fmt(gBrutto)} €</div>
        </div>
        <div class="sum-block">
          <div class="sum-label">Steuern</div>
          <div class="sum-value" style="color:#f59e0b">−${fmt(gSteuer)} €</div>
        </div>
        <div class="sum-block">
          <div class="sum-label">Gewinn netto</div>
          <div class="sum-value" style="color:${clr(gNetto)};font-weight:700">${sign(gNetto)}${fmt(gNetto)} €</div>
        </div>
      </div>`;

    // Tabelle
    const tableHeader = `
      <div class="table-header">
        <span class="col-name">Aktie</span>
        <span class="col-date">Datum</span>
        <span class="col-num">Kaufkurs</span>
        <span class="col-num">Verkaufskurs</span>
        <span class="col-num">Stk.</span>
        <span class="col-num">Erlös</span>
        <span class="col-num">Brutto</span>
        <span class="col-num">Steuer</span>
        <span class="col-num">Netto</span>
      </div>`;

    const tableRows = txVisible.map((tx, i) => {
      const gb = parseFloat(tx.gewinn_brutto ?? 0);
      const gn = parseFloat(tx.gewinn_netto  ?? 0);
      const st = parseFloat(tx.steuer_betrag ?? 0);
      const er = parseFloat(tx.erloes_gesamt ?? 0);
      const kk = parseFloat(tx.kaufkurs ?? 0);
      const vk = parseFloat(tx.verkaufskurs ?? 0);
      const sk = parseFloat(tx.stueckzahl ?? 0);

      const bezeichnung = (tx.bezeichnung || tx.kuerzel || "–").trim();
      const kuerzel     = tx.kuerzel || "";
      const vdatum      = (tx.verkaufsdatum || "").substring(0, 10);

      return `
        <div class="table-row" style="animation-delay:${i*0.04}s">
          <span class="col-name">
            <span class="tx-name">${bezeichnung}</span>
            <span class="tx-kuerzel">${kuerzel}</span>
          </span>
          <span class="col-date">${vdatum}</span>
          <span class="col-num">${fmt(kk, 3)}</span>
          <span class="col-num">${fmt(vk, 3)}</span>
          <span class="col-num">${fmt(sk, 3)}</span>
          <span class="col-num">${fmt(er)}</span>
          <span class="col-num" style="color:${clr(gb)}">${sign(gb)}${fmt(gb)}</span>
          <span class="col-num" style="color:#f59e0b">−${fmt(st)}</span>
          <span class="col-num" style="color:${clr(gn)};font-weight:600">${sign(gn)}${fmt(gn)}</span>
        </div>`;
    }).join("");

    const emptyMsg = txAll.length === 0
      ? `<div class="empty">Noch keine Verkäufe verbucht.</div>`
      : (txSorted.length > maxRows
          ? `<div class="more-hint">${txSorted.length - maxRows} weitere Transaktionen nicht angezeigt (rows: ${maxRows})</div>`
          : "");

    this.shadowRoot.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Outfit:wght@400;600;700&display=swap');
        :host{display:block}
        ha-card{
          background:var(--ha-card-background,var(--card-background-color,#1c1c27));
          border-radius:16px;overflow:hidden;font-family:'Outfit',sans-serif
        }
        /* Header */
        .header{
          padding:1.2rem 1.6rem .8rem;
          display:flex;align-items:center;justify-content:space-between;gap:.5rem
        }
        .hdr-title{
          font-size:1.05rem;font-weight:700;letter-spacing:.12em;
          text-transform:uppercase;color:var(--secondary-text-color)
        }
        .hdr-count{
          font-size:.8rem;font-family:'DM Mono',monospace;
          color:var(--secondary-text-color);
          background:rgba(255,255,255,.06);padding:.2rem .7rem;border-radius:20px
        }

        /* Summenzeile */
        .summary-row{
          display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem;
          padding:.6rem 1.4rem 1rem;
          border-bottom:1px solid rgba(255,255,255,.07)
        }
        .sum-block{
          background:rgba(255,255,255,.04);border-radius:10px;
          padding:.55rem .8rem;display:flex;flex-direction:column;gap:.25rem
        }
        .sum-label{font-size:.65rem;color:var(--secondary-text-color);text-transform:uppercase;letter-spacing:.08em}
        .sum-value{font-size:.95rem;font-family:'DM Mono',monospace;font-weight:600}

        /* Tabelle */
        .table-wrap{padding:0 1rem 1rem;overflow-x:auto}
        .table-header{
          display:grid;
          grid-template-columns:2fr 1fr 1fr 1fr 0.7fr 1fr 1fr 1fr 1fr;
          gap:.4rem;padding:.5rem .6rem;
          font-size:.65rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
          color:var(--secondary-text-color);border-bottom:1px solid rgba(255,255,255,.08)
        }
        .table-row{
          display:grid;
          grid-template-columns:2fr 1fr 1fr 1fr 0.7fr 1fr 1fr 1fr 1fr;
          gap:.4rem;padding:.55rem .6rem;
          border-bottom:1px solid rgba(255,255,255,.04);
          animation:slideIn .35s ease both
        }
        .table-row:last-child{border-bottom:none}
        .table-row:hover{background:rgba(255,255,255,.03);border-radius:8px}
        @keyframes slideIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        .col-name{display:flex;flex-direction:column;gap:.1rem;overflow:hidden}
        .tx-name{font-size:.8rem;font-weight:600;color:var(--primary-text-color);
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .tx-kuerzel{font-size:.68rem;font-family:'DM Mono',monospace;color:var(--secondary-text-color)}
        .col-date{font-size:.72rem;font-family:'DM Mono',monospace;color:var(--secondary-text-color);
          display:flex;align-items:center}
        .col-num{font-size:.78rem;font-family:'DM Mono',monospace;text-align:right;
          display:flex;align-items:center;justify-content:flex-end;white-space:nowrap}

        .empty{text-align:center;padding:2.5rem 1rem;
          color:var(--secondary-text-color);font-family:'DM Mono',monospace;font-size:.85rem}
        .more-hint{text-align:center;padding:.6rem 1rem;
          color:var(--secondary-text-color);font-size:.72rem;font-family:'DM Mono',monospace;
          border-top:1px solid rgba(255,255,255,.06)}
      </style>
      <ha-card>
        <div class="header">
          <div class="hdr-title">${title}</div>
          <div class="hdr-count">${txAll.length} Verkauf${txAll.length !== 1 ? "e" : ""}</div>
        </div>

        ${summaryRow}

        <div class="table-wrap">
          ${tableHeader}
          ${txVisible.length > 0 ? tableRows : `<div class="empty">Noch keine Verkäufe – nutze im Integration-Menü „Aktie verkaufen".</div>`}
          ${emptyMsg}
        </div>
      </ha-card>`;
  }

  getCardSize() { return 6; }
  static getStubConfig() { return { title: "Bilanz", rows: 10 }; }
}

customElements.define("my-portfoliox-bilanz-card", MyPortfolioBilanzCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type:        "my-portfoliox-bilanz-card",
  name:        "Portfolio Bilanz",
  description: "Realisierte Verkäufe mit Brutto/Netto-Gewinn und Steuerausweis",
});
