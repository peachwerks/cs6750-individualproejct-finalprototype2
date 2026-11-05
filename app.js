(function () {
  "use strict";

  // ---------- Lot rules ----------
  var FREE_MIN = 120;            // first 2 hours free
  var TIER1_MIN = 300, TIER1 = 5; // up to 5 hours: $5
  var TIER2 = 10;                 // up to 12 hours: $10
  var REMIND_BEFORE = 15;         // text reminder before free time ends

  // All 50 states plus DC, alphabetical by postal code
  var STATES = ["AK", "AL", "AR", "AZ", "CA", "CO", "CT", "DC", "DE", "FL", "GA", "HI", "IA", "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY"];

  // ---------- Demo profile used by the wizard ----------
  var DEMO = { name: "Jamie Morgan", plate: "JMK4821", state: "GA", contactType: "phone", contact: "(404) 555-0147", auto: true };

  // ---------- State ----------
  var KEY = "parking-app-proto";
  var state = load() || fresh();
  state.weak = false;
  var draft = { plate: "", state: "GA", name: "", contactType: "phone", contact: "", remember: true, auto: false };
  var errors = {};
  var confirmEnd = false;

  function fresh() {
    return { screen: "register", offset: 0, profile: null, session: null, last: null, messages: [], unread: 0, weak: false };
  }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  // ---------- Simulated clock ----------
  var base = Date.now();
  function now() { return base + state.offset * 60000; }
  function fmt(t) { return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
  function dur(min) {
    min = Math.max(0, Math.round(min));
    var h = Math.floor(min / 60), m = min % 60;
    return (h ? h + " h " : "") + m + " min";
  }
  // "2 hours", "1 hour 45 minutes", "15 minutes"
  function words(min) {
    min = Math.max(0, Math.ceil(min));
    var h = Math.floor(min / 60), m = min % 60, out = [];
    if (h) out.push(h + (h === 1 ? " hour" : " hours"));
    if (m || !h) out.push(m + (m === 1 ? " minute" : " minutes"));
    return out.join(" ");
  }
  function elapsed(s) { return (now() - s.start) / 60000; }
  function charge(min) { return min <= FREE_MIN ? 0 : min <= TIER1_MIN ? TIER1 : TIER2; }
  function freeUntil(start) { return start + FREE_MIN * 60000; }

  // ---------- Helpers ----------
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function maskContact(p) {
    if (p.contactType === "email") return p.contact;
    var d = p.contact.replace(/\D/g, "");
    return "(•••) •••-" + d.slice(-4);
  }
  function go(screen) { state.screen = screen; confirmEnd = false; save(); render(); $("scroller").scrollTop = 0; }

  var toastTimer;
  function toast(msg) {
    var old = document.querySelector(".toast"); if (old) old.remove();
    var t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
    $("phone").appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.remove(); }, 2200);
  }

  // ---------- Text messages: arrive 2 s after the action, with a ding ----------
  var TEXT_DELAY = 2000;
  var audio = null;
  function unlockAudio() {
    // Browsers only allow sound after a tap or click, so create it on the first one
    if (audio) return;
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
  }
  function ding() {
    if (!audio) return;
    try {
      if (audio.state === "suspended") audio.resume();
      var t0 = audio.currentTime;
      // Two quick bell-like notes, similar to a phone's text alert
      [[1318.5, 0], [1760, 0.12]].forEach(function (n) {
        var osc = audio.createOscillator(), gain = audio.createGain();
        osc.type = "sine"; osc.frequency.value = n[0];
        gain.gain.setValueAtTime(0.0001, t0 + n[1]);
        gain.gain.exponentialRampToValueAtTime(0.25, t0 + n[1] + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n[1] + 0.5);
        osc.connect(gain).connect(audio.destination);
        osc.start(t0 + n[1]); osc.stop(t0 + n[1] + 0.55);
      });
    } catch (e) {}
  }

  var notifTimer;
  function text(msg) {
    var sentAt = now();
    setTimeout(function () {
      state.messages.unshift({ t: sentAt, msg: msg });
      state.unread += 1; save();
      if (state.screen === "messages" || state.screen === "lock") { render(); }
      else {
        $("notifText").textContent = msg; $("notif").hidden = false;
        clearTimeout(notifTimer); notifTimer = setTimeout(function () { $("notif").hidden = true; }, 6000);
      }
      ding();
      renderChrome();
    }, TEXT_DELAY);
  }

  // ---------- Screens ----------
  var rates = "Then $" + TIER1 + " up to 5 hours · $" + TIER2 + " up to 12 hours";

  function freeBanner(start, big) {
    var s = state.session;
    if (s && big) {
      var used = elapsed(s), left = FREE_MIN - used, over = left < 0;
      var after = "After, $" + TIER1 + " up to 5 hours and $" + TIER2 + " up to 12 hours";
      return '<div class="free big' + (over ? " over" : "") + '">' +
        '<span class="lbl">' + (over ? "Free parking ended at" : "Free parking until") + '</span>' +
        '<span class="time">' + fmt(freeUntil(s.start)) + '</span>' +
        '<span class="rates"><strong>' + (over ? "You owe $" + charge(used) + " so far" : words(left) + " remaining") + '</strong><br>' +
          (over ? "$" + TIER1 + " up to 5 hours and $" + TIER2 + " up to 12 hours" : after) + '</span></div>';
    }
    return '<div class="free reg"><span class="lbl">Register now and park free until</span>' +
      '<span class="time" id="freeNow">' + fmt(freeUntil(start)) + '</span>' +
      '<span class="rates">' + rates + '</span></div>';
  }

  function viewRegister() {
    var p = state.profile;
    var welcome = p ? '<div class="card"><div class="ok-head"><span class="ok-dot">✓</span><div><h2>Welcome back, ' + esc(p.name.split(" ")[0]) + '</h2>' +
      '<p class="sub"><span class="plate">' + esc(p.plate) + '</span> · ' + esc(p.state) + '</p></div></div>' +
      '<button class="btn" type="button" data-action="quick">Park now with saved details</button>' +
      '<button class="link" type="button" data-action="forget">Not you? Use different details</button></div>' : "";

    var form = p ? "" :
      '<div class="card"><div class="step-head"><span class="num">1</span><h2>Your vehicle</h2></div>' +
        '<div class="field"><label for="plate">License plate</label><div class="row">' +
          '<div class="plate-wrap"><input type="text" id="plate" autocomplete="off" autocapitalize="characters" maxlength="8" placeholder="e.g. ABC1234" value="' + esc(draft.plate) + '"' + (errors.plate ? ' class="bad" aria-invalid="true"' : "") + '>' +
          // Hidden file input: on phones, capture="environment" opens the rear camera directly
          '<input type="file" id="plateCam" accept="image/*" capture="environment" hidden>' +
          '<button type="button" class="cam-btn" data-action="scan" aria-label="Scan plate with camera (optional)" title="Scan plate (optional)">' +
            '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg>' +
          '</button></div>' +
          '<select id="pstate" aria-label="Plate state">' + STATES.map(function (s) { return "<option" + (s === draft.state ? " selected" : "") + ">" + s + "</option>"; }).join("") + '</select></div>' +
          (errors.plate ? '<span class="err">' + errors.plate + '</span>' : '<span class="hint">Optionally, tap the icon to use your camera</span>') +
        '</div></div>' +

      '<div class="card"><div class="step-head"><span class="num">2</span><h2>How we reach you</h2></div>' +
        '<div class="field"><label for="name">Name</label><input type="text" id="name" autocomplete="name" value="' + esc(draft.name) + '"' + (errors.name ? ' class="bad"' : "") + '>' +
          (errors.name ? '<span class="err">' + errors.name + '</span>' : "") + '</div>' +
        '<div class="field"><div class="label-row"><label for="contact">' + (draft.contactType === "phone" ? "Mobile number" : "Email") + '</label>' +
          '<button class="link" type="button" data-action="swapContact">' + (draft.contactType === "phone" ? "Use email instead" : "Use phone instead") + '</button></div>' +
          '<input type="' + (draft.contactType === "phone" ? "tel" : "email") + '" id="contact" autocomplete="' + (draft.contactType === "phone" ? "tel" : "email") + '" placeholder="' + (draft.contactType === "phone" ? "(555) 555-5555" : "you@example.com") + '" value="' + esc(draft.contact) + '"' + (errors.contact ? ' class="bad"' : "") + '>' +
          (errors.contact ? '<span class="err">' + errors.contact + '</span>' : '<span class="hint">We\'ll send your confirmation and a reminder ' + REMIND_BEFORE + ' minutes before free parking ends.</span>') +
          '</div></div>' +

      '<div class="card"><div class="step-head"><span class="num">3</span><h2>Next time</h2></div>' +
        '<label class="check"><input type="checkbox" id="remember"' + (draft.remember ? " checked" : "") + '><span>Remember me on this phone<small>Next visit is one tap.</small></span></label>' +
        '<label class="check"><input type="checkbox" id="auto"' + (draft.auto ? " checked" : "") + '><span>Sign me up for AUTO<small>Skip this form next time. Cameras in the parking lot automatically register you to park.</small></span></label>' +
        '<button class="link" type="button" data-action="howAuto">How AUTO works</button></div>' +

      '<button class="btn" type="button" data-action="register" id="regBtn">Register to park</button>' +
      '<p class="note">No card needed now. You only pay if you stay past the free time.</p>';

    return freeBanner(now(), false) + welcome + form;
  }

  function viewConfirm() {
    var s = state.session;
    if (!s) return viewRegister();
    var used = elapsed(s), owed = charge(used);
    var head = owed
      ? '<div class="ok-head"><span class="ok-dot warn-dot">!</span><div><h1>Your free time is up</h1><p class="sub">Pay now, or pay when you leave.</p></div></div>'
      : '<div class="ok-head"><span class="ok-dot">✓</span><div><h1>' + (s.viaAuto ? "You\'re automatically checked in" : "You\'re registered") + '</h1><p class="sub">We\'ll send you a text and let you know when your parking is up.</p></div></div>';
    var actions = owed
      ? '<button class="btn" type="button" data-action="pay">Pay $' + owed + ' now</button>'
      : '<button class="btn secondary" type="button" data-action="calendar">Add reminder to calendar</button>';
    var end = '<button class="btn secondary" type="button" data-action="bookmark">Add bookmark for next time</button>';

    return head + freeBanner(s.start, true) +
      '<div class="card"><dl class="details">' +
        '<dt>Vehicle</dt><dd><span class="plate">' + esc(s.plate) + '</span> · ' + esc(s.state) + '</dd>' +
        '<dt>Parked at</dt><dd>' + fmt(s.start) + '</dd>' +
        '<dt>Time parked</dt><dd>' + dur(used) + '</dd>' +
        '<dt>Texts go to</dt><dd>' + esc(maskContact(s)) + '</dd>' +
        '<dt>AUTO</dt><dd>' + (s.auto ? "On" : "Off") + '</dd>' +
      '</dl></div><div class="btns">' + actions + end + '</div>';
  }

  function viewPay() {
    var s = state.session; if (!s) return viewRegister();
    var used = elapsed(s), owed = charge(used);
    return '<h1>Pay for parking</h1>' +
      '<div class="card"><dl class="details">' +
        '<dt>Parked</dt><dd>' + fmt(s.start) + ' – ' + fmt(now()) + '</dd>' +
        '<dt>Time parked</dt><dd>' + dur(used) + '</dd>' +
        '<dt>First 2 hours</dt><dd>Free</dd>' +
        '<dt>Total</dt><dd>$' + owed.toFixed(2) + '</dd></dl></div>' +
      '<div class="card"><div class="field"><label for="card">Card number</label><input type="text" id="card" value="4242 4242 4242 4242" inputmode="numeric"></div>' +
        '<div class="row" style="grid-template-columns:1fr 1fr"><div class="field"><label for="exp">Expiry</label><input type="text" id="exp" value="12 / 29"></div>' +
        '<div class="field"><label for="cvc">Security code</label><input type="text" id="cvc" value="123"></div></div>' +
        '<p class="hint">Demo only. Nothing is charged and nothing you type is sent anywhere.</p></div>' +
      '<div class="btns"><button class="btn" type="button" data-action="payNow">Pay $' + owed + '</button>' +
      '<button class="btn ghost" type="button" data-action="back">Back</button></div>';
  }

  function viewDone() {
    var l = state.last;
    var body = l ? '<div class="card"><dl class="details">' +
      '<dt>Vehicle</dt><dd><span class="plate">' + esc(l.plate) + '</span></dd>' +
      '<dt>Parked</dt><dd>' + fmt(l.start) + ' – ' + fmt(l.end) + '</dd>' +
      '<dt>Time parked</dt><dd>' + dur((l.end - l.start) / 60000) + '</dd>' +
      '<dt>Total</dt><dd>$' + l.total.toFixed(2) + '</dd></dl></div>' : "";
    return '<div class="ok-head"><span class="ok-dot">✓</span><div><h1>You\'re all set</h1><p class="sub">Your session has ended. A receipt was sent by text.</p></div></div>' +
      body + '<button class="btn" type="button" data-action="again">Park again</button>';
  }

  function viewAuto() {
    return '<h1>How AUTO works</h1>' +
      '<div class="card"><ol class="steps">' +
        '<li><span class="num">1</span><p><strong>Turn on AUTO once</strong><br><span class="sub">Check "Sign me up for AUTO" when you register.</span></p></li>' +
        '<li><span class="num">2</span><p><strong>Just drive in</strong><br><span class="sub">The lot\'s cameras read your plate and start your session. No sign, no form.</span></p></li>' +
        '<li><span class="num">3</span><p><strong>Get a text each time</strong><br><span class="sub">One when you arrive with your free-until time, one when you leave with any charge.</span></p></li>' +
      '</ol></div>' +
      '<button class="btn" type="button" data-action="back">Back</button>' +
      '<p class="note">Your plate is only used to match your visits to this lot. You can turn AUTO off at any time. ' +
        'We do not store timestamps or activities. We only maintain your license plate number from the AUTO system. ' +
        'All of your information is encrypted and safe with us.</p>';
  }

  function viewMessages() {
    var msgs = state.messages.slice().reverse(); // oldest first, like a real thread
    var thread = msgs.length ? "" : '<p class="ios-empty">No messages</p>';
    msgs.forEach(function (m, i) {
      var gap = i === 0 || m.t - msgs[i - 1].t > 15 * 60000;
      if (gap) thread += '<div class="ios-stamp"><b>Today</b> ' + fmt(m.t) + '</div>';
      var lastInRun = i === msgs.length - 1 || msgs[i + 1].t - m.t > 15 * 60000;
      thread += '<div class="ios-bubble' + (lastInRun ? " tail" : "") + '">' + esc(m.msg) + '</div>';
    });
    return '<div class="ios-head"><button class="ios-back" type="button" data-action="back" aria-label="Back to parking"><b>‹</b></button>' +
      '<div class="ios-avatar" aria-hidden="true">PA</div><div class="ios-name">Parking App ›</div></div>' +
      '<div class="ios-thread">' + thread + '</div>' +
      '<div class="ios-input" aria-hidden="true"><span>Text Message</span></div>';
  }

  function bookmarkUrl() {
    return /^https?:/.test(location.protocol) ? location.host + location.pathname.replace(/index\.html$/, "") : "parking-app.vercel.app/";
  }
  function viewBookmark() {
    return '<div class="ios-nav"><button class="ios-link" type="button" data-action="back">Cancel</button>' +
        '<strong>Add Bookmark</strong><button class="ios-link b" type="button" data-action="saveBookmark">Save</button></div>' +
      '<div class="ios-group"><div class="ios-cell bm"><div class="bm-icon" aria-hidden="true">P</div>' +
        '<div class="bm-fields"><input type="text" id="bmTitle" value="Register to park" aria-label="Bookmark name">' +
        '<div class="bm-url">' + esc(bookmarkUrl()) + '</div></div></div></div>' +
      '<div class="ios-label">LOCATION</div>' +
      '<div class="ios-group"><div class="ios-cell"><span class="bm-star" aria-hidden="true">☆</span><span class="bm-loc">Favorites</span><span class="bm-chev" aria-hidden="true">›</span></div></div>' +
      '<p class="ios-foot">Next time, open Favorites and tap "Register to park" to go straight to the form.</p>';
  }

  function viewLock() {
    var d = new Date(now());
    var date = d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    var time = fmt(now()).replace(/\s?[AP]M/i, "");
    // Only texts that arrived after the phone was locked
    var fresh = state.messages.slice(0, Math.max(0, state.messages.length - (state.lockCount || 0)));
    var cards = fresh.map(function (m) {
      return '<div class="lock-notif" role="button" tabindex="0" data-action="lockOpen">' +
        '<div class="notif-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24"><path fill="#fff" d="M12 3.5c-5 0-9 3.3-9 7.4 0 2.3 1.3 4.4 3.3 5.8-.2 1.3-.8 2.5-1.8 3.4 1.9 0 3.6-.7 4.8-1.8.9.2 1.8.3 2.7.3 5 0 9-3.3 9-7.4S17 3.5 12 3.5z"/></svg></div>' +
        '<div class="notif-body"><div class="notif-top"><strong>Parking App</strong><span>now</span></div>' +
        '<div class="notif-text">' + esc(m.msg) + '</div></div></div>';
    }).join("");
    return '<div class="lock">' +
      '<div class="lock-top"><div class="lock-padlock" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div>' +
        '<div class="lock-date">' + esc(date) + '</div><div class="lock-time">' + esc(time) + '</div></div>' +
      '<div class="lock-notifs">' + cards + '</div>' +
      '<div class="lock-bottom" aria-hidden="true"><span class="lock-btn">' +
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="1.8"><path d="M8 3h8l-1 6H9z"/><path d="M9 9h6v12H9z"/></svg></span>' +
        '<span class="lock-btn"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="1.8"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg></span></div>' +
      '<div class="home-bar" aria-hidden="true"></div></div>';
  }

  // Replica of Safari's Bookmarks list, with the Parking App bookmark already saved
  function viewBookmarks() {
    var ico = function (d) { return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
    var book = ico('<path d="M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 2z"/><path d="M20 5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2z"/>');
    var glasses = ico('<circle cx="6.5" cy="15" r="3.5"/><circle cx="17.5" cy="15" r="3.5"/><path d="M10 15h4M3 15l2-7M21 15l-2-7"/>');
    var clock = ico('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>');
    var folder = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#007aff" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>';
    var bmark = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#007aff" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 2z"/><path d="M20 5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2z"/></svg>';
    return '<div class="ios-nav"><span></span><strong>Bookmarks</strong><button class="ios-link b" type="button" data-action="back">Done</button></div>' +
      '<div class="ios-seg" aria-hidden="true"><span class="on">' + book + '</span><span>' + glasses + '</span><span>' + clock + '</span></div>' +
      '<div class="ios-search" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#8e8e93" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>Search</div>' +
      '<div class="ios-group bm-list">' +
        '<div class="ios-cell">' + folder + '<span class="bm-loc">Favorites</span><span class="bm-chev" aria-hidden="true">›</span></div>' +
        '<button type="button" class="ios-cell bm-row" data-action="openBookmark">' + bmark +
          '<span class="bm-text"><span class="bm-title">Parking App</span><span class="bm-sub">' + esc(bookmarkUrl()) + '</span></span></button>' +
      '</div>' +
      '<p class="ios-foot">Tap a bookmark to open it.</p>';
  }

  var views = { bookmarks: viewBookmarks, lock: viewLock, bookmark: viewBookmark, register: viewRegister, confirm: viewConfirm, pay: viewPay, done: viewDone, auto: viewAuto, messages: viewMessages };
  var prev = "register";

  function render() {
    $("screen").innerHTML = (views[state.screen] || viewRegister)();
    var sheet = state.screen === "bookmark" || state.screen === "bookmarks";
    $("phone").classList.toggle("msg-app", state.screen === "messages" || sheet);
    $("phone").classList.toggle("sheet-app", sheet);
    $("phone").classList.toggle("lock-app", state.screen === "lock");
    $("phone").classList.toggle("reg-screen", state.screen === "register");
    renderChrome();
  }
  function renderChrome() {
    $("sbTime").textContent = fmt(now()).replace(/\s?[AP]M/i, "");
    $("sbSignal").textContent = state.weak ? "1 bar ▮" : "5G ▮▮▮";
    $("wizTime").textContent = fmt(now());
    var s = state.session;
    $("wizSession").textContent = s ? "Session: " + dur(elapsed(s)) + " parked, owes $" + charge(elapsed(s)) : "No active session";
  }

  // ---------- Actions ----------
  function readForm() {
    ["plate", "name", "contact"].forEach(function (k) { var el = $(k); if (el) draft[k] = el.value.trim(); });
    if ($("pstate")) draft.state = $("pstate").value;
    if ($("remember")) draft.remember = $("remember").checked;
    if ($("auto")) draft.auto = $("auto").checked;
  }
  function validate() {
    errors = {};
    draft.plate = draft.plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (draft.plate.length < 2) errors.plate = "Enter your license plate.";
    if (!draft.name) errors.name = "Enter your name.";
    if (draft.contactType === "phone") {
      if (draft.contact.replace(/\D/g, "").length !== 10) errors.contact = "Enter a 10-digit mobile number.";
    } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.contact)) errors.contact = "Enter a valid email address.";
    return !Object.keys(errors).length;
  }

  function startSession(p) {
    state.session = { plate: p.plate, state: p.state, name: p.name, contactType: p.contactType, contact: p.contact, auto: !!p.auto, start: now(), reminded: false, overNoted: false };
    save();
  }

  function finishRegistration(p) {
    var btn = $("regBtn") || document.querySelector('[data-action="quick"]');
    var complete = function () {
      startSession(p);
      text("You're registered. Plate " + p.plate + ". Free parking until " + fmt(freeUntil(now())) + ". We'll remind you " + REMIND_BEFORE + " min before.");
      go("confirm");
    };
    if (state.weak) {
      if (btn) { btn.disabled = true; btn.textContent = "Weak signal. Saving and retrying…"; }
      setTimeout(function () { toast("Sent once signal returned"); complete(); }, 2200);
    } else complete();
  }

  // paid = true when the driver just paid on the Pay screen
  function endSession(paid) {
    var s = state.session; if (!s) return;
    var total = charge(elapsed(s));
    if (total && !paid) {
      // Owes money and hasn't paid yet: send them to pay instead of ending silently
      text("You left at " + fmt(now()) + " after " + dur(elapsed(s)) + ". You owe $" + total.toFixed(2) + ". Tap to pay.");
      prev = "confirm"; go("pay"); return;
    }
    state.last = { plate: s.plate, start: s.start, end: now(), total: total };
    state.session = null; save();
    text(total
      ? "Payment received: $" + total.toFixed(2) + " for " + dur((state.last.end - state.last.start) / 60000) + ". Thanks!"
      : "You left at " + fmt(now()) + ". Time parked: " + dur((state.last.end - state.last.start) / 60000) + ". Total: $0.00. Thanks!");
    go("done");
  }

  function checkTimers() {
    var s = state.session; if (!s) return;
    var left = FREE_MIN - elapsed(s);
    if (!s.reminded && left <= REMIND_BEFORE && left > 0) {
      s.reminded = true;
      text("Reminder: free parking ends at " + fmt(freeUntil(s.start)) + " (" + dur(left) + "). After that it's $" + TIER1 + ". No action needed if you're leaving.");
    }
    if (!s.overNoted && left <= 0) {
      s.overNoted = true; s.reminded = true;
      text("Your free 2 hours ended at " + fmt(freeUntil(s.start)) + ". $" + TIER1 + " now applies (up to 5 hours). Tap to pay or pay when you leave.");
    }
    save();
  }

  document.addEventListener("pointerdown", unlockAudio, true);
  document.addEventListener("keydown", unlockAudio, true);
  document.addEventListener("click", function (e) {
    unlockAudio();
    var a = e.target.closest("[data-action]");
    if (a) {
      var act = a.getAttribute("data-action");
      if (state.screen === "register") readForm();
      switch (act) {
        case "register":
          if (!validate()) { render(); var bad = document.querySelector(".bad"); if (bad) bad.focus(); return; }
          var p = { name: draft.name, plate: draft.plate, state: draft.state, contactType: draft.contactType, contact: draft.contact, auto: draft.auto };
          if (draft.remember || draft.auto) state.profile = p;
          finishRegistration(p); break;
        case "quick": finishRegistration(state.profile); break;
        case "forget": state.profile = null; save(); render(); break;
        case "swapContact": draft.contactType = draft.contactType === "phone" ? "email" : "phone"; draft.contact = ""; errors.contact = null; render(); break;
        case "scan":
          // Phones and tablets only: open the camera. On a desktop the icon does nothing.
          if (isTouchDevice() && $("plateCam")) $("plateCam").click();
          break;
        case "howAuto": prev = state.screen; go("auto"); break;
        case "messages": prev = state.screen === "messages" ? prev : state.screen; state.unread = 0; go("messages"); break;
        case "back":
          var dest = prev === "auto" || prev === "messages" || prev === "lock" ? "register" : prev;
          go(dest); if (dest === "pay") prev = "confirm";
          break;
        case "calendar": toast("Reminder added for " + fmt(freeUntil(state.session.start) - REMIND_BEFORE * 60000)); break;
        case "bookmark": prev = state.screen; go("bookmark"); break;
        case "lockOpen": openMessages(); break;
        case "openBookmark": wizard(state.bmTarget === "returning" ? "returning" : "arriveNew"); break;
        case "saveBookmark": go(prev); toast("Added to Favorites"); break;
        case "end": confirmEnd = true; render(); break;
        case "endNo": confirmEnd = false; render(); break;
        case "endYes": endSession(); break;
        case "pay": prev = "confirm"; go("pay"); break;
        case "payNow": endSession(true); break;
        case "again": go("register"); break;
      }
      return;
    }
    var w = e.target.closest("[data-wiz]");
    if (w) wizard(w.getAttribute("data-wiz"));
  });

  var CAMERA_PLATE = "ABC123";
  function isTouchDevice() {
    return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  }
  // After a photo is taken, pretend to read the plate (Wizard of Oz: no real recognition)
  document.addEventListener("change", function (e) {
    if (e.target.id !== "plateCam" || !e.target.files || !e.target.files.length) return;
    e.target.value = ""; // drop the photo immediately
    readForm();
    var btn = document.querySelector(".cam-btn"), field = $("plate");
    if (btn) btn.classList.add("scanning");
    if (field) { field.value = ""; field.placeholder = "Reading plate…"; }
    setTimeout(function () {
      if (state.screen !== "register" || !$("plate")) return;
      readForm(); draft.plate = CAMERA_PLATE; draft.state = "GA"; errors.plate = null;
      render(); toast("Plate read: " + CAMERA_PLATE);
    }, 1500);
  });

  function openMessages() {
    $("notif").hidden = true;
    if (state.screen === "lock") prev = state.lockNext || "confirm"; // where "unlocking" lands
    else if (state.screen !== "messages") prev = state.screen;
    state.unread = 0; go("messages");
  }
  $("notif").addEventListener("click", openMessages);
  $("notif").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openMessages(); } });

  // ---------- Wizard ----------
  function setElapsed(min) {
    var s = state.session;
    if (!s) { toast("Wizard: no active session"); return; }
    state.offset += Math.max(0, min - elapsed(s));
    checkTimers(); render();
  }
  function wizard(cmd) {
    switch (cmd) {
      case "reset":
        try { localStorage.removeItem(KEY); } catch (e) {}
        state = fresh(); base = Date.now();
        draft = { plate: "", state: "GA", name: "", contactType: "phone", contact: "", remember: true, auto: false }; errors = {};
        render(); break;
      case "bmNew":
      case "bmReturning":
        state.bmTarget = cmd === "bmNew" ? "new" : "returning";
        if (state.screen !== "bookmarks") prev = state.screen === "lock" ? "register" : state.screen;
        $("notif").hidden = true; go("bookmarks"); break;
      case "arriveNew":
        // Empty form, nothing saved, no session; keeps the text history
        state.profile = null; state.session = null; errors = {};
        draft = { plate: "", state: "GA", name: "", contactType: "phone", contact: "", remember: true, auto: false };
        $("notif").hidden = true; go("register"); break;
      case "returning": state.profile = Object.assign({}, DEMO); state.session = null; $("notif").hidden = true; go("register"); break;
      case "lock":
        var lp = Object.assign({}, state.profile || DEMO, { auto: true });
        state.profile = lp; startSession(lp); state.session.viaAuto = true; state.lockSince = now(); state.lockCount = state.messages.length; state.lockNext = "confirm";
        $("notif").hidden = true; go("lock");
        text("Welcome back. Your car " + lp.plate + " entered the lot at " + fmt(now()) + ". You're automatically checked in, and parking is free until " + fmt(freeUntil(now())) + ".");
        break;
      case "scan":
        if (state.screen !== "register" || !$("plate")) { toast("Wizard: open the registration form first"); return; }
        readForm(); draft.plate = DEMO.plate; draft.state = DEMO.state; errors.plate = null; render(); toast("Plate read: " + DEMO.plate); break;
      case "lockLeave":
        if (!state.session) {
          // No session yet: pretend the car arrived 1 hour 12 minutes ago
          var lp2 = Object.assign({}, state.profile || DEMO, { auto: true });
          state.profile = lp2; startSession(lp2); state.session.start = now() - 72 * 60000;
        }
        var ls = state.session, lused = elapsed(ls), ltotal = charge(lused);
        state.lockSince = now(); state.lockCount = state.messages.length; $("notif").hidden = true;
        if (ltotal) {
          state.lockNext = "pay"; go("lock");
          text("Your car " + ls.plate + " left the lot at " + fmt(now()) + " after " + dur(lused) + ". You owe $" + ltotal.toFixed(2) + ". Tap to pay.");
        } else {
          state.last = { plate: ls.plate, start: ls.start, end: now(), total: 0 };
          state.session = null; state.lockNext = "done"; go("lock");
          text("Your car " + ls.plate + " left the lot at " + fmt(now()) + ". Time parked: 1 hour and 12 minutes. Total: $0.00. Thanks for parking!");
        }
        break;
      case "autoEnter":
        var p = state.profile && state.profile.auto ? state.profile : Object.assign({}, DEMO);
        state.profile = p; startSession(p); state.session.viaAuto = true;
        text("Welcome back. Your car " + p.plate + " entered the lot at " + fmt(now()) + ". You're automatically checked in, and parking is free until " + fmt(freeUntil(now())) + ".");
        go("confirm"); break;
      case "msgEnter":
        // Text only: the driver stays on whatever screen they're on
        var mp = Object.assign({}, state.profile || DEMO, { auto: true });
        state.profile = mp;
        if (!state.session) { startSession(mp); state.session.viaAuto = true; }
        text("Welcome back. Your car " + mp.plate + " entered the lot at " + fmt(now()) + ". You're automatically checked in, and parking is free until " + fmt(freeUntil(state.session.start)) + ".");
        save(); break;
      case "msgLeave":
        // Text only: the driver stays on whatever screen they're on
        var ms = state.session, mplate = (ms || state.profile || DEMO).plate;
        var mused = ms ? elapsed(ms) : 72, mtotal = charge(mused);
        if (ms && mtotal) {
          if (state.screen === "lock") state.lockNext = "pay";
          text("Your car " + mplate + " left the lot at " + fmt(now()) + " after " + dur(mused) + ". You owe $" + mtotal.toFixed(2) + ". Tap to pay.");
        } else {
          state.last = { plate: mplate, start: ms ? ms.start : now() - 72 * 60000, end: now(), total: 0 };
          state.session = null;
          if (state.screen === "lock") state.lockNext = "done";
          text("Your car " + mplate + " left the lot at " + fmt(now()) + ". Time parked: 1 hour and 12 minutes. Total: $0.00. Thanks for parking!");
        }
        save(); break;
      case "autoLeave":
        if (!state.session) { toast("Wizard: no active session"); return; }
        endSession(); break;
      case "t15": state.offset += 15; checkTimers(); render(); break;
      case "t105": setElapsed(105); break;
      case "t130": setElapsed(130); break;
      case "t310": setElapsed(310); break;
      case "hide": toggleWizard(); break;
    }
  }
  function toggleWizard() {
    var w = $("wizard");
    if (window.matchMedia("(max-width: 760px)").matches) w.classList.toggle("open");
    else w.classList.toggle("hidden-desktop");
  }
  document.addEventListener("keydown", function (e) {
    if ((e.key === "w" || e.key === "W") && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) toggleWizard();
  });
  var taps = 0, tapTimer;
  $("brand").addEventListener("click", function () {
    taps += 1; clearTimeout(tapTimer); tapTimer = setTimeout(function () { taps = 0; }, 600);
    if (taps >= 3) { taps = 0; toggleWizard(); }
  });
  if (location.hash === "#participant") $("wizard").classList.add("hidden-desktop");

  // Keep the clock and free-until time current
  setInterval(function () {
    if (document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName)) { renderChrome(); var f = $("freeNow"); if (f) f.textContent = fmt(freeUntil(now())); return; }
    checkTimers();
    if (state.screen === "confirm" || state.screen === "register") { var y = $("scroller").scrollTop; readFormIfRegister(); render(); $("scroller").scrollTop = y; }
    else renderChrome();
  }, 15000);
  function readFormIfRegister() { if (state.screen === "register") readForm(); }

  render();
})();
