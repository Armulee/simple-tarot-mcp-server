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
 * The layout mirrors the simple-tarot web app's card picker: a question header,
 * a "selected X/N" counter, the "costs 1 star" line, Shuffle / Pick-for-me /
 * overflow controls, and a linear horizontally-scrollable deck of face-down
 * cosmic cards that the user slides upward to select. The user's real star
 * balance (structuredContent.stars) is shown top-right. UI language follows
 * structuredContent.locale (th | en), falling back to detecting Thai script in
 * the question. The deck arrives via the draw_tarot_spread tool result
 * (structuredContent.deck: 78 pre-shuffled cards); picks map to deck indices so
 * the server-side shuffle stays authoritative.
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
    --bg-deepest: #08060f;
    --bg-deep: #0e0b1a;
    --panel: rgba(255, 255, 255, 0.04);
    --border: rgba(255, 255, 255, 0.12);
    --gold: #f5c451;
    --ink: #f3ecf7;
    --ink-dim: #9b93ad;
    --edge-blue: #15a6ff;
    --edge-purple: #b56cff;
    --sigil: #fcd34d;
    --aura-blue: rgba(59, 130, 246, 0.85);
    --aura-purple: rgba(124, 58, 237, 0.7);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { background: transparent; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Thai", sans-serif;
    color: var(--ink);
    user-select: none; -webkit-user-select: none;
  }
  #stage {
    position: relative; overflow: hidden; border-radius: 20px;
    background: radial-gradient(130% 90% at 50% -10%, var(--bg-deep) 0%, var(--bg-deepest) 70%);
    border: 1px solid var(--border);
    padding: 18px 14px 18px;
    min-height: 300px;
  }
  /* twinkling starfield */
  .cstars { position: absolute; inset: 0; pointer-events: none; z-index: 0; background-repeat: repeat; background-size: 200px 100px; }
  .cstars.c1 {
    background-image: radial-gradient(1px 1px at 25px 15px, #fff, transparent),
      radial-gradient(2px 2px at 55px 85px, #fff, transparent),
      radial-gradient(1px 1px at 95px 25px, #fff, transparent),
      radial-gradient(2px 2px at 135px 75px, #fff, transparent),
      radial-gradient(1px 1px at 175px 45px, #fff, transparent);
    animation: twinkle-a 4.3s ease-in-out infinite;
  }
  .cstars.c2 {
    background-image: radial-gradient(2px 2px at 45px 65px, #fff, transparent),
      radial-gradient(1px 1px at 85px 35px, #fff, transparent),
      radial-gradient(2px 2px at 125px 85px, #fff, transparent),
      radial-gradient(1px 1px at 165px 15px, #fff, transparent),
      radial-gradient(1px 1px at 195px 55px, #fff, transparent);
    animation: twinkle-b 3.5s ease-in-out infinite;
  }
  @keyframes twinkle-a { 0%, 100% { opacity: 0.2; } 10% { opacity: 0.6; } 45% { opacity: 0.3; } 70% { opacity: 0.9; } 85% { opacity: 0.4; } }
  @keyframes twinkle-b { 0%, 100% { opacity: 0.45; } 25% { opacity: 0.2; } 50% { opacity: 0.85; } 75% { opacity: 0.3; } }
  #stage > :not(.cstars) { position: relative; z-index: 1; }

  /* ---- star balance badge (top-right) ---- */
  #starbadge {
    position: absolute; top: 12px; right: 12px; z-index: 3;
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 11px 5px 9px; border-radius: 999px;
    background: rgba(245, 196, 81, 0.12);
    border: 1px solid rgba(245, 196, 81, 0.4);
    color: var(--gold); font-size: 13px; font-weight: 700;
    box-shadow: 0 0 14px rgba(245, 196, 81, 0.15);
  }
  #starbadge[hidden] { display: none; }
  #starbadge svg { width: 14px; height: 14px; fill: var(--gold); }

  /* ---- header ---- */
  header { text-align: center; padding: 4px 34px 0; }
  #question {
    font-size: 12px; color: var(--ink-dim); margin-bottom: 6px;
    overflow: hidden; text-overflow: ellipsis; display: -webkit-box;
    -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  }
  #question:empty { display: none; }
  #counter { font-size: 19px; font-weight: 700; color: var(--ink); line-height: 1.3; }
  #starcost {
    display: inline-flex; align-items: center; gap: 6px; margin-top: 8px;
    font-size: 13px; color: var(--gold);
  }
  #starcost svg { width: 14px; height: 14px; fill: var(--gold); }
  #starcost[hidden] { display: none; }

  /* ---- control buttons ---- */
  #controls { display: flex; justify-content: center; align-items: center; gap: 9px; margin: 15px 0 4px; }
  #controls[hidden] { display: none; }
  .ctl {
    display: inline-flex; align-items: center; gap: 6px;
    font-family: inherit; font-size: 13px; color: var(--ink);
    background: var(--panel); border: 1px solid var(--border);
    border-radius: 999px; padding: 8px 15px; cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .ctl:active { background: rgba(255, 255, 255, 0.09); }
  .ctl svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .ctl.icon { padding: 8px; width: 38px; justify-content: center; }
  .ctl.icon svg { fill: currentColor; stroke: none; }
  .ctl[disabled] { opacity: 0.4; pointer-events: none; }
  #menuwrap { position: relative; }
  #menu {
    position: absolute; top: calc(100% + 6px); right: 0; z-index: 5;
    min-width: 150px; padding: 5px; border-radius: 12px;
    background: #171325; border: 1px solid var(--border);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
  }
  #menu[hidden] { display: none; }
  .menu-item {
    display: flex; align-items: center; gap: 9px; width: 100%;
    font-family: inherit; font-size: 13px; color: var(--ink); text-align: left;
    background: transparent; border: 0; border-radius: 8px; padding: 9px 10px; cursor: pointer;
  }
  .menu-item:active { background: rgba(255, 255, 255, 0.07); }
  .menu-item svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

  /* ---- the linear deck (slide a card up to pick) ---- */
  #deckwrap {
    margin-top: 10px; overflow-x: auto; overflow-y: hidden;
    -webkit-overflow-scrolling: touch; scrollbar-width: none; touch-action: pan-x;
  }
  #deckwrap[hidden] { display: none; }
  #deckwrap::-webkit-scrollbar { display: none; }
  #deck { position: relative; height: 232px; }
  .dcard {
    position: absolute; bottom: 6px; width: 76px; height: 114px;
    cursor: grab; touch-action: pan-x; will-change: transform;
    transition: transform 0.18s ease, opacity 0.4s ease;
  }
  .dcard.dragging { transition: none; cursor: grabbing; }
  .dcard .cframe {
    width: 100%; height: 100%; border-radius: 14px; padding: 1px;
    background: linear-gradient(135deg, var(--edge-blue), var(--edge-purple) 50%, var(--edge-blue));
    box-shadow: 0 6px 14px rgba(0, 0, 0, 0.5);
  }
  .dcard .cwhite { width: 100%; height: 100%; border-radius: 13px; background: #fff; padding: 3px; }
  .dcard .cinner {
    position: relative; width: 100%; height: 100%; border-radius: 10px; overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: inset 0 0 26px rgba(0, 0, 0, 0.6);
    background:
      radial-gradient(circle at 30% 20%, rgba(123, 44, 191, 0.9) 0%, transparent 42%),
      radial-gradient(circle at 70% 80%, rgba(0, 188, 212, 0.85) 0%, transparent 46%),
      linear-gradient(135deg, #05081a 0%, #1a0b2e 60%, #3b0f4a 100%);
    display: flex; align-items: center; justify-content: center; transition: filter 0.3s ease;
  }
  .dcard .cinner::before {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background:
      radial-gradient(1px 1px at 20% 30%, #fff 99%, transparent),
      radial-gradient(1px 1px at 80% 60%, #fff 99%, transparent),
      radial-gradient(1px 1px at 40% 80%, #fff 99%, transparent),
      radial-gradient(1px 1px at 60% 20%, #fff 99%, transparent),
      radial-gradient(1px 1px at 75% 25%, #fff 99%, transparent);
  }
  .dcard .csigil { position: relative; color: var(--sigil); font-size: 22px; line-height: 1; text-shadow: 0 0 8px rgba(252, 211, 77, 0.6); }
  .dcard.aura .cframe { box-shadow: 0 0 0 2px var(--aura-blue), 0 0 24px 8px var(--aura-purple), 0 0 54px 20px rgba(59, 130, 246, 0.5); }
  .dcard.aura .cinner { filter: saturate(1.25) brightness(1.08); }
  .dcard.taken { opacity: 0; pointer-events: none; }
  @media (hover: hover) { .dcard:not(.taken):hover .cinner { filter: brightness(1.15); } }

  /* swipe-up teaching overlay */
  #swipehint {
    position: absolute; z-index: 6; pointer-events: none; transform: translateX(-50%);
    display: none; flex-direction: column; align-items: center;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6));
  }
  #swipehint.show { display: flex; }
  #swipehint .ring {
    width: 42px; height: 42px; border: 2px solid #fff; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    animation: sbounce 0.9s ease-in-out infinite;
  }
  #swipehint .ring svg { width: 22px; height: 22px; stroke: #fff; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  #swipehint .pill { margin-top: 6px; font-size: 10px; color: #fff; white-space: nowrap; background: rgba(0, 0, 0, 0.5); padding: 2px 9px; border-radius: 999px; }
  @keyframes sbounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
  #deckhint { text-align: center; font-size: 12px; color: var(--ink-dim); opacity: 0.9; margin-top: 6px; }
  #deckhint[hidden] { display: none; }

  /* ---- done / status panel ---- */
  #panel { margin: 16px auto 4px; max-width: 340px; text-align: center; font-size: 13px; line-height: 1.6; color: var(--ink); }
  #panel[hidden] { display: none; }
  #panel .big { font-size: 15px; color: var(--gold); margin-bottom: 4px; }
  #resend {
    margin-top: 10px; padding: 9px 22px; font-size: 13px; font-family: inherit;
    color: #1a1030; background: linear-gradient(180deg, #f7d878, var(--gold));
    border: none; border-radius: 999px; cursor: pointer; font-weight: 700;
  }
  #resend[hidden] { display: none; }

  .waiting #controls, .waiting #deckwrap, .waiting #deckhint, .waiting #starcost { display: none; }
  .shimmer { animation: shimmer 1.6s ease-in-out infinite; }
  @keyframes shimmer { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }

  @media (prefers-reduced-motion: reduce) {
    .dcard { transition: none; }
    .shimmer, .cstars, #swipehint .ring { animation: none; }
  }
</style>
</head>
<body>
<div id="stage" class="waiting">
  <div class="cstars c1"></div>
  <div class="cstars c2"></div>
  <div id="starbadge" hidden><svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg><b id="starcount">0</b></div>
  <header>
    <p id="question"></p>
    <p id="counter" class="shimmer">Shuffling the deck…</p>
    <p id="starcost" hidden><svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg><span id="starcost-text"></span></p>
  </header>

  <div id="controls" hidden>
    <button id="btn-shuffle" class="ctl" type="button">
      <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v5h-5"/></svg>
      <span id="lbl-shuffle"></span>
    </button>
    <button id="btn-pick" class="ctl" type="button">
      <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 3l1.7 4.6L18 9l-4.3 1.4L12 15l-1.7-4.6L6 9l4.3-1.4z"/></svg>
      <span id="lbl-pick"></span>
    </button>
    <div id="menuwrap">
      <button id="btn-menu" class="ctl icon" type="button" aria-label="More">
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>
      </button>
      <div id="menu" hidden>
        <button id="btn-reset" class="menu-item" type="button">
          <svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/></svg>
          <span id="lbl-reset"></span>
        </button>
      </div>
    </div>
  </div>

  <section id="deckwrap" aria-label="The deck" hidden><div id="deck"></div></section>
  <p id="deckhint" hidden></p>

  <div id="panel" hidden>
    <p class="big" id="panel-title"></p>
    <p id="panel-body"></p>
    <button id="resend" hidden></button>
  </div>
</div>
<script>
(function () {
  "use strict";

  /* ---------- localisation (mirrors simple-tarot card-ui.ts) ---------- */
  var I18N = {
    en: {
      selected: function (s, t) { return "You have selected " + s + "/" + t + " cards"; },
      consumeStar: "Drawing cards will consume 1 star",
      shuffle: "Shuffle", pick: "Pick for me", reset: "Start over",
      swipe: "Swipe up on a card to select", shuffling: "Shuffling the deck…",
      spread: { single: "Single Card", three_card: "Three Cards", celtic_cross: "Celtic Cross" },
      sending: "🔮 Sending your cards to Claude…",
      sent: "✨ Cards sent to Claude", sentBody: "Return to the conversation to read your interpretation.",
      saved: "✨ Cards saved", savedBody: "Tell Claude “I've picked my cards — please interpret them” to read your interpretation.",
      cancelled: "The card draw was cancelled", cancelledBody: "Close this view and start a new draw whenever you're ready.",
      failTitle: "Could not send the cards", retry: "Try again",
      incomplete: "Card data incomplete", incompleteBody: "Call the draw_tarot_spread tool again.",
      noconn: "Could not connect to the conversation window"
    },
    th: {
      selected: function (s, t) { return "คุณเลือกไพ่แล้ว " + s + "/" + t + " ใบ"; },
      consumeStar: "การจั่วไพ่จะใช้ดวงดาว 1 ดวง",
      shuffle: "สับไพ่", pick: "เลือกให้หน่อย", reset: "เริ่มเลือกใหม่",
      swipe: "ปัดขึ้นบนไพ่เพื่อเลือก", shuffling: "กำลังสับไพ่…",
      spread: { single: "ไพ่ใบเดียว", three_card: "ไพ่สามใบ", celtic_cross: "เซลติกครอส" },
      sending: "🔮 กำลังส่งไพ่ให้ Claude…",
      sent: "✨ ส่งไพ่ให้ Claude แล้ว", sentBody: "กลับไปที่บทสนทนาเพื่ออ่านคำทำนายของคุณ",
      saved: "✨ บันทึกไพ่แล้ว", savedBody: "บอก Claude ว่า “ฉันเลือกไพ่แล้ว ช่วยตีความให้หน่อย” เพื่ออ่านคำทำนาย",
      cancelled: "การจั่วไพ่ถูกยกเลิก", cancelledBody: "ปิดหน้านี้แล้วเริ่มจั่วใหม่ได้ทุกเมื่อ",
      failTitle: "ส่งไพ่ไม่สำเร็จ", retry: "ลองอีกครั้ง",
      incomplete: "ข้อมูลไพ่ไม่ครบ", incompleteBody: "กรุณาเรียกเครื่องมือ draw_tarot_spread อีกครั้ง",
      noconn: "เชื่อมต่อกับหน้าต่างสนทนาไม่ได้"
    }
  };
  var T = I18N.en;
  function isThai(s) { return typeof s === "string" && /[\\u0E00-\\u0E7F]/.test(s); }

  /* ---------- minimal MCP Apps JSON-RPC client over postMessage ---------- */
  var PROTOCOL_VERSION = "2026-01-26";
  var pending = new Map();
  var nextId = 1;
  var hostCaps = null;
  var toolCancelled = false;

  function post(msg) { msg.jsonrpc = "2.0"; window.parent.postMessage(msg, "*"); }
  function request(method, params) {
    return new Promise(function (resolve, reject) {
      var id = nextId++;
      pending.set(id, { resolve: resolve, reject: reject });
      post({ id: id, method: method, params: params });
    });
  }
  function notify(method, params) { post({ method: method, params: params || {} }); }

  window.addEventListener("message", function (ev) {
    if (ev.source !== window.parent) return;
    var m = ev.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.id !== undefined && m.method === undefined) {
      var p = pending.get(m.id);
      if (p) { pending.delete(m.id); if (m.error) p.reject(m.error); else p.resolve(m.result); }
      return;
    }
    if (m.method !== undefined && m.id !== undefined) {
      if (m.method === "ping" || m.method === "ui/resource-teardown") post({ id: m.id, result: {} });
      else post({ id: m.id, error: { code: -32601, message: "Method not found: " + m.method } });
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
  var spread = null;       // { spread_type, spread_name, positions, deck, locale, stars }
  var picks = [];          // { position, card }
  var taken = new Set();   // taken deck indices
  var deckOrder = [];      // deck indices in current display order
  var sending = false;

  var el = function (id) { return document.getElementById(id); };

  function onToolInput(params) {
    var args = params.arguments || {};
    if (typeof args.question === "string" && args.question.trim()) {
      if (!spread && isThai(args.question)) { T = I18N.th; document.documentElement.lang = "th"; }
      el("question").textContent = "“" + args.question.trim() + "”";
      sendSize();
    }
  }

  function onToolCancelled() {
    toolCancelled = true;
    showPanel(T.cancelled, T.cancelledBody, false);
  }

  function onToolResult(result) {
    if (spread) return;
    var sc = result && result.structuredContent;
    if (!sc || !Array.isArray(sc.deck) || !Array.isArray(sc.positions)) {
      showPanel(T.incomplete, T.incompleteBody, false);
      return;
    }
    spread = sc;

    // language: server locale wins, else detect Thai in the question
    if (sc.locale === "th" || (sc.locale !== "en" && isThai(sc.question))) T = I18N.th;
    else T = I18N.en;
    document.documentElement.lang = (T === I18N.th) ? "th" : "en";

    if (typeof sc.question === "string" && sc.question) el("question").textContent = "“" + sc.question + "”";

    // static labels
    el("lbl-shuffle").textContent = T.shuffle;
    el("lbl-pick").textContent = T.pick;
    el("lbl-reset").textContent = T.reset;
    el("deckhint").textContent = T.swipe;
    el("starcost-text").textContent = T.consumeStar;

    // star balance badge
    if (typeof sc.stars === "number" && sc.stars >= 0) {
      el("starcount").textContent = String(sc.stars);
      el("starbadge").hidden = false;
    }

    deckOrder = sc.deck.map(function (_, i) { return i; });
    buildDeck();

    el("counter").classList.remove("shimmer");
    updateCounter();
    el("starcost").hidden = false;
    el("controls").hidden = false;
    el("deckwrap").hidden = false;
    el("deckhint").hidden = false;
    document.getElementById("stage").classList.remove("waiting");
    centerDeck();
    sendSize();
  }

  /* ---------- deck build & geometry ---------- */
  var CARD_W = 76, CARD_H = 114, STEP = 46, PAD = 14;
  var hintEl = null;

  function makeHint() {
    var hint = document.createElement("div");
    hint.id = "swipehint";
    hint.innerHTML =
      '<div class="ring"><svg viewBox="0 0 24 24"><path d="M7 11l5-5m0 0l5 5m-5-5v12"/></svg></div>' +
      '<div class="pill"></div>';
    return hint;
  }

  function createCardEl(idx, pos) {
    var c = document.createElement("div");
    c.className = "dcard";
    c.dataset.i = String(idx);
    c.style.left = (PAD + pos * STEP) + "px";
    c.style.zIndex = String(pos + 1);
    c.setAttribute("role", "button");
    c.setAttribute("aria-label", "Face-down card — slide up to choose");
    var frame = document.createElement("div"); frame.className = "cframe";
    var white = document.createElement("div"); white.className = "cwhite";
    var inner = document.createElement("div"); inner.className = "cinner";
    var sigil = document.createElement("div"); sigil.className = "csigil"; sigil.textContent = "✷";
    inner.appendChild(sigil); white.appendChild(inner); frame.appendChild(white); c.appendChild(frame);
    c.addEventListener("pointerdown", onPointerDown);
    c.addEventListener("pointermove", onPointerMove);
    c.addEventListener("pointerup", onPointerUp);
    c.addEventListener("pointercancel", onPointerCancel);
    return c;
  }

  function buildDeck() {
    var deck = el("deck");
    deck.innerHTML = "";
    var disp = deckOrder.filter(function (i) { return !taken.has(i); });
    var n = disp.length;
    deck.style.width = (PAD * 2 + STEP * Math.max(0, n - 1) + CARD_W) + "px";
    disp.forEach(function (idx, pos) { deck.appendChild(createCardEl(idx, pos)); });
    if (!hintEl) hintEl = makeHint();
    var pill = hintEl.querySelector(".pill");
    if (pill) pill.textContent = T.swipe;
    deck.appendChild(hintEl);
  }

  function centerDeck() {
    var wrap = el("deckwrap");
    var deckW = el("deck").scrollWidth;
    wrap.scrollLeft = Math.max(0, (deckW - wrap.clientWidth) / 2);
  }

  function cardElByIndex(i) { return el("deck").querySelector('[data-i="' + i + '"]'); }

  /* ---------- slide-up-to-pick gesture ---------- */
  var drag = null, hintTimer = null;

  function pickable() {
    return spread && !toolCancelled && !sending && picks.length < spread.positions.length;
  }

  function readTranslateY(elm) {
    var m = window.getComputedStyle(elm).transform;
    if (!m || m === "none") return 0;
    var v = m.match(/-?\\d+\\.?\\d*/g);
    if (!v) return 0;
    if (v.length === 6) return parseFloat(v[5]) || 0;
    if (v.length === 16) return parseFloat(v[13]) || 0;
    return 0;
  }

  function onPointerDown(ev) {
    if (!ev.isPrimary) return;
    hideMenu();
    var cardEl = ev.currentTarget;
    if (cardEl.classList.contains("taken")) return;
    drag = {
      el: cardEl, i: Number(cardEl.dataset.i),
      startX: ev.clientX, startY: ev.clientY,
      startScroll: el("deckwrap").scrollLeft,
      pointerId: ev.pointerId, type: ev.pointerType, mode: null, moved: false
    };
  }

  function onPointerMove(ev) {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    var dx = ev.clientX - drag.startX;
    var dy = ev.clientY - drag.startY;
    if (drag.mode === null) {
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
      if (Math.abs(dy) > Math.abs(dx) + 8) {
        drag.mode = "lift";
        try { drag.el.setPointerCapture(drag.pointerId); } catch (e) {}
        drag.el.classList.add("dragging");
        hideSwipeHint();
      } else if (Math.abs(dx) > Math.abs(dy) + 8) {
        if (drag.type === "mouse" || drag.type === "pen") {
          drag.mode = "scroll";
          try { drag.el.setPointerCapture(drag.pointerId); } catch (e) {}
        } else { drag.mode = "native"; }
      } else { return; }
    }
    if (drag.mode === "lift") {
      ev.preventDefault();
      var ty = Math.max(-CARD_H, Math.min(0, dy));
      var rot = Math.max(-8, ty / 20);
      drag.el.style.transform = "translateY(" + ty + "px) rotate(" + rot + "deg)";
      drag.el.style.zIndex = "500";
      if (-ty >= 0.5 * CARD_H) drag.el.classList.add("aura");
      else drag.el.classList.remove("aura");
    } else if (drag.mode === "scroll") {
      ev.preventDefault();
      el("deckwrap").scrollLeft = drag.startScroll - dx;
    }
  }

  function onPointerUp(ev) {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    var cardEl = drag.el, mode = drag.mode;
    if (mode === "lift") {
      var up = -readTranslateY(cardEl);
      cardEl.classList.remove("dragging", "aura");
      if (up >= 0.5 * CARD_H && pickable() && !taken.has(drag.i)) {
        selectCard(drag.i, cardEl);
      } else {
        cardEl.style.zIndex = String((deckOrder.indexOf(drag.i) + 1) || 1);
        cardEl.style.transform = "translateY(0) rotate(0deg)";
      }
    } else if (!mode && !drag.moved) {
      showSwipeHint(cardEl);
    }
    drag = null;
  }

  function onPointerCancel(ev) {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    if (drag.mode === "lift") {
      drag.el.classList.remove("dragging", "aura");
      drag.el.style.transform = "translateY(0) rotate(0deg)";
    }
    drag = null;
  }

  function selectCard(i, cardEl) {
    if (taken.has(i)) return;
    taken.add(i);
    var card = spread.deck[i];
    var pos = spread.positions[picks.length];
    picks.push({ position: pos, card: card });
    cardEl.style.transition = "transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.45s ease";
    cardEl.style.transform = "translateY(-135%) rotate(-6deg)";
    cardEl.classList.add("taken");
    updateCounter();
    if (picks.length === spread.positions.length) setTimeout(finishPicking, 900);
  }

  function updateCounter() {
    if (!spread) return;
    el("counter").textContent = T.selected(picks.length, spread.positions.length);
  }

  /* ---------- controls: shuffle / pick-for-me / reset ---------- */
  function shuffleDeckUI() {
    if (!spread || sending || toolCancelled) return;
    hideMenu();
    var untaken = deckOrder.filter(function (i) { return !taken.has(i); });
    for (var k = untaken.length - 1; k > 0; k--) {
      var j = Math.floor(Math.random() * (k + 1));
      var t = untaken[k]; untaken[k] = untaken[j]; untaken[j] = t;
    }
    deckOrder = untaken;
    buildDeck();
    centerDeck();
  }

  function pickForMe() {
    if (!pickable()) return;
    hideMenu();
    var remaining = spread.positions.length - picks.length;
    var avail = deckOrder.filter(function (i) { return !taken.has(i); });
    for (var k = avail.length - 1; k > 0; k--) {
      var j = Math.floor(Math.random() * (k + 1));
      var t = avail[k]; avail[k] = avail[j]; avail[j] = t;
    }
    avail.slice(0, remaining).forEach(function (idx, n) {
      setTimeout(function () {
        if (!pickable() || taken.has(idx)) return;
        var c = cardElByIndex(idx);
        if (!c) return;
        c.style.zIndex = "500";
        c.classList.add("aura");
        setTimeout(function () { var cc = cardElByIndex(idx); if (cc) selectCard(idx, cc); }, 220);
      }, n * 430);
    });
  }

  function resetPicks() {
    if (sending || toolCancelled) return;
    hideMenu();
    taken.clear();
    picks = [];
    deckOrder = spread.deck.map(function (_, i) { return i; });
    buildDeck();
    centerDeck();
    updateCounter();
    sendSize();
  }

  function toggleMenu() { var m = el("menu"); m.hidden = !m.hidden; }
  function hideMenu() { var m = el("menu"); if (m) m.hidden = true; }

  el("btn-shuffle").addEventListener("click", shuffleDeckUI);
  el("btn-pick").addEventListener("click", pickForMe);
  el("btn-menu").addEventListener("click", function (e) { e.stopPropagation(); toggleMenu(); });
  el("btn-reset").addEventListener("click", resetPicks);
  document.addEventListener("click", function (e) {
    if (!el("menuwrap").contains(e.target)) hideMenu();
  });

  /* ---------- swipe-up teaching overlay ---------- */
  function showSwipeHint(cardEl) {
    if (!hintEl) return;
    var left = parseFloat(cardEl.style.left) + CARD_W / 2;
    hintEl.style.left = left + "px";
    hintEl.style.bottom = (6 + CARD_H + 8) + "px";
    hintEl.classList.add("show");
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(hideSwipeHint, 1900);
  }
  function hideSwipeHint() {
    if (hintEl) hintEl.classList.remove("show");
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
  }

  /* ---------- finish & send ---------- */
  function finishPicking() {
    hideSwipeHint();
    el("controls").hidden = true;
    el("deckwrap").hidden = true;
    el("deckhint").hidden = true;
    sendResults();
  }

  function pickSummaryLines() {
    return picks.map(function (p) {
      return p.position.index + ". " + p.position.label + ": " + p.card.name +
        (p.card.reversed ? " (Reversed)" : " (Upright)");
    });
  }

  function showPanel(title, body, withRetry) {
    el("panel").hidden = false;
    el("panel-title").textContent = title;
    el("panel-body").textContent = body;
    el("resend").textContent = T.retry;
    el("resend").hidden = !withRetry;
    sendSize();
  }

  function sendResults() {
    if (sending) return;
    sending = true;
    showPanel(T.sending, "", false);

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
          orientation: p.card.reversed ? "reversed" : "upright"
        };
      })
    };

    var attempt;
    if (hostCaps && hostCaps.message) {
      attempt = request("ui/message", { role: "user", content: [{ type: "text", text: text }] })
        .then(function () { showPanel(T.sent, T.sentBody, false); });
    } else if (hostCaps && hostCaps.updateModelContext) {
      attempt = request("ui/update-model-context", { content: [{ type: "text", text: text }], structuredContent: structured })
        .then(function () { showPanel(T.saved, T.savedBody, false); });
    } else {
      attempt = Promise.reject(new Error("host does not support ui/message or ui/update-model-context"));
    }
    attempt.catch(function () {
      sending = false;
      showPanel(T.failTitle, lines.join("\\n"), true);
    });
  }

  el("resend").addEventListener("click", sendResults);

  /* ---------- handshake ---------- */
  request("ui/initialize", {
    protocolVersion: PROTOCOL_VERSION,
    appInfo: { name: "askingfate-tarot-picker", version: "2.0.0" },
    appCapabilities: { availableDisplayModes: ["inline"] }
  }).then(function (result) {
    hostCaps = (result && result.hostCapabilities) || {};
    notify("ui/notifications/initialized");
    sendSize();
  }).catch(function () {
    showPanel(T.noconn, T.incompleteBody, false);
  });

  window.addEventListener("resize", sendSize);
})();
</script>
</body>
</html>`;
