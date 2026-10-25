const M = require("./engine");
const actions = M.emptyActions();
const skus = M.catalog(actions);
const k = M.kpis(skus, "all");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(skus.length > 0 && skus.every(function (s) { return s.id.indexOf("CT-") !== 0; }), "filler rows are still in the catalog");
assert(k.total === skus.length, "sku count " + k.total);
assert(k.inventoryValue === skus.reduce(function (a, s) { return a + s.value; }, 0), "inventory " + k.inventoryValue);
assert(k.sales === Math.round(skus.reduce(function (a, s) { return a + (s.sold || 0) * (s.listPrice || s.price); }, 0)), "sales " + k.sales);
assert(k.healthy + k.low + k.risk + k.dead + k.out === skus.length, "status buckets");
assert(M.alerts(skus).every(function (s) { return s.loss > 0 && (s.status === "low" || s.status === "critical"); }), "alerts");

const jacket = skus.find(function (s) { return s.id === "JKT-409"; });
assert(jacket && jacket.status === "dead", "jacket should be dead from age and velocity");
actions.clearance["JKT-409"] = 0.15;
const after = M.kpis(M.catalog(actions), "all");
const cleared = M.catalog(actions).find(function (s) { return s.id === "JKT-409"; });
assert(cleared.status === "risk", "jacket status " + cleared.status);
assert(after.dead === k.dead - 1, "dead after " + after.dead);
assert(after.capital < k.capital, "capital did not fall " + after.capital);
assert(after.sales === k.sales, "clearance preview must not rewrite sales already made");
assert(M.orderNote(cleared).indexOf("not an order") !== -1, "note must refuse auto-buy");

var renamed = M.normalize({ name: "Item #1", sku: "SKU-1001", stock: 10, cost: 350, selling_price: 560, category: "Men's Clothing" });
assert(renamed.name === "Navy Oxford Shirt", "placeholder name " + renamed.name);
assert(renamed.cat === "Shirts" && renamed.img === "img/linen.jpg", "placeholder look " + renamed.cat);
assert(M.normalize({ name: "Linen Casual Shirt", id: "SH-312", units: 35, cost: 410, price: 899 }).cat === "Shirts", "shirt");
assert(M.normalize({ name: "Athleisure Track Pants", id: "TP-505", units: 8, cost: 480, price: 999 }).cat === "Pants", "pants");
var skirt = M.normalize({ name: "Rose Wrap Skirt", id: "SK-1", units: 4, cost: 200, price: 499 });
assert(skirt.cat === "Skirts" && skirt.img === "img/skirt.jpg", "skirts " + skirt.img);
assert(M.normalize({ name: "Beach Wrap", id: "BW-014", units: 9, cost: 260, price: 699 }).img === "img/wrap.jpg", "wrap photo");
assert(M.normalize({ name: "Cobalt Polo Dress", id: "X", units: 1, cost: 1, price: 2 }).img === "img/kurti.jpg", "dress photo");
assert(M.normalize({ name: "Aqua Swim Shorts", id: "X", units: 1, cost: 1, price: 2 }).img === "img/pants.jpg", "shorts photo");
assert(M.normalize({ name: "Grey Track Jacket", id: "X", units: 1, cost: 1, price: 2 }).img === "img/jacket.jpg", "jacket photo");
assert(M.normalize({ name: "Cotton Polo", id: "CP-330", units: 10, cost: 300, price: 799 }).img === "img/polo.jpg", "polo photo");
assert(M.normalize({ name: "Coastal Sandals", id: "SD-881", units: 34, cost: 418, price: 799 }).img === "img/sandals.jpg", "sandal photo");

var sold = M.applySale({ units: 10, sold: 2, price: 499, cost: 300 }, 3);
assert(sold.units === 7 && sold.sold === 5 && sold.revenue === 1497 && sold.profit === 597, "sale " + JSON.stringify(sold));
assert(M.applySale({ units: 2, sold: 0, price: 100, cost: 40 }, 5).error, "oversell");
assert(M.watchList(skus).some(function (s) { return s.id === "JKT-409" && s.label === "Sales down"; }), "jacket stays sales down while stock remains");
var gone = M.catalog(Object.assign(M.emptyActions(), {
  added: [{ id: "JKT-409", name: "Winter Heavy Jacket", units: 0, cost: jacket.cost, price: jacket.listPrice, vel: jacket.vel, age: jacket.age, sold: jacket.sold + jacket.units }]
}));
var j0 = gone.find(function (s) { return s.id === "JKT-409"; });
assert(j0.status === "reorder", "sold out status " + j0.status);
assert(M.watchList(gone).some(function (s) { return s.id === "JKT-409" && s.label === "Reorder"; }), "sales down flips to reorder when sold out");
var k0 = M.kpis(gone, "all");
assert(k0.dead === 0 && k0.deadCapital === 0 && k0.out === 1, "dead capital clears " + k0.deadCapital);
var dropped = M.catalog(Object.assign(M.emptyActions(), { removed: ["JKT-409"] }));
assert(!dropped.some(function (s) { return s.id === "JKT-409"; }) && dropped.length === skus.length - 1, "delete removes the sku");

