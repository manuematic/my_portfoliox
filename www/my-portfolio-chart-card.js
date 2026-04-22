/**
 * my-portfolio-chart-card  v0.9.2
 * Grafischer Kursverlauf einer Aktie (1 Jahr) mit 100/200-Tage-Linie und Trendlinie.
 *
 * YAML:
 *   type: custom:my-portfolio-chart-card
 *   title: Kursverlauf       # optional
 */

const _chartState = new Map();
let   _chartUid   = 0;

class MyPortfolioChartCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._uid      = ++_chartUid;
    this._cache    = {};   // { symbol: { ts, prices } }
    this._loading  = false;
  }

  setConfig(config) {
    this._config = config;
    if (!_chartState.has(this._uid)) {
      _chartState.set(this._uid, {
        portfolio: null,
        symbol:    null,
        sma100:    false,
        sma200:    false,
        trend:     false,
        kursziel:  false,
      });
    }
  }

  get _st()       { return _chartState.get(this._uid) || {}; }
  _set(key, val)  { const s = this._st; s[key] = val; _chartState.set(this._uid, s); }

  set hass(hass) {
    this._hass = hass;
    // Erstes Portfolio/Symbol automatisch wählen
    const st = this._st;
    if (!st.portfolio || !st.symbol) {
      const stocks = this._getStocks();
      if (stocks.length > 0 && !st.portfolio) {
        this._set("portfolio", stocks[0].portfolio);
        const first = stocks.find(s => s.portfolio === stocks[0].portfolio);
        if (first) this._set("symbol", first.kuerzel);
      }
    }
    this._render();
  }

  // ── Hilfsmethoden ────────────────────────────────────────────────────────

  _getStocks() {
    const stocks = [];
    for (const [, state] of Object.entries(this._hass.states)) {
      const attr = state.attributes || {};
      if (attr.kuerzel === undefined || attr.summary_key !== undefined) continue;
      stocks.push({
        bezeichnung: (attr.bezeichnung || attr.kuerzel || "").trim(),
        kuerzel:     attr.kuerzel,
        portfolio:   attr.portfolio_name || "Standard",
      });
    }
    return stocks.sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung, "de"));
  }

  _portfolios() {
    return [...new Set(this._getStocks().map(s => s.portfolio))];
  }

  _stocksForPortfolio(portfolio) {
    return this._getStocks().filter(s => s.portfolio === portfolio);
  }

  async _fetchHistory(symbol, isin) {
    const cacheKey = isin || symbol;
    const cached = this._cache[cacheKey];
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000) return cached.prices;

    // ING als primäre Quelle wenn ISIN vorhanden (letztes Jahr via Tradegate)
    if (isin) {
      const prices = await this._fetchHistoryING(isin);
      if (prices && prices.length > 10) {
        this._cache[cacheKey] = { ts: Date.now(), prices };
        return prices;
      }
      console.warn("ING Chart-Daten unvollständig, Fallback auf Yahoo:", symbol);
    }

    // Yahoo Finance Fallback
    return await this._fetchHistoryYahoo(symbol, cacheKey);
  }

  async _fetchHistoryING(isin) {
    // ING liefert nur 3 Monate pro Request → 4 Requests für 1 Jahr
    const allPrices = [];
    const now = new Date();
    for (let i = 3; i >= 0; i--) {
      const end   = new Date(now.getFullYear(), now.getMonth() - i * 3,     0);
      const start = new Date(now.getFullYear(), now.getMonth() - i * 3 - 3, 1);
      const fmt   = d => `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
      const url   = `https://component-api.wertpapiere.ing.de/api/v1/components/exchangehistory/${isin}` +
                    `?exchangeCode=TGT&currencyIsoCode=EUR&startDate=${fmt(start)}&endDate=${fmt(end)}`;
      try {
        const res  = await fetch(url, { headers: { Accept: "application/json", Origin: "https://www.ing.de" }});
        if (!res.ok) continue;
        const json = await res.json();
        const items = json?.historyItems || [];
        for (const item of items) {
          if (item.close && item.date) {
            const [d, m, y] = item.date.split(".");
            allPrices.push({ date: new Date(y, m-1, d), close: item.close });
          }
        }
      } catch(e) { /* Quartal überspringen */ }
    }
    return allPrices.sort((a, b) => a.date - b.date);
  }

  async _fetchHistoryYahoo(symbol, cacheKey) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
                `?interval=1d&range=1y&includePrePost=false`;
    try {
      const res  = await fetch(url, { headers: { Accept: "application/json" } });
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) return null;
      const ts     = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      const prices = ts.map((t, i) => ({
        date:  new Date(t * 1000),
        close: closes[i] ?? null,
      })).filter(p => p.close !== null);
      this._cache[cacheKey] = { ts: Date.now(), prices };
      return prices;
    } catch (e) {
      console.error("Yahoo Chart fetch error:", e);
      return null;
    }
  }

  // ── Technische Indikatoren ───────────────────────────────────────────────

  _sma(prices, n) {
    return prices.map((_, i) => {
      if (i < n - 1) return null;
      const slice = prices.slice(i - n + 1, i + 1);
      return slice.reduce((s, p) => s + p.close, 0) / n;
    });
  }

  _trendline(prices) {
    const n = prices.length;
    if (n < 2) return [];
    const xs = prices.map((_, i) => i);
    const ys = prices.map(p => p.close);
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
    const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    const slope = den ? num / den : 0;
    const inter = my - slope * mx;
    return xs.map(x => slope * x + inter);
  }

  // ── SVG Chart ────────────────────────────────────────────────────────────

  _drawChart(prices) {
    if (!prices || prices.length < 2) return `<div class="no-data">Keine Daten verfügbar</div>`;

    const st      = this._st;
    const W       = 800;
    const H       = 320;
    const padL    = 55;
    const padR    = 16;
    const padT    = 20;
    const padB    = 40;
    const cW      = W - padL - padR;
    const cH      = H - padT - padB;
    const n       = prices.length;

    const closes  = prices.map(p => p.close);
    const kzSensor = _getKursziel(this._hass, this._st.symbol);
    const kzVal    = kzSensor ? parseFloat(kzSensor) : null;

    const allVals = [...closes];

    // Werte für Skalierung sammeln
    const sma100v = st.sma100 ? this._sma(prices, 100) : [];
    const sma200v = st.sma200 ? this._sma(prices, 200) : [];
    const trendv  = st.trend  ? this._trendline(prices) : [];

    if (st.sma100) allVals.push(...sma100v.filter(v => v !== null));
    if (st.sma200) allVals.push(...sma200v.filter(v => v !== null));
    if (st.trend)  allVals.push(...trendv);
    if (st.kursziel && kzVal) allVals.push(kzVal);

    const minV = Math.min(...allVals) * 0.998;
    const maxV = Math.max(...allVals) * 1.002;
    const rng  = maxV - minV || 1;

    const xOf  = i => padL + (i / (n - 1)) * cW;
    const yOf  = v => padT + cH - ((v - minV) / rng) * cH;

    // Kurslinie Pfad
    const linePath = closes
      .map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`)
      .join(" ");

    // Füllbereich
    const fillPath = linePath +
      ` L${xOf(n-1).toFixed(1)},${(padT + cH).toFixed(1)}` +
      ` L${padL},${(padT + cH).toFixed(1)} Z`;

    // Farbe: grün wenn letzter Kurs > erster
    const up        = closes[closes.length - 1] >= closes[0];
    const lineClr   = up ? "#22c55e" : "#ef4444";
    const fillId    = `grad_${this._uid}`;

    // SMA-Pfade
    const smaPath = (vals, clr) => {
      let d = "", first = true;
      vals.forEach((v, i) => {
        if (v === null) { first = true; return; }
        d += `${first ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)} `;
        first = false;
      });
      return `<path d="${d}" fill="none" stroke="${clr}" stroke-width="1.5" stroke-dasharray="4,2" opacity="0.85"/>`;
    };

    const trendPath = () => {
      const d = trendv.map((v, i) =>
        `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`
      ).join(" ");
      return `<path d="${d}" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="6,3" opacity="0.85"/>`;
    };

    const kursZielLine = () => {
      if (!kzVal) return "";
      const y = yOf(kzVal).toFixed(1);
      const clr = kzVal > (closes[closes.length-1] || 0) ? "#22c55e" : "#ef4444";
      return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"
                stroke="${clr}" stroke-width="1.5" stroke-dasharray="8,4" opacity="0.7"/>
              <text x="${W - padR - 2}" y="${parseFloat(y) - 4}" text-anchor="end"
                class="axis-lbl" fill="${clr}">KZ ${kzVal.toFixed(2)}</text>`;
    };

    // Y-Achse Labels (5 Stufen)
    const yLabels = Array.from({ length: 5 }, (_, i) => {
      const v = minV + (i / 4) * rng;
      const y = yOf(v);
      return `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" class="axis-lbl">${v.toFixed(2)}</text>
              <line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" class="grid-line"/>`;
    });

    // X-Achse: monatliche Labels
    const months = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
    let lastMonth = -1;
    const xLabels = prices.map((p, i) => {
      const m = p.date.getMonth();
      if (m === lastMonth) return "";
      lastMonth = m;
      const x = xOf(i);
      return `<text x="${x}" y="${padT + cH + 24}" text-anchor="middle" class="axis-lbl">${months[m]}</text>
              <line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + cH}" class="grid-line-v"/>`;
    });

    // Tooltip-Overlay (unsichtbare Bereiche für Hover → CSS-only simplified)
    const lastPx  = xOf(n - 1);
    const lastPy  = yOf(closes[n - 1]);
    const lastVal = closes[n - 1].toFixed(2);

    return `
      <svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="${fillId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="${lineClr}" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="${lineClr}" stop-opacity="0.02"/>
          </linearGradient>
        </defs>

        <!-- Grid -->
        ${yLabels.join("")}
        ${xLabels.join("")}

        <!-- Füllbereich -->
        <path d="${fillPath}" fill="url(#${fillId})"/>

        <!-- Kurslinie -->
        <path d="${linePath}" fill="none" stroke="${lineClr}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>

        <!-- Indikatoren -->
        ${st.sma100 ? smaPath(sma100v, "#60a5fa") : ""}
        ${st.sma200 ? smaPath(sma200v, "#a78bfa") : ""}
        ${st.trend  ? trendPath()                 : ""}
        ${st.kursziel ? kursZielLine() : ""}

        <!-- Letzter Kurs Punkt + Label -->
        <circle cx="${lastPx}" cy="${lastPy}" r="4" fill="${lineClr}" stroke="#1c1c27" stroke-width="2"/>
        <rect x="${lastPx - 28}" y="${lastPy - 22}" width="56" height="16" rx="4"
              fill="${lineClr}" opacity="0.15"/>
        <text x="${lastPx}" y="${lastPy - 11}" text-anchor="middle"
              class="price-lbl" fill="${lineClr}">${lastVal}</text>
      </svg>`;
  }

  // ── Render ───────────────────────────────────────────────────────────────

  async _loadAndRender() {
    const st = this._st;
    if (!st.symbol || this._loading) return;
    this._loading = true;
    this._render(); // zeigt Spinner
    // ISIN aus HA-Sensor lesen (für ING-Quelle)
    let isin = null;
    if (this._hass) {
      for (const [, state] of Object.entries(this._hass.states)) {
        const a = state.attributes || {};
        if (a.kuerzel === st.symbol && a.summary_key === undefined && a.isin) {
          isin = a.isin;
          break;
        }
      }
    }
    const prices = await this._fetchHistory(st.symbol, isin);
    this._prices  = prices;
    this._loading = false;
    this._render();
  }

  _render() {
    if (!this._hass || !_chartState.has(this._uid)) return;

    const title      = (this._config || {}).title || "Kursverlauf";
    const st         = this._st;
    const portfolios = this._portfolios();
    const curPort    = st.portfolio || portfolios[0] || "";
    const stocks     = this._stocksForPortfolio(curPort);
    const curSym     = st.symbol || stocks[0]?.kuerzel || "";
    const curStock   = stocks.find(s => s.kuerzel === curSym) || stocks[0];

    const btn = (active, label, id) =>
      `<button class="ind-btn${active ? " active" : ""}"
         onclick="this.getRootNode().host._toggle('${id}')">${label}</button>`;

    // Chart-Inhalt
    // Datenladen NUR anstoßen wenn Symbol sich geändert hat, nicht bei jedem hass-Update
    let chartContent;
    if (this._loadedSymbol !== curSym && !this._loading) {
      this._loadedSymbol = curSym;
      this._prices       = null;
      setTimeout(() => this._loadAndRender(), 0);
      chartContent = `<div class="loading"><div class="spinner"></div><span>Lade ${curSym}\u2026</span></div>`;
    } else if (this._loading) {
      chartContent = `<div class="loading"><div class="spinner"></div><span>Kursdaten werden geladen\u2026</span></div>`;
    } else if (this._prices) {
      chartContent = this._drawChart(this._prices);
    } else {
      chartContent = `<div class="loading"><div class="spinner"></div><span>Lade ${curSym}\u2026</span></div>`;
    }

    // Legende
    const legend = `
      <div class="legend">
        <span class="leg-item"><span class="leg-dot" style="background:#22c55e"></span>Kurs</span>
        ${st.sma100 ? `<span class="leg-item"><span class="leg-dash" style="border-color:#60a5fa"></span>SMA 100</span>` : ""}
        ${st.sma200 ? `<span class="leg-item"><span class="leg-dash" style="border-color:#a78bfa"></span>SMA 200</span>` : ""}
        ${st.trend  ? `<span class="leg-item"><span class="leg-dash" style="border-color:#f59e0b"></span>Trend</span>` : ""}
        ${st.kursziel ? `<span class="leg-item"><span class="leg-dash" style="border-color:#22c55e"></span>Ø Kursziel</span>` : ""}
      </div>`;

    this.shadowRoot.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Outfit:wght@400;600;700&display=swap');
        :host { display: block; }
        ha-card {
          background: var(--ha-card-background, var(--card-background-color, #1c1c27));
          border-radius: 16px;
          overflow: hidden;
          font-family: 'Outfit', sans-serif;
          padding-bottom: .8rem;
        }
        /* ── Header ── */
        .header {
          padding: 1.3rem 1.6rem .5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: .6rem;
        }
        .hdr-title {
          font-size: 1.05rem;
          font-weight: 700;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
        }
        .hdr-price {
          font-family: 'DM Mono', monospace;
          font-size: 1.3rem;
          font-weight: 500;
          color: var(--primary-text-color);
        }
        /* ── Selects ── */
        .selects {
          display: flex;
          gap: .6rem;
          padding: 0 1.6rem .5rem;
          flex-wrap: wrap;
          align-items: center;
        }
        .sel-label {
          font-size: .75rem;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
          flex-shrink: 0;
        }
        select {
          font-size: .82rem;
          font-family: 'Outfit', sans-serif;
          padding: .3rem .7rem;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,.15);
          background: rgba(255,255,255,.07);
          color: var(--primary-text-color);
          cursor: pointer;
          outline: none;
          appearance: none;
          -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236b7280'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right .5rem center;
          background-size: .6rem;
          padding-right: 1.6rem;
        }
        select:focus { border-color: #3b82f6; }
        /* ── Indikator-Buttons ── */
        .indicators {
          display: flex;
          gap: .4rem;
          padding: 0 1.6rem .6rem;
          flex-wrap: wrap;
        }
        .ind-label {
          font-size: .75rem;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
          align-self: center;
          flex-shrink: 0;
          margin-right: .2rem;
        }
        .ind-btn {
          font-size: .75rem;
          font-family: 'DM Mono', monospace;
          padding: .25rem .65rem;
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,.12);
          background: rgba(255,255,255,.05);
          color: var(--secondary-text-color);
          cursor: pointer;
          transition: all .15s;
          user-select: none;
        }
        .ind-btn:hover { background:rgba(255,255,255,.1); color:var(--primary-text-color); }
        .ind-btn.active {
          font-weight: 700;
          border-width: 1.5px;
        }
        .ind-btn:nth-child(2).active { background:rgba(96,165,250,.2);  border-color:#60a5fa; color:#93c5fd; }
        .ind-btn:nth-child(3).active { background:rgba(167,139,250,.2); border-color:#a78bfa; color:#c4b5fd; }
        .ind-btn:nth-child(4).active { background:rgba(245,158,11,.2);  border-color:#f59e0b; color:#fcd34d; }
        /* ── Chart ── */
        .chart-wrap {
          padding: 0 1.0rem;
          position: relative;
        }
        .chart-svg {
          width: 100%;
          height: auto;
          display: block;
        }
        .axis-lbl {
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          fill: rgba(255,255,255,.35);
        }
        .grid-line {
          stroke: rgba(255,255,255,.06);
          stroke-width: 1;
        }
        .grid-line-v {
          stroke: rgba(255,255,255,.04);
          stroke-width: 1;
        }
        .price-lbl {
          font-family: 'DM Mono', monospace;
          font-size: 11px;
          font-weight: 500;
        }
        .no-data {
          height: 200px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
          font-size: .9rem;
        }
        /* ── Spinner ── */
        .loading {
          height: 220px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
          font-size: .85rem;
        }
        .spinner {
          width: 2rem;
          height: 2rem;
          border: 2px solid rgba(255,255,255,.1);
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin .7s linear infinite;
        }
        @keyframes spin { to { transform:rotate(360deg); } }
        /* ── Legende ── */
        .legend {
          display: flex;
          gap: 1rem;
          padding: .5rem 1.6rem 0;
          flex-wrap: wrap;
        }
        .leg-item {
          display: flex;
          align-items: center;
          gap: .35rem;
          font-size: .75rem;
          color: var(--secondary-text-color);
          font-family: 'DM Mono', monospace;
        }
        .leg-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .leg-dash {
          width: 18px; height: 0;
          border-bottom: 2px dashed;
          flex-shrink: 0;
        }
      </style>
      <ha-card>
        <div class="header">
          <div class="hdr-title">${title}</div>
          ${curStock ? `<div class="hdr-price">${curStock.bezeichnung}</div>` : ""}
        </div>

        <!-- Auswahl Portfolio + Aktie -->
        <div class="selects">
          <span class="sel-label">Portfolio:</span>
          <select onchange="this.getRootNode().host._selectPortfolio(this.value)">
            ${portfolios.map(p =>
              `<option value="${p}" ${p === curPort ? "selected" : ""}>${p}</option>`
            ).join("")}
          </select>
          <span class="sel-label">Aktie:</span>
          <select onchange="this.getRootNode().host._selectSymbol(this.value)">
            ${stocks.map(s =>
              `<option value="${s.kuerzel}" ${s.kuerzel === curSym ? "selected" : ""}>${s.bezeichnung} (${s.kuerzel})</option>`
            ).join("")}
          </select>
        </div>

        <!-- Indikator-Buttons -->
        <div class="indicators">
          <span class="ind-label">Indikatoren:</span>
          ${btn(st.sma100, "100-Tage Ø", "sma100")}
          ${btn(st.sma200, "200-Tage Ø", "sma200")}
          ${btn(st.trend,  "Trendlinie", "trend")}
        </div>

        <!-- Chart -->
        <div class="chart-wrap">
          ${chartContent}
        </div>

        <!-- Legende -->
        ${legend}
      </ha-card>`;
  }

  // ── Event Handler ────────────────────────────────────────────────────────

  _selectPortfolio(portfolio) {
    this._set("portfolio", portfolio);
    const stocks = this._stocksForPortfolio(portfolio);
    if (stocks.length > 0) {
      this._set("symbol", stocks[0].kuerzel);
      this._loadedSymbol = null;
      this._prices     = null;
    }
    this._render();
  }

  _selectSymbol(symbol) {
    this._set("symbol", symbol);
    this._loadedSymbol = null;
    this._prices     = null;
    this._render();
  }

  _toggle(key) {
    this._set(key, !this._st[key]);
    this._render();
  }

  getCardSize() { return 8; }
  static getStubConfig() { return { title: "Kursverlauf" }; }
}

customElements.define("my-portfolio-chart-card", MyPortfolioChartCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type:        "my-portfolio-chart-card",
  name:        "Portfolio Kursverlauf",
  description: "Grafischer Kursverlauf einer Aktie mit SMA 100/200 und Trendlinie.",
});

// Hilfsfunktion: Ø-Kursziel für ein Symbol aus HA-States
function _getKursziel(hass, symbol) {
  if (!hass || !symbol) return null;
  for (const [, state] of Object.entries(hass.states)) {
    const attr = state.attributes || {};
    if (attr.kuerzel === symbol && attr.summary_key === undefined) {
      const kz = parseFloat(attr.kursziel_mittel);
      return isNaN(kz) ? null : kz;
    }
  }
  return null;
}
