(function () {
  if (!document.getElementById("copilot-panel") && !window.MercuraCopilot) {
    var engine = document.createElement("script");
    engine.src = "engine.js";
    engine.onload = function () {
      var chat = document.createElement("script");
      chat.src = "copilot.js";
      document.body.appendChild(chat);
    };
    document.body.appendChild(engine);
  }
  var routes = [
    ["Dashboard", "dashboard.html"],
    ["Inventory", "inventory.html"],
    ["Sales", "sales.html"],
    ["Stock Alerts", "alerts.html"],
    ["AI Insights", "insights.html"],
    ["Cash Flow", "cash.html"],
    ["Settings", "settings.html"]
  ];
  document.querySelectorAll(".mx-link").forEach(function (a) {
    var label = (a.innerText || "").replace(/\s+/g, " ").trim();
    routes.forEach(function (pair) {
      if (label.indexOf(pair[0]) !== -1) a.setAttribute("href", pair[1]);
    });
  });
  document.querySelectorAll("aside img").forEach(function (logo) {
    logo.style.cursor = "pointer";
    logo.addEventListener("click", function () { location.href = "index.html"; });
  });
  document.querySelectorAll("form").forEach(function (form) {
    if (form.querySelector("input[type='password'], input[type='email']")) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        location.href = "dashboard.html";
      });
    }
  });
  document.querySelectorAll("button[type='submit']").forEach(function (btn) {
    if (/sign in/i.test(btn.textContent || "")) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        location.href = "dashboard.html";
      });
    }
  });
  document.querySelectorAll("tr, article, .group").forEach(function (row) {
    var text = row.textContent || "";
    if (text.indexOf("JKT-409") === -1 && text.indexOf("Winter Heavy Jacket") === -1) return;
    row.style.cursor = "pointer";
    row.addEventListener("click", function (e) {
      if (e.target.closest("a, input, select")) return;
      location.href = "product.html";
    });
  });
  var roll = document.getElementById("inv-roll");
  if (roll) {
    var body = roll.querySelector("tbody");
    if (body) body.insertAdjacentHTML("beforeend", body.innerHTML);
    var paused = false;
    roll.addEventListener("mouseenter", function () { paused = true; });
    roll.addEventListener("mouseleave", function () { paused = false; });
    roll.addEventListener("click", function (e) {
      var row = e.target.closest("tr");
      if (!row) return;
      var text = row.textContent || "";
      if (text.indexOf("JKT-409") === -1 && text.indexOf("Winter Heavy Jacket") === -1) return;
      if (e.target.closest("a, input, select")) return;
      location.href = "product.html";
    });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    function step() {
      var half = roll.scrollHeight / 2;
      if (!paused && half > roll.clientHeight) {
        roll.scrollTop += 0.45;
        if (roll.scrollTop >= half) roll.scrollTop = 0;
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  document.querySelectorAll("a").forEach(function (a) {
    if (/View Inventory Balance/i.test(a.textContent || "")) a.setAttribute("href", "inventory.html");
  });
})();
