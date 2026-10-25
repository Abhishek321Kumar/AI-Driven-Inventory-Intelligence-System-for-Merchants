/* Confirm, then open WhatsApp. Nothing is sent until the merchant clicks dispatch. */
(function () {
  var pending = null;

  function digits(phone) {
    var d = String(phone || "").replace(/\D/g, "");
    if (d.length === 11 && d.charAt(0) === "0") d = d.slice(1);
    if (d.length === 10) d = "91" + d;
    return d.length === 12 && d.indexOf("91") === 0 ? d : "";
  }

  function validIndian(phone) {
    var local = String(phone || "").replace(/\D/g, "").replace(/^0/, "").replace(/^91/, "");
    return /^[6-9]\d{9}$/.test(local);
  }

  function formatPhone(phone) {
    var d = digits(phone);
    return d ? "+" + d : "";
  }

  function merchant() {
    try { return JSON.parse(localStorage.getItem("mercura_merchant") || "null") || {}; }
    catch (e) { return {}; }
  }

  function money(n) {
    if (window.Mercura && window.Mercura.inr) return window.Mercura.inr(n);
    return "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
  }

  function qtyOf(sku) {
    if (sku.qty) return Math.max(1, parseInt(sku.qty, 10) || 1);
    if (window.MercuraLive && window.MercuraLive.reorderQty) {
      var live = window.MercuraLive.reorderQty(sku, sku.vel);
      if (live > 0) return live;
    }
    var need = Math.ceil((Number(sku.vel) || 1) * ((Number(sku.lead) || 7) + 14) - (Number(sku.units) || 0));
    return Math.max(1, sku.moq || 1, need);
  }

  function lookup(id) {
    if (window.Mercura && window.MercuraStore) {
      var hit = window.Mercura.catalog(window.MercuraStore.engineActions()).find(function (s) { return s.id === id; });
      if (hit) return hit;
    }
    if (window.Mercura && window.Mercura.RAW) {
      return (window.Mercura.RAW || []).find(function (s) { return s.id === id; }) || null;
    }
    return null;
  }

  function message(sku, qty) {
    var who = merchant();
    var shop = who.shop || "Sharma Apparels";
    var store = /bengaluru|bangalore/i.test(shop) ? shop : shop + " Flagship, Bengaluru";
    var whoName = who.username || who.name || "Merchant";
    var whoPhone = formatPhone(who.phone);
    var lead = Math.max(1, parseInt(sku.lead, 10) || 4);
    return [
      "📦 *OFFICIAL PURCHASE ORDER INQUIRY*",
      "Store: " + store,
      "Merchant: " + whoName + (whoPhone ? " (" + whoPhone + ")" : ""),
      "------------------------------------------",
      "*Item:* " + (sku.name || sku.id),
      "*SKU:* " + sku.id,
      "*Quantity Needed:* " + qty + " units",
      "*Target Dispatch:* Within " + lead + " business days",
      "*Delivery Destination:* Counter POS / Bengaluru",
      "------------------------------------------",
      "Please reply to this chat with stock confirmation & proforma invoice.",
      "Automated Dispatch generated via Mercura AI Engine."
    ].join("\n");
  }

  function esc(text) {
    return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function shell() {
    var el = document.getElementById("mercura-po-modal");
    if (el) return el;
    el = document.createElement("div");
    el.id = "mercura-po-modal";
    el.className = "hidden fixed inset-0 z-[90] flex items-center justify-center p-4";
    el.innerHTML = ''
      + '<div class="absolute inset-0 bg-[#0B1F2A]/80" data-po="cancel"></div>'
      + '<div class="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-[#F8F8F6] text-[#1F2937] shadow-2xl">'
      + '<div class="bg-[#0B1F2A] text-white px-5 py-4"><h2 class="font-display font-bold text-lg">Confirm purchase order</h2>'
      + '<p class="text-xs text-slate-300 mt-1">Nothing is sent until you dispatch.</p></div>'
      + '<div class="p-5 space-y-3 text-sm">'
      + '<div><div class="text-[10px] uppercase font-bold text-slate-500">Supplier</div><div id="po-supplier" class="font-bold"></div></div>'
      + '<div id="po-facts" class="font-mono text-xs space-y-1"></div>'
      + '<div><div class="text-[10px] uppercase font-bold text-slate-500 mb-1">WhatsApp message preview</div>'
      + '<div id="po-preview" class="rounded-xl bg-white border border-slate-200 p-3 text-xs leading-relaxed"></div></div>'
      + '<p id="po-warn" class="hidden text-xs text-[#B45309]"></p>'
      + '<div class="flex justify-end gap-2 pt-1">'
      + '<button type="button" data-po="cancel" class="px-4 py-2 rounded-xl bg-slate-100 text-xs font-semibold">Cancel</button>'
      + '<button type="button" id="po-send" data-po="send" class="px-4 py-2 rounded-xl bg-[#0B1F2A] text-white text-xs font-bold">Confirm &amp; Dispatch to WhatsApp</button>'
      + '</div></div></div>';
    el.addEventListener("click", function (event) {
      var act = event.target && event.target.closest && event.target.closest("[data-po]");
      if (!act) return;
      if (act.getAttribute("data-po") === "cancel") close();
      if (act.getAttribute("data-po") === "send") dispatch();
    });
    document.body.appendChild(el);
    return el;
  }

  function close() {
    pending = null;
    var el = document.getElementById("mercura-po-modal");
    if (el) el.classList.add("hidden");
  }

  function open(skuOrId, extra) {
    var sku = typeof skuOrId === "string" ? lookup(skuOrId) : skuOrId;
    if (!sku) sku = { id: skuOrId };
    if (extra) sku = Object.assign({}, sku, extra);
    var qty = qtyOf(sku);
    var phone = formatPhone(sku.supplier_whatsapp || sku.phone);
    var cost = Number(sku.cost) || 0;
    var text = message(sku, qty);
    pending = { phone: phone, text: text };
    var root = shell();
    document.getElementById("po-supplier").textContent = (sku.supplier || "Supplier") + (phone ? " · " + phone : " · no WhatsApp number");
    document.getElementById("po-facts").innerHTML = ""
      + "<div>SKU " + esc(sku.id) + " · " + esc(sku.name || sku.id) + "</div>"
      + "<div>Units requested " + qty + "</div>"
      + "<div>Unit cost " + money(cost) + " · Total " + money(qty * cost) + "</div>";
    document.getElementById("po-preview").innerHTML = esc(text).replace(/\*([^*]+)\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
    var warn = document.getElementById("po-warn");
    var send = document.getElementById("po-send");
    if (!phone) {
      warn.textContent = "Add a supplier WhatsApp number on this product before a purchase order can be dispatched.";
      warn.classList.remove("hidden");
      send.disabled = true;
      send.classList.add("opacity-40");
    } else {
      warn.classList.add("hidden");
      send.disabled = false;
      send.classList.remove("opacity-40");
    }
    root.classList.remove("hidden");
  }

  function dispatch() {
    if (!pending || !pending.phone) return;
    var url = "https://wa.me/" + digits(pending.phone) + "?text=" + encodeURIComponent(pending.text);
    window.open(url, "_blank", "noopener");
    if (window.showToast) window.showToast("WhatsApp opened. The supplier still has to confirm.", "send");
    if (window.HapticAudio) window.HapticAudio.click();
    close();
  }

  window.MercuraPO = { open: open, close: close, validIndian: validIndian, formatPhone: formatPhone };
})();