const C = require("./copilot");
const book = { skus: skus, sales: k.sales, profit: k.profit, inventory: k.inventoryValue, capital: k.capital, deadCapital: k.deadCapital, todayQty: 0, todayRevenue: 0, today: [] };
const jackets = C.reply("how many jackets are left", book, "en");
assert(jackets.lang === "en" && /47/.test(jackets.text) && /Winter/.test(jackets.text) && !/₹/.test(jackets.text), jackets.text);
const hindi = C.reply("जैकेट कितने बचे हैं", book, "en");
assert(hindi.lang === "hi" && /[\u0900-\u097F]/.test(hindi.text) && /47/.test(hindi.text), hindi.text);
const kannada = C.reply("ಜಾಕೆಟ್ ಎಷ್ಟು ಉಳಿದಿದೆ", book, "en");
assert(kannada.lang === "kn" && /[\u0C80-\u0CFF]/.test(kannada.text) && /47/.test(kannada.text), kannada.text);
const roman = C.reply("jacket kitna stock", book, "en");
assert(roman.lang === "hi" && /[\u0900-\u097F]/.test(roman.text) && /47/.test(roman.text), roman.text);
const englishWins = C.reply("how many jackets are left", book, "hi");
assert(englishWins.lang === "en" && /left/.test(englishWins.text), englishWins.text);
const down = C.reply("what is sales down", book, "kn");
assert(/Sales are down/.test(down.text) && /Jacket/.test(down.text), down.text);
const soldOut = C.reply("is the jacket sold out", { skus: gone, sales: 0, profit: 0, inventory: 0, capital: 0, deadCapital: 0, todayQty: 0, todayRevenue: 0, today: [] }, "en");
assert(/sold out/i.test(soldOut.text) && !/₹/.test(soldOut.text), soldOut.text);
const price = C.reply("what is the jacket price", book, "en");
assert(/1,499/.test(price.text) && !/\b47\b/.test(price.text), price.text);
const jacketToday = C.reply("आज कितने जैकेट बिके और कितने रुपए की सेल हुई", {
  skus: skus, sales: k.sales, profit: k.profit, inventory: k.inventoryValue, capital: k.capital, deadCapital: k.deadCapital,
  todayQty: 2, todayRevenue: 2998,
  today: [{ sku: "JKT-409", name: "Winter Heavy Jacket", qty: 2, revenue: 2998 }]
}, "hi");
assert(/2/.test(jacketToday.text) && /2,998/.test(jacketToday.text), jacketToday.text);
const supplier = C.reply("who supplies the jacket", book, "en");
assert(/Nordic/.test(supplier.text) && !/₹/.test(supplier.text), supplier.text);
const shirts = C.reply("how many shirts are left", book, "en");
assert(/Crew/.test(shirts.text) && /Polo/.test(shirts.text) && /Linen/.test(shirts.text) && !/₹/.test(shirts.text), shirts.text);
const shoes = C.reply("how many shoes are left", book, "en");
assert(/Sandal/.test(shoes.text) && /AirSprint|Running/.test(shoes.text) && !/₹/.test(shoes.text), shoes.text);
const cost = C.reply("what is the jacket cost", book, "en");
assert(/809/.test(cost.text) && !/\b47\b/.test(cost.text), cost.text);
var noon = new Date();
noon.setHours(12, 0, 0, 0);
var trend = M.salesTrend(skus, [{ sku: "JKT-409", qty: 2, revenue: 2998, timestamp: noon.getTime() }], noon.getTime());
var trendJacket = trend.rows.filter(function (r) { return r.id === "JKT-409"; })[0];
var trendShoes = trend.rows.filter(function (r) { return r.id === "SH-102"; })[0];
assert(trendJacket.dir === "up" && trendShoes.dir === "down" && trend.qty === 2 && trend.revenue === 2998, trendJacket.dir + " " + trendShoes.dir);
var jacketOpen = skus.filter(function (s) { return s.id === "JKT-409"; })[0];
assert(M.pendingPo(jacketOpen) === 30, "open po");
assert(M.pendingPo(Object.assign({}, jacketOpen, { locked: true })) === 0, "locked po");
assert(M.pendingPo(Object.assign({}, jacketOpen, { units: 0 })) === 0, "sold out po");
var spoken = C.romanHindi("Winter Heavy Jacket के आज 47 पीस बिके, बिक्री ₹70,453।");
assert(/ke/.test(spoken) && /bike/.test(spoken) && /bikr/.test(spoken) && /47/.test(spoken), spoken);
var clean = C.spokenText("कितने जैकेट? बिक्री ₹2,998।", "hi");
assert(clean.indexOf("?") === -1 && clean.indexOf("।") === -1 && clean.indexOf(",") === -1 && /रुपये/.test(clean) && /कितने/.test(clean), clean);

console.log("ok", { skus: skus.length, inventory: k.inventoryValue, sales: k.sales, profit: k.profit, capital: k.capital, dead: k.deadCapital });
