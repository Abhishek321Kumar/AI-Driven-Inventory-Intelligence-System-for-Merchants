var TOKEN = "mercura_pg_token";
var GUARD = { dashboard: 1, inventory: 1, sales: 1, alerts: 1, insights: 1, cash: 1, settings: 1, profile: 1 };
var user = null;
var pushTimer = 0;
var applying = false;

function readToken() {
  return localStorage.getItem(TOKEN) || sessionStorage.getItem(TOKEN) || "";
}

function storeToken(token, remember) {
  localStorage.removeItem(TOKEN);
  sessionStorage.removeItem(TOKEN);
  (remember ? localStorage : sessionStorage).setItem(TOKEN, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN);
  sessionStorage.removeItem(TOKEN);
}

function forgetLocal(id) {
  if (id) {
    localStorage.removeItem("mercura_store_" + id);
    localStorage.removeItem("mercura_live_" + id);
  }
  localStorage.removeItem("mercura_active_merchant");
}

function uid() { return user && user.uid ? user.uid : ""; }

function profile() {
  try { return JSON.parse(localStorage.getItem("mercura_active_merchant") || "null"); }
  catch (e) { return null; }
}

function rememberProfile(next) {
  if (!next) return;
  localStorage.setItem("mercura_active_merchant", JSON.stringify(next));
  if (window.MercuraAuth && window.MercuraAuth.paint) window.MercuraAuth.paint();
}

var DATA_FRAMES = ["frame-dashboard", "frame-inventory", "frame-sales", "frame-alerts", "frame-insights", "frame-cash"];

function paintEmpty() {
  var banner = document.getElementById("mercura-empty");
  if (!banner) return;
  var count = 0;
  if (window.Mercura && window.MercuraStore) count = window.Mercura.catalog(window.MercuraStore.engineActions()).length;
  var who = profile();
  var empty = !!user && count === 0;
  DATA_FRAMES.forEach(function (id) {
    var frame = document.getElementById(id);
    if (!frame) return;
    var copy = frame.querySelector(".mercura-empty");
    if (!copy) {
      copy = document.createElement("p");
      copy.className = "mercura-empty text-slate-400 text-sm py-10 text-center";
      copy.textContent = "No data yet. Add a dataset with “+ Ingest Data” to see this page.";
      frame.insertBefore(copy, frame.firstChild);
    }
    copy.hidden = !empty;
    frame.setAttribute("data-empty", empty ? "1" : "0");
  });
  document.querySelectorAll(".empty-store").forEach(function (slot) {
    slot.textContent = (who && (who.shop || who.store_name)) || "your store";
  });
}

function liveState() {
  var key = "mercura_live_" + (uid() || "local");
  try { return JSON.parse(localStorage.getItem(key) || "") || { orders: [], purchases: [] }; }
  catch (e) { return { orders: [], purchases: [] }; }
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function bookSkus() {
  if (!window.Mercura || !window.MercuraStore) return [];
  return window.Mercura.catalog(window.MercuraStore.engineActions()).map(function (sku) {
    var copy = plain(sku);
    copy.price = sku.listPrice || sku.price;
    delete copy.listPrice;
    delete copy.status;
    delete copy.days;
    delete copy.value;
    delete copy.reviewed;
    delete copy.snoozed;
    delete copy.margin;
    return copy;
  });
}

function api(method, path, body) {
  var headers = { "Content-Type": "application/json" };
  var token = readToken();
  if (token) headers.Authorization = "Bearer " + token;
  return fetch(path, {
    method: method,
    headers: headers,
    body: body ? JSON.stringify(body) : undefined
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      if (!res.ok) {
        var err = new Error((data && data.error) || "database-unavailable");
        err.code = (data && data.error) || "database-unavailable";
        throw err;
      }
      return data;
    });
  });
}

function applyBook(data) {
  syncStamp("Synced");
  applying = true;
  try {
    if (data.merchant) {
      rememberProfile(data.merchant);
      user = { uid: data.merchant.uid, email: data.merchant.email };
    }
    var clearance = data.clearance || {};
    var locked = data.locked || {};
    (data.skus || []).forEach(function (sku) {
      if (sku.clearance) clearance[sku.id] = Number(sku.clearance) || 0;
      if (sku.locked) locked[sku.id] = true;
      delete sku.clearance;
      delete sku.locked;
    });
    if (window.Mercura) window.Mercura.replaceCatalog(data.skus || []);
    if (window.MercuraStore) {
      window.MercuraStore.state = {
        added: [],
        removed: [],
        salesHistory: data.sales || [],
        clearance: clearance,
        locked: locked
      };
      window.MercuraStore.saveState();
    }
    if (user && user.uid) {
      localStorage.setItem("mercura_live_" + user.uid, JSON.stringify({
        orders: data.orders || [],
        purchases: data.purchases || []
      }));
    }
  } finally {
    applying = false;
  }
  paintEmpty();
}

var pending = false;
var retried = false;

