/**
 * Self-contained HTML for the tarot card-picking MCP App.
 *
 * Runs inside a sandboxed iframe: all CSS/JS is inline, no network requests,
 * no localStorage/sessionStorage — state lives in JS memory only. The page
 * speaks the MCP Apps protocol (spec 2026-01-26) over JSON-RPC postMessage:
 *
 *   view → host  request       ui/initialize, ui/message, ui/update-model-context
 *   view → host  notification  ui/notifications/initialized, ui/notifications/size-changed
 *   host → view  notification  ui/notifications/tool-input, ui/notifications/tool-result,
 *                              ui/notifications/tool-cancelled
 *   host → view  request       ping, ui/resource-teardown
 *
 * The card deck arrives via the draw_tarot_spread tool result
 * (structuredContent.deck: 78 pre-shuffled cards). The user taps cards in the
 * fan; picks map to deck indices, so the server-side shuffle stays authoritative.
 */

export const TAROT_APP_URI = "ui://askingfate/tarot-picker.html";

export const TAROT_APP_HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>AskingFate — Tarot Reading</title>
<style>
  :root {
    --purple-deepest: #140a26;
    --purple-deep: #1f1038;
    --purple-mid: #2d1b4e;
    --purple-soft: #47307a;
    --gold: #d4af37;
    --gold-bright: #f0c75e;
    --gold-dim: #9c7f2c;
    --ink: #f3ecdc;
    --ink-dim: #b8a98a;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { background: transparent; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: var(--ink);
    user-select: none;
    -webkit-user-select: none;
  }
  #stage {
    position: relative;
    overflow: hidden;
    border-radius: 16px;
    background:
      radial-gradient(120% 80% at 50% 0%, var(--purple-mid) 0%, var(--purple-deep) 55%, var(--purple-deepest) 100%);
    border: 1px solid rgba(212, 175, 55, 0.35);
    padding: 18px 12px 20px;
    min-height: 300px;
  }
  #stage::before {
    content: "";
    position: absolute; inset: 6px;
    border: 1px solid rgba(212, 175, 55, 0.18);
    border-radius: 12px;
    pointer-events: none;
  }
  /* Twinkling starfield — same repeating patterns as the main site's cosmic background */
  .cstars {
    position: absolute; inset: 0; pointer-events: none; z-index: 0;
    background-repeat: repeat; background-size: 200px 100px;
  }
  .cstars.c1 {
    background-image: radial-gradient(1px 1px at 25px 15px, white, transparent),
      radial-gradient(2px 2px at 55px 85px, white, transparent),
      radial-gradient(1px 1px at 95px 25px, white, transparent),
      radial-gradient(2px 2px at 135px 75px, white, transparent),
      radial-gradient(1px 1px at 175px 45px, white, transparent);
    animation: twinkle-a 4.3s ease-in-out infinite;
  }
  .cstars.c2 {
    background-image: radial-gradient(2px 2px at 45px 65px, white, transparent),
      radial-gradient(1px 1px at 85px 35px, white, transparent),
      radial-gradient(2px 2px at 125px 85px, white, transparent),
      radial-gradient(1px 1px at 165px 15px, white, transparent),
      radial-gradient(1px 1px at 195px 55px, white, transparent);
    animation: twinkle-b 3.5s ease-in-out infinite;
  }
  @keyframes twinkle-a { 0%, 100% { opacity: 0.2; } 10% { opacity: 0.7; } 45% { opacity: 0.3; } 70% { opacity: 1; } 85% { opacity: 0.4; } }
  @keyframes twinkle-b { 0%, 100% { opacity: 0.5; } 25% { opacity: 0.2; } 50% { opacity: 0.9; } 75% { opacity: 0.3; } }
  #stage > :not(.cstars) { position: relative; z-index: 1; }
  header { text-align: center; position: relative; }
  header h1 {
    font-size: 15px; letter-spacing: 0.35em; text-transform: uppercase;
    color: var(--gold-bright); font-weight: 600;
  }
  header .rule {
    width: 140px; height: 1px; margin: 8px auto;
    background: linear-gradient(90deg, transparent, var(--gold), transparent);
  }
  #subtitle { font-size: 13px; color: var(--ink-dim); }
  #question {
    font-size: 13px; color: var(--ink); margin-top: 6px; font-style: italic;
    overflow: hidden; text-overflow: ellipsis; display: -webkit-box;
    -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  }
  #question:empty { display: none; }

  /* ---- chosen-card slots ---- */
  #slots {
    display: flex; flex-wrap: wrap; justify-content: center;
    gap: 10px; margin: 16px 4px 4px;
  }
  .slot { width: 78px; text-align: center; }
  body.s-10 .slot { width: 58px; }
  .slot .well {
    position: relative; width: 100%; aspect-ratio: 5 / 8;
    perspective: 700px;
  }
  .slot .flip {
    position: absolute; inset: 0;
    transform-style: preserve-3d;
    transition: transform 0.7s cubic-bezier(0.25, 0.7, 0.3, 1);
  }
  .slot.filled .flip { transform: rotateY(180deg); }
  .face {
    position: absolute; inset: 0; border-radius: 7px;
    backface-visibility: hidden; -webkit-backface-visibility: hidden;
  }
  .face.back {
    border: 1px dashed rgba(212, 175, 55, 0.5);
    background: rgba(212, 175, 55, 0.06);
    display: flex; align-items: center; justify-content: center;
    color: var(--gold-dim); font-size: 18px;
  }
  .face.front {
    transform: rotateY(180deg);
    background:
      radial-gradient(100% 130% at 50% 0%, #3a2564 0%, #241344 70%, #190c30 100%);
    border: 1px solid var(--gold);
    box-shadow: 0 0 14px rgba(212, 175, 55, 0.45), inset 0 0 0 2px rgba(212, 175, 55, 0.25);
    overflow: hidden;
  }
  .cardface {
    position: absolute; inset: 0; padding: 6px 3px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  }
  .cardface.rev { transform: rotate(180deg); }
  .cardface .glyph { font-size: 17px; color: var(--gold-bright); line-height: 1; }
  .cardface .numeral { font-size: 10px; color: var(--gold); letter-spacing: 0.1em; }
  .cardface .name {
    font-size: 10px; font-weight: 700; color: var(--ink);
    text-align: center; line-height: 1.25; word-break: break-word;
  }
  body.s-10 .cardface .glyph { font-size: 13px; }
  body.s-10 .cardface .name { font-size: 8px; }
  .revbadge {
    position: absolute; top: 3px; right: 4px; font-size: 9px; color: var(--gold-bright);
  }
  .slot .plabel {
    margin-top: 5px; font-size: 10px; color: var(--gold); line-height: 1.3;
    letter-spacing: 0.02em;
  }
  .slot.filled .well { animation: glowpulse 0.9s ease-out; }
  @keyframes glowpulse {
    0% { filter: drop-shadow(0 0 0 rgba(240, 199, 94, 0)); }
    40% { filter: drop-shadow(0 0 16px rgba(240, 199, 94, 0.9)); }
    100% { filter: drop-shadow(0 0 0 rgba(240, 199, 94, 0)); }
  }

  #counter {
    text-align: center; font-size: 12px; color: var(--ink-dim); margin-top: 12px;
    min-height: 16px;
  }
  #counter b { color: var(--gold-bright); font-weight: 600; }

  /* ---- the fan of face-down cards ---- */
  #fanwrap {
    margin-top: 6px; overflow-x: auto; overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  #fanwrap::-webkit-scrollbar { display: none; }
  #fan { position: relative; height: 175px; }
  .card {
    position: absolute; width: 60px; height: 94px;
    transform-origin: 50% 100%;
    transition: transform 0.25s ease, opacity 0.3s ease;
    cursor: pointer;
  }
  .card .cback {
    width: 100%; height: 100%; border-radius: 6px;
    background:
      radial-gradient(60% 45% at 50% 50%, rgba(212, 175, 55, 0.28) 0%, transparent 70%),
      repeating-linear-gradient(45deg, rgba(212, 175, 55, 0.10) 0 2px, transparent 2px 7px),
      repeating-linear-gradient(-45deg, rgba(212, 175, 55, 0.10) 0 2px, transparent 2px 7px),
      linear-gradient(160deg, #33205c 0%, #221142 55%, #170a2e 100%);
    border: 1px solid var(--gold-dim);
    box-shadow: inset 0 0 0 2px rgba(212, 175, 55, 0.22), 0 3px 8px rgba(0, 0, 0, 0.55);
    display: flex; align-items: center; justify-content: center;
  }
  .card .cback span { font-size: 16px; color: var(--gold); opacity: 0.9; text-shadow: 0 0 8px rgba(240,199,94,.6); }
  .card.taken { opacity: 0; pointer-events: none; }
  .card:not(.taken):active { filter: brightness(1.25); }
  #fanhint { text-align: center; font-size: 11px; color: var(--ink-dim); opacity: 0.8; margin-top: 2px; }

  /* ---- done / status panel ---- */
  #panel {
    margin: 14px auto 0; max-width: 340px; text-align: center;
    font-size: 13px; line-height: 1.6; color: var(--ink);
  }
  #panel[hidden] { display: none; }
  #panel .big { font-size: 15px; color: var(--gold-bright); margin-bottom: 4px; }
  #resend {
    margin-top: 10px; padding: 9px 22px; font-size: 13px; font-family: inherit;
    color: var(--purple-deepest); background: linear-gradient(180deg, var(--gold-bright), var(--gold));
    border: none; border-radius: 999px; cursor: pointer; font-weight: 700;
  }
  #resend[hidden] { display: none; }

  .waiting #slots, .waiting #fanwrap, .waiting #counter, .waiting #fanhint { display: none; }
  .shimmer { animation: shimmer 1.6s ease-in-out infinite; }
  @keyframes shimmer { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }

  @media (prefers-reduced-motion: reduce) {
    .slot .flip, .card { transition: none; }
    .slot.filled .well, .shimmer, .cstars { animation: none; }
  }
