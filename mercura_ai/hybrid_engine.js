/* Local catalog formulas paint first; Google Gemini (/api/ai/decide) replaces them when it answers. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", api.boot);
    else api.boot();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var FALLBACK = "Edge-Fallback (Local Deterministic Engine)";
  var EVENTS = [
    { name: "Dussehra", date: "2026-10-20", cats: ["Dresses", "Accessories", "Wraps"], lift: 1.35 },
    { name: "Diwali", date: "2026-11-08", cats: ["Dresses", "Accessories", "Wraps"], lift: 1.5 },
    { name: "Christmas", date: "2026-12-25", cats: ["Jackets", "Accessories"], lift: 1.4 },
    { name: "Ugadi", date: "2027-03-19", cats: ["Dresses", "Wraps"], lift: 1.3 }
  ];

  function live() {
    return typeof window !== "undefined" ? window.MercuraLive : null;
  }

  function dailyRate(sku, history, now) {
    var L = live();
    if (L) return L.dailyRate(sku, history, now);
    var clock = now || new Date();
    var start = clock.getTime() - 14 * 86400000;
    var qty = 0;
    var days = {};
    (history || []).forEach(function (row) {
      if (row.sku !== sku.id) return;
      var ts = Number(row.timestamp) || 0;
      if (ts < start || ts > clock.getTime()) return;
      qty += Number(row.qty) || 0;
      var d = new Date(ts);
      d.setHours(0, 0, 0, 0);
      days[d.getTime()] = 1;
    });
    if (Object.keys(days).length >= 7) return qty / Object.keys(days).length;
    return Number(sku.vel) || 0;
  }

  function festivalFor(sku, now) {
    var L = live();
    if (L) {
      var hit = L.festival([sku], now);
      if (hit && hit.rows.some(function (r) { return r.id === sku.id; })) return hit;
      return null;
    }
    var clock = now || new Date();
    var best = null;
    EVENTS.forEach(function (event) {
      var days = Math.round((new Date(event.date + "T00:00:00").getTime() - clock.getTime()) / 86400000);
      if (days < 0 || days > 14 || event.cats.indexOf(sku.cat) < 0) return;
      if (!best || days < best.days) best = { name: event.name, days: days, lift: event.lift };
    });
    return best;
  }

  function tags(sku, now, fest) {
    var out = [];
    if (fest) out.push(fest.name);
    if ((Number(sku.clearance) || 0) >= 0.1) out.push(Math.round(sku.clearance * 100) + "% Clearance");
    var day = (now || new Date()).getDay();
    if (day === 0 || day === 6) out.push("Weekend Counter Promo");
    return out;
  }

  function regimeOf(mult) {
    if (mult > 2) return "HIGH_SURGE";
    if (mult >= 1.2) return "MODERATE_GROWTH";
    if (mult < 0.7) return "SLUMP";
    return "STABLE";
  }

  function forecastFallback(sku, history, now) {
    var base = dailyRate(sku, history, now);
    var fest = festivalFor(sku, now);
    var lift = fest ? fest.lift : 1;
    return {
      source: FALLBACK,
      regime: regimeOf(lift),
      confidence: null,
      baseline: Math.round(base * 10) / 10,
      rate: Math.round(base * lift * 10) / 10,
      events: tags(sku, now, fest),
      review: false
    };
  }

  function riskOf(sku) {
    var L = live();
    if (L) return L.riskScore(sku);
    var price = Number(sku.listPrice || sku.price) || 1;
    var age = Math.min((Number(sku.age) || 0) / 120, 1);
    var slow = 1 - Math.min(Number(sku.vel) || 0, 5) / 5;
    var thin = 1 - Math.max(0, Math.min(1, (price - (Number(sku.cost) || 0)) / price));
    var cover = Math.min((Number(sku.days) || 0) / 180, 1);
    var z = -1.2 + 2.4 * age + 1.8 * slow + 0.4 * thin + 1.6 * cover;
    return Math.round(100 / (1 + Math.exp(-z)));
  }

  function cashAt(sku, rate) {
    var L = live();
    if (L) {
      var row = L.recovery(sku).filter(function (r) { return Math.abs(r.rate - rate) < 0.001; })[0];
      if (row) return row;
    }
    var price = Number(sku.listPrice || sku.price) || 0;
    var units = Math.min(sku.units, (Number(sku.vel) || 0) * (1 + rate * 3) * 30);
    return { rate: rate, units: Math.round(units * 10) / 10, cash: Math.round(units * price * (1 - rate)) };
  }

  function deadFallback(sku, history, now) {
    var score = riskOf(sku);
    var rate = score >= 90 ? 0.2 : score >= 50 ? 0.15 : 0.1;
    var row = cashAt(sku, rate);
    var fest = festivalFor(sku, now);
    return {
      source: FALLBACK,
      probability: score,
      markdown: rate,
      confidence: null,
      cash: row.cash,
      days: row.units ? Math.round(row.units / Math.max(Number(sku.vel) || 0.05, 0.05)) : 0,
      review: Math.min(score / 100, 1 - score / 100) > 0.2,
      context: sku.cat === "Jackets"
        ? "Seasonal outerwear. A heavy winter jacket in tropical Bengaluru during October is a climate mismatch."
        : "Shelf life follows the category benchmark already in the catalog.",
      events: tags(sku, now, fest)
    };
  }

  function pick(skus) {
    var hot = (skus || []).filter(function (s) {
      return s.status === "dead" || s.status === "risk" || s.status === "low" || s.status === "critical" || s.status === "reorder";
    });
    return (hot.length ? hot : (skus || [])).slice(0, 6);
  }

  function badge(row) {
    if (String(row.source || "").indexOf("Google Gemini") === 0) {
      var pct = Number(row.confidence);
      var shown = isFinite(pct) ? pct.toFixed(1) : (Number(row.probability) || 0).toFixed(1);
      return "<span class=\"inline-flex rounded-full bg-emerald-400/15 text-emerald-200 px-2 py-0.5 text-[10px] font-bold\">AI Telemetry: Google Gemini (" + shown + "% Calibrated)</span>";
    }
    return "<span class=\"inline-flex rounded-full bg-amber-400/15 text-amber-100 px-2 py-0.5 text-[10px] font-bold\">Edge Telemetry: Local Math Engine (Offline Mode)</span>";
  }

  function money(n) {
    if (typeof window !== "undefined" && window.Mercura && window.Mercura.inr) return window.Mercura.inr(n);
    return "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
  }

  function card(row, kind) {
    if (kind === "demand") {
      return "<div class=\"rounded-xl bg-white/5 px-3 py-2 text-sm\"><div class=\"flex flex-wrap justify-between gap-2\"><b>" + row.name + "</b>" + badge(row) + "</div>"
        + "<div class=\"font-mono text-xs text-slate-300 mt-1\">" + row.regime + " · " + row.rate + "/day"
        + (row.events && row.events.length ? " · " + row.events.join(", ") : "")
        + (row.review ? " · merchant review" : "") + "</div></div>";
    }
    return "<div class=\"rounded-xl bg-white/5 px-3 py-2 text-sm\"><div class=\"flex flex-wrap justify-between gap-2\"><b>" + row.name + "</b>" + badge(row) + "</div>"
      + "<div class=\"font-mono text-xs text-slate-300 mt-1\">P(dead) " + Number(row.probability).toFixed(1) + "% · " + Math.round(row.markdown * 100) + "% off · " + money(row.cash)
      + " · " + row.days + " days" + (row.review ? " · merchant review" : "") + "</div>"
      + "<div class=\"text-xs text-slate-400 mt-1\">" + (row.context || "") + "</div></div>";
  }

  function host(frameId) {
    var frame = document.getElementById(frameId);
    if (!frame) return null;
    var el = document.getElementById("hybrid-" + frameId);
    if (el) return el;
    el = document.createElement("section");
    el.id = "hybrid-" + frameId;
    el.className = "rounded-2xl border border-white/10 bg-[#0B1F2A] text-white p-5 space-y-3 mb-4";
    var liveEl = document.getElementById(frameId === "frame-dashboard" ? "dash-greeting" : "live-" + frameId);
    if (liveEl) liveEl.insertAdjacentElement("afterend", el);
    else frame.insertBefore(el, frame.firstChild);
    return el;
  }

  function paint(pack) {
    var demandHtml = "<h2 class=\"font-display font-bold text-lg\">Demand forecast</h2>"
      + pack.forecasts.map(function (row) { return card(row, "demand"); }).join("");
    var deadHtml = "<h2 class=\"font-display font-bold text-lg\">Dead stock</h2>"
      + pack.dead.map(function (row) { return card(row, "dead"); }).join("");
    var dash = host("frame-dashboard");
    var insights = host("frame-insights");
    var page = document.getElementById("mercura-hybrid");
    if (dash) dash.innerHTML = demandHtml;
    if (insights) insights.innerHTML = deadHtml;
    if (!dash && !insights && page) page.innerHTML = "<div class=\"rounded-2xl bg-[#0B1F2A] text-white p-5 space-y-3\">" + demandHtml + deadHtml + "</div>";
  }

  function historyOf() {
    if (typeof window !== "undefined" && window.MercuraStore) return window.MercuraStore.state.salesHistory || [];
    try {
      var saved = JSON.parse(localStorage.getItem("mercura_store_v3") || "");
      return (saved && saved.salesHistory) || [];
    } catch (e) { return []; }
  }

  function skusOf() {
    if (typeof window === "undefined" || !window.Mercura) return Promise.resolve([]);
    if (window.MercuraStore) return Promise.resolve(window.Mercura.catalog(window.MercuraStore.engineActions()));
    return fetch("data/catalog.json").then(function (res) { return res.json(); }).then(function (raw) {
      window.Mercura.replaceCatalog(raw);
      var saved = {};
      try { saved = JSON.parse(localStorage.getItem("mercura_store_v3") || "") || {}; } catch (e) {}
      return window.Mercura.catalog({
        clearance: saved.clearance || {},
        locked: saved.locked || {},
        reviewed: {}, snooze: {}, dismissed: {}, accepted: {}, added: saved.added || [], log: []
      });
    }).catch(function () { return []; });
  }

  function refresh() {
    var now = new Date();
    return skusOf().then(function (skus) {
      var list = pick(skus);
      var history = historyOf();
      if (!list.length) return;
      var forecasts = [];
      var dead = [];
      list.forEach(function (sku) {
        var forecastRow = forecastFallback(sku, history, now);
        var deadRow = deadFallback(sku, history, now);
        forecastRow.name = sku.name;
        deadRow.name = sku.name;
        forecasts.push(forecastRow);
        dead.push(deadRow);
      });
      paint({ forecasts: forecasts, dead: dead });
      var body = JSON.stringify({ skus: list.map(function (sku, i) {
        return {
          id: sku.id, name: sku.name, cat: sku.cat, age: sku.age, days: sku.days, units: sku.units,
          price: Number(sku.listPrice || sku.price) || 0,
          capital: Math.round((Number(sku.units) || 0) * (Number(sku.cost) || 0)),
          baseline: forecasts[i].baseline, events: forecasts[i].events
        };
      }) });
      return askModel(body).then(function (pack) {
        if (!pack) return;
        function merge(rows, fresh) {
          return rows.map(function (row, i) {
            var hit = (fresh || []).filter(function (r) { return r.id === list[i].id; })[0];
            if (!hit) return row;
            hit.name = row.name;
            if (!hit.events) hit.events = row.events;
            return hit;
          });
        }
        paint({ forecasts: merge(forecasts, pack.forecasts), dead: merge(dead, pack.dead) });
      });
    });
  }

  var asked = { body: null, pack: null };
  function askModel(body) {
    var token = localStorage.getItem("mercura_pg_token") || sessionStorage.getItem("mercura_pg_token");
    if (!token || typeof fetch !== "function") return Promise.resolve(null);
    // Store saves fire refresh() often; only call Gemini again when the products sent actually change.
    if (asked.body === body) return asked.pack;
    asked.body = body;
    asked.pack = fetch("/api/ai/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: body
    }).then(function (res) { return res.ok ? res.json() : null; }).catch(function () { return null; }).then(function (pack) {
      if (!pack) asked.body = null;
      return pack;
    });
    return asked.pack;
  }

  function boot() {
    if (typeof document === "undefined") return;
    refresh();
    if (window.MercuraStore && window.MercuraStore.subscribe) window.MercuraStore.subscribe(function () { refresh(); });
  }

  return { boot: boot, forecastFallback: forecastFallback, deadFallback: deadFallback, regimeOf: regimeOf, refresh: refresh };
});
