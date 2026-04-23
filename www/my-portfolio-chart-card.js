/**
 * my-portfolio-chart-card  v0.9.7
 * Jahreschart + Kennzahlen-Panel
 *
 * YAML:
 *   type: custom:my-portfolio-chart-card
 *   title: Kursverlauf   # optional
 */

const _chartState = new Map();
let   _chartUid   = 0;

// ── Hilfsfunktion: Ø-Kursziel aus HA-States ─────────────────────────────────
function _getSensorAttr(hass, symbol, attr) {
  if (!hass || !symbol) return null;
  for (const [, state] of Object.entries(hass.states)) {
    const a = state.attributes || {};
    if (a.kuerzel === symbol && a.summary_key === undefined)
      return a[attr] ?? null;
  }
  return null;
}

// ── Card-Klasse ──────────────────────────────────────────────────────────────
class MyPortfolioChartCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._uid     = ++_chartUid;
    this._cache   = {};
    this._loading = false;
  }

  setConfig(config) {
    this._config = config;
    if (!_chartState.has(this._uid)) {
      _chartState.set(this._uid, {
        portfolio: null, symbol: null,
        sma100: false, sma200: false, trend: false, kursziel: false,
      });
    }
  }

  get _st()      { return _chartState.get(this._uid) || {}; }
  _set(k, v)     { const s = this._st; s[k] = v; _chartState.set(this._uid, s); }

  set hass(hass) {
    this._hass = hass;
    const st = this._st;
    if (!st.portfolio || !st.symbol) {
      const stocks = this._getStocks();
      if (stocks.length > 0) {
        if (!st.portfolio) this._set("portfolio", stocks[0].portfolio);
        const first = stocks.find(s => s.portfolio === (this._st.portfolio || stocks[0].portfolio));
        if (first && !st.symbol) this._set("symbol", first.kuerzel);
      }
    }
    this._render();
  }

  // ── Hilfsmethoden ───────────────────────────────────────────────────────

  _getStocks() {
    const stocks = [];
    for (const [, state] of Object.entries(this._hass.states)) {
      const a = state.attributes || {};
      if (a.kuerzel === undefined || a.summary_key !== undefined) continue;
      stocks.push({
        bezeichnung: (a.bezeichnung || a.kuerzel || "").trim(),
        kuerzel:     a.kuerzel,
        portfolio:   a.portfolio_name || "Standard",
        isin:        a.isin || null,
      });
    }
    return stocks.sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung, "de"));
  }

  _stocksForPortfolio(p) { return this._getStocks().filter(s => s.portfolio === p); }
  _portfolios()           { return [...new Set(this._getStocks().map(s => s.portfolio))]; }

  _currentIsin() {
    const s = this._getStocks().find(s => s.kuerzel === this._st.symbol);
    return s?.isin || null;
  }

  // ── Datenabruf ──────────────────────────────────────────────────────────

  async _fetchHistory(symbol, isin) {
    const key    = isin || symbol;
    const cached = this._cache[key];
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000) return cached.prices;

    if (isin) {
      const prices = await this._fetchHistoryING(isin);
      if (prices && prices.length > 10) {
        this._cache[key] = { ts: Date.now(), prices };
        return prices;
      }
    }
    return await this._fetchHistoryYahoo(symbol, key);
  }

  async _fetchHistoryING(isin) {
    const all = [];
    const now = new Date();
    const fmt  = d => `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${d.getFullYear()}`;
    for (let i = 3; i >= 0; i--) {
      const end   = new Date(now.getFullYear(), now.getMonth() - i * 3,     0);
      const start = new Date(now.getFullYear(), now.getMonth() - i * 3 - 3, 1);
      const url   = `https://component-api.wertpapiere.ing.de/api/v1/components/exchangehistory/${isin}` +
                    `?exchangeCode=TGT&currencyIsoCode=EUR&startDate=${fmt(start)}&endDate=${fmt(end)}`;
      try {
        const res  = await fetch(url, { headers: { Accept: "application/json", Origin: "https://www.ing.de" }});
        if (!res.ok) continue;
        const json = await res.json();
        for (const item of (json?.historyItems || [])) {
          if (item.close && item.date) {
            const [d, m, y] = item.date.split(".");
            all.push({ date: new Date(+y, +m-1, +d), close: item.close,
                       high: item.high || item.close, low: item.low || item.close });
          }
        }
      } catch(e) { /* überspringen */ }
    }
    return all.sort((a, b) => a.date - b.date);
  }

  async _fetchHistoryYahoo(symbol, cacheKey) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
                `?interval=1d&range=1y&includePrePost=false`;
    try {
      const res  = await fetch(url, { headers: { Accept: "application/json" }});
      const json = await res.json();
      const r    = json?.chart?.result?.[0];
      if (!r) return null;
      const ts     = r.timestamp || [];
      const q      = r.indicators?.quote?.[0] || {};
      const prices = ts.map((t, i) => ({
        date:  new Date(t * 1000),
        close: q.close?.[i] ?? null,
        high:  q.high?.[i]  ?? null,
        low:   q.low?.[i]   ?? null,
      })).filter(p => p.close !== null);
      this._cache[cacheKey] = { ts: Date.now(), prices };
      return prices;
    } catch(e) { return null; }
  }

  // ── Technische Indikatoren ───────────────────────────────────────────────

  _sma(prices, n) {
    return prices.map((_, i) => {
      if (i < n - 1) return null;
      return prices.slice(i - n + 1, i + 1).reduce((s, p) => s + p.close, 0) / n;
    });
  }

  _trendline(prices) {
    const n  = prices.length;
    if (n < 2) return [];
    const xs = prices.map((_, i) => i);
    const ys = prices.map(p => p.close);
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
    const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    const m   = den ? num / den : 0;
    return xs.map(x => m * x + (my - m * mx));
  }

  // ── SVG Chart ────────────────────────────────────────────────────────────

  _drawChart(prices) {
    if (!prices || prices.length < 2)
      return `<div class="no-data">Keine Daten verfügbar</div>`;

    const st   = this._st;
    const W = 800, H = 300, padL = 55, padR = 18, padT = 16, padB = 36;
    const cW = W - padL - padR, cH = H - padT - padB;
    const n  = prices.length;

    const closes  = prices.map(p => p.close);
    const kzVal   = parseFloat(_getSensorAttr(this._hass, st.symbol, "kursziel_mittel")) || null;
    const allVals = [...closes];

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

    const xOf = i => padL + (i / (n - 1)) * cW;
    const yOf = v => padT + cH - ((v - minV) / rng) * cH;

    const linePath = closes.map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
    const fillPath = linePath + ` L${xOf(n-1).toFixed(1)},${(padT+cH).toFixed(1)} L${padL},${(padT+cH).toFixed(1)} Z`;
    const up       = closes[n-1] >= closes[0];
    const lineClr  = up ? "#22c55e" : "#ef4444";
    const fillId   = `grad_${this._uid}`;

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
      const d = trendv.map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
      return `<path d="${d}" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="6,3" opacity="0.85"/>`;
    };

    const kzLine = () => {
      if (!kzVal) return "";
      const y   = yOf(kzVal).toFixed(1);
      const clr = kzVal > closes[n-1] ? "#22c55e" : "#ef4444";
      return `<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}"
                stroke="${clr}" stroke-width="1.5" stroke-dasharray="8,4" opacity="0.7"/>
              <text x="${W-padR-3}" y="${parseFloat(y)-4}" text-anchor="end"
                class="axis-lbl" fill="${clr}">KZ ${kzVal.toFixed(2)}</text>`;
    };

    // Kaufkurs-Linie
    const kaufkurs = parseFloat(_getSensorAttr(this._hass, st.symbol, "preis")) || null;
    const kaufLine = () => {
      if (!kaufkurs || kaufkurs < minV || kaufkurs > maxV) return "";
      const y = yOf(kaufkurs).toFixed(1);
      return `<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}"
                stroke="#f59e0b" stroke-width="1" stroke-dasharray="3,3" opacity="0.5"/>
              <text x="${padL+4}" y="${parseFloat(y)-4}" class="axis-lbl" fill="#f59e0b">Kauf ${kaufkurs.toFixed(2)}</text>`;
    };

    // Y-Achse
    const yLabels = Array.from({ length: 5 }, (_, i) => {
      const v = minV + (i / 4) * rng;
      const y = yOf(v);
      return `<text x="${padL-6}" y="${y+4}" text-anchor="end" class="axis-lbl">${v.toFixed(2)}</text>
              <line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" class="grid-line"/>`;
    });

    // X-Achse Monats-Labels
    const months = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
    let lastMonth = -1;
    const xLabels = prices.map((p, i) => {
      const m = p.date.getMonth();
      if (m === lastMonth) return "";
      lastMonth = m;
      const x = xOf(i);
      return `<text x="${x}" y="${padT+cH+22}" text-anchor="middle" class="axis-lbl">${months[m]}</text>
              <line x1="${x}" y1="${padT}" x2="${x}" y2="${padT+cH}" class="grid-line-v"/>`;
    });

    const lastPx = xOf(n-1), lastPy = yOf(closes[n-1]);

    return `
      <svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="${fillId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="${lineClr}" stop-opacity="0.22"/>
            <stop offset="100%" stop-color="${lineClr}" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        ${yLabels.join("")}
        ${xLabels.join("")}
        <path d="${fillPath}" fill="url(#${fillId})"/>
        ${kaufLine()}
        <path d="${linePath}" fill="none" stroke="${lineClr}" stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round"/>
        ${st.sma100 ? smaPath(sma100v, "#60a5fa") : ""}
        ${st.sma200 ? smaPath(sma200v, "#a78bfa") : ""}
        ${st.trend  ? trendPath()                 : ""}
        ${st.kursziel ? kzLine()                  : ""}
        <circle cx="${lastPx}" cy="${lastPy}" r="4" fill="${lineClr}" stroke="#1c1c27" stroke-width="2"/>
        <rect x="${lastPx-28}" y="${lastPy-22}" width="56" height="16" rx="4"
              fill="${lineClr}" opacity="0.15"/>
        <text x="${lastPx}" y="${lastPy-11}" text-anchor="middle"
              class="price-lbl" fill="${lineClr}">${closes[n-1].toFixed(2)}</text>
      </svg>`;
  }

  // ── Kennzahlen-Panel ─────────────────────────────────────────────────────

  _buildInfoPanel(prices) {
    const sym   = this._st.symbol;
    const fmt   = (v, d=2) => v != null && !isNaN(v)
      ? Number(v).toLocaleString("de-DE", {minimumFractionDigits:d, maximumFractionDigits:d})
      : "–";
    const sign  = v => (v != null && !isNaN(v) && v >= 0) ? "+" : "";
    const pct   = v => v != null ? `${sign(v)}${fmt(v)}%` : "–";

    // Aus HA-Sensor
    const kurs     = parseFloat(_getSensorAttr(this._hass, sym, "aktueller_kurs"));
    const kaufkurs = parseFloat(_getSensorAttr(this._hass, sym, "preis"));
    const stueck   = parseFloat(_getSensorAttr(this._hass, sym, "stueckzahl"));
    const gewinn   = parseFloat(_getSensorAttr(this._hass, sym, "gewinn"));
    const tgAbs    = parseFloat(_getSensorAttr(this._hass, sym, "tages_aenderung_abs"));
    const tgPct    = parseFloat(_getSensorAttr(this._hass, sym, "tages_aenderung_pct"));
    const kzMittel = parseFloat(_getSensorAttr(this._hass, sym, "kursziel_mittel"));
    const kzHoch   = parseFloat(_getSensorAttr(this._hass, sym, "kursziel_hoch"));
    const kzTief   = parseFloat(_getSensorAttr(this._hass, sym, "kursziel_tief"));
    const konsens  = _getSensorAttr(this._hass, sym, "analysten_konsens");
    const anzahl   = _getSensorAttr(this._hass, sym, "analysten_anzahl");

    // Aus Kursverlauf berechnen
    let w52h = null, w52t = null;
    let sma100last = null, sma200last = null;
    let sma100dist = null, sma200dist = null;

    if (prices && prices.length > 1) {
      const closes = prices.map(p => p.close).filter(v => v != null);
      const highs  = prices.map(p => p.high  || p.close).filter(v => v != null);
      const lows   = prices.map(p => p.low   || p.close).filter(v => v != null);
      w52h = Math.max(...highs);
      w52t = Math.min(...lows);

      const sma100v = this._sma(prices, 100);
      const sma200v = this._sma(prices, 200);
      const last100 = [...sma100v].reverse().find(v => v !== null);
      const last200 = [...sma200v].reverse().find(v => v !== null);
      if (last100 && !isNaN(kurs)) {
        sma100last = last100;
        sma100dist = ((kurs - last100) / last100) * 100;
      }
      if (last200 && !isNaN(kurs)) {
        sma200last = last200;
        sma200dist = ((kurs - last200) / last200) * 100;
      }
    }

    const upside = (!isNaN(kurs) && !isNaN(kzMittel) && kurs > 0)
      ? ((kzMittel - kurs) / kurs) * 100 : null;

    // Kursgewinn seit Kauf absolut
    const gesamtGewinnAbs = (!isNaN(kurs) && !isNaN(kaufkurs) && !isNaN(stueck))
      ? (kurs - kaufkurs) * stueck : null;

    const tgClr   = (!isNaN(tgPct) && tgPct >= 0) ? "#22c55e" : "#ef4444";
    const gwClr   = (!isNaN(gewinn) && gewinn >= 0) ? "#22c55e" : "#ef4444";
    const konsensClr = konsens
      ? (konsens.toLowerCase().includes("buy") ? "#22c55e"
       : konsens.toLowerCase().includes("sell") ? "#ef4444" : "#f59e0b")
      : "var(--secondary-text-color)";

    const row = (label, value, color = "var(--primary-text-color)", sub = null) => `
      <div class="kz-row">
        <span class="kz-label">${label}</span>
        <span class="kz-value" style="color:${color}">${value}${sub ? `<span class="kz-sub">${sub}</span>` : ""}</span>
      </div>`;

    const divider = () => `<div class="kz-divider"></div>`;

    return `
      <div class="info-panel">

        <div class="info-section">
          <div class="info-sec-title">Kurs</div>
          ${row("Aktuell", `${fmt(kurs, 3)} €`,
            (!isNaN(tgPct) && tgPct >= 0) ? "#22c55e" : "#ef4444")}
          ${row("Tagesänderung",
            `${sign(tgAbs)}${fmt(tgAbs, 3)} € (${sign(tgPct)}${fmt(tgPct)}%)`, tgClr)}
          ${row("Kaufkurs", `${fmt(kaufkurs, 3)} €`)}
          ${row("Gewinn/Verlust", `${sign(gesamtGewinnAbs)}${fmt(gesamtGewinnAbs)} € (${pct(gewinn)})`, gwClr)}
        </div>

        ${divider()}

        <div class="info-section">
          <div class="info-sec-title">52-Wochen</div>
          ${row("52W Hoch", `${fmt(w52h, 3)} €`, "#22c55e")}
          ${row("52W Tief", `${fmt(w52t, 3)} €`, "#ef4444")}
          ${w52h != null && w52t != null && !isNaN(kurs) ? row("Position",
            (() => {
              const r = w52h - w52t;
              const p = r > 0 ? ((kurs - w52t) / r) * 100 : null;
              return p != null ? `${fmt(p)}% über Tief` : "–";
            })()
          ) : ""}
        </div>

        ${divider()}

        <div class="info-section">
          <div class="info-sec-title">Gleitende Durchschnitte</div>
          ${row("SMA 100",
            sma100last != null ? `${fmt(sma100last, 2)} €` : "–",
            "var(--primary-text-color)",
            sma100dist != null
              ? `&nbsp;<span style="color:${sma100dist>=0?"#22c55e":"#ef4444"};font-size:.75rem">${sign(sma100dist)}${fmt(sma100dist)}%</span>`
              : null
          )}
          ${row("SMA 200",
            sma200last != null ? `${fmt(sma200last, 2)} €` : "–",
            "var(--primary-text-color)",
            sma200dist != null
              ? `&nbsp;<span style="color:${sma200dist>=0?"#22c55e":"#ef4444"};font-size:.75rem">${sign(sma200dist)}${fmt(sma200dist)}%</span>`
              : null
          )}
        </div>

        ${divider()}

        <div class="info-section">
          <div class="info-sec-title">Analysten${anzahl ? ` (${anzahl})` : ""}</div>
          ${row("Konsens",
            konsens || "–", konsensClr)}
          ${row("Kursziel Ø", kzMittel != null ? `${fmt(kzMittel)} €` : "–")}
          ${row("Kursziel Hoch", kzHoch != null ? `${fmt(kzHoch)} €` : "–", "#22c55e")}
          ${row("Kursziel Tief", kzTief != null ? `${fmt(kzTief)} €` : "–", "#ef4444")}
          ${row("Upside", upside != null ? `${sign(upside)}${fmt(upside)}%` : "–",
            upside != null ? (upside >= 0 ? "#22c55e" : "#ef4444") : "var(--secondary-text-color)")}
        </div>

      </div>`;
  }

  // ── Lade-Logik ───────────────────────────────────────────────────────────

  async _loadAndRender() {
    const st   = this._st;
    const isin = this._currentIsin();
    if (!st.symbol || this._loading) return;
    this._loading = true;
    this._render();
    this._prices = await this._fetchHistory(st.symbol, isin);
    this._loading = false;
    this._render();
  }

  // ── Render ───────────────────────────────────────────────────────────────

  _render() {
    if (!this._hass || !_chartState.has(this._uid)) return;

    const title      = (this._config || {}).title || "Kursverlauf";
    const st         = this._st;
    const portfolios = this._portfolios();
    const curPort    = st.portfolio || portfolios[0] || "";
    const stocks     = this._stocksForPortfolio(curPort);
    const curSym     = st.symbol || stocks[0]?.kuerzel || "";
    const curStock   = stocks.find(s => s.kuerzel === curSym) || stocks[0];
    const isin       = curStock?.isin || null;

    const btn = (active, label, id) =>
      `<button class="ind-btn${active ? " active" : ""}"
         onclick="this.getRootNode().host._toggle('${id}')">${label}</button>`;

    // Kursziel-Button nur zeigen wenn Daten vorhanden
    const kzVal = _getSensorAttr(this._hass, curSym, "kursziel_mittel");

    // Chart-Inhalt
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
        <span class="leg-item"><span class="leg-dot" style="background:#aaa"></span>Kurs</span>
        <span class="leg-item"><span class="leg-dash" style="border-color:#f59e0b"></span>Kaufkurs</span>
        ${st.sma100 ? `<span class="leg-item"><span class="leg-dash" style="border-color:#60a5fa"></span>SMA 100</span>` : ""}
        ${st.sma200 ? `<span class="leg-item"><span class="leg-dash" style="border-color:#a78bfa"></span>SMA 200</span>` : ""}
        ${st.trend  ? `<span class="leg-item"><span class="leg-dash" style="border-color:#f59e0b"></span>Trend</span>` : ""}
        ${st.kursziel && kzVal ? `<span class="leg-item"><span class="leg-dash" style="border-color:#22c55e"></span>KZ Ø</span>` : ""}
      </div>`;

    // Info-Panel
    const infoPanel = this._buildInfoPanel(this._prices);

    this.shadowRoot.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Outfit:wght@400;600;700&display=swap');
        :host{display:block}
        ha-card{
          background:var(--ha-card-background,var(--card-background-color,#1c1c27));
          border-radius:16px;overflow:hidden;font-family:'Outfit',sans-serif;padding-bottom:.8rem
        }
        /* Header */
        .header{padding:1.2rem 1.6rem .3rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem}
        .hdr-title{font-size:1.05rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--secondary-text-color)}
        .hdr-name{font-size:1.1rem;font-weight:600;color:var(--primary-text-color);font-family:'DM Mono',monospace}
        /* Selects */
        .selects{display:flex;gap:.6rem;padding:0 1.6rem .4rem;flex-wrap:wrap;align-items:center}
        .sel-label{font-size:.75rem;color:var(--secondary-text-color);font-family:'DM Mono',monospace;flex-shrink:0}
        select{font-size:.82rem;font-family:'Outfit',sans-serif;padding:.28rem .7rem;border-radius:8px;
          border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.07);color:var(--primary-text-color);
          cursor:pointer;outline:none;appearance:none;-webkit-appearance:none;
          background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236b7280'/%3E%3C/svg%3E");
          background-repeat:no-repeat;background-position:right .5rem center;background-size:.6rem;padding-right:1.6rem}
        select:focus{border-color:#3b82f6}
        /* Indikator-Buttons */
        .indicators{display:flex;gap:.4rem;padding:0 1.6rem .5rem;flex-wrap:wrap}
        .ind-label{font-size:.75rem;color:var(--secondary-text-color);font-family:'DM Mono',monospace;align-self:center;flex-shrink:0;margin-right:.2rem}
        .ind-btn{font-size:.75rem;font-family:'DM Mono',monospace;padding:.25rem .65rem;border-radius:6px;
          border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:var(--secondary-text-color);
          cursor:pointer;transition:all .15s;user-select:none}
        .ind-btn:hover{background:rgba(255,255,255,.1);color:var(--primary-text-color)}
        .ind-btn.active{font-weight:700;border-width:1.5px}
        .ind-btn:nth-child(2).active{background:rgba(96,165,250,.2);border-color:#60a5fa;color:#93c5fd}
        .ind-btn:nth-child(3).active{background:rgba(167,139,250,.2);border-color:#a78bfa;color:#c4b5fd}
        .ind-btn:nth-child(4).active{background:rgba(245,158,11,.2);border-color:#f59e0b;color:#fcd34d}
        .ind-btn:nth-child(5).active{background:rgba(34,197,94,.2);border-color:#22c55e;color:#86efac}
        /* Haupt-Layout: Chart + Info nebeneinander */
        .main-layout{display:flex;gap:0;align-items:flex-start}
        /* Chart */
        .chart-wrap{flex:1;min-width:0;padding:0 .6rem 0 1rem}
        .chart-svg{width:100%;height:auto;display:block}
        .axis-lbl{font-family:'DM Mono',monospace;font-size:10px;fill:rgba(255,255,255,.35)}
        .grid-line{stroke:rgba(255,255,255,.06);stroke-width:1}
        .grid-line-v{stroke:rgba(255,255,255,.04);stroke-width:1}
        .price-lbl{font-family:'DM Mono',monospace;font-size:11px;font-weight:500}
        .no-data{height:200px;display:flex;align-items:center;justify-content:center;
          color:var(--secondary-text-color);font-family:'DM Mono',monospace;font-size:.9rem}
        /* Spinner */
        .loading{height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;
          gap:1rem;color:var(--secondary-text-color);font-family:'DM Mono',monospace;font-size:.85rem}
        .spinner{width:2rem;height:2rem;border:2px solid rgba(255,255,255,.1);border-top-color:#3b82f6;
          border-radius:50%;animation:spin .7s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        /* Info-Panel */
        .info-panel{
          width:200px;flex-shrink:0;padding:.4rem 1.2rem .4rem .4rem;
          display:flex;flex-direction:column;gap:0
        }
        .info-section{padding:.3rem 0}
        .info-sec-title{font-size:.65rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
          color:var(--secondary-text-color);margin-bottom:.3rem;padding-bottom:.2rem;
          border-bottom:1px solid rgba(255,255,255,.06)}
        .kz-row{display:flex;justify-content:space-between;align-items:baseline;
          gap:.4rem;padding:.12rem 0}
        .kz-label{font-size:.72rem;color:var(--secondary-text-color);font-family:'Outfit',sans-serif;
          flex-shrink:0;white-space:nowrap}
        .kz-value{font-size:.78rem;font-family:'DM Mono',monospace;font-weight:500;
          text-align:right;white-space:nowrap}
        .kz-sub{font-size:.68rem}
        .kz-divider{height:1px;background:rgba(255,255,255,.05);margin:.1rem 0}
        /* Legende */
        .legend{display:flex;gap:1rem;padding:.4rem 1.6rem 0;flex-wrap:wrap}
        .leg-item{display:flex;align-items:center;gap:.35rem;font-size:.72rem;
          color:var(--secondary-text-color);font-family:'DM Mono',monospace}
        .leg-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
        .leg-dash{width:18px;height:0;border-bottom:2px dashed;flex-shrink:0}
      </style>
      <ha-card>
        <div class="header">
          <div class="hdr-title">${title}</div>
          ${curStock ? `<div class="hdr-name">${curStock.bezeichnung}${isin ? ` <span style="opacity:.4;font-size:.75rem">${isin}</span>` : ""}</div>` : ""}
        </div>

        <div class="selects">
          <span class="sel-label">Portfolio:</span>
          <select onchange="this.getRootNode().host._selectPortfolio(this.value)">
            ${portfolios.map(p => `<option value="${p}" ${p===curPort?"selected":""}>${p}</option>`).join("")}
          </select>
          <span class="sel-label">Aktie:</span>
          <select onchange="this.getRootNode().host._selectSymbol(this.value)">
            ${stocks.map(s => `<option value="${s.kuerzel}" ${s.kuerzel===curSym?"selected":""}>${s.bezeichnung} (${s.kuerzel})</option>`).join("")}
          </select>
        </div>

        <div class="indicators">
          <span class="ind-label">Indikatoren:</span>
          ${btn(st.sma100, "SMA 100", "sma100")}
          ${btn(st.sma200, "SMA 200", "sma200")}
          ${btn(st.trend,  "Trend",   "trend")}
          ${kzVal ? btn(st.kursziel, "Kursziel", "kursziel") : ""}
        </div>

        <div class="main-layout">
          <div class="chart-wrap">${chartContent}</div>
          ${infoPanel}
        </div>

        ${legend}
      </ha-card>`;
  }

  // ── Event Handler ─────────────────────────────────────────────────────────

  _selectPortfolio(portfolio) {
    this._set("portfolio", portfolio);
    const stocks = this._stocksForPortfolio(portfolio);
    if (stocks.length > 0) {
      this._set("symbol", stocks[0].kuerzel);
      this._loadedSymbol = null;
      this._prices       = null;
    }
    this._render();
  }

  _selectSymbol(symbol) {
    this._set("symbol", symbol);
    this._loadedSymbol = null;
    this._prices       = null;
    this._render();
  }

  _toggle(key) {
    this._set(key, !this._st[key]);
    this._render();
  }

  getCardSize() { return 9; }
  static getStubConfig() { return { title: "Kursverlauf" }; }
}

customElements.define("my-portfolio-chart-card", MyPortfolioChartCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type:        "my-portfolio-chart-card",
  name:        "Portfolio Kursverlauf",
  description: "Jahreschart mit Kennzahlen-Panel (52W, SMA-Abstände, Analysten)",
});
