/* Live layer for the PDF gaps. Reads the catalog the shop already keeps.
   Does not replace status, pending PO, clearance, or the copilot's answers. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", api.boot);
    else api.boot();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var EVENTS = [
    { name: "Dussehra", date: "2026-10-20", cats: ["Dresses", "Accessories", "Wraps"], lift: 1.35 },
    { name: "Diwali", date: "2026-11-08", cats: ["Dresses", "Accessories", "Wraps"], lift: 1.5 },
    { name: "Christmas", date: "2026-12-25", cats: ["Jackets", "Accessories"], lift: 1.4 },
    { name: "Ugadi", date: "2027-03-19", cats: ["Dresses", "Wraps"], lift: 1.3 }
  ];
  var ALIAS = [
    [/polo|\bcp-330\b/, "CP-330"],
    [/kurti|कुर्त|ಕುರ್ತಿ|\bkt-204\b/, "KT-204"],
    [/sandal|सैंडल|ಸ್ಯಾಂಡ|chappal|\bsd-881\b/, "SD-881"],
    [/sneaker|airsprint|running shoe|\bsh-102\b/, "SH-102"],
    [/scarf|glove|स्कार्फ|\bacc-091\b/, "ACC-091"],
    [/jacket|जैकेट|ಜಾಕೆಟ್|coat|\bjkt-409\b/, "JKT-409"],
    [/jean|denim|जींस|\bjn-204\b/, "JN-204"],
    [/track|jogger|\btp-505\b/, "TP-505"],
    [/linen|\bsh-312\b/, "SH-312"],
    [/tee|t-shirt|टी\s?शर्ट|\bts-088\b|crew/, "TS-088"],
    [/wrap|\bbw-014\b/, "BW-014"]
  ];

  function key() {
    var id = window.MercuraCloud && window.MercuraCloud.uid && window.MercuraCloud.uid();
    return "mercura_live_" + (id || "local");
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(key()) || "") || { orders: [], purchases: [] }; }
    catch (e) { return { orders: [], purchases: [] }; }
  }
  function save(state) {
    localStorage.setItem(key(), JSON.stringify(state));
    if (window.MercuraCloud && window.MercuraCloud.schedulePush) window.MercuraCloud.schedulePush();
  }

  function dailyRate(sku, history, now) {
    var clock = now ? new Date(now) : new Date();
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
    var n = Object.keys(days).length;
    if (n >= 7) return qty / n;
    return Number(sku.vel) || 0;
  }

  function reorderQty(sku, rate) {
    if (!sku || sku.locked) return 0;
    if ((Number(sku.units) || 0) <= 0) {
      if (sku.status !== "reorder") return 0;
      var emptyRate = Math.max(Number(rate) || Number(sku.vel) || 0, 0.05);
      return Math.max(Number(sku.moq) || 1, Math.ceil(emptyRate * ((Number(sku.lead) || 7) + 14)));
    }
    var per = Math.max(Number(rate) || 0, 0.05);
    var cover = sku.units / per;
    var lead = Number(sku.lead) || 7;
    if (cover >= lead && sku.status !== "critical" && sku.status !== "low") return 0;
    var need = Math.ceil(per * (lead + 14) - sku.units);
    if (need <= 0) return 0;
    return Math.max(Number(sku.moq) || 1, need);
  }

  // ponytail: fixed weights until salesHistory covers a few weeks. Then refit offline and replace these four numbers.
  function riskScore(sku) {
    var price = Number(sku.listPrice || sku.price) || 1;
    var age = Math.min((Number(sku.age) || 0) / 120, 1);
    var slow = 1 - Math.min(Number(sku.vel) || 0, 5) / 5;
    var thin = 1 - Math.max(0, Math.min(1, (price - (Number(sku.cost) || 0)) / price));
    var cover = Math.min((Number(sku.days) || 0) / 180, 1);
    var z = -1.2 + 2.4 * age + 1.8 * slow + 0.4 * thin + 1.6 * cover;
    return Math.round(100 / (1 + Math.exp(-z)));
  }

  function recovery(sku) {
    var price = Number(sku.listPrice || sku.price) || 0;
    return [0.1, 0.15, 0.2].map(function (rate) {
      var units = Math.min(sku.units, (Number(sku.vel) || 0) * (1 + rate * 3) * 30);
      return { rate: rate, units: Math.round(units * 10) / 10, cash: Math.round(units * price * (1 - rate)) };
    });
  }

  function festival(skus, now) {
    var clock = now ? new Date(now) : new Date();
    var hit = null;
    EVENTS.forEach(function (event) {
      var when = new Date(event.date + "T00:00:00");
      var days = Math.round((when.getTime() - clock.getTime()) / 86400000);
      if (days < 0 || days > 14) return;
      if (!hit || days < hit.days) hit = { name: event.name, days: days, cats: event.cats, lift: event.lift };
    });
    if (!hit) return null;
    var rows = (skus || []).filter(function (s) { return hit.cats.indexOf(s.cat) >= 0 && s.units > 0; });
    return {
      name: hit.name,
      days: hit.days,
      lift: hit.lift,
      rows: rows.map(function (s) {
        var rate = (Number(s.vel) || 0) * hit.lift;
        return { id: s.id, name: s.name, qty: reorderQty(Object.assign({}, s, { status: "low" }), rate) };
      })
    };
  }

  function advice(sku, rate) {
    var qty = reorderQty(sku, rate);
    if (sku.status === "reorder") {
      return { kind: "reorder", qty: qty, text: "Reorder " + qty + " of " + sku.name + ". It is sold out." };
    }
    if (sku.status === "dead" || sku.status === "risk") {
      return { kind: "discount", qty: 0, text: "Discount " + sku.name + ". Do not reorder. " + Math.round(sku.value || 0) + " is tied up." };
    }
    if (qty > 0) return { kind: "reorder", qty: qty, text: "Reorder " + qty + " of " + sku.name + " before the " + (sku.lead || 7) + "-day lead time." };
    return { kind: "hold", qty: 0, text: "Leave " + sku.name + ". Cover is " + (sku.units <= 0 ? "none" : (Number(sku.days) || 0).toFixed(1) + " days") + "." };
  }

  function ranks(skus) {
    var rows = (skus || []).map(function (s) {
      var price = Number(s.listPrice || s.price) || 0;
      return { id: s.id, name: s.name, sold: Number(s.sold) || 0, vel: Number(s.vel) || 0, profit: Math.round((Number(s.sold) || 0) * (price - (Number(s.cost) || 0))) };
    });
    return {
      demand: rows.slice().sort(function (a, b) { return b.sold - a.sold || b.vel - a.vel; }).slice(0, 5),
      profit: rows.slice().sort(function (a, b) { return b.profit - a.profit || b.sold - a.sold; }).slice(0, 5)
    };
  }

  function book(skus, history, now) {
    var rows = (skus || []).map(function (s) {
      var rate = dailyRate(s, history, now);
      var say = advice(s, rate);
      return { sku: s, rate: Math.round(rate * 10) / 10, score: riskScore(s), advice: say, recovery: recovery(s) };
    });
    return { rows: rows, ranks: ranks(skus), festival: festival(skus, now) };
  }

  function parseCommand(text, skus) {
    var q = String(text || "").trim();
    if (!q) return null;
    if (/how|what|which|why|when|कितन|क्या|कैसे|ಎಷ್ಟ|ಯಾವ|\?/.test(q)) return null;
    var sale = /sold|sale|\bbech|\bbika|बेच|बिक|ಮಾರಾಟ/.test(q);
    var buy = /bought|buy|kharid|खरीद|received|add stock|stock in/.test(q);
    if (!sale && !buy) return null;
    var qty = parseInt((q.match(/\d+/) || [])[0], 10);
    if (!qty) return null;
    var id = null;
    var low = q.toLowerCase();
    ALIAS.forEach(function (pair) { if (!id && pair[0].test(low)) id = pair[1]; });
    if (!id) {
      (skus || []).some(function (s) {
        if (low.indexOf(String(s.name).toLowerCase()) >= 0 || low.indexOf(String(s.id).toLowerCase()) >= 0) { id = s.id; return true; }
        return false;
      });
    }
    if (!id) return null;
    return { type: sale ? "sale" : "buy", id: id, qty: qty };
  }

  function parseInvoice(text, skus) {
    var items = [];
    String(text || "").split(/\n/).forEach(function (line) {
      var low = line.toLowerCase();
      var nums = line.match(/\d+(?:\.\d+)?/g);
      if (!nums) return;
      var best = null;
      var bestN = 0;
      (skus || []).forEach(function (s) {
        var words = String(s.name).toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 5; });
        var n = words.filter(function (w) { return low.indexOf(w) >= 0; }).length + (low.indexOf(String(s.id).toLowerCase()) >= 0 ? 2 : 0);
        if (n > bestN) { bestN = n; best = s; }
      });
      if (!best || bestN < 1) return;
      var qty = Math.max(1, parseInt(nums[0], 10) || 1);
      var cost = nums.length > 1 ? Number(nums[1]) : best.cost;
      var price = nums.length > 2 ? Number(nums[2]) : (best.listPrice || best.price);
      items.push({ name: best.name, sku: best.id, qty: qty, cost: cost, price: price });
    });
    return items;
  }

  function boot() {
    var M = window.Mercura;
    var store = window.MercuraStore;
    if (!M || !store || document.getElementById("live-root")) return;
    var marker = document.createElement("i");
    marker.id = "live-root";
    marker.hidden = true;
    document.body.appendChild(marker);

    function inr(n) { return M.inr(n); }
    function skus() { return M.catalog(store.engineActions()); }
    function history() { return store.state.salesHistory || []; }
    function state() {
      var s = load();
      s.orders = s.orders || [];
      s.purchases = s.purchases || [];
      return s;
    }

    function mount(frameId) {
      var frame = document.getElementById(frameId);
      if (!frame || document.getElementById("live-" + frameId)) return null;
      var el = document.createElement("section");
      el.id = "live-" + frameId;
      el.className = "rounded-2xl border border-white/10 bg-[#0B1F2A] text-white p-5 space-y-3";
      if (frameId === "frame-dashboard" && frame.lastElementChild) frame.insertBefore(el, frame.lastElementChild);
      else if (frameId === "frame-dashboard") frame.appendChild(el);
      else frame.insertBefore(el, frame.firstChild);
      return el;
    }
    mount("frame-dashboard");
    mount("frame-sales");
    mount("frame-alerts");
    mount("frame-insights");
    mount("frame-cash");

    function render() {
      var data = book(skus(), history(), new Date());
      var live = state();
      paintDashboard(data);
      paintSales(data);
      paintAlerts(data);
      paintInsights(data);
      paintCash(data, live);
      paintPages(data);
    }

    var TONE = { reorder: "#B45309", critical: "#EF4444", low: "#F59E0B", dead: "#EF4444", risk: "#B89628", healthy: "#0EA5A0" };
    var LABEL = { reorder: "Sold out", critical: "Critical", low: "Low stock", dead: "Dead stock", risk: "Slow mover", healthy: "Healthy" };
    var ALERT = { reorder: 1, critical: 1, low: 1 };

    function setText(id, value) { var el = document.getElementById(id); if (el) el.textContent = value; }
    function setHtml(id, value) { var el = document.getElementById(id); if (el) el.innerHTML = value; }
    function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
    function sum(list, fn) { return list.reduce(function (a, x) { return a + (Number(fn(x)) || 0); }, 0); }
    function cover(s) { return s.units <= 0 ? "sold out" : (Number(s.days) || 0).toFixed(1) + " days cover"; }
    function badge(s) {
      var t = TONE[s.status] || "#64748B";
      return "<span class=\"px-2 py-0.5 rounded font-mono text-[10px] font-bold\" style=\"color:" + t + ";background:" + t + "1f\">● " + (LABEL[s.status] || s.status) + "</span>";
    }
    function action(r) {
      var id = esc(r.sku.id);
      if (r.advice.kind === "reorder") return "<button type=\"button\" onclick=\"copySupplierNote('" + id + "')\" class=\"btn-gold px-4 py-2 rounded-xl text-xs font-bold cursor-pointer\">Reorder " + r.advice.qty + "</button>";
      if (r.advice.kind === "discount") return "<button type=\"button\" onclick=\"switchFrame('cash')\" class=\"btn-gold px-4 py-2 rounded-xl text-xs font-bold cursor-pointer\">See cash recovery</button>";
      return "<button type=\"button\" onclick=\"switchFrame('inventory')\" class=\"text-xs font-bold text-[#0EA5A0] hover:underline cursor-pointer\">View inventory →</button>";
    }

    function hubCard(r) {
      var s = r.sku;
      return "<div class=\"glass-card p-5 rounded-2xl flex flex-col justify-between border-t-4 shadow-sm\" style=\"border-top-color:" + (TONE[s.status] || "#64748B") + "\"><div class=\"space-y-3\">"
        + "<div class=\"flex items-center justify-between\">" + badge(s) + "<span class=\"text-[10px] font-mono text-[#94A3B8]\">" + cover(s) + "</span></div>"
        + "<div class=\"flex items-start gap-3\"><img src=\"" + esc(s.img) + "\" alt=\"\" class=\"w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0 shadow-sm\"><div class=\"overflow-hidden\">"
        + "<h4 class=\"font-display font-bold text-sm text-[#1F2937] leading-tight\">" + esc(s.name) + "</h4><span class=\"text-xs text-[#94A3B8] font-mono block mt-0.5\">SKU: " + esc(s.id) + " • " + esc(s.cat) + "</span></div></div>"
        + "<div class=\"bg-slate-100/90 rounded-xl p-3.5 text-xs text-[#1F2937] leading-relaxed border border-slate-200/60\">" + esc(r.advice.text) + "</div></div>"
        + "<div class=\"pt-4 mt-4 border-t border-slate-100 flex items-center justify-between\">" + action(r) + "<span class=\"text-xs font-mono text-[#94A3B8]\">Risk " + r.score + "</span></div></div>";
    }

    function alertCard(r) {
      var s = r.sku;
      var gap = (Number(s.lead) || 7) - (Number(s.days) || 0);
      var note = s.units <= 0 ? "Sold out. Every day without stock is a lost sale."
        : "Runs out in about " + (Number(s.days) || 0).toFixed(1) + " days. The supplier needs " + (s.lead || 7) + " days" + (gap > 0 ? ", so you are " + gap.toFixed(1) + " days short." : ".");
      var call = s.phone ? "<a href=\"tel:" + esc(s.phone) + "\" class=\"text-[#0EA5A0] hover:underline font-medium\">Call " + esc(s.supplier || "supplier") + " · " + esc(s.phone) + "</a>" : "<span class=\"text-[#94A3B8]\">" + esc(s.supplier || "No supplier on file") + "</span>";
      var stat = function (label, value) { return "<div class=\"rounded-xl bg-slate-50 border border-slate-100 p-3\"><span class=\"text-[10px] uppercase text-[#94A3B8] font-bold block\">" + label + "</span><b class=\"text-[#1F2937] text-base\">" + value + "</b></div>"; };
      return "<div class=\"glass-card p-5 sm:p-6 rounded-2xl border-l-4 shadow-sm space-y-4\" style=\"border-left-color:" + (TONE[s.status] || "#64748B") + "\">"
        + "<div class=\"flex items-start gap-4\"><img src=\"" + esc(s.img) + "\" alt=\"\" class=\"w-14 h-14 rounded-xl object-cover border border-slate-200 shrink-0\"><div>"
        + "<div class=\"flex flex-wrap items-center gap-2 mb-1\">" + badge(s) + "<span class=\"font-mono text-xs text-[#94A3B8]\">#" + esc(s.id) + " • " + esc(s.cat) + "</span></div>"
        + "<h3 class=\"font-display font-bold text-base text-[#0B1F2A]\">" + esc(s.name) + "</h3></div></div>"
        + "<div class=\"grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-xs\">" + stat("On hand", s.units + " units") + stat("Selling", r.rate + "/day") + stat("Cover", s.units <= 0 ? "None" : (Number(s.days) || 0).toFixed(1) + " days") + stat("Supplier lead", (s.lead || 7) + " days") + "</div>"
        + "<p class=\"text-sm text-[#4B5563]\">" + note + "</p>"
        + "<div class=\"pt-2 flex flex-wrap items-center justify-between gap-3 text-xs\">" + call + (r.advice.qty > 0 ? action(r) : "") + "</div></div>";
    }

    function moneyRow(s, total) {
      var t = TONE[s.status] || "#64748B";
      var pct = total ? Math.round(s.value / total * 1000) / 10 : 0;
      return "<div class=\"p-3 rounded-xl bg-slate-50/60 border border-slate-100\"><div class=\"flex flex-wrap items-center justify-between gap-2 mb-1.5\"><div class=\"flex items-center gap-2\">"
        + "<span class=\"w-2.5 h-2.5 rounded-full\" style=\"background:" + t + "\"></span><span class=\"font-sans font-bold text-[#1F2937] text-sm\">" + esc(s.name) + " (" + esc(s.id) + ")</span>"
        + "<span class=\"px-2 py-0.5 rounded text-[10px] font-mono font-bold\" style=\"color:" + t + ";background:" + t + "1a\">" + LABEL[s.status] + " · " + s.age + "d old</span></div>"
        + "<div class=\"flex items-center gap-1.5\"><b class=\"text-sm font-extrabold\" style=\"color:" + t + "\">" + inr(s.value) + "</b><span class=\"text-[#94A3B8] font-bold\">(" + pct + "%)</span></div></div>"
        + "<div class=\"h-2.5 bg-slate-100 rounded-full overflow-hidden\"><div class=\"h-full rounded-full\" style=\"width:" + pct + "%;background:" + t + "\"></div></div></div>";
    }

    function healthHtml(groups, total) {
      var offset = 0;
      var arc = "M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831";
      var rings = groups.map(function (g) {
        var pct = total ? g[1] / total * 100 : 0;
        var path = "<path d=\"" + arc + "\" fill=\"none\" stroke=\"" + g[2] + "\" stroke-width=\"3.8\" stroke-dasharray=\"" + pct.toFixed(1) + ", 100\" stroke-dashoffset=\"" + (-offset).toFixed(1) + "\"/>";
        offset += pct;
        return path;
      }).join("");
      var healthy = total ? Math.round(groups[0][1] / total * 100) : 0;
      var bars = groups.map(function (g) {
        var pct = total ? Math.round(g[1] / total * 100) : 0;
        return "<div><div class=\"flex justify-between text-[#1F2937] mb-0.5\"><span class=\"flex items-center gap-1.5\"><span class=\"w-2 h-2 rounded-full\" style=\"background:" + g[2] + "\"></span> " + g[0] + " (" + pct + "%)</span><span class=\"font-bold\">" + plural(g[1], "SKU") + "</span></div>"
          + "<div class=\"w-full bg-slate-100 h-1.5 rounded-full overflow-hidden\"><div class=\"h-full rounded-full\" style=\"width:" + pct + "%;background:" + g[2] + "\"></div></div></div>";
      }).join("");
      return "<div class=\"flex items-center gap-5\"><div class=\"relative w-24 h-24 shrink-0\"><svg viewBox=\"0 0 36 36\" class=\"w-24 h-24 transform -rotate-90\">"
        + "<path d=\"" + arc + "\" fill=\"none\" stroke=\"#E2E8F0\" stroke-width=\"3.8\"/>" + rings + "</svg>"
        + "<div class=\"absolute inset-0 flex flex-col items-center justify-center text-center\"><span class=\"font-mono font-black text-sm text-[#0B1F2A]\">" + healthy + "%</span><span class=\"text-[8px] text-[#0EA5A0] font-bold uppercase -mt-0.5\">Healthy</span></div></div>"
        + "<div class=\"flex-1 space-y-2 font-mono text-[10px]\">" + bars + "</div></div>";
    }

    function paintPages(data) {
      var rows = data.rows;
      var all = rows.map(function (r) { return r.sku; });
      var by = function (st) { return all.filter(function (s) { return st.indexOf(s.status) >= 0; }); };
      var dead = by(["dead"]), slow = by(["risk"]);
      var hour = new Date().getHours();
      setText("live-greeting", hour < 12 ? "Good Morning" : (hour < 17 ? "Good Afternoon" : "Good Evening"));
      setText("d-kpi-risk-count", plural(dead.length + slow.length, "slow or dead SKU"));
      var watch = by(["reorder", "critical", "low"]).length + dead.length + slow.length;
      setText("side-health", !all.length ? "No products yet" : (watch ? plural(watch, "product") + " need attention" : "All products healthy"));

      var deadValue = sum(dead, function (s) { return s.value; });
      var slowValue = sum(slow, function (s) { return s.value; });
      setHtml("dash-health", healthHtml([
        ["Healthy", by(["healthy"]).length, "#0EA5A0"],
        ["Low stock", by(["low", "critical"]).length, "#F59E0B"],
        ["Slow & dead", dead.length + slow.length, "#EF4444"],
        ["Sold out", by(["reorder"]).length, "#94A3B8"]
      ], all.length));
      setText("dash-health-focus", dead.length ? "Recommended focus: clear " + plural(dead.length, "dead product") : "No dead stock to clear");
      setText("dash-health-capital", inr(deadValue) + " capital");

      var urgency = { reorder: 0, critical: 1, dead: 2, low: 3, risk: 4, healthy: 5 };
      var actions = rows.filter(function (r) { return r.advice.kind !== "hold"; }).sort(function (a, b) {
        return (urgency[a.sku.status] - urgency[b.sku.status]) || (b.score - a.score);
      });
      setText("dash-hub-count", plural(actions.length, "recommendation"));
      setHtml("dash-hub-cards", (actions.length ? actions : rows).slice(0, 3).map(hubCard).join(""));

      var stockValue = sum(all, function (s) { return s.value; });
      var healthyValue = sum(by(["healthy"]), function (s) { return s.value; });
      setText("inv-healthy-share", "Working capital locked (" + (stockValue ? Math.round(healthyValue / stockValue * 100) : 0) + "% healthy)");
      setText("inv-dead-note", dead.length ? "Recommend clearance action" : "No dead stock");

      var alerts = rows.filter(function (r) { return ALERT[r.sku.status]; }).sort(function (a, b) { return a.sku.days - b.sku.days; });
      var price = function (s) { return Number(s.listPrice || s.price) || 0; };
      var short = function (r) { return Math.max(0, (Number(r.sku.lead) || 7) - (Number(r.sku.days) || 0)); };
      setText("alerts-kpi-critical", plural(alerts.filter(function (r) { return r.sku.units <= 0 || r.sku.days < 3; }).length, "SKU"));
      setText("alerts-kpi-risk", inr(sum(alerts, function (r) { return r.sku.loss > 0 ? r.sku.loss : short(r) * r.rate * price(r.sku); })));
      setText("alerts-kpi-gap", (alerts.length ? sum(alerts, short) / alerts.length : 0).toFixed(1) + " Days");
      setText("alert-unreviewed-kpi", alerts.length + " New");
      setHtml("alerts-cards", alerts.map(alertCard).join("")
        || "<div class=\"glass-card p-6 rounded-2xl text-sm text-[#4B5563]\">No stock alerts. Every product covers its supplier lead time.</div>");

      var discounts = rows.filter(function (r) { return r.advice.kind === "discount"; });
      setText("ins-kpi-queue", plural(actions.length, "Active Item"));
      setText("ins-kpi-time", "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      setText("ins-kpi-capital", inr(sum(discounts, function (r) { return r.recovery[1].cash; })));
      setText("ins-kpi-capital-note", "Cash back at 15% off across " + plural(discounts.length, "discount action"));
      setText("ins-kpi-urgent", by(["critical", "reorder"]).length + " Urgent");
      setText("ins-kpi-reorder", plural(rows.filter(function (r) { return r.advice.kind === "reorder"; }).length, "Reorder"));

      var sales = sum(all, function (s) { return (s.sold || 0) * price(s); });
      var profit = sum(all, function (s) { return (s.sold || 0) * (price(s) - (Number(s.cost) || 0)); });
      setText("cash-margin", "Margin " + (sales ? (profit / sales * 100).toFixed(1) : "0") + "%");
      setText("cash-pill-dead", "Dead: " + inr(deadValue));
      setText("cash-pill-slow", "Slow: " + inr(slowValue));
      var stuck = dead.concat(slow).sort(function (a, b) { return b.value - a.value; });
      setText("cash-where-note", stuck.length ? plural(stuck.length, "slow or dead product") + ", largest first" : "Nothing slow or dead");
      setHtml("cash-where-rows", stuck.map(function (s) { return moneyRow(s, deadValue + slowValue); }).join("")
        || "<div class=\"text-sm text-[#4B5563]\">No capital is stuck in slow or dead stock.</div>");

      var thumb = document.getElementById("thumb-sku-select");
      if (thumb) {
        var picked = thumb.value;
        thumb.innerHTML = all.map(function (s) { return "<option value=\"" + esc(s.id) + "\">" + esc(s.id) + " • " + esc(s.name) + "</option>"; }).join("");
        if (picked && all.some(function (s) { return s.id === picked; })) thumb.value = picked;
      }
    }

    window.exportCatalogCsv = function (kind) {
      var data = book(skus(), history(), new Date());
      var rows = data.rows.filter(function (r) {
        if (kind === "alerts") return ALERT[r.sku.status];
        if (kind === "actions") return r.advice.kind !== "hold";
        return true;
      });
      var cell = function (v) { return "\"" + String(v == null ? "" : v).replace(/"/g, "\"\"") + "\""; };
      var lines = [["sku", "name", "category", "status", "units", "cost", "price", "per_day", "cover_days", "lead_days", "supplier", "advice"].join(",")]
        .concat(rows.map(function (r) {
          var s = r.sku;
          return [s.id, s.name, s.cat, s.status, s.units, s.cost, s.listPrice || s.price, r.rate, s.units <= 0 ? 0 : (Number(s.days) || 0).toFixed(1), s.lead, s.supplier, r.advice.text].map(cell).join(",");
        }));
      var link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
      link.download = "mercura_" + (kind || "inventory") + "_" + new Date().toISOString().slice(0, 10) + ".csv";
      link.click();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    };

    function paintDashboard(data) {
      var el = document.getElementById("live-frame-dashboard");
      if (!el) return;
      el.innerHTML = "<h2 class=\"font-display font-bold text-lg\">Profit versus demand</h2>"
        + "<p class=\"text-xs text-slate-300\">Same catalog, two sorts. A fast seller and a high-profit seller can be different products.</p>"
        + "<div class=\"grid md:grid-cols-2 gap-4 text-sm\">"
        + col("By units sold", data.ranks.demand.map(function (r) { return r.name + " · " + r.sold + " sold"; }))
        + col("By total profit", data.ranks.profit.map(function (r) { return r.name + " · " + inr(r.profit); }))
        + "</div>";
    }

    function paintSales(data) {
      var el = document.getElementById("live-frame-sales");
      if (!el) return;
      el.innerHTML = "<h2 class=\"font-display font-bold text-lg\">14-day demand forecast</h2>"
        + "<p class=\"text-xs text-slate-300\">Uses the average of logged sale days when a product has 7 or more days in the last fortnight. Otherwise it uses today's velocity.</p>"
        + "<div class=\"grid sm:grid-cols-2 gap-2 text-xs font-mono\">"
        + data.rows.map(function (r) {
          var cover = r.sku.units <= 0 ? "reorder" : (r.sku.units / Math.max(r.rate, 0.05)).toFixed(1) + " days";
          return "<div class=\"rounded-xl bg-white/5 px-3 py-2\">" + r.sku.name + "<br>" + r.rate + "/day · " + cover + "</div>";
        }).join("")
        + "</div>";
    }

    function paintAlerts(data) {
      var el = document.getElementById("live-frame-alerts");
      if (!el) return;
      var f = data.festival;
      el.innerHTML = "<h2 class=\"font-display font-bold text-lg\">Festival demand</h2>"
        + (f
          ? "<p class=\"text-sm\">" + f.name + " is in " + f.days + " days. Demand for " + f.rows.length + " matching products is lifted " + Math.round((f.lift - 1) * 100) + "%.</p>"
            + "<div class=\"text-xs font-mono space-y-1\">" + (f.rows.length ? f.rows.map(function (r) {
              return "<div>" + r.name + " · suggested extra " + r.qty + "</div>";
            }).join("") : "<div>No on-hand stock in those categories.</div>") + "</div>"
          : "<p class=\"text-sm text-slate-300\">No festival inside the next 14 days. The reorder numbers stay on ordinary demand.</p>");
    }

    function paintInsights(data) {
      var el = document.getElementById("live-frame-insights");
      if (!el) return;
      var actions = data.rows.filter(function (r) { return r.advice.kind !== "hold"; });
      el.innerHTML = "<h2 class=\"font-display font-bold text-lg\">Actions from live status</h2>"
        + "<p class=\"text-xs text-slate-300\">Dead or ageing stock is a discount. Cover shorter than the supplier lead time is a reorder. The risk number is a fixed score from age, speed, margin, and cover.</p>"
        + "<div class=\"space-y-2 text-sm\">"
        + (actions.length ? actions : data.rows.slice(0, 3)).map(function (r) {
          return "<div class=\"rounded-xl bg-white/5 px-3 py-2 flex flex-wrap justify-between gap-2\"><span>" + r.advice.text + "</span><span class=\"font-mono text-xs text-[#D4AF37]\">Risk " + r.score + "</span></div>";
        }).join("")
        + "</div>";
    }

    function paintCash(data, live) {
      var el = document.getElementById("live-frame-cash");
      if (!el) return;
      var slow = data.rows.filter(function (r) { return r.sku.status === "dead" || r.sku.status === "risk"; });
      var orders = live.orders.filter(function (o) { return o.status !== "received"; });
      var journal = journalRows(live);
      var balance = journal.reduce(function (a, row) { return a + row.signed; }, 0);
      el.innerHTML = "<h2 class=\"font-display font-bold text-lg\">Cash recovery, orders, and ledger</h2>"
        + "<p class=\"text-xs text-slate-300\">30-day estimate if the slow stock sells at 10%, 15%, or 20% off. Sending a note does not place an order.</p>"
        + (slow.length ? slow.map(function (r) {
          return "<div class=\"text-sm\"><b>" + r.sku.name + "</b><div class=\"font-mono text-xs text-slate-300\">"
            + r.recovery.map(function (c) { return Math.round(c.rate * 100) + "% · " + inr(c.cash); }).join(" · ")
            + "</div></div>";
        }).join("") : "<p class=\"text-sm text-slate-300\">No dead or ageing stock to discount.</p>")
        + "<div class=\"space-y-2\">" + data.rows.filter(function (r) { return r.advice.qty > 0; }).map(function (r) {
          return "<div class=\"flex flex-wrap items-center gap-2 text-sm\"><span class=\"flex-1\">" + r.sku.name + " · " + r.advice.qty + " units</span>"
            + "<button type=\"button\" class=\"px-3 py-1 rounded-lg bg-[#D4AF37] text-[#0B1F2A] text-xs font-bold\" data-live-send=\"" + r.sku.id + "\" data-qty=\"" + r.advice.qty + "\">Send supplier note</button>"
            + "</div>";
        }).join("") + orders.map(function (o) {
          return "<div class=\"flex flex-wrap items-center gap-2 text-xs font-mono\"><span class=\"flex-1\">" + o.sku + " · " + o.qty + " · " + o.status + "</span>"
            + "<button type=\"button\" class=\"px-3 py-1 rounded-lg bg-white/10\" data-live-recv=\"" + o.id + "\">Mark received</button></div>";
        }).join("") + "</div>"
        + "<div class=\"text-sm\">Ledger balance <b class=\"font-mono\">" + inr(balance) + "</b></div>"
        + "<div class=\"text-xs font-mono space-y-1 max-h-40 overflow-auto\">" + (journal.slice(-12).reverse().map(function (row) {
          return "<div>" + row.label + " · " + inr(row.signed) + "</div>";
        }).join("") || "<div>No sales or purchases logged yet.</div>") + "</div>";
    }

    function col(title, lines) {
      return "<div class=\"rounded-xl bg-white/5 p-3\"><div class=\"text-xs uppercase tracking-wide text-[#D4AF37] mb-2\">" + title + "</div>"
        + lines.map(function (line) { return "<div class=\"py-1 border-t border-white/10\">" + line + "</div>"; }).join("") + "</div>";
    }

    function journalRows(live) {
      var rows = (history() || []).map(function (s) {
        return { at: s.timestamp, signed: Number(s.revenue) || 0, label: "Sale " + s.name + " × " + s.qty };
      });
      (live.purchases || []).forEach(function (p) {
        rows.push({ at: p.at, signed: -Math.abs(Number(p.money) || 0), label: "Purchase " + p.name + " × " + p.qty });
      });
      rows.sort(function (a, b) { return a.at - b.at; });
      return rows;
    }

    function sendOrder(id, qty) {
      var sku = skus().find(function (s) { return s.id === id; });
      if (!sku) return;
      var note = M.orderNote(Object.assign({}, sku, { units: sku.units }));
      var live = state();
      live.orders.push({ id: "PO-" + Date.now(), sku: id, name: sku.name, qty: qty, status: "sent", at: Date.now() });
      save(live);
      var phone = String(sku.phone || "").replace(/\D/g, "");
      var url = phone
        ? "https://wa.me/" + phone + "?text=" + encodeURIComponent(note)
        : "mailto:" + (sku.email || "") + "?subject=" + encodeURIComponent("Reorder " + id) + "&body=" + encodeURIComponent(note);
      window.open(url, "_blank", "noopener");
      render();
    }

    function receive(orderId) {
      var live = state();
      var order = live.orders.find(function (o) { return o.id === orderId; });
      if (!order || order.status === "received") return;
      var sku = skus().find(function (s) { return s.id === order.sku; });
      if (!sku) return;
      var cost = Number(sku.cost) || 0;
      store.addProducts([Object.assign({}, sku, { units: sku.units + order.qty, price: sku.listPrice || sku.price })]);
      order.status = "received";
      live.purchases.push({ sku: sku.id, name: sku.name, qty: order.qty, money: Math.round(order.qty * cost), at: Date.now() });
      save(live);
      render();
    }

    document.body.addEventListener("click", function (event) {
      var send = event.target.closest && event.target.closest("[data-live-send]");
      if (send) sendOrder(send.getAttribute("data-live-send"), parseInt(send.getAttribute("data-qty"), 10) || 1);
      var got = event.target.closest && event.target.closest("[data-live-recv]");
      if (got) receive(got.getAttribute("data-live-recv"));
    });

    if (window.MercuraCopilot && window.MercuraCopilot.ask) {
      var origAsk = window.MercuraCopilot.ask.bind(window.MercuraCopilot);
      window.MercuraCopilot.ask = function (raw) {
        var input = document.getElementById("copilot-input");
        var q = String(raw || (input && input.value) || "").trim();
        var cmd = parseCommand(q, skus());
        if (!cmd) return origAsk(raw);
        if (input) input.value = "";
        var reply = act(cmd);
        chat(q, reply);
      };
    }

    function act(cmd) {
      var sku = skus().find(function (s) { return s.id === cmd.id; });
      if (!sku) return "That product is not in the shop.";
      if (cmd.type === "sale") {
        try {
          var sold = store.recordSale(cmd.id, cmd.qty);
          return "Recorded " + sold.qtySold + " " + sku.name + ". " + sold.remainingStock + " left. " + inr(sold.revenue) + ".";
        } catch (e) { return e.message; }
      }
      store.addProducts([Object.assign({}, sku, { units: sku.units + cmd.qty, price: sku.listPrice || sku.price })]);
      var live = state();
      live.purchases.push({ sku: sku.id, name: sku.name, qty: cmd.qty, money: Math.round(cmd.qty * (Number(sku.cost) || 0)), at: Date.now() });
      save(live);
      return "Added " + cmd.qty + " " + sku.name + ". Stock is now " + (sku.units + cmd.qty) + ".";
    }

    function chat(q, reply) {
      var log = document.getElementById("copilot-log");
      if (log) {
        [["you", q], ["bot", reply]].forEach(function (pair) {
          var row = document.createElement("div");
          row.className = pair[0] === "you" ? "ml-8 rounded-2xl bg-[#0B1F2A] text-white px-3 py-2 text-sm" : "mr-8 rounded-2xl bg-white border border-slate-200 text-[#1F2937] px-3 py-2 text-sm";
          row.textContent = pair[1];
          log.appendChild(row);
        });
        log.scrollTop = log.scrollHeight;
      }
      if (window.speechSynthesis) {
        var utter = new SpeechSynthesisUtterance(reply.replace(/[₹,?.!]/g, " "));
        utter.lang = "en-IN";
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
      }
    }

    if (window.handleCustomInvoiceUpload) {
      var origUpload = window.handleCustomInvoiceUpload;
      window.handleCustomInvoiceUpload = function (file) {
        origUpload(file);
        if (!file || !file.type || file.type.indexOf("image/") !== 0) return;
        readInvoice(file);
      };
    }
    if (window.commitOcrToLedger) {
      var origCommit = window.commitOcrToLedger;
      window.commitOcrToLedger = function () {
        var lines = readOcrForm();
        origCommit();
        if (!lines.length) return;
        var live = state();
        lines.forEach(function (line) {
          live.purchases.push({ sku: line.sku, name: line.name, qty: line.qty, money: Math.round(line.qty * line.cost), at: Date.now() });
        });
        save(live);
        render();
      };
    }

    function readOcrForm() {
      var out = [];
      document.querySelectorAll("#ocr-line-items-tbody tr").forEach(function (tr) {
        var name = tr.querySelector(".ocr-item-name") && tr.querySelector(".ocr-item-name").value;
        if (!name) return;
        out.push({
          name: name,
          sku: (tr.querySelector(".ocr-item-sku") && tr.querySelector(".ocr-item-sku").value) || "",
          qty: parseInt(tr.querySelector(".ocr-item-qty") && tr.querySelector(".ocr-item-qty").value, 10) || 1,
          cost: parseFloat(tr.querySelector(".ocr-item-cost") && tr.querySelector(".ocr-item-cost").value) || 0
        });
      });
      return out;
    }

    function readInvoice(file) {
      loadTesseract().then(function (T) { return T.recognize(file, "eng"); }).then(function (res) {
        var items = parseInvoice(res && res.data && res.data.text, skus());
        if (!items.length) return;
        var tbody = document.getElementById("ocr-line-items-tbody");
        if (!tbody) return;
        tbody.innerHTML = items.map(function (item) {
          return "<tr class=\"border-b border-slate-100 text-xs\"><td class=\"py-2 px-2\"><input class=\"ocr-item-name w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs\" value=\"" + esc(item.name) + "\"></td>"
            + "<td class=\"py-2 px-2\"><input class=\"ocr-item-sku w-20 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono\" value=\"" + esc(item.sku) + "\"></td>"
            + "<td class=\"py-2 px-2\"><input type=\"number\" class=\"ocr-item-qty w-16 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono text-right\" value=\"" + item.qty + "\"></td>"
            + "<td class=\"py-2 px-2\"><input type=\"number\" class=\"ocr-item-cost w-20 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono text-right\" value=\"" + item.cost + "\"></td>"
            + "<td class=\"py-2 px-2\"><input type=\"number\" class=\"ocr-item-price w-20 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono text-right\" value=\"" + item.price + "\"></td>"
            + "<td class=\"py-2 px-2 text-center\"><button type=\"button\" onclick=\"this.closest('tr').remove();\" class=\"text-rose-500 text-sm\">✕</button></td></tr>";
        }).join("");
        if (window.showToast) window.showToast("Read " + items.length + " lines from the photo");
      }).catch(function () {});
    }

    function loadTesseract() {
      if (window.Tesseract) return Promise.resolve(window.Tesseract);
      return new Promise(function (ok, err) {
        var script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
        script.onload = function () { ok(window.Tesseract); };
        script.onerror = err;
        document.head.appendChild(script);
      });
    }

    function esc(s) {
      return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    }

    store.subscribe(function () { render(); });
    render();
    window.MercuraLive = {
      sendOrder: sendOrder, receive: receive, render: render,
      dailyRate: dailyRate, riskScore: riskScore, festival: festival, recovery: recovery
    };
  }

  return { book: book, parseCommand: parseCommand, parseInvoice: parseInvoice, reorderQty: reorderQty, riskScore: riskScore, festival: festival, dailyRate: dailyRate, boot: boot };
});
