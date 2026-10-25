(function () {
  var M = window.Mercura;
  var KEY = "mercura-ledger-v1";
  var root = document.getElementById("root");
  var ui = {
    channel: "all",
    q: "",
    inv: "all",
    alert: "all",
    rec: "all",
    sort: "catalog",
    cat: "all",
    page: 1,
    modal: null,
    toast: "",
    showPassword: false,
    email: "merchant@retailstore.com"
  };

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || M.emptyActions(); }
    catch (e) { return M.emptyActions(); }
  }
  function save(actions) { localStorage.setItem(KEY, JSON.stringify(actions)); }
  function session() { return sessionStorage.getItem("mercura-session"); }

  function route() {
    var parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (!session()) return { name: "login" };
    if (!parts.length) return { name: "dashboard" };
    if (parts[0] === "product") return { name: "product", sku: parts[1] || "JKT-409" };
    return { name: parts[0] };
  }
  function go(name) { location.hash = "#/" + name; }

  function toast(msg) {
    ui.toast = msg;
    render();
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { ui.toast = ""; render(); }, 2400);
  }

  function log(actions, text) {
    actions.log = actions.log || [];
    actions.log.unshift({ t: Date.now(), text: text });
  }

  function skus() { return M.catalog(load()); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function statusLabel(s) {
    return { healthy: "HEALTHY", low: "LOW STOCK", critical: "STOCKOUT", risk: "SLOW", dead: "DEAD STOCK", reorder: "REORDER" }[s] || s;
  }

  function thumb(s, cls) {
    var klass = cls || "thumb";
    if (s && s.img) return '<img class="' + klass + '" alt="' + esc(s.name) + '" src="' + esc(s.img) + '">';
    var letter = s && s.name ? s.name.slice(0, 1) : "M";
    return '<div class="swatch">' + esc(letter) + "</div>";
  }

  function pills(active, items, act) {
    return '<div class="pills">' + items.map(function (it) {
      return '<button class="pill' + (active === it[0] ? " on" : "") + '" data-act="' + act + '" data-id="' + it[0] + '">' + it[1] + "</button>";
    }).join("") + "</div>";
  }

  function navButton(n, here, openAlerts, compact) {
    var badge = n[0] === "alerts" && openAlerts ? '<span class="grow">' + openAlerts + "</span>" : "";
    var copy = compact ? "<b>" + n[2] + "</b>" : "<span class=\"nav-copy\"><b>" + n[2] + "</b><small>" + n[3] + "</small></span>";
    return '<button class="' + (here === n[0] ? "on" : "") + '" data-act="goto" data-id="' + n[0] + '"><span class="material-symbols-outlined">' + n[1] + "</span>" + copy + badge + "</button>";
  }

  function shell(page, actions) {
    var list = skus();
    var openAlerts = M.alerts(list).length;
    var groups = [
      ["Watch", [
        ["dashboard", "dashboard", "Dashboard", "Today’s picture"],
        ["inventory", "inventory_2", "Inventory", list.length + " products"],
        ["sales", "point_of_sale", "Sales", "What moved this month"]
      ]],
      ["Decide", [
        ["alerts", "notification_important", "Stock Alerts", "About to run out"],
        ["insights", "auto_awesome", "AI Insights", "Buy, stop, or discount"],
        ["cash", "payments", "Cash Flow", "Money sitting in stock"]
      ]]
    ];
    var settings = ["settings", "settings", "Settings", "Store and sign out"];
    var here = route().name === "product" ? "inventory" : route().name;
    var titles = { dashboard: "Dashboard", inventory: "Inventory", sales: "Sales", alerts: "Stock Alerts", insights: "AI Insights", cash: "Cash Flow", settings: "Settings", product: "Product" };
    var title = titles[route().name] || "Dashboard";
    var sync = actions.lastSync ? "Just now" : "4 mins ago";
    var trail = route().name === "product"
      ? '<button data-act="goto" data-id="inventory">Inventory</button><span>/</span><b>' + esc(route().sku) + "</b>"
      : "<b>" + title + "</b>";
    return '<div class="app"><aside class="side">' +
      '<div class="brand-row"><img class="logo" alt="Mercura" src="img/logo.png"><div><strong>Mercura AI</strong><span>Driven by AI and controlled by you</span></div></div>' +
      '<nav class="nav">' + groups.map(function (g) {
        return '<p class="nav-label">' + g[0] + "</p>" + g[1].map(function (n) { return navButton(n, here, openAlerts); }).join("");
      }).join("") + '<p class="nav-label">Store</p>' + navButton(settings, here, openAlerts) + "</nav>" +
      '<div class="merchant"><img class="avatar" alt="Rajesh Sharma" src="img/rajesh.jpg"><div><b>Rajesh Sharma</b><small>Pro · Sharma Apparels</small></div></div>' +
      "</aside><div class=\"main\"><header class=\"top\"><div class=\"crumb\"><span class=\"sync\"><span class=\"dot\"></span> Live sync " + sync + "</span><span class=\"slash\">/</span>" + trail + "</div>" +
      '<div class="who"><span class="material-symbols-outlined">notifications</span><img class="avatar" alt="" src="img/rajesh.jpg"> Rajesh S. <span class="tag ok">Pro</span></div></header>' +
      '<div class="page">' + page + "</div></div>" +
      '<nav class="tabbar">' + groups[0][1].concat(groups[1][1], [settings]).map(function (n) { return navButton(n, here, openAlerts, true); }).join("") + "</nav></div>";
  }

  function dashboard(actions) {
    var list = skus();
    var k = M.kpis(list, ui.channel);
    var recs = M.recommendations(list, actions).slice(0, 3);
    var weeks = [0.22, 0.24, 0.26, 0.28].map(function (w) { return Math.round(k.sales * w); });
    var max = Math.max.apply(null, weeks);
    var total = k.healthy + k.low + k.risk + k.dead;
    var parts = [
      ["Healthy", k.healthy, "#22A06B"],
      ["Low stock", k.low, "#F5A623"],
      ["Slow", k.risk, "#ab3500"],
      ["Dead", k.dead, "#E5484D"]
    ];
    return '<div class="head"><div><div class="kicker">Sharma Apparels & Retail</div><h1>Good morning, Rajesh</h1><p class="muted">' + k.total + " active SKUs · Mercura advises. You still place every order.</p></div></div>" +
      pills(ui.channel, [["all", "All Channels"], ["shopify", "Shopify Store"], ["pos", "Offline POS"], ["warehouse", "Warehouse A"]], "channel") +
      '<div class="grid-4">' +
      kpi("Total inventory", M.inr(k.inventoryValue), k.total + " SKUs tracked") +
      kpi("Monthly sales (Oct)", M.inr(k.sales), '<span class="up">↑ 14.2% vs target</span>') +
      kpi("Estimated profit", M.inr(k.profit), "Margin ~30.3%") +
      kpi("Capital at risk", M.inr(k.capital), '<span class="down">Slow and dead stock</span>') +
      "</div>" +
      '<div class="grid-2 section"><section class="card"><h2>Sales & demand</h2><div class="bars">' +
      weeks.map(function (n, i) {
        return "<div><i style=\"height:" + Math.max(8, Math.round(n / max * 110)) + 'px"></i><span>W' + (i + 1) + "<br>" + M.inr(n) + "</span></div>";
      }).join("") + "</div></section>" +
      '<section class="card"><h2>Inventory health</h2><div class="legend">' + parts.map(function (p) {
        var pct = Math.round(p[1] / total * 100);
        return "<div><div class=\"row-between\"><span>" + p[0] + "</span><b>" + pct + "% · " + p[1] + '</b></div><div class="line"><b style="width:' + pct + "%;background:" + p[2] + '"></b></div></div>';
      }).join("") + "</div><p class=\"note\" style=\"margin-top:12px\">Focus: clear " + k.dead + " dead items before November.</p></section></div>" +
      '<div class="section hub"><div><h2 style="margin:0">Mercura action hub</h2><span class="muted">' + recs.length + " recommendations on screen. Nothing is purchased automatically.</span></div>" +
      '<button class="btn small" data-act="goto" data-id="insights">Open queue</button></div>' +
      '<div class="grid-3 section">' + recs.map(card).join("") + "</div>" +
      '<div class="foot"><span>All figures in INR. Built from POS and Shopify velocity.</span><button class="linkish" data-act="export">Download snapshot</button></div>';
  }

  function kpi(label, num, sub) {
    return '<article class="kpi"><div class="label">' + label + '</div><div class="num">' + num + '</div><div class="sub">' + sub + "</div></article>";
  }

  function card(r) {
    var tone = r.kind === "ok" ? "ok" : r.kind === "stock" ? "warn" : "bad";
    var s = skus().filter(function (x) { return x.id === r.id; })[0];
    return '<article class="card"><div class="card-top">' + thumb(s) + "<div><span class=\"tag " + tone + "\">" + esc(r.kind) + "</span><h2>" + esc(r.title) + "</h2><div class=\"sku\">" + esc(r.id) + " · " + esc(r.supplier) + "</div></div></div><p>" + esc(r.note) + "</p><p><b>" + (r.exposure ? M.inr(r.exposure) : "No cash move") + "</b></p><div class=\"tools\"><button class=\"btn small primary\" style=\"width:auto\" data-act=\"accept\" data-id=\"" + r.id + "\">" + esc(r.action) + "</button><button class=\"btn small\" data-act=\"product\" data-id=\"" + r.id + "\">Open</button></div></article>";
  }

  var FACE = {
    "TS-088": { units: 42, monthly: 18, pct: "+14% vel", dir: "up", margin: 32, age: 12, note: "Optimal turnover cycle (21-day velocity)", icon: "verified", tone: "ok", bar: 78, barTone: "ok", status: "HEALTHY", st: "healthy", action: "View" },
    "JN-204": { units: 21, monthly: 7, pct: "Stable", dir: "flat", margin: 26, age: 25, note: "Stable sell-through rate", icon: "show_chart", tone: "ok", bar: 52, barTone: "ok", status: "HEALTHY", st: "healthy", action: "View" },
    "JKT-409": { units: 47, monthly: 2, pct: "−62% vel", dir: "down", margin: 18, age: 63, note: "₹38,000 tied up. Recommend 15% clearance discount.", icon: "paid", tone: "bad", bar: 90, barTone: "bad", status: "DEAD STOCK RISK", st: "dead", action: "Discount", badge: "Critical" },
    "SH-102": { units: 8, monthly: 14, pct: "+28% vel", dir: "up", margin: 28, age: 19, note: "Stockout in ~5 days. Manual reorder note ready.", icon: "alarm", tone: "warn", bar: 18, barTone: "mid", status: "LOW STOCK", st: "low", action: "Reorder" },
    "SH-312": { units: 35, monthly: 12, pct: "+8% vel", dir: "up", margin: 34, age: 18, note: "Healthy sell-through, high margin", icon: "trending_up", tone: "ok", bar: 65, barTone: "ok", status: "HEALTHY", st: "healthy", action: "View" },
    "ACC-091": { units: 29, monthly: 1, pct: "−45% vel", dir: "down", margin: 22, age: 58, note: "58-day storage age. Off-season velocity dip.", icon: "timelapse", tone: "bad", bar: 72, barTone: "bad", status: "DEAD STOCK RISK", st: "dead", action: "View" },
    "TP-505": { units: 6, monthly: 16, pct: "+32% vel", dir: "up", margin: 29, age: 14, note: "High turnover velocity. 4 days cover remaining.", icon: "bolt", tone: "warn", bar: 14, barTone: "mid", status: "LOW STOCK", st: "low", action: "Reorder" }
  };

  function faceOf(s) {
    if (FACE[s.id]) return FACE[s.id];
    var monthly = Math.max(1, Math.round(s.vel * 30));
    var down = s.status === "dead" || s.status === "risk";
    var labels = { healthy: "HEALTHY", low: "LOW STOCK", critical: "LOW STOCK", risk: "DEAD STOCK RISK", dead: "DEAD STOCK RISK" };
    return {
      units: s.units,
      monthly: monthly,
      pct: down ? "−" + (20 + (s.age % 30)) + "% vel" : "+" + (6 + (s.units % 18)) + "% vel",
      dir: down ? "down" : "up",
      margin: Math.round(s.margin * 100),
      age: s.age,
      note: s.status === "reorder" ? "Sold out. Reorder is ready." : s.status === "healthy" ? "Steady sell-through" : s.status === "low" || s.status === "critical" ? "Cover is short. Reorder is your call." : "Capital is sitting. Worth a discount.",
      icon: s.status === "healthy" ? "verified" : s.status === "low" || s.status === "critical" ? "alarm" : "timelapse",
      tone: s.status === "healthy" ? "ok" : s.status === "low" || s.status === "critical" ? "warn" : "bad",
      bar: Math.max(10, Math.min(92, Math.round(s.units / 50 * 100))),
      barTone: s.status === "healthy" ? "ok" : s.status === "low" || s.status === "critical" ? "mid" : "bad",
      status: labels[s.status] || s.status,
      st: s.status === "critical" ? "low" : s.status === "risk" ? "dead" : s.status,
      action: s.status === "reorder" || s.status === "low" || s.status === "critical" ? "Reorder" : s.status === "dead" ? "Discount" : "View"
    };
  }

  function rowAction(s, face) {
    if (face.action === "Discount") return '<button class="btn small danger" data-act="clearance" data-id="' + s.id + '"><span class="material-symbols-outlined">sell</span> Discount</button>';
    if (face.action === "Reorder") return '<button class="btn small warn" data-act="supplier" data-id="' + s.id + '"><span class="material-symbols-outlined">add_shopping_cart</span> Reorder</button>';
    return '<button class="btn small" data-act="product" data-id="' + s.id + '">View</button>';
  }

  function slicePage(rows) {
    var pageSize = 7;
    var pages = Math.max(1, Math.ceil(rows.length / pageSize));
    if (ui.page > pages) ui.page = pages;
    if (ui.page < 1) ui.page = 1;
    var start = (ui.page - 1) * pageSize;
    return { pages: pages, start: start, view: rows.slice(start, start + pageSize) };
  }

  function pager(page, pages, start, count, total) {
    var end = start + count;
    var nums = [1, 2, 3, page - 1, page, page + 1, pages].filter(function (n, i, arr) {
      return n >= 1 && n <= pages && arr.indexOf(n) === i;
    }).sort(function (a, b) { return a - b; });
    var html = '<div class="pager-bar"><p>Showing <b>' + (total ? start + 1 : 0) + "</b> to <b>" + end + "</b> of <b>" + total + "</b> products</p><div class=\"pager\">";
    html += '<button class="page-btn" data-act="page" data-id="' + Math.max(1, page - 1) + '"><span class="material-symbols-outlined">chevron_left</span> Previous</button>';
    var prev = 0;
    nums.forEach(function (n) {
      if (n - prev > 1) html += '<span class="muted">…</span>';
      html += '<button class="page-btn' + (n === page ? " on" : "") + '" data-act="page" data-id="' + n + '">' + n + "</button>";
      prev = n;
    });
    html += '<button class="page-btn" data-act="page" data-id="' + Math.min(pages, page + 1) + '">Next <span class="material-symbols-outlined">chevron_right</span></button></div></div>';
    return html;
  }

  function inventory(actions) {
    var list = M.kpis(skus(), "all");
    var rows = list.shown.filter(function (s) {
      var blob = (s.name + " " + s.id + " " + s.supplier).toLowerCase();
      if (ui.q && blob.indexOf(ui.q.toLowerCase()) === -1) return false;
      if (ui.inv === "all") return true;
      if (ui.inv === "low") return s.status === "low" || s.status === "critical";
      return s.status === ui.inv;
    });
    if (ui.cat !== "all") rows = rows.filter(function (s) { return s.cat === ui.cat; });
    if (ui.sort !== "catalog") {
      rows.sort(function (a, b) {
        if (ui.sort === "age") return b.age - a.age;
        if (ui.sort === "qty") return a.units - b.units;
        if (ui.sort === "vel") return b.vel - a.vel;
        return b.margin - a.margin;
      });
    }
    var cut = slicePage(rows);
    var soon = M.alerts(skus())[0];
    var healthyPct = Math.round(list.healthy / list.total * 100);
    var cats = ["all"];
    list.shown.forEach(function (s) { if (cats.indexOf(s.cat) === -1) cats.push(s.cat); });
    return '<div class="head"><div><div class="title-row"><h1>Inventory Management</h1><span class="live">Live Stream</span></div><p class="muted">Monitor SKU performance, stock age, velocity, and risk across ' + list.total + ' products. Seven on this page, the rest on the next pages.</p></div><div class="tools">' +
      '<button class="btn small" data-act="export"><span class="material-symbols-outlined">file_download</span> Export CSV</button><button class="btn small" data-act="sync"><span class="material-symbols-outlined">sync</span> Sync POS</button><button class="btn small primary" style="width:auto" data-act="add"><span class="material-symbols-outlined">add</span> Add Product</button></div></div>' +
      '<div class="grid-4"><article class="kpi"><div class="kpi-top"><span class="label">Total tracked SKUs</span><span class="ico"><span class="material-symbols-outlined">inventory_2</span></span></div><div class="num">' + list.total + ' <span class="chip ok">Active now</span></div><div class="sub">100% catalog coverage synced</div></article>' +
      '<article class="kpi"><div class="kpi-top"><span class="label">Value in inventory</span><span class="ico"><span class="material-symbols-outlined">account_balance_wallet</span></span></div><div class="num">' + M.inr(list.inventoryValue) + ' <span class="chip ok">+3.8% MoM</span></div><div class="sub">Working capital locked · ' + healthyPct + '% healthy</div></article>' +
      '<article class="kpi"><div class="kpi-top"><span class="label">Dead stock capital</span><span class="ico bad"><span class="material-symbols-outlined">warning</span></span></div><div class="num down">' + M.inr(list.deadCapital) + '</div><div class="sub">1 SKU flagged · recommend clearance</div></article>' +
      '<article class="kpi"><div class="kpi-top"><span class="label">Imminent stockout</span><span class="ico"><span class="material-symbols-outlined">timelapse</span></span></div><div class="num">1 SKU <span class="chip warn">&lt; 5 days cover</span></div><div class="sub">' + (soon ? esc(soon.id) + " runs out Friday" : "None open") + "</div></article></div>" +
      '<div class="toolbar"><div class="search"><span class="material-symbols-outlined">search</span><input id="q" placeholder="Search SKU, product title, barcode…  /" value="' + esc(ui.q) + '"></div>' +
      pills(ui.inv, [["all", "All " + list.total], ["healthy", "Healthy " + list.healthy], ["low", "Low stock " + list.low], ["risk", "Risk " + list.risk], ["dead", "Dead stock " + list.dead]], "inv") +
      '<select class="bare" id="cat">' + cats.map(function (c) { return '<option value="' + esc(c) + '"' + (ui.cat === c ? " selected" : "") + ">" + (c === "all" ? "All categories" : esc(c)) + "</option>"; }).join("") + "</select>" +
      '<select class="bare" id="sort"><option value="catalog"' + (ui.sort === "catalog" ? " selected" : "") + '>Sort by: page order</option><option value="age"' + (ui.sort === "age" ? " selected" : "") + '>Sort by: inventory age</option><option value="qty"' + (ui.sort === "qty" ? " selected" : "") + '>Sort by: stock, lowest first</option><option value="vel"' + (ui.sort === "vel" ? " selected" : "") + '>Sort by: monthly velocity</option><option value="margin"' + (ui.sort === "margin" ? " selected" : "") + ">Sort by: margin</option></select></div>" +
      '<div class="card table-card"><table><thead><tr><th>Product</th><th>Stock</th><th>Monthly sales</th><th>Margin</th><th>Inventory age</th><th>Status</th><th></th></tr></thead><tbody>' +
      cut.view.map(function (s) {
        var f = faceOf(s);
        var arrow = f.dir === "down" ? "arrow_downward" : f.dir === "flat" ? "horizontal_rule" : "arrow_upward";
        return '<tr class="click" data-act="product" data-id="' + s.id + '"><td><div class="prod">' + thumb(s) + "<div><div class=\"name\">" + esc(s.name) + (f.badge ? ' <span class="badge-crit">' + f.badge + "</span>" : "") + "</div><div class=\"sku\">SKU: " + esc(s.id) + " · " + esc(s.cat) + "</div><div class=\"note-line " + f.tone + "\"><span class=\"material-symbols-outlined\">" + f.icon + "</span>" + esc(f.note) + "</div></div></div></td>" +
          "<td><b>" + f.units + '</b> <span class="muted">units</span><div class="meter"><b class="' + f.barTone + '" style="width:' + f.bar + '%"></b></div></td>' +
          "<td><b>" + f.monthly + '</b><div class="vel ' + f.dir + '"><span class="material-symbols-outlined">' + arrow + "</span>" + esc(f.pct) + "</div></td>" +
          "<td>" + f.margin + "%</td><td><span class=\"material-symbols-outlined age-ico\">schedule</span> " + f.age + " days</td>" +
          '<td><span class="status ' + f.st + '">' + f.status + "</span></td><td class=\"act\">" + rowAction(s, f) + "</td></tr>";
      }).join("") +
      "</tbody></table>" + pager(ui.page, cut.pages, cut.start, cut.view.length, rows.length) + "</div>" +
      '<p class="sovereign"><span class="material-symbols-outlined">verified_user</span><span><b>Merchant sovereignty.</b> Mercura advises only. You make every purchase. Auto-purchasing is off.</span></p>';
  }

  function alerts(actions) {
    var all = M.alerts(skus());
    var rows = all.filter(function (s) {
      if (ui.alert === "critical") return s.days < 2;
      if (ui.alert === "moderate") return s.days >= 2;
      return true;
    });
    var revenue = all.reduce(function (a, s) { return a + s.loss; }, 0);
    var gap = all.length ? (all.reduce(function (a, s) { return a + Math.max(0, s.lead - s.days); }, 0) / all.length) : 0;
    var body = rows.length ? rows.map(function (s, i) {
      return '<article class="alert">' + thumb(s, "alert-photo") + '<div class="body"><div class="tag bad">SKU ' + esc(s.id) + "</div><h2>" + esc(s.name) + "</h2><p class=\"muted\">" + esc(s.cat) + "</p>" +
        "<div class=\"metrics\"><div><span class=\"muted\">On hand</span><b>" + s.units + "</b></div><div><span class=\"muted\">Run rate</span><b>" + s.vel.toFixed(1) + "/day</b></div><div><span class=\"muted\">Cover</span><b>" + s.days.toFixed(1) + " days</b></div><div><span class=\"muted\">Revenue at risk</span><b>" + M.inr(s.loss) + "</b></div></div>" +
        '<p class="note">Lead time ' + s.lead + " days. Gap about " + Math.max(0, s.lead - s.days).toFixed(1) + " days. Vendor " + esc(s.supplier) + ". Mercura will not place the order.</p>" +
        '<div class="tools" style="margin-top:10px"><button class="btn small" data-act="supplier" data-id="' + s.id + '">Supplier</button><button class="btn small" data-act="copy" data-id="' + s.id + '">Copy order note</button><button class="btn small" data-act="snooze" data-id="' + s.id + '">Snooze 24h</button><button class="btn small primary" style="width:auto" data-act="review" data-id="' + s.id + '">Mark reviewed</button></div></div></article>';
    }).join("") : '<div class="card"><h2>All stock alerts reviewed</h2><p class="muted">The queue is clear. Restore the sample if you want to run the demo again.</p><button class="btn small" data-act="restore">Restore sample alerts</button></div>';
    return '<div class="head"><div><div class="kicker">Inventory advisory</div><h1>Stock exhaustion alerts</h1></div><div class="tools"><button class="btn small" data-act="review-all">Mark visible reviewed</button><button class="btn small" data-act="export">Export CSV</button></div></div>' +
      '<div class="grid-4"><article class="kpi"><div class="label">Open alerts</div><div class="num">' + all.length + '</div></div>' +
      '<article class="kpi"><div class="label">Revenue at risk</div><div class="num">' + M.inr(revenue) + '</div></div>' +
      '<article class="kpi"><div class="label">Avg lead gap</div><div class="num">' + gap.toFixed(1) + ' days</div></div>' +
      '<article class="kpi"><div class="label">Unreviewed</div><div class="num">' + all.length + "</div></div></div>" +
      pills(ui.alert, [["all", "All (" + all.length + ")"], ["critical", "Critical < 2 days"], ["moderate", "Moderate < 5 days"]], "alert") + body +
      '<p class="foot"><span>Merchant sovereignty: no autonomous buying.</span></p>';
  }

  function insights(actions) {
    var list = skus();
    var recs = M.recommendations(list, actions).filter(function (r) { return ui.rec === "all" || r.kind === ui.rec; });
    var capital = M.kpis(list, "all").capital;
    return '<div class="head"><div><div class="kicker">Actionable queue</div><h1>AI recommendations</h1><p class="muted">Re-evaluated from the same stock book as the dashboard.</p></div></div>' +
      '<div class="grid-3"><article class="kpi"><div class="label">Active items</div><div class="num">' + recs.length + '</div></div>' +
      '<article class="kpi"><div class="label">Capital in play</div><div class="num">' + M.inr(capital) + '</div></div>' +
      '<article class="kpi"><div class="label">Rule</div><div class="num" style="font-size:18px">You decide</div><div class="sub">Accept writes a plan. It never sends a PO.</div></article></div>' +
      pills(ui.rec, [["all", "All"], ["risk", "Risk"], ["stock", "Stock"], ["cash", "Cash"], ["ok", "Hold"]], "rec") +
      '<div class="grid-2">' + recs.map(card).join("") + "</div>";
  }

  function product(actions, id) {
    var s = skus().filter(function (x) { return x.id === id; })[0] || skus()[0];
    var points = [];
    for (var i = 0; i < 12; i++) {
      var fall = (s.status === "dead" || s.status === "risk") ? i * 0.07 : 0;
      points.push(Math.max(0.4, s.vel * 7 * (1 - fall)));
    }
    var max = Math.max.apply(null, points);
    var channels = Object.keys(s.channels).map(function (c) {
      var u = s.channels[c];
      return "<div><div class=\"row-between\"><span>" + c + "</span><b>" + u + " units · " + M.inr(Math.round(u * s.cost)) + "</b></div></div>";
    }).join("");
    return '<button class="btn ghost small" data-act="goto" data-id="inventory">← Inventory</button>' +
      '<div class="product-hero section">' + thumb(s, "hero-photo") + "<div><div class=\"kicker\">" + esc(s.cat) + "</div><h1>" + esc(s.name) + "</h1><div class=\"sku\">#" + esc(s.id) + " · " + esc(s.supplier) + (s.locked ? " · reorders locked" : "") + (s.clearance ? " · " + Math.round(s.clearance * 100) + "% clearance planned" : "") + "</div></div></div>" +
      '<div class="grid-4 section">' +
      kpi("Current stock", s.units + " units", s.days.toFixed(1) + " days of cover") +
      kpi("Inventory value", M.inr(s.value), "Landed cost " + M.inr(s.cost)) +
      kpi("Age", s.age + " days", s.age > 45 ? "Stale" : "In window") +
      kpi("Margin", Math.round(s.margin * 100) + "%", "Retail " + M.inr(s.price)) +
      "</div>" +
      '<div class="grid-2 section"><section class="card"><h2>12-week velocity</h2><div class="bars">' + points.map(function (n, i) {
        return "<div><i style=\"height:" + Math.max(6, Math.round(n / max * 110)) + "px\"></i><span>" + (i + 1) + "</span></div>";
      }).join("") + "</div></section><section class=\"card\"><h2>Where it sits</h2>" + channels +
      "<p class=\"muted\">MOQ " + (s.moq || 20) + " · lead " + s.lead + " days</p></section></div>" +
      '<section class="card section"><span class="tag risk">Why this is the call</span><h2>' + esc(why(s)) + "</h2><p>" + esc(advice(s)) + "</p>" +
      '<div class="tools"><button class="btn small primary" style="width:auto" data-act="clearance" data-id="' + s.id + '">Apply 15% clearance</button>' +
      '<button class="btn small" data-act="lock" data-id="' + s.id + '">Lock reorders</button>' +
      '<button class="btn small" data-act="copy" data-id="' + s.id + '">Copy supplier note</button>' +
      '<button class="btn small" data-act="supplier" data-id="' + s.id + '">Supplier</button></div>' +
      '<p class="muted">Simulation is a plan on this device. It is valid until you reset the demo. No supplier is contacted.</p></section>';
  }

  function why(s) {
    if (s.status === "reorder") return "Sold out. The status is reorder.";
    if (s.status === "dead") return "This pile has barely sold for " + s.age + " days. Buying more would trap another PO in the same season.";
    if (s.status === "critical") return "Cover is " + s.days.toFixed(1) + " days and " + s.supplier + " needs " + s.lead + ". The gap is a stockout, not a guess.";
    if (s.status === "low") return "Under 5 days of cover at the current run rate. Still your call whether to reorder.";
    if (s.status === "risk") return "Capital is sitting. Velocity is too slow for the age of the stock.";
    return "Sell-through matches a healthy retail cycle. Leave the cadence alone.";
  }
  function advice(s) {
    if (s.clearance) return "Clearance is already planned at " + Math.round(s.clearance * 100) + "%. Watch whether units actually start moving before you buy again.";
    if (s.status === "reorder") return "Send the restock order. Nothing is left on the shelf.";
    if (s.status === "dead" || s.status === "risk") return "Plan a 15% markdown or a bundle. Lock reorders until on-hand stock drops.";
    if (s.status === "critical" || s.status === "low") return "Copy the note and call the supplier. Mercura does not send the purchase order.";
    return "No discount and no extra buy this week.";
  }

  function sales() {
    var list = skus().slice().sort(function (a, b) { return b.vel - a.vel; });
    var k = M.kpis(list, ui.channel);
    var cut = slicePage(list);
    return '<div class="head"><div><div class="kicker">October</div><h1>Sales</h1><p class="muted">' + list.length + ' products, fastest sellers first.</p></div></div>' +
      pills(ui.channel, [["all", "All"], ["shopify", "Shopify"], ["pos", "POS"], ["warehouse", "Warehouse"]], "channel") +
      '<div class="grid-3"><article class="kpi"><div class="label">Sales</div><div class="num">' + M.inr(k.sales) + '</div></article>' +
      '<article class="kpi"><div class="label">Profit</div><div class="num">' + M.inr(k.profit) + '</div></article>' +
      '<article class="kpi"><div class="label">Fastest SKU</div><div class="num" style="font-size:18px">' + esc(list[0].name) + "</div><div class=\"sub\">" + list[0].vel.toFixed(1) + " / day</div></article></div>" +
      '<div class="card table-card section"><table><thead><tr><th>SKU</th><th>Velocity</th><th>Cover</th><th>Status</th></tr></thead><tbody>' +
      cut.view.map(function (s) {
        return '<tr class="click" data-act="product" data-id="' + s.id + '"><td><div class="card-top">' + thumb(s) + "<div><div class=\"name\">" + esc(s.name) + "</div><div class=\"sku\">" + s.id + "</div></div></div></td><td>" + s.vel.toFixed(1) + "</td><td>" + s.days.toFixed(1) + "d</td><td><span class=\"status " + s.status + "\">" + statusLabel(s.status) + "</span></td></tr>";
      }).join("") + "</tbody></table>" + pager(ui.page, cut.pages, cut.start, cut.view.length, list.length) + "</div>";
  }

  function cash(actions) {
    var k = M.kpis(skus(), "all");
    var recoverable = skus().filter(function (s) { return s.status === "dead" || s.status === "risk"; }).reduce(function (a, s) { return a + s.value; }, 0);
    var logRows = (actions.log || []).slice(0, 8);
    return '<div class="kicker">Working capital</div><h1>Cash flow</h1>' +
      '<div class="grid-4"><article class="kpi"><div class="label">Locked in stock</div><div class="num">' + M.inr(k.inventoryValue) + '</div></article>' +
      '<article class="kpi"><div class="label">At risk</div><div class="num">' + M.inr(k.capital) + '</div></article>' +
      '<article class="kpi"><div class="label">October profit</div><div class="num">' + M.inr(k.profit) + '</div></article>' +
      '<article class="kpi"><div class="label">Slow stock you can plan</div><div class="num">' + M.inr(recoverable) + "</div></article></div>" +
      '<h2 class="section">Decisions on this device</h2><div class="log">' +
      (logRows.length ? logRows.map(function (row) {
        return "<article><b>" + new Date(row.t).toLocaleString() + "</b><div>" + esc(row.text) + "</div></article>";
      }).join("") : '<article class="muted">No decisions yet. Accept a recommendation or mark an alert reviewed. The cash number moves when you do.</article>') +
      "</div>";
  }

  function settings() {
    var email = session() || "";
    return '<div class="kicker">Store</div><h1>Settings</h1>' +
      '<div class="grid-2"><section class="card"><h2>Sharma Apparels & Retail</h2><p>Signed in as ' + esc(email) + "</p><p>Rajesh Sharma · Pro merchant · Bengaluru</p>" +
      '<div class="tools"><button class="btn small" data-act="logout">Sign out</button><button class="btn small danger" data-act="reset">Reset demo data</button></div></section>' +
      '<section class="card"><h2>Merchant sovereignty</h2><p>Mercura can classify stock, draft a note, and price a clearance. It cannot send a purchase order, change a supplier, or move money.</p>' +
      '<p class="muted">Sample catalog only. No live Shopify or bank connection in this build.</p></section></div>';
  }

  function login() {
    return '<div class="login"><section class="hero"><div><div class="brand-row"><img class="logo" alt="Mercura" src="img/logo.png"><div><strong>Mercura AI</strong><span>Driven by AI and controlled by you</span></div></div>' +
      "<h1>Smarter inventory.<br><em>Better decisions.</em></h1><p class=\"lead\">For a retailer who is tired of finding out a jacket died in the warehouse, or that shoes will stock out before the supplier truck arrives.</p>" +
      '<div class="questions"><article><strong>What is happening?</strong><span>Inventory, sales, profit, and capital at risk.</span></article>' +
      '<article><strong>What is becoming risky?</strong><span>Dead stock and stockouts, with the rupee amount.</span></article>' +
      '<article><strong>What should I do next?</strong><span>A plan you accept. Never an automatic order.</span></article></div></div>' +
      '<div class="hero-foot"><span>Live forecast guardrail</span><span>Auto-order lock: on</span></div></section>' +
      '<section class="panel"><form class="card-login" data-act="signin"><h2>Welcome back</h2><p class="sub">Sharma Apparels & Retail</p>' +
      '<label>Work email</label><div class="field"><span class="material-symbols-outlined">mail</span><input id="email" type="email" value="' + esc(ui.email) + '" required></div>' +
      '<label>Password</label><div class="field"><span class="material-symbols-outlined">lock</span><input id="password" type="' + (ui.showPassword ? "text" : "password") + '" value="supersafepassword123"><button class="eye" type="button" data-act="eye" aria-label="Show password"><span class="material-symbols-outlined">visibility</span></button></div>' +
      '<div class="row-between"><label style="margin:0"><input type="checkbox" checked> Remember this device</label><button type="button" class="linkish" data-act="forgot">Forgot password?</button></div>' +
      '<button class="btn primary" type="submit">Sign in to dashboard</button>' +
      '<div class="split"><button class="sso" type="button" data-act="sso">Shopify</button><button class="sso" type="button" data-act="sso">Google</button></div>' +
      '<p class="hint">Judges: use <button type="button" class="linkish" data-act="demo">demo@retailer.io</button> and sign in. Any password works.</p>' +
      '<div class="trust"><span>Sample data only</span><span>Financially aware AI</span></div></form></section></div>';
  }

  function modal() {
    if (!ui.modal) return "";
    if (ui.modal.type === "supplier") {
      var s = skus().filter(function (x) { return x.id === ui.modal.id; })[0];
      if (!s) return "";
      return '<div class="modal-back" data-act="close"><div class="modal" data-act="stop"><h2>' + esc(s.supplier) + "</h2><p>" + esc(s.name) + " · " + esc(s.id) + "</p><p>" + esc(s.email || "orders@supplier.in") + "<br>" + esc(s.phone || "+91 80 4000 2200") + "</p><p class=\"note\">" + esc(M.orderNote(s)) + '</p><div class="tools"><button class="btn small" data-act="copy" data-id="' + s.id + '">Copy note</button><button class="btn small primary" style="width:auto" data-act="close-modal">Close</button></div></div></div>';
    }
    if (ui.modal.type === "add") {
      return '<div class="modal-back" data-act="close"><form class="modal" data-act="save-product"><h2>Add product</h2>' +
        '<label>Name</label><input class="bare" name="name" required>' +
        '<label>Units on hand</label><input class="bare" name="units" type="number" min="1" value="12" required>' +
        '<label>Landed cost ₹</label><input class="bare" name="cost" type="number" min="1" value="400" required>' +
        '<label>Retail price ₹</label><input class="bare" name="price" type="number" min="1" value="899" required>' +
        '<label>Units sold per day</label><input class="bare" name="vel" type="number" min="0.1" step="0.1" value="1" required>' +
        '<div class="tools" style="margin-top:12px"><button class="btn small" type="button" data-act="close-modal">Cancel</button><button class="btn small primary" style="width:auto" type="submit">Save into catalog</button></div></form></div>';
    }
    return "";
  }

  function page(actions) {
    var r = route();
    if (r.name === "login") return login();
    var inner = {
      dashboard: dashboard,
      inventory: inventory,
      alerts: alerts,
      insights: insights,
      sales: sales,
      cash: cash,
      settings: settings
    }[r.name];
    if (r.name === "product") return shell(product(actions, r.sku), actions);
    if (!inner) return shell(dashboard(actions), actions);
    return shell(inner(actions), actions);
  }

  function render() {
    var actions = load();
    var focus = document.activeElement && document.activeElement.id;
    var pos = focus && document.activeElement.selectionStart;
    root.innerHTML = page(actions) + modal() + (ui.toast ? '<div class="toast">' + esc(ui.toast) + "</div>" : "");
    if (focus) {
      var el = document.getElementById(focus);
      if (el) {
        el.focus();
        if (pos != null && el.setSelectionRange) el.setSelectionRange(pos, pos);
      }
    }
  }

  function mutate(fn) {
    var actions = load();
    fn(actions);
    save(actions);
    render();
  }

  function signIn(email) {
    sessionStorage.setItem("mercura-session", email);
    localStorage.setItem("mercura-user", email);
    go("dashboard");
  }

  root.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]");
    if (!t) return;
    if (t.getAttribute("data-stop") != null && t.getAttribute("data-act") !== "close") return;
    var act = t.getAttribute("data-act");
    var id = t.getAttribute("data-id");
    if (act === "stop" || act === "signin" || act === "save-product") return;
    if (act === "close" || act === "close-modal") {
      if (act === "close" && e.target.closest(".modal")) return;
      ui.modal = null;
      render();
      return;
    }
    if (t.closest("[data-stop]") && act !== "copy" && act !== "close") e.stopPropagation();
    if (act === "goto") { ui.page = 1; return go(id); }
    if (act === "product") return go("product/" + id);
    if (act === "channel") { ui.channel = id; return render(); }
    if (act === "inv") { ui.inv = id; ui.page = 1; return render(); }
    if (act === "page") { ui.page = Number(id); return render(); }
    if (act === "alert") { ui.alert = id; return render(); }
    if (act === "rec") { ui.rec = id; return render(); }
    if (act === "eye") { ui.showPassword = !ui.showPassword; return render(); }
    if (act === "demo") { ui.email = "demo@retailer.io"; return render(); }
    if (act === "forgot") return toast("Reset link stays in the demo. Use any password.");
    if (act === "sso") return signIn("demo@retailer.io");
    if (act === "logout") { sessionStorage.removeItem("mercura-session"); location.hash = ""; return render(); }
    if (act === "reset") {
      localStorage.removeItem(KEY);
      ui.modal = null;
      toast("Demo catalog restored.");
      return;
    }
    if (act === "add") { ui.modal = { type: "add" }; return render(); }
    if (act === "supplier") { ui.modal = { type: "supplier", id: id }; return render(); }
    if (act === "export") return exportCsv();
    if (act === "sync") return mutate(function (a) { a.lastSync = Date.now(); log(a, "POS sync marked. Sample velocities unchanged."); toast("POS synced."); });
    if (act === "copy") return copyNote(id);
    if (act === "review") return mutate(function (a) { a.reviewed[id] = true; log(a, id + " marked reviewed. No order sent."); toast(id + " reviewed"); });
    if (act === "review-all") return mutate(function (a) {
      M.alerts(M.catalog(a)).forEach(function (s) {
        if (ui.alert === "critical" && s.days >= 2) return;
        if (ui.alert === "moderate" && s.days < 2) return;
        a.reviewed[s.id] = true;
      });
      log(a, "Visible stock alerts marked reviewed.");
      toast("Alerts reviewed");
    });
    if (act === "snooze") return mutate(function (a) { a.snooze[id] = Date.now() + 86400000; log(a, id + " snoozed for 24 hours."); toast(id + " snoozed"); });
    if (act === "restore") return mutate(function (a) { a.reviewed = {}; a.snooze = {}; log(a, "Sample alerts restored."); toast("Alerts restored"); });
    if (act === "dismiss") return mutate(function (a) { a.dismissed[id] = true; });
    if (act === "accept" || act === "clearance") return accept(id, act);
    if (act === "lock") return mutate(function (a) { a.locked[id] = true; log(a, id + " reorders locked. Supplier not contacted."); toast("Reorders locked"); });
  });

  root.addEventListener("submit", function (e) {
    var form = e.target;
    if (form.getAttribute("data-act") === "signin") {
      e.preventDefault();
      var email = form.querySelector("#email").value.trim();
      if (email.indexOf("@") === -1) return toast("Enter a work email.");
      ui.email = email;
      return signIn(email);
    }
    if (form.getAttribute("data-act") === "save-product") {
      e.preventDefault();
      var data = Object.fromEntries(new FormData(form).entries());
      mutate(function (a) {
        var id = "NW-" + Math.floor(100 + Math.random() * 900);
        var units = Number(data.units), vel = Number(data.vel), price = Number(data.price);
        var days = units / Math.max(vel, 0.1);
        a.added.push({
          id: id, name: data.name, cat: "Added", supplier: "Manual",
          units: units, cost: Number(data.cost), price: price, vel: vel, age: 3,
          margin: (price - Number(data.cost)) / price, lead: 6,
          loss: days < 5 ? Math.round(price * vel * 2) : 0,
          channels: { shopify: 0, pos: units, warehouse: 0 }
        });
        log(a, id + " " + data.name + " added to the decision catalog.");
      });
      ui.modal = null;
      toast("Product added");
      render();
    }
  });

  root.addEventListener("input", function (e) {
    if (e.target.id === "q") { ui.q = e.target.value; ui.page = 1; render(); }
    if (e.target.id === "sort") { ui.sort = e.target.value; ui.page = 1; render(); }
    if (e.target.id === "cat") { ui.cat = e.target.value; ui.page = 1; render(); }
  });

  function accept(id, act) {
    var before = skus().filter(function (x) { return x.id === id; })[0];
    if (!before) return;
    var stockout = before.status === "critical" || before.status === "low";
    mutate(function (a) {
      if (act === "accept" && stockout) {
        a.reviewed[id] = true;
        log(a, "Reviewed " + id + ". Supplier note copied. No PO sent.");
        return;
      }
      if (act === "clearance" || before.status === "dead" || before.status === "risk") {
        a.clearance[id] = 0.15;
        if (before.status === "dead") a.locked[id] = true;
        log(a, "15% clearance planned for " + id + ". Capital at risk updates. No purchase order sent.");
        return;
      }
      a.accepted[id] = true;
      log(a, id + " stays on its current reorder cadence.");
    });
    if (act === "accept" && stockout) copyNote(id);
    else if (before.status === "healthy" && act !== "clearance") toast("No buy and no discount.");
    else toast("Clearance planned. Nothing was ordered.");
  }

  function copyNote(id) {
    var s = skus().filter(function (x) { return x.id === id; })[0];
    if (!s) return;
    var text = M.orderNote(s);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function () {});
    toast("Supplier note copied. It says this is not an order.");
  }

  function exportCsv() {
    var lines = ["sku,name,units,cover_days,value,status"];
    skus().forEach(function (s) {
      lines.push([s.id, '"' + s.name.replace(/"/g, "") + '"', s.units, s.days.toFixed(1), s.value, s.status].join(","));
    });
    var blob = new Blob([lines.join("\n")], { type: "text/csv" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mercura-inventory.csv";
    a.click();
    toast("CSV downloaded");
  }

  var saved = localStorage.getItem("mercura-user");
  if (saved) ui.email = saved;
  window.addEventListener("hashchange", render);
  if (session() && !location.hash) location.hash = "#/dashboard";
  render();
})();
