import React, { useRef } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

function bindHandlers(root) {
  root.querySelectorAll("*").forEach(function (el) {
    Array.from(el.attributes).forEach(function (attr) {
      if (!/^on[a-z]+$/i.test(attr.name)) return;
      var eventName = attr.name.slice(2);
      var code = attr.value;
      el.removeAttribute(attr.name);
      el.addEventListener(eventName, function (event) {
        return new Function("event", code).call(this, event);
      });
    });
  });
}

function MercuraScreen() {
  var ref = useRef(null);
  return <div id="mercura-screen" ref={ref} style={{ display: "contents" }} />;
}

var host = document.getElementById("root");
var view = document.getElementById("mercura-view");
if (host && view) {
  var root = createRoot(host);
  flushSync(function () {
    root.render(<MercuraScreen />);
  });
  var screen = document.getElementById("mercura-screen");
  screen.appendChild(view.content.cloneNode(true));
  bindHandlers(screen);
}
