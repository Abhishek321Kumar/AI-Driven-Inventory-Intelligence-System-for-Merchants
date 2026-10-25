(function () {
  var PROTECTED = {
    "dashboard.html": 1,
    "inventory.html": 1,
    "alerts.html": 1,
    "sales.html": 1,
    "cash.html": 1,
    "settings.html": 1,
    "product.html": 1,
    "insights.html": 1,
    "index.html": 1
  };

  function file() {
    return location.pathname.split("/").pop() || "index.html";
  }

  var page = file();
  var protectedPage = !!PROTECTED[page];
  if (protectedPage && !localStorage.getItem("mercura_pg_token") && !sessionStorage.getItem("mercura_pg_token")) {
    location.replace("login.html");
    return;
  }
  if (protectedPage) {
    document.documentElement.setAttribute("data-booting", "1");
    var style = document.createElement("style");
    style.textContent = "html[data-booting] body{visibility:hidden}html[data-booting]::before{content:'';position:fixed;inset:0;background:#0B1F2A;z-index:99999}html[data-booting]::after{content:'MERCURA';position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);color:#D4AF37;font:800 18px sans-serif;letter-spacing:.2em;z-index:100000}";
    document.documentElement.appendChild(style);
  }

  function merchant() {
    try { return JSON.parse(localStorage.getItem("mercura_active_merchant") || "null"); }
    catch (e) { return null; }
  }

  function paint() {
    var user = merchant();
    if (!user || !document.body) return;
    var who = user.username || user.name || "";
    document.querySelectorAll("[data-merchant]").forEach(function (el) {
      var key = el.getAttribute("data-merchant");
      var value = key === "name" || key === "first" || key === "username" ? who : (key === "fullname" ? (user.name || who) : user[key]);
      if (value) el.textContent = value;
    });
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (!node.parentNode || /^(SCRIPT|STYLE)$/.test(node.parentNode.tagName)) continue;
      if (node.nodeValue.indexOf("Rajesh") === -1) continue;
      node.nodeValue = node.nodeValue.replace(/Rajesh Sharma/g, who).replace(/Rajesh S\./g, who).replace(/\bRajesh\b/g, who);
    }
    var card = document.querySelector(".mx-merchant");
    if (!card) return;
    var name = card.querySelector("b");
    var shop = card.querySelector("span");
    if (name && who) name.textContent = who;
    if (shop) shop.textContent = user.shop || "";
  }

  window.MercuraAuth = {
    merchant: merchant,
    paint: paint,
    page: page,
    protectedPage: protectedPage,
    signOut: function () {
      if (window.MercuraCloud && window.MercuraCloud.signOut) return window.MercuraCloud.signOut();
      location.replace("login.html");
    },
    ready: function () {
      document.documentElement.removeAttribute("data-booting");
      paint();
    }
  };

  setTimeout(function () {
    if (document.documentElement.hasAttribute("data-booting")) document.documentElement.removeAttribute("data-booting");
  }, 12000);

  window.addEventListener("pageshow", function (event) {
    if (!event.persisted || !protectedPage) return;
    if (!(window.MercuraCloud && window.MercuraCloud.user())) location.replace("login.html");
  });
})();
