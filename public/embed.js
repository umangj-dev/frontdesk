// FrontDesk AI — embeddable widget.
// A client pastes ONE line on their site and gets a floating AI chat bubble:
//   <script src="https://YOURHOST/embed.js" data-client="their-id" async></script>
// No framework, works on any website (WordPress, Squarespace, Wix, Webflow, raw HTML).
(function () {
  var s = document.currentScript;
  var client = (s && s.getAttribute("data-client")) || "demo-clinic";
  var origin = (s && s.src) ? new URL(s.src).origin : "";
  var accent = (s && s.getAttribute("data-accent")) || "#19c3a3";

  // Floating launcher button
  var btn = document.createElement("button");
  btn.setAttribute("aria-label", "Chat with us");
  btn.style.cssText = [
    "position:fixed", "bottom:22px", "right:22px", "z-index:2147483000",
    "width:60px", "height:60px", "border-radius:50%", "border:0", "cursor:pointer",
    "background:" + accent, "color:#04130f", "font-size:26px",
    "box-shadow:0 10px 30px -6px rgba(0,0,0,.45)", "transition:transform .15s",
  ].join(";");
  btn.innerHTML = "&#128172;"; // speech balloon
  btn.onmouseenter = function () { btn.style.transform = "scale(1.06)"; };
  btn.onmouseleave = function () { btn.style.transform = "scale(1)"; };

  // Chat panel (iframe to the hosted widget)
  var frame = document.createElement("iframe");
  frame.src = origin + "/?client=" + encodeURIComponent(client) + "&embed=1";
  frame.style.cssText = [
    "position:fixed", "bottom:94px", "right:22px", "z-index:2147483000",
    "width:380px", "height:560px", "max-width:calc(100vw - 44px)",
    "max-height:calc(100vh - 130px)", "border:0", "border-radius:18px",
    "box-shadow:0 24px 70px -20px rgba(0,0,0,.55)", "display:none", "background:#0b0d10",
  ].join(";");

  var open = false;
  btn.onclick = function () {
    open = !open;
    frame.style.display = open ? "block" : "none";
    btn.innerHTML = open ? "&#10005;" : "&#128172;";
  };

  function mount() {
    document.body.appendChild(frame);
    document.body.appendChild(btn);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
