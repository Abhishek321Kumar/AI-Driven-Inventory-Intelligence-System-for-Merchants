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
  var KEY = "mercura_live_v1";
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

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "") || { orders: [], purchases: [] }; }
    catch (e) { return { orders: [], purchases: [] }; }
  }
  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
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
    if (!sku || sku.locked || (Number(sku.units) || 0) <= 0) return 0;
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
      frame.insertBefore(el, frame.firstChild);
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
    }

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
          var cover = r.sku.units <= 0 ? "sold out" : (r.sku.units / Math.max(r.rate, 0.05)).toFixed(1) + " days";
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
