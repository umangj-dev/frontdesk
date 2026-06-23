/* FrontDesk — chat widget loader
 * Usage:  <script src="https://frontdesk.works/embed.js" data-client="demo-clinic" async></script>
 * Drops an AI chat bubble in the corner of ANY site. Style-isolated via Shadow DOM so it
 * never collides with the host theme (WordPress / Squarespace / Wix / Webflow / Shopify / raw HTML).
 *
 * BACKEND SEAM: replace `askAI()` below with a fetch() to your endpoint. Everything else is UI.
 */
(function () {
  "use strict";
  if (window.__frontdeskLoaded) return;
  window.__frontdeskLoaded = true;

  // --- resolve config -------------------------------------------------------
  var script = document.currentScript || (function () {
    var s = document.getElementsByTagName("script");
    return s[s.length - 1];
  })();
  var CLIENT_ID = (script && script.getAttribute("data-client")) || "demo-clinic";
  var BASE = (function () {
    try { return script.src.replace(/embed\.js.*$/, ""); } catch (e) { return ""; }
  })();

  // --- per-client config (in production: GET BASE + 'clients/' + CLIENT_ID + '.json') ---
  var CLIENTS = {
    "demo-clinic": {
      name: "Lumière Aesthetics",
      accent: "#28cdab",
      greeting: "Hi 👋 I’m the front desk for Lumière Aesthetics. Ask me about treatments, prices or hours — or I can book you in right now.",
      hours: "Mon–Sat 9am–6pm · AI front desk open 24/7",
      phone: "(604) 555-0142",
      services: [
        { name: "Botox", price: "from $12/unit" },
        { name: "Dermal fillers", price: "from $650" },
        { name: "HydraFacial", price: "$199" },
        { name: "Laser hair removal", price: "from $120" },
        { name: "Free consultation", price: "$0" }
      ]
    }
  };
  var CFG = CLIENTS[CLIENT_ID] || {
    name: "Our front desk", accent: "#28cdab",
    greeting: "Hi 👋 How can I help? I can answer questions or book you an appointment.",
    hours: "Open 24/7", phone: "", services: []
  };
  var BOOK_URL = BASE + "book.html?client=" + encodeURIComponent(CLIENT_ID);

  // --- inject brand fonts once (outside shadow; shadow can still use them) ---
  if (!document.getElementById("fd-fonts")) {
    var l = document.createElement("link");
    l.id = "fd-fonts"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Instrument+Serif&display=swap";
    document.head.appendChild(l);
  }

  // --- host + shadow root ---------------------------------------------------
  var host = document.createElement("div");
  host.id = "frontdesk-widget";
  host.style.cssText = "position:fixed;z-index:2147483000;bottom:0;right:0;";
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: "open" });

  var A = CFG.accent;
  root.innerHTML = [
    "<style>",
    ":host,*{box-sizing:border-box;margin:0;padding:0}",
    ".wrap{position:fixed;bottom:24px;right:24px;font-family:'Inter',-apple-system,system-ui,sans-serif}",
    "@media(max-width:480px){.wrap{bottom:16px;right:16px;left:16px}}",
    /* bubble */
    ".bubble{margin-left:auto;width:60px;height:60px;border-radius:50%;background:" + A + ";border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 12px 34px -8px rgba(0,0,0,.45);transition:transform .3s cubic-bezier(.16,1,.3,1);position:relative}",
    ".bubble:hover{transform:translateY(-3px) scale(1.04)}",
    ".bubble svg{width:26px;height:26px;color:#042019}",
    ".bubble .close-i{display:none}",
    ".wrap.open .bubble .chat-i{display:none}",
    ".wrap.open .bubble .close-i{display:block}",
    ".dot{position:absolute;top:-2px;right:-2px;width:16px;height:16px;border-radius:50%;background:#f0c270;border:2px solid #0c0b0a;color:#0c0b0a;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center}",
    ".wrap.open .dot{display:none}",
    /* panel */
    ".panel{position:absolute;bottom:78px;right:0;width:380px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 120px);background:#0c0b0a;border:1px solid rgba(244,239,228,.12);border-radius:18px;overflow:hidden;display:flex;flex-direction:column;opacity:0;transform:translateY(14px) scale(.98);pointer-events:none;transition:opacity .3s,transform .3s cubic-bezier(.16,1,.3,1);box-shadow:0 30px 80px -20px rgba(0,0,0,.7)}",
    ".wrap.open .panel{opacity:1;transform:none;pointer-events:auto}",
    /* header */
    ".hd{padding:18px 20px;border-bottom:1px solid rgba(244,239,228,.09);display:flex;align-items:center;gap:12px;background:#131210}",
    ".av{width:38px;height:38px;border-radius:10px;background:" + A + ";display:flex;align-items:center;justify-content:center;color:#042019;font-family:'Instrument Serif',serif;font-size:20px;flex-shrink:0}",
    ".hd .nm{font-family:'Instrument Serif',serif;font-size:18px;color:#f4efe4;line-height:1.1}",
    ".hd .st{font-size:11.5px;color:" + A + ";display:flex;align-items:center;gap:5px;margin-top:2px}",
    ".hd .st .p{width:6px;height:6px;border-radius:50%;background:" + A + ";animation:pulse 2s infinite}",
    "@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}",
    /* messages */
    ".msgs{flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:10px}",
    ".msgs::-webkit-scrollbar{width:6px}.msgs::-webkit-scrollbar-thumb{background:rgba(244,239,228,.12);border-radius:3px}",
    ".m{max-width:82%;padding:11px 14px;font-size:14px;line-height:1.5;border-radius:14px;white-space:pre-wrap;word-wrap:break-word}",
    ".m.ai{background:#1b1916;color:#e8e2d6;border:1px solid rgba(244,239,228,.08);border-bottom-left-radius:4px;align-self:flex-start}",
    ".m.u{background:" + A + ";color:#042019;align-self:flex-end;border-bottom-right-radius:4px;font-weight:500}",
    ".typing{align-self:flex-start;display:flex;gap:4px;padding:13px 15px;background:#1b1916;border:1px solid rgba(244,239,228,.08);border-radius:14px;border-bottom-left-radius:4px}",
    ".typing span{width:6px;height:6px;border-radius:50%;background:#8a8174;animation:bl 1.4s infinite}",
    ".typing span:nth-child(2){animation-delay:.2s}.typing span:nth-child(3){animation-delay:.4s}",
    "@keyframes bl{0%,80%,100%{opacity:.25}40%{opacity:1}}",
    /* quick replies */
    ".chips{display:flex;flex-wrap:wrap;gap:7px;padding:0 18px 6px}",
    ".chip{font-size:12.5px;color:#e8e2d6;background:transparent;border:1px solid rgba(244,239,228,.18);border-radius:100px;padding:7px 13px;cursor:pointer;transition:all .2s;font-family:inherit}",
    ".chip:hover{border-color:" + A + ";color:" + A + "}",
    ".cta{margin:0 18px 8px;display:block;text-align:center;background:" + A + ";color:#042019;font-weight:600;font-size:13.5px;padding:11px;border-radius:10px;text-decoration:none;font-family:inherit}",
    /* input */
    ".inp{display:flex;gap:8px;padding:14px;border-top:1px solid rgba(244,239,228,.09);background:#131210}",
    ".inp input{flex:1;background:#0c0b0a;border:1px solid rgba(244,239,228,.14);border-radius:10px;padding:11px 13px;color:#f4efe4;font-size:14px;font-family:inherit;outline:none}",
    ".inp input:focus{border-color:" + A + "}",
    ".inp button{background:" + A + ";border:none;border-radius:10px;width:42px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}",
    ".inp button svg{width:18px;height:18px;color:#042019}",
    ".foot{text-align:center;font-size:10.5px;color:#5d564c;padding:0 0 9px;background:#131210;letter-spacing:.03em}",
    ".foot b{color:#8a8174;font-weight:500}",
    "</style>",
    "<div class='wrap' part='wrap'>",
    "  <div class='panel'>",
    "    <div class='hd'>",
    "      <div class='av'>" + (CFG.name.charAt(0) || "F") + "</div>",
    "      <div><div class='nm'>" + esc(CFG.name) + "</div><div class='st'><span class='p'></span>Online now · replies instantly</div></div>",
    "    </div>",
    "    <div class='msgs' id='msgs'></div>",
    "    <div class='chips' id='chips'></div>",
    "    <a class='cta' id='cta' href='" + esc(BOOK_URL) + "' target='_blank' rel='noopener'>📅 Book an appointment</a>",
    "    <div class='inp'>",
    "      <input id='ti' type='text' placeholder='Type your message…' autocomplete='off' />",
    "      <button id='send' aria-label='Send'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z'/></svg></button>",
    "    </div>",
    "    <div class='foot'>Powered by <b>FrontDesk</b></div>",
    "  </div>",
    "  <button class='bubble' id='bub' aria-label='Open chat'>",
    "    <span class='dot'>1</span>",
    "    <svg class='chat-i' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/></svg>",
    "    <svg class='close-i' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round'><path d='M18 6 6 18M6 6l12 12'/></svg>",
    "  </button>",
    "</div>"
  ].join("");

  // --- refs -----------------------------------------------------------------
  var wrap = root.querySelector(".wrap");
  var bub = root.getElementById("bub");
  var msgs = root.getElementById("msgs");
  var chips = root.getElementById("chips");
  var ti = root.getElementById("ti");
  var sendBtn = root.getElementById("send");
  var greeted = false;

  bub.addEventListener("click", function () {
    wrap.classList.toggle("open");
    if (wrap.classList.contains("open")) {
      if (!greeted) { greeted = true; setTimeout(function () { ai(CFG.greeting); setChips(["What are your prices?", "What are your hours?", "Book an appointment"]); }, 350); }
      setTimeout(function () { ti.focus(); }, 320);
    }
  });
  sendBtn.addEventListener("click", submit);
  ti.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });

  function submit() {
    var v = ti.value.trim(); if (!v) return;
    user(v); ti.value = ""; clearChips();
    var t = typing();
    askAI(v).then(function (reply) {
      t.remove(); ai(reply.text);
      if (reply.chips) setChips(reply.chips);
    });
  }

  // --- message rendering ----------------------------------------------------
  function bubbleEl(cls, text) { var d = document.createElement("div"); d.className = "m " + cls; d.textContent = text; msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d; }
  function user(t) { return bubbleEl("u", t); }
  function ai(t) { return bubbleEl("ai", t); }
  function typing() { var d = document.createElement("div"); d.className = "typing"; d.innerHTML = "<span></span><span></span><span></span>"; msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d; }
  function clearChips() { chips.innerHTML = ""; }
  function setChips(arr) {
    clearChips();
    arr.forEach(function (c) {
      var b = document.createElement("button"); b.className = "chip"; b.textContent = c;
      b.addEventListener("click", function () {
        if (/book/i.test(c)) { window.open(BOOK_URL, "_blank", "noopener"); return; }
        ti.value = c; submit();
      });
      chips.appendChild(b);
    });
  }

  // --- AI ENGINE (demo) -----------------------------------------------------
  // Swap this for: fetch(BASE+'api/chat',{method:'POST',body:JSON.stringify({client:CLIENT_ID,message:q})}).then(r=>r.json())
  function askAI(q) {
    return new Promise(function (resolve) {
      var delay = 650 + Math.min(q.length * 14, 700);
      setTimeout(function () { resolve(reply(q)); }, delay);
    });
  }
  function reply(q) {
    var s = q.toLowerCase();
    if (/(price|cost|how much|pricing|\$)/.test(s)) {
      var list = CFG.services.map(function (x) { return "• " + x.name + " — " + x.price; }).join("\n");
      return { text: "Here’s a quick price guide:\n\n" + list + "\n\nWant me to book you in for one of these?", chips: ["Book an appointment", "What are your hours?"] };
    }
    if (/(hour|open|close|today|when|time)/.test(s)) return { text: "We’re open " + CFG.hours + ". I can take a booking any time — even right now. Want a slot?", chips: ["Book an appointment", "What are your prices?"] };
    if (/(book|appointment|appt|schedule|slot|availab)/.test(s)) return { text: "Perfect — I’ll get you booked. Tap below and pick a time that works; it drops straight into our calendar.", chips: ["📅 Book an appointment"] };
    if (/(where|location|address|park)/.test(s)) return { text: "We’re easy to find and there’s parking on-site. Want me to text you the exact address when you book?", chips: ["Book an appointment"] };
    if (/(phone|call|number|speak|human|talk)/.test(s)) return { text: (CFG.phone ? "You can reach the team at " + CFG.phone + " during opening hours. " : "") + "Or I can sort it right here — what do you need?", chips: ["Book an appointment", "What are your prices?"] };
    if (/(hi|hello|hey|yo)\b/.test(s)) return { text: "Hi! 😊 Happy to help. I can answer questions about treatments and prices, or book you straight in.", chips: ["What are your prices?", "Book an appointment"] };
    if (/(thank|thanks|ty|cheers)/.test(s)) return { text: "Anytime! 💛 Want me to lock in an appointment while you’re here?", chips: ["Book an appointment"] };
    return { text: "Great question — let me make sure you get the right answer. I can give you prices and hours instantly, or book you in and have the team confirm the details.", chips: ["What are your prices?", "What are your hours?", "Book an appointment"] };
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
})();
