var Mercura = require("./engine.js");
var live = require("./live.js");
var skus = Mercura.catalog(Mercura.emptyActions());
var shoes = skus.find(function (s) { return s.id === "SH-102"; });
var jacket = skus.find(function (s) { return s.id === "JKT-409"; });
var kurti = skus.find(function (s) { return s.id === "KT-204"; });

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(live.reorderQty(jacket, jacket.vel) === 0, "slow jacket is not a reorder");
assert(live.reorderQty(shoes, shoes.vel) > shoes.units, "shoes reorder covers the lead time");
assert(live.dailyRate(shoes, [], new Date()) === shoes.vel, "forecast falls back to velocity");
var history = [];
for (var i = 0; i < 8; i++) history.push({ sku: "SH-102", qty: 2, timestamp: Date.now() - i * 86400000 });
assert(Math.abs(live.dailyRate(shoes, history, new Date()) - 2) < 0.01, "seven-plus days use the logged average");

var fest = live.festival(skus, new Date("2026-10-17T12:00:00"));
assert(fest && fest.name === "Dussehra" && fest.rows.some(function (r) { return r.id === "KT-204"; }), "Dussehra lifts the kurti");
assert(live.festival(skus, new Date("2026-06-01T12:00:00")) === null, "a quiet day has no festival");

assert(live.riskScore(jacket) > live.riskScore(shoes), "aged slow stock scores higher than a fast seller");
var cash = live.book(skus, [], new Date("2026-10-17T12:00:00")).rows.find(function (r) { return r.sku.id === "JKT-409"; }).recovery;
assert(cash[0].rate === 0.1 && cash[1].rate === 0.15 && cash[2].rate === 0.2 && cash[0].cash > 0, "three discount recoveries");

assert(live.parseCommand("sold 2 jackets", skus).id === "JKT-409", "voice sale finds the jacket");
assert(live.parseCommand("how many jackets sold today", skus) === null, "a question stays a question");
assert(live.parseCommand("bought 4 kurtis", skus).type === "buy", "voice buy finds the kurti");
var lines = live.parseInvoice("Sports Running Shoes 10 1100 2499\n", skus);
assert(lines[0] && lines[0].sku === "SH-102" && lines[0].qty === 10, "invoice line matches the shoe");

var rank = live.book(skus, [], new Date()).ranks;
assert(rank.profit[0].profit >= rank.profit[1].profit, "profit rank is sorted");
assert(rank.demand[0].sold >= rank.demand[1].sold, "demand rank is sorted");
console.log("live ok", { shoeReorder: live.reorderQty(shoes, shoes.vel), kurti: kurti.id, jacketRisk: live.riskScore(jacket) });