function bookBody() {
  var state = window.MercuraStore.state || {};
  var live = liveState();
  return {
    skus: bookSkus(),
    sales: state.salesHistory || [],
    orders: live.orders || [],
    purchases: live.purchases || []
  };
}

async function pushNow() {
  if (!user || !user.uid || applying || !window.MercuraStore) return;
  pending = false;
  await api("PUT", "/api/store", bookBody());
  retried = false;
  syncStamp("Saved");
}

function syncStamp(label) {
  var el = document.getElementById("live-sync-time");
  if (el) el.textContent = label + " " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function saveFailed(err) {
  console.warn("Could not save the store book", err);
  pending = true;
  syncStamp("Save failed");
  if (typeof window.showToast === "function") window.showToast("Could not save to your store database. Retrying.", "error");
  if (retried) return;
  retried = true;
  setTimeout(schedulePush, 3000);
}

function schedulePush() {
  if (!user || !user.uid || applying) return;
  pending = true;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(function () {
    pushNow().catch(saveFailed);
  }, 400);
}

function saveNow() {
  clearTimeout(pushTimer);
  if (!user || !user.uid) return Promise.resolve(false);
  return pushNow().then(function () { return true; }, function (err) { saveFailed(err); return false; });
}

// ponytail: keepalive caps the body at 64 KB, about 300 SKUs. Imports call saveNow, so only small edits wait on this.
window.addEventListener("pagehide", function () {
  if (!pending || !user || !user.uid || applying || !window.MercuraStore) return;
  var token = readToken();
  if (!token) return;
  try {
    fetch("/api/store", {
      method: "PUT",
      keepalive: true,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(bookBody())
    });
  } catch (e) {}
});

function goDashboard(extra) {
  var page = (window.MercuraAuth && window.MercuraAuth.page) || "";
  if (page === "login.html") location.replace("index.html?view=dashboard" + (extra || ""));
}

function finishBoot() {
  if (window.MercuraAuth && window.MercuraAuth.ready) window.MercuraAuth.ready();
  paintEmpty();
  var params = new URLSearchParams(location.search);
  var view = params.get("view") || "dashboard";
  if (user && GUARD[view] && typeof window.switchFrame === "function") window.switchFrame(view);
  if (user && params.get("hi") === "1" && typeof window.showToast === "function") {
    var who = profile();
    window.showToast("Welcome back, " + ((who && who.name) || "there") + "!");
  }
}

async function enter(mode, fields) {
  var path = mode === "register" ? "/api/auth/register" : "/api/auth/login";
  var data = await api("POST", path, {
    email: fields.email,
    password: fields.password,
    name: fields.name,
    shop: fields.shop,
    phone: fields.phone,
    category: fields.category
  });
  var previous = profile();
  if (previous && previous.uid !== data.merchant.uid) forgetLocal(previous.uid);
  storeToken(data.token, !!fields.remember);
  user = { uid: data.merchant.uid, email: data.merchant.email };
  rememberProfile(data.merchant);
  goDashboard(mode === "register" ? "&new=1" : "&hi=1");
  return data;
}

async function boot() {
  var page = window.MercuraAuth && window.MercuraAuth.page;
  var token = readToken();
  if (token && page === "login.html") {
    goDashboard("&hi=1");
    return;
  }
  if (!token) {
    user = null;
    if (window.MercuraAuth && window.MercuraAuth.protectedPage) location.replace("login.html");
    else finishBoot();
    return;
  }
  user = { token: token };
  try {
    applyBook(await api("GET", "/api/store"));
  } catch (err) {
    console.warn(err);
    if (err && (err.code === "unauthorized" || err.code === "database-unavailable")) {
      if (err.code === "unauthorized") {
        clearToken();
        user = null;
        forgetLocal((profile() || {}).uid);
        if (window.Mercura) window.Mercura.replaceCatalog([]);
      }
      if (window.MercuraAuth && window.MercuraAuth.protectedPage) {
        location.replace("login.html");
        return;
      }
    }
  }
  finishBoot();
}

window.MercuraCloud = {
  uid: uid,
  user: function () { return user && user.uid ? user : null; },
  schedulePush: schedulePush,
  saveNow: saveNow,
  enter: enter,
  api: api,
  loadSample: async function () {
    if (!user) { location.href = "login.html"; return; }
    applyBook(await api("POST", "/api/store/sample"));
    if (typeof window.showToast === "function") window.showToast("Sample store loaded.");
  },
  signOut: async function () {
    clearTimeout(pushTimer);
    var id = uid() || ((profile() || {}).uid || "");
    user = null;
    try { await api("POST", "/api/auth/logout"); } catch (e) {}
    clearToken();
    forgetLocal(id);
    sessionStorage.clear();
    if (window.Mercura) window.Mercura.replaceCatalog([]);
    location.replace("login.html");
  }
};

window.mercuraGuardFrame = function (frameName) {
  if (!GUARD[frameName]) return true;
  if (user && user.uid) return true;
  location.href = "login.html";
  return false;
};

if (window.MercuraStore && window.MercuraStore.subscribe) {
  window.MercuraStore.subscribe(function () { paintEmpty(); });
}

boot();