</style>
</head>
<body>
<div id="stage" class="waiting">
  <div class="cstars c1"></div>
  <div class="cstars c2"></div>
  <header>
    <h1>✦ AskingFate ✦</h1>
    <div class="rule"></div>
    <p id="subtitle" class="shimmer">Shuffling the deck…</p>
    <p id="question"></p>
  </header>
  <section id="slots" aria-label="Chosen cards"></section>
  <p id="counter"></p>
  <section id="fanwrap" aria-label="The deck"><div id="fan"></div></section>
  <p id="fanhint">Scroll through the deck, then tap the cards that call to you</p>
  <div id="panel" hidden>
    <p class="big" id="panel-title"></p>
    <p id="panel-body"></p>
    <button id="resend" hidden>Try again</button>
  </div>
</div>
<script>
(function () {
  "use strict";

  /* ---------- minimal MCP Apps JSON-RPC client over postMessage ---------- */
  var PROTOCOL_VERSION = "2026-01-26";
  var pending = new Map();
  var nextId = 1;
  var hostCaps = null;
  var toolCancelled = false;

  function post(msg) {
    msg.jsonrpc = "2.0";
    window.parent.postMessage(msg, "*");
  }
  function request(method, params) {
    return new Promise(function (resolve, reject) {
      var id = nextId++;
      pending.set(id, { resolve: resolve, reject: reject });
      post({ id: id, method: method, params: params });
    });
  }
  function notify(method, params) {
    post({ method: method, params: params || {} });
  }

  window.addEventListener("message", function (ev) {
    if (ev.source !== window.parent) return;
    var m = ev.data;
    if (!m || m.jsonrpc !== "2.0") return;

    if (m.id !== undefined && m.method === undefined) {
      var p = pending.get(m.id);
      if (p) {
        pending.delete(m.id);
        if (m.error) p.reject(m.error);
        else p.resolve(m.result);
      }
      return;
    }
    if (m.method !== undefined && m.id !== undefined) {
      if (m.method === "ping" || m.method === "ui/resource-teardown") {
        post({ id: m.id, result: {} });
      } else {
        post({ id: m.id, error: { code: -32601, message: "Method not found: " + m.method } });
      }
      return;
    }
    if (m.method === "ui/notifications/tool-input") onToolInput(m.params || {});
    else if (m.method === "ui/notifications/tool-result") onToolResult(m.params || {});
    else if (m.method === "ui/notifications/tool-cancelled") onToolCancelled(m.params || {});
  });

  function sendSize() {
    var h = document.getElementById("stage").offsetHeight + 8;
    notify("ui/notifications/size-changed", { height: h });
  }

  /* ---------- state ---------- */
  var spread = null;   // { spread_type, spread_name, positions: [...], deck: [...] }
  var picks = [];      // { position, card }
  var taken = new Set();
  var sending = false;

  var el = function (id) { return document.getElementById(id); };

  function onToolInput(params) {
    var args = params.arguments || {};
    if (typeof args.question === "string" && args.question.trim()) {
      el("question").textContent = "“" + args.question.trim() + "”";
      sendSize();
    }
  }

  function onToolCancelled() {
    toolCancelled = true;
    showPanel("The card draw was cancelled", "Close this view and start a new draw whenever you're ready.", false);
  }

  function onToolResult(result) {
    if (spread) return; // already initialised
    var sc = result && result.structuredContent;
    if (!sc || !Array.isArray(sc.deck) || !Array.isArray(sc.positions)) {
      showPanel("Card data incomplete", "Call the draw_tarot_spread tool again.", false);
      return;
    }
    spread = sc;
    if (typeof sc.question === "string" && sc.question) {
      el("question").textContent = "“" + sc.question + "”";
    }
    buildSlots();
    buildFan();
    el("subtitle").classList.remove("shimmer");
    el("subtitle").textContent = sc.spread_name + " — tap to pick " +
      sc.positions.length + (sc.positions.length > 1 ? " cards" : " card");
    document.getElementById("stage").classList.remove("waiting");
    document.body.classList.add("s-" + sc.positions.length);
    updateCounter();
    // centre the fan
    var wrap = el("fanwrap");
    var fanW = el("fan").scrollWidth;
    wrap.scrollLeft = Math.max(0, (fanW - wrap.clientWidth) / 2);
    sendSize();
  }

  function buildSlots() {
    var slots = el("slots");
    spread.positions.forEach(function (pos) {
      var slot = document.createElement("div");
      slot.className = "slot";
      slot.id = "slot-" + pos.index;

      var well = document.createElement("div");
      well.className = "well";
      var flip = document.createElement("div");
      flip.className = "flip";
      var back = document.createElement("div");
      back.className = "face back";
      back.textContent = "✧";
      var front = document.createElement("div");
      front.className = "face front";
      flip.appendChild(back);
      flip.appendChild(front);
      well.appendChild(flip);
      slot.appendChild(well);

      var label = document.createElement("div");
      label.className = "plabel";
      label.textContent = pos.index + ". " + pos.label;
      slot.appendChild(label);

      slots.appendChild(slot);
    });
  }

  function buildFan() {
    var fan = el("fan");
    var n = spread.deck.length;
    var step = 17, cardW = 60, pad = 16;
    var centre = (n - 1) / 2;
    fan.style.width = (pad * 2 + step * (n - 1) + cardW) + "px";
    for (var i = 0; i < n; i++) {
      var c = document.createElement("div");
      c.className = "card";
      c.dataset.i = String(i);
      var t = (i - centre) / centre; // -1 … 1
      c.style.left = (pad + i * step) + "px";
      c.style.top = (34 + 26 * t * t) + "px";
      c.style.transform = "rotate(" + (t * 24) + "deg)";
      c.setAttribute("role", "button");
      c.setAttribute("aria-label", "Face-down card " + (i + 1));
      var back = document.createElement("div");
      back.className = "cback";
      var star = document.createElement("span");
      star.textContent = "☾✦";
      back.appendChild(star);
      c.appendChild(back);
      c.addEventListener("click", onCardTap);
      fan.appendChild(c);
    }
  }

  function onCardTap(ev) {
    if (!spread || toolCancelled || sending) return;
    if (picks.length >= spread.positions.length) return;
    var cardEl = ev.currentTarget;
    var i = Number(cardEl.dataset.i);
    if (taken.has(i)) return;
    taken.add(i);

    var card = spread.deck[i];
    var pos = spread.positions[picks.length];
    picks.push({ position: pos, card: card });

    // lift-and-fade the tapped card out of the fan
    var current = cardEl.style.transform;
    cardEl.style.transform = current + " translateY(-26px) scale(1.06)";
    cardEl.classList.add("taken");

    fillSlot(pos, card);
    updateCounter();

    if (picks.length === spread.positions.length) {
      setTimeout(finishPicking, 950);
    }
  }

  function fillSlot(pos, card) {
    var slot = el("slot-" + pos.index);
    var front = slot.querySelector(".face.front");

    var face = document.createElement("div");
    face.className = "cardface" + (card.reversed ? " rev" : "");
    var glyph = document.createElement("div");
    glyph.className = "glyph";
    glyph.textContent = card.glyph;
    var numeral = document.createElement("div");
    numeral.className = "numeral";
    numeral.textContent = card.numeral;
    var name = document.createElement("div");
    name.className = "name";
    name.textContent = card.name;
    face.appendChild(glyph);
    face.appendChild(numeral);
    face.appendChild(name);
    front.appendChild(face);

    if (card.reversed) {
      var badge = document.createElement("div");
      badge.className = "revbadge";
      badge.textContent = "↺ Reversed";
      front.appendChild(badge);
    }
    slot.classList.add("filled");
  }

  function updateCounter() {
    if (!spread) return;
    var total = spread.positions.length;
    if (picks.length < total) {
      el("counter").innerHTML = "";
      var b = document.createElement("b");
      b.textContent = picks.length + " / " + total;
      el("counter").appendChild(document.createTextNode("Picked "));
      el("counter").appendChild(b);
      el("counter").appendChild(document.createTextNode(" cards"));
    } else {
      el("counter").textContent = "All " + total + " cards picked ✨";
    }
  }

  function pickSummaryLines() {
    return picks.map(function (p) {
      return p.position.index + ". " + p.position.label + ": " + p.card.name +
        (p.card.reversed ? " (Reversed)" : " (Upright)");
    });
  }

  function finishPicking() {
    el("fanwrap").style.display = "none";
    el("fanhint").style.display = "none";
    sendResults();
  }

  function showPanel(title, body, withRetry) {
    el("panel").hidden = false;
    el("panel-title").textContent = title;
    el("panel-body").textContent = body;
    el("resend").hidden = !withRetry;
    sendSize();
  }

  function sendResults() {
    if (sending) return;
    sending = true;
    showPanel("🔮 Sending your cards to Claude…", "", false);

    var lines = pickSummaryLines();
    var header = "The user has finished picking tarot cards — " + spread.spread_name +
      (spread.question ? " | Question: “" + spread.question + "”" : "");
    var text = header + "\\n" + lines.join("\\n") +
      "\\nPlease interpret each card in its position, connect the reading to the user's question, and close with overall guidance.";

    var structured = {
      spread_type: spread.spread_type,
      question: spread.question || null,
      selected_cards: picks.map(function (p) {
        return {
          position_index: p.position.index,
          position_key: p.position.key,
          position_label: p.position.label,
          name: p.card.name,
          orientation: p.card.reversed ? "reversed" : "upright",
        };
      }),
    };

    var attempt;
    if (hostCaps && hostCaps.message) {
      attempt = request("ui/message", { role: "user", content: [{ type: "text", text: text }] })
        .then(function () {
          showPanel("✨ Cards sent to Claude", "Return to the conversation to read your interpretation.", false);
        });
    } else if (hostCaps && hostCaps.updateModelContext) {
      attempt = request("ui/update-model-context", {
        content: [{ type: "text", text: text }],
        structuredContent: structured,
      }).then(function () {
        showPanel("✨ Cards saved", "Tell Claude “I've picked my cards — please interpret them” to read your interpretation.", false);
      });
    } else {
      attempt = Promise.reject(new Error("host does not support ui/message or ui/update-model-context"));
    }

    attempt.catch(function () {
      sending = false;
      showPanel("Could not send the cards", "Your picks:\\n" + lines.join("\\n"), true);
    });
  }

  el("resend").addEventListener("click", sendResults);

  /* ---------- handshake ---------- */
  request("ui/initialize", {
    protocolVersion: PROTOCOL_VERSION,
    appInfo: { name: "askingfate-tarot-picker", version: "1.0.0" },
    appCapabilities: { availableDisplayModes: ["inline"] },
  }).then(function (result) {
    hostCaps = (result && result.hostCapabilities) || {};
    notify("ui/notifications/initialized");
    sendSize();
  }).catch(function () {
    showPanel("Could not connect to the conversation window", "Call the draw_tarot_spread tool again.", false);
  });

  window.addEventListener("resize", sendSize);
})();
</script>
</body>
</html>`;
