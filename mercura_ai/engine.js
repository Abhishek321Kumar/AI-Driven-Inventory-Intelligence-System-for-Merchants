(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Mercura = factory();
})(typeof self !== "undefined" ? self : this, function () {
  // Seed matches data/catalog.json. A fetched file, or an imported sheet, replaces it.
  var RAW = [
    { id: "TS-088", name: "Cotton Crew T-Shirt", cat: "Essentials", supplier: "Sri Krishna Mills", units: 42, cost: 320, price: 499, vel: 2, sold: 18, age: 12, lead: 7, loss: 0, channels: { shopify: 18, pos: 16, warehouse: 8 }, img: "img/ts.jpg" },
    { id: "JN-204", name: "Denim Straight Jeans", cat: "Apparel", supplier: "Indigo Loom", units: 21, cost: 740, price: 1299, vel: 0.84, sold: 7, age: 25, lead: 10, loss: 0, channels: { shopify: 6, pos: 10, warehouse: 5 }, img: "img/jeans.jpg" },
    { id: "JKT-409", name: "Winter Heavy Jacket", cat: "Outerwear", supplier: "Nordic Wear Ltd.", units: 47, cost: 38000 / 47, price: 1499, vel: 0.34, sold: 2, age: 63, lead: 7, loss: 0, channels: { shopify: 0, pos: 15, warehouse: 32 }, img: "img/jacket.jpg", moq: 25 },
    { id: "SH-102", name: "Sports Running Shoes — AirSprint", cat: "Footwear", supplier: "Apex Footwear Ltd.", units: 14, cost: 1100, price: 2499, vel: 8.4, sold: 14, age: 8, lead: 7, loss: 18400, phone: "+91 98201 44821", email: "contact@apexshoes.in", channels: { shopify: 8, pos: 6, warehouse: 0 }, img: "img/shoes.jpg" },
    { id: "SH-312", name: "Linen Casual Shirt", cat: "Apparel", supplier: "Coastal Loom", units: 35, cost: 410, price: 899, vel: 1.94, sold: 12, age: 18, lead: 8, loss: 0, channels: { shopify: 14, pos: 12, warehouse: 9 }, img: "img/linen.jpg" },
    { id: "ACC-091", name: "Woolen Scarf & Gloves Set", cat: "Accessories", supplier: "Hill Thread Co.", units: 29, cost: 210, price: 449, vel: 0.5, sold: 1, age: 58, lead: 12, loss: 0, channels: { shopify: 4, pos: 9, warehouse: 16 }, img: "img/scarf.jpg" },
    { id: "TP-505", name: "Athleisure Track Pants", cat: "Activewear", supplier: "Sprint Mills", units: 8, cost: 480, price: 999, vel: 2.4, sold: 16, age: 9, lead: 5, loss: 6200, channels: { shopify: 3, pos: 5, warehouse: 0 }, img: "img/pants.jpg" },
    { id: "KT-204", name: "Silk Blend Festive Kurti", cat: "Ethnic Wear", supplier: "Banaras House", units: 5, cost: 640, price: 1899, vel: 3.2, sold: 18, age: 11, lead: 6, loss: 9800, channels: { shopify: 2, pos: 3, warehouse: 0 }, img: "img/kurti.jpg" },
    { id: "SD-881", name: "Coastal Sandals", cat: "Footwear", supplier: "Coastal Steps", units: 34, cost: 418, price: 799, vel: 0.6, sold: 8, age: 44, lead: 9, loss: 0, channels: { shopify: 10, pos: 8, warehouse: 16 }, img: "img/sandals.jpg" },
    { id: "BW-014", name: "Beach Wrap", cat: "Resort", supplier: "Coastal Steps", units: 9, cost: 260, price: 699, vel: 2.2, sold: 12, age: 16, lead: 6, loss: 4200, channels: { shopify: 4, pos: 5, warehouse: 0 }, img: "img/wrap.jpg" },
    { id: "CP-330", name: "Cotton Polo", cat: "Essentials", supplier: "Sri Krishna Mills", units: 10, cost: 300, price: 799, vel: 2.6, sold: 14, age: 14, lead: 5, loss: 4000, channels: { shopify: 4, pos: 4, warehouse: 2 }, img: "img/polo.jpg" }
  ];

  function inr(n) {
    var sign = n < 0 ? "-" : "";
    var x = String(Math.round(Math.abs(n)));
    if (x.length <= 3) return sign + "₹" + x;
    var last = x.slice(-3);
    var rest = x.slice(0, -3);
    var out = "";
    while (rest.length > 2) {
      out = "," + rest.slice(-2) + out;
      rest = rest.slice(0, -2);
    }
    return sign + "₹" + rest + out + "," + last;
  }

  function money(units, cost) {
    return Math.round(units * cost);
  }

  // Used when an import had no product name and fell back to "Item #1".
  var NAME_BOOK = [
    ["Navy Oxford Shirt", "Apparel", "img/linen.jpg"],
    ["Olive Crew Tee", "Essentials", "img/ts.jpg"],
    ["Stone Chino Trouser", "Apparel", "img/jeans.jpg"],
    ["Black Knit Polo", "Essentials", "img/polo.jpg"],
    ["Rust Denim Jacket", "Outerwear", "img/jacket.jpg"],
    ["Ivory Silk Kurta", "Ethnic Wear", "img/kurti.jpg"],
    ["Sage Linen Shorts", "Activewear", "img/pants.jpg"],
    ["Maroon Wool Cardigan", "Outerwear", "img/jacket.jpg"],
    ["Charcoal Formal Shirt", "Apparel", "img/linen.jpg"],
    ["Sand Slim Blazer", "Outerwear", "img/jacket.jpg"],
    ["Indigo Selvedge Jeans", "Apparel", "img/jeans.jpg"],
    ["Cream Cashmere Scarf", "Accessories", "img/scarf.jpg"],
    ["Black Leather Belt", "Accessories", "img/scarf.jpg"],
    ["Tan Suede Loafers", "Footwear", "img/shoes.jpg"],
    ["White Canvas Sneakers", "Footwear", "img/shoes.jpg"],
    ["Coral Resort Shirt", "Resort", "img/linen.jpg"],
    ["Teal Beach Cover-Up", "Resort", "img/wrap.jpg"],
    ["Mustard Festive Dupatta", "Ethnic Wear", "img/kurti.jpg"],
    ["Grey Track Jacket", "Activewear", "img/pants.jpg"],
    ["Navy Running Shorts", "Activewear", "img/pants.jpg"],
    ["Blush Day Dress", "Resort", "img/wrap.jpg"],
    ["Forest Hoodie", "Outerwear", "img/jacket.jpg"],
    ["Sky Oxford Shorts", "Apparel", "img/linen.jpg"],
    ["Wine Velvet Blazer", "Outerwear", "img/jacket.jpg"],
    ["Khaki Utility Shirt", "Apparel", "img/linen.jpg"],
    ["Pearl Silk Blouse", "Apparel", "img/linen.jpg"],
    ["Coal Bomber Jacket", "Outerwear", "img/jacket.jpg"],
    ["Lime Training Tee", "Essentials", "img/ts.jpg"],
    ["Brown Brogue Shoes", "Footwear", "img/shoes.jpg"],
    ["Gold Festive Stole", "Ethnic Wear", "img/kurti.jpg"],
    ["Slate Wool Trouser", "Apparel", "img/jeans.jpg"],
    ["Aqua Swim Shorts", "Resort", "img/wrap.jpg"],
    ["Plum Evening Kurti", "Ethnic Wear", "img/kurti.jpg"],
    ["Oat Linen Dress", "Resort", "img/wrap.jpg"],
    ["Red Flannel Shirt", "Apparel", "img/linen.jpg"],
    ["Midnight Parka", "Outerwear", "img/jacket.jpg"],
    ["Honey Leather Sandals", "Footwear", "img/sandals.jpg"],
    ["Pine Quilted Vest", "Outerwear", "img/jacket.jpg"],
    ["Rose Wrap Skirt", "Resort", "img/wrap.jpg"],
    ["Steel Crew Sweatshirt", "Essentials", "img/ts.jpg"],
    ["Amber Silk Scarf", "Accessories", "img/scarf.jpg"],
    ["Cobalt Polo Dress", "Essentials", "img/polo.jpg"],
    ["Clay Work Shirt", "Apparel", "img/linen.jpg"],
    ["Ivory Pleated Trouser", "Apparel", "img/jeans.jpg"],
    ["Black Ankle Boots", "Footwear", "img/shoes.jpg"],
    ["Moss Knit Sweater", "Outerwear", "img/jacket.jpg"],
    ["Copper Evening Wrap", "Resort", "img/wrap.jpg"],
    ["Pale Blue Oxford", "Apparel", "img/linen.jpg"]
  ];

  var GARMENT_ORDER = ["Shirts", "Pants", "Skirts", "Dresses", "Jackets", "Shoes", "Accessories", "Wraps"];

  // Photo on disk must depict the same garment as the category.
  function garmentLook(name) {
    var n = String(name || "").toLowerCase();
    if (/skirt/.test(n)) return { cat: "Skirts", img: "img/skirt.jpg" };
    if (/wrap|cover-up|cover up|poncho/.test(n)) return { cat: "Wraps", img: "img/wrap.jpg" };
    if (/dress|kurti|kurta|anarkali/.test(n)) return { cat: "Dresses", img: "img/kurti.jpg" };
    if (/jean|chino|trouser/.test(n)) return { cat: "Pants", img: "img/jeans.jpg" };
    if (/pant|short/.test(n)) return { cat: "Pants", img: "img/pants.jpg" };
    if (/jacket|blazer|parka|cardigan|sweater|bomber|vest|hoodie/.test(n)) return { cat: "Jackets", img: "img/jacket.jpg" };
    if (/sandal/.test(n)) return { cat: "Shoes", img: "img/sandals.jpg" };
    if (/shoe|sneaker|loafer|boot|brogue/.test(n)) return { cat: "Shoes", img: "img/shoes.jpg" };
    if (/scarf|glove|stole|dupatta|belt/.test(n)) return { cat: "Accessories", img: "img/scarf.jpg" };
    if (/polo/.test(n)) return { cat: "Shirts", img: "img/polo.jpg" };
    if (/\btee\b|t-shirt|sweatshirt/.test(n)) return { cat: "Shirts", img: "img/ts.jpg" };
    return { cat: "Shirts", img: "img/linen.jpg" };
  }

  function garment(name) {
    return garmentLook(name).cat;
  }

  function applySale(raw, qty) {
    var onHand = Math.max(0, Number(raw.units) || 0);
    var n = Math.max(1, parseInt(qty, 10) || 1);
    if (!onHand) return { error: "None left in stock" };
    if (n > onHand) return { error: "Only " + onHand + " in stock" };
    var price = Number(raw.listPrice != null ? raw.listPrice : raw.price) || 0;
    var cost = Number(raw.cost) || 0;
    return {
      units: onHand - n,
      sold: (Number(raw.sold) || 0) + n,
      qty: n,
      revenue: Math.round(n * price),
      profit: Math.round(n * (price - cost))
    };
  }

  function normalize(p) {
    var units = Number(p.units != null ? p.units : p.stock) || 0;
    var cost = Number(p.cost != null ? p.cost : p.cost_price) || 0;
    var price = Number(p.price != null ? p.price : p.selling_price) || 0;
    var vel = Number(p.vel != null ? p.vel : p.daily_velocity);
    if (!vel) vel = Number(p.monthly_sales) > 0 ? Number(p.monthly_sales) / 30 : 0.4;
    var sold = Number(p.sold) || 0;
    var ch = p.channels;
    if (!ch) {
      var third = Math.max(0, Math.round(units / 3));
      ch = { shopify: third, pos: third, warehouse: Math.max(0, units - third * 2) };
    }
    var id = String(p.id || p.sku || "SKU");
    var name = p.name || p.title || p.product_name || p.item_name || p.product || "";
    var cat = p.cat || p.category || "Apparel";
    var img = p.img || p.image_url || p.image || "";
    var placeholder = !String(name).trim() || /^item #\d+$/i.test(String(name).trim()) || name === "Untitled";
    if (placeholder) {
      var n = parseInt(String(name).replace(/\D/g, ""), 10) || parseInt(id.replace(/\D/g, ""), 10) || 1;
      var pick = NAME_BOOK[(n - 1) % NAME_BOOK.length];
      name = pick[0];
      img = pick[2];
    }
    // Scanned products bring their own photo and category; only stock images get the garment look.
    if (!/^(https?:|data:image\/)/.test(img)) {
      var look = garmentLook(name);
      cat = look.cat;
      img = look.img;
    }
    return {
      id: id,
      name: name,
      cat: cat,
      supplier: p.supplier || p.vendor || "Local Vendor",
      units: units,
      cost: cost,
      price: price,
      vel: vel,
      sold: sold,
      age: Number(p.age != null ? p.age : p.inventory_age_days) || 0,
      margin: price > 0 ? (price - cost) / price : 0,
      lead: Number(p.lead != null ? p.lead : p.supplier_lead_days) || 7,
      loss: Number(p.loss) || 0,
      channels: { shopify: Number(ch.shopify) || 0, pos: Number(ch.pos) || 0, warehouse: Number(ch.warehouse) || 0 },
      img: img,
      moq: p.moq,
      phone: p.phone || p.supplier_whatsapp || "",
      supplier_whatsapp: p.supplier_whatsapp || p.phone || "",
      email: p.email
    };
  }

  function replaceCatalog(rows) {
    var next = (rows || []).map(normalize);
    RAW.splice(0, RAW.length);
    next.forEach(function (r) { RAW.push(r); });
  }

  function share(s, channel) {
    if (!channel || channel === "all") return 1;
    var c = s.channels || {};
    var sum = (c.shopify || 0) + (c.pos || 0) + (c.warehouse || 0);
    if (!sum) return 0;
    return (c[channel] || 0) / sum;
  }

  function statusOf(s) {
    if ((Number(s.units) || 0) <= 0) return "reorder";
    var days = s.units / Math.max(s.vel, 0.05);
    if (s.age >= 60 && s.vel < 1) return "dead";
    if (s.age >= 40 && days > 45) return "risk";
    if (days < 2) return "critical";
    if (days < 5) return "low";
    return "healthy";
  }

  function watchList(skus) {
    var rank = { dead: 0, risk: 1, reorder: 2, critical: 3, low: 4 };
    return (skus || []).filter(function (s) {
      return s.status === "dead" || s.status === "risk" || s.status === "reorder" || s.status === "critical" || s.status === "low";
    }).map(function (s) {
      var label = s.status === "reorder"
        ? "Reorder"
        : ((s.status === "dead" || s.status === "risk") ? "Sales down" : ("About " + s.days.toFixed(1) + " days left"));
      return { id: s.id, name: s.name, status: s.status, label: label, units: s.units };
    }).sort(function (a, b) {
      return (rank[a.status] - rank[b.status]) || a.name.localeCompare(b.name);
    });
  }

  function applyOne(raw, actions) {
    var clearance = (actions.clearance && actions.clearance[raw.id]) || 0;
    var vel = raw.vel * (clearance ? 1 + clearance * 3 : 1);
    var price = Math.round(raw.price * (1 - clearance));
    var days = raw.units / Math.max(vel, 0.05);
    var draft = {
      id: raw.id, name: raw.name, cat: raw.cat, supplier: raw.supplier,
      units: raw.units, cost: raw.cost, price: price, listPrice: raw.price, vel: vel, age: raw.age,
      margin: clearance ? (raw.margin || 0) * (1 - clearance) : (raw.margin || 0),
      lead: raw.lead, loss: raw.loss, sold: raw.sold || 0, channels: raw.channels, img: raw.img,
      moq: raw.moq, phone: raw.phone, supplier_whatsapp: raw.supplier_whatsapp || raw.phone || "", email: raw.email, clearance: clearance,
      locked: !!(actions.locked && actions.locked[raw.id])
    };
    var status = statusOf(draft);
    // ponytail: a planned clearance flips dead stock to watched risk immediately. Real sell-through would wait for POS sales before the status moves.
    if (clearance >= 0.1 && status === "dead") status = "risk";
    draft.status = status;
    draft.days = days;
    draft.value = money(raw.units, raw.cost);
    draft.reviewed = !!(actions.reviewed && actions.reviewed[raw.id]);
    draft.snoozed = (actions.snooze && actions.snooze[raw.id] || 0) > Date.now();
    return draft;
  }

  function catalog(actions) {
    var gone = {};
    ((actions && actions.removed) || []).forEach(function (id) { gone[id] = true; });
    var map = {};
    var order = [];
    RAW.forEach(function (raw) {
      var n = normalize(raw);
      if (gone[n.id]) return;
      map[n.id] = n;
      order.push(n.id);
    });
    ((actions && actions.added) || []).forEach(function (raw) {
      var n = normalize(raw);
      if (gone[n.id]) return;
      if (!map[n.id]) order.unshift(n.id);
      map[n.id] = n;
    });
    return order.map(function (id) { return applyOne(map[id], actions || {}); });
  }

  function exposure(s) {
    var v = s.value;
    if (s.status === "dead") return v;
    if (s.status === "risk") return s.clearance ? Math.round(v * 0.4) : v;
    return 0;
  }

  function visible(skus, channel) {
    if (!channel || channel === "all") return skus;
    return skus.filter(function (s) { return (s.channels[channel] || 0) > 0; });
  }

  function tally(skus) {
    var c = { healthy: 0, low: 0, critical: 0, risk: 0, dead: 0 };
    skus.forEach(function (s) { c[s.status] += 1; });
    return c;
  }

  function channelMix(skus) {
    var t = { shopify: 0, pos: 0, warehouse: 0 };
    skus.forEach(function (s) {
      var c = s.channels || {};
      t.shopify += c.shopify || 0;
      t.pos += c.pos || 0;
      t.warehouse += c.warehouse || 0;
    });
    var sum = t.shopify + t.pos + t.warehouse || 1;
    return {
      shopify: Math.round(t.shopify / sum * 100),
      pos: Math.round(t.pos / sum * 100),
      warehouse: Math.round(t.warehouse / sum * 100)
    };
  }

  // ponytail: pace is today's logged sales vs daily velocity times the fraction of the day so far. A real trend would use prior days of POS history.
  function salesTrend(skus, history, now) {
    var clock = now ? new Date(now) : new Date();
    var start = new Date(clock);
    start.setHours(0, 0, 0, 0);
    var t0 = start.getTime();
    var dayFrac = Math.min(1, Math.max(1 / 24, (clock.getTime() - t0) / 86400000));
    var bySku = {};
    (history || []).forEach(function (row) {
      var ts = Number(row.timestamp) || 0;
      if (ts < t0 || ts > clock.getTime()) return;
      var id = row.sku;
      if (!bySku[id]) bySku[id] = { qty: 0, revenue: 0 };
      bySku[id].qty += Number(row.qty) || 0;
      bySku[id].revenue += Number(row.revenue) || 0;
    });
    var rows = (skus || []).map(function (s) {
      var got = bySku[s.id] || { qty: 0, revenue: 0 };
      var expect = (Number(s.vel) || 0) * dayFrac;
      var dir = "flat";
      if (got.qty > 0 && got.qty >= expect * 1.25) dir = "up";
      else if (expect >= 0.5 && got.qty <= expect * 0.5) dir = "down";
      return { id: s.id, name: s.name, qty: got.qty, revenue: got.revenue, expect: Math.round(expect * 10) / 10, dir: dir, vel: Number(s.vel) || 0 };
    }).sort(function (a, b) {
      var rank = { up: 0, down: 1, flat: 2 };
      return (rank[a.dir] - rank[b.dir]) || (b.qty - a.qty) || (b.vel - a.vel);
    });
    return {
      qty: rows.reduce(function (a, r) { return a + r.qty; }, 0),
      revenue: rows.reduce(function (a, r) { return a + r.revenue; }, 0),
      up: rows.filter(function (r) { return r.dir === "up"; }).length,
      down: rows.filter(function (r) { return r.dir === "down"; }).length,
      rows: rows
    };
  }

  function kpis(skus, channel) {
    var counts = { healthy: 0, low: 0, critical: 0, risk: 0, dead: 0, out: 0 };
    var inventoryValue = 0, sales = 0, profit = 0, capital = 0, deadCapital = 0;
    var shown = [];
    skus.forEach(function (s) {
      var f = share(s, channel);
      if (channel && channel !== "all" && f <= 0) return;
      shown.push(s);
      if (s.status === "reorder") counts.out += 1;
      else counts[s.status] += 1;
      var sell = s.listPrice || s.price;
      inventoryValue += s.value * f;
      sales += (s.sold || 0) * sell * f;
      profit += (s.sold || 0) * (sell - s.cost) * f;
      capital += exposure(s) * f;
      if (s.status === "dead") deadCapital += s.value * f;
    });
    return {
      inventoryValue: Math.round(inventoryValue),
      sales: Math.round(sales),
      profit: Math.round(profit),
      capital: Math.round(capital),
      deadCapital: Math.round(deadCapital),
      total: shown.length,
      healthy: counts.healthy,
      low: counts.low + counts.critical,
      risk: counts.risk,
      dead: counts.dead,
      out: counts.out,
      critical: counts.critical,
      shown: shown
    };
  }

  function alerts(skus) {
    return skus.filter(function (s) {
      return (s.status === "critical" || s.status === "low") && !s.reviewed && !s.snoozed && s.loss > 0;
    }).sort(function (a, b) { return a.days - b.days; });
  }

  function recommendations(skus, actions) {
    var dismissed = (actions && actions.dismissed) || {};
    var out = [];
    skus.forEach(function (s) {
      if (dismissed[s.id]) return;
      if (s.id === "JKT-409" && s.status === "reorder") {
        out.push({ id: s.id, kind: "stock", title: "Reorder — Jacket", supplier: s.supplier, exposure: 0, note: "The jacket is sold out. Status is reorder.", action: "Send a restock order" });
      } else if (s.id === "JKT-409" && s.status === "dead") {
        out.push({ id: s.id, kind: "risk", title: "Reduce Purchase — Jacket", supplier: s.supplier, exposure: s.value, note: "47 jackets unsold for 63 days. Do not send the pending 30-unit PO.", action: "Plan 15% clearance and lock reorders" });
      } else if (s.id === "JKT-409" && s.clearance) {
        out.push({ id: s.id, kind: "cash", title: "Clearance live — Jacket", supplier: s.supplier, exposure: exposure(s), note: "15% off is planned. Reorders stay locked until stock is under 10.", action: "Watch sell-through" });
      } else if (s.id === "SH-102" && !s.reviewed && s.days < 5) {
        out.push({ id: s.id, kind: "stock", title: "Review Stock — Sports Shoes", supplier: s.supplier, exposure: s.loss, note: "AirSprint covers about " + s.days.toFixed(1) + " days. Lead time is " + s.lead + " days. Mercura will not order.", action: "Copy a supplier note and call Apex" });
      } else if (s.id === "SD-881" && !s.clearance) {
        out.push({ id: s.id, kind: "cash", title: "Consider Promotion — Sandals", supplier: s.supplier, exposure: s.value, note: "Velocity is soft. A 15% clearance can unlock about ₹14,200.", action: "Simulate 15% clearance" });
      } else if (s.id === "TS-088") {
        out.push({ id: s.id, kind: "ok", title: "Maintain Stock — T-Shirts", supplier: s.supplier, exposure: 0, note: "21-day cycle is on target. No buy or discount.", action: "Leave the reorder cadence" });
      }
    });
    return out;
  }

  function pendingPo(s) {
    if (!s || (Number(s.units) || 0) <= 0 || s.locked) return 0;
    if (s.id === "JKT-409") return 30;
    return 0;
  }

  function orderNote(s) {
    var batch = Math.max(s.moq || 20, Math.ceil(s.vel * 30 - s.units));
    var shop = "Our store";
    try { shop = JSON.parse(localStorage.getItem("mercura_active_merchant") || "{}").shop || shop; } catch (e) {}
    return shop + " — reorder request, not an order. SKU " + s.id + " " + s.name + ". On hand " + s.units + ". Suggested batch " + batch + " units. Please confirm lead time. We will place the PO ourselves.";
  }

  if (typeof module === "object" && module.exports) {
    try {
      var fs = require("fs");
      var path = require("path");
      var file = path.join(__dirname, "data", "catalog.json");
      replaceCatalog(JSON.parse(fs.readFileSync(file, "utf8")));
    } catch (e) {}
  }

  return {
    RAW: RAW,
    inr: inr,
    normalize: normalize,
    replaceCatalog: replaceCatalog,
    channelMix: channelMix,
    garmentOrder: GARMENT_ORDER,
    catalog: catalog,
    kpis: kpis,
    alerts: alerts,
    recommendations: recommendations,
    applySale: applySale,
    watchList: watchList,
    salesTrend: salesTrend,
    pendingPo: pendingPo,
    orderNote: orderNote,
    statusOf: statusOf,
    emptyActions: function () {
      return { clearance: {}, locked: {}, reviewed: {}, snooze: {}, dismissed: {}, accepted: {}, added: [], log: [] };
    }
  };
});
