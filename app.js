(function () {
  "use strict";

  // ---------- Lot rules ----------
  var FREE_MIN = 120;            // first 2 hours free
  var TIER1_MIN = 300, TIER1 = 5; // up to 5 hours: $5
  var TIER2 = 10;                 // up to 12 hours: $10
  var REMIND_BEFORE = 15;         // text reminder before free time ends

  // ---------- Demo profile used by the wizard ----------
  var DEMO = { name: "Jamie Morgan", plate: "JMK4821", state: "GA", contactType: "phone", contact: "(404) 555-0147", auto: true };

  // ---------- State ----------
  var KEY = "lot7-proto";
  var state = load() || fresh();
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
  function go(screen) { state.screen = screen; confirmEnd = false; save(); render(); $("screen").scrollTop = 0; }

  var toastTimer;
  function toast(msg) {
    var old = document.querySelector(".toast"); if (old) old.remove();
    var t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
    $("phone").appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.remove(); }, 2200);
  }

  var notifTimer;
  function text(msg) {
    state.messages.unshift({ t: now(), msg: msg });
    state.unread += 1; save();
    $("notifText").textContent = msg; $("notif").hidden = false;
    clearTimeout(notifTimer); notifTimer = setTimeout(function () { $("notif").hidden = true; }, 5000);
    renderChrome();
  }

  // ---------- Screens ----------
  var rates = "Then $" + TIER1 + " up to 5 hours · $" + TIER2 + " up to 12 hours";

  function freeBanner(start, big) {
    var s = state.session;
    if (s && big) {
      var used = elapsed(s), left = FREE_MIN - used, over = left < 0;
      var pct = Math.min(100, Math.max(0, used / FREE_MIN * 100));
      return '<div class="free big' + (over ? " over" : "") + '">' +
        '<span class="lbl">' + (over ? "Free parking ended at" : "Free parking until") + '</span>' +
        '<span class="time">' + fmt(freeUntil(s.start)) + '</span>' +
        '<span class="rates">' + (over ? "You now owe $" + charge(used) + ". " + rates.replace("Then ", "") : dur(left) + " left. " + rates) + '</span>' +
        '<div class="bar" aria-hidden="true"><span style="width:' + pct + '%"></span></div></div>';
    }
    return '<div class="free"><span class="lbl">Register now and park free until</span>' +
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
          '<input type="text" id="plate" autocomplete="off" autocapitalize="characters" maxlength="8" placeholder="e.g. ABC1234" value="' + esc(draft.plate) + '"' + (errors.plate ? ' class="bad" aria-invalid="true"' : "") + '>' +
          '<select id="pstate" aria-label="Plate state">' + ["GA", "AL", "FL", "NC", "SC", "TN", "Other"].map(function (s) { return "<option" + (s === draft.state ? " selected" : "") + ">" + s + "</option>"; }).join("") + '</select></div>' +
          (errors.plate ? '<span class="err">' + errors.plate + '</span>' : '<span class="hint">Must match your plate exactly. Cameras use it to find your car.</span>') +
        '</div><button class="btn secondary" type="button" data-action="scan" id="scanBtn">Scan plate with camera</button></div>' +

      '<div class="card"><div class="step-head"><span class="num">2</span><h2>How we reach you</h2></div>' +
        '<div class="field"><label for="name">Name</label><input type="text" id="name" autocomplete="name" value="' + esc(draft.name) + '"' + (errors.name ? ' class="bad"' : "") + '>' +
          (errors.name ? '<span class="err">' + errors.name + '</span>' : "") + '</div>' +
        '<div class="field"><label for="contact">' + (draft.contactType === "phone" ? "Mobile number" : "Email") + '</label>' +
          '<input type="' + (draft.contactType === "phone" ? "tel" : "email") + '" id="contact" autocomplete="' + (draft.contactType === "phone" ? "tel" : "email") + '" placeholder="' + (draft.contactType === "phone" ? "(555) 555-5555" : "you@example.com") + '" value="' + esc(draft.contact) + '"' + (errors.contact ? ' class="bad"' : "") + '>' +
          (errors.contact ? '<span class="err">' + errors.contact + '</span>' : '<span class="hint">We\'ll send your confirmation and a reminder ' + REMIND_BEFORE + ' minutes before free parking ends.</span>') +
          '<button class="link" type="button" data-action="swapContact">' + (draft.contactType === "phone" ? "Use email instead" : "Use a phone number instead") + '</button></div></div>' +

      '<div class="card"><div class="step-head"><span class="num">3</span><h2>Next time</h2></div>' +
        '<label class="check"><input type="checkbox" id="remember"' + (draft.remember ? " checked" : "") + '><span>Remember me on this phone<small>Next visit is one tap.</small></span></label>' +
        '<label class="check"><input type="checkbox" id="auto"' + (draft.auto ? " checked" : "") + '><span>Sign me up for AUTO<small>Skip this form. Cameras check you in and text you.</small></span></label>' +
        '<button class="link" type="button" data-action="howAuto">How AUTO works</button></div>' +

      '<p class="note">No card needed now. You only pay if you stay past the free time.</p>' +
      '<button class="btn" type="button" data-action="register" id="regBtn">Register my parking</button>';

    return '<h1>Register your parking</h1>' + freeBanner(now(), false) + welcome + form;
  }

  function viewConfirm() {
    var s = state.session;
    if (!s) return viewRegister();
    var used = elapsed(s), owed = charge(used);
    var head = owed
      ? '<div class="ok-head"><span class="ok-dot warn-dot">!</span><div><h1>Your free time is up</h1><p class="sub">Pay now, or pay when you leave.</p></div></div>'
      : '<div class="ok-head"><span class="ok-dot">✓</span><div><h1>You\'re registered</h1><p class="sub">You\'re covered. No need to keep this page open.</p></div></div>';
    var actions = owed
      ? '<button class="btn" type="button" data-action="pay">Pay $' + owed + ' now</button>'
      : '<button class="btn secondary" type="button" data-action="calendar">Add reminder to calendar</button>';
    var end = confirmEnd
      ? '<div class="confirm"><strong>End your parking session?</strong><p class="sub">' + (owed ? "You'll pay $" + owed + " for " + dur(used) + "." : "You won't be charged.") + '</p>' +
        '<button class="btn danger" type="button" data-action="endYes">Yes, I\'m leaving</button><button class="btn ghost" type="button" data-action="endNo">Keep parking</button></div>'
      : '<button class="btn ghost" type="button" data-action="end">I\'m leaving now</button>';

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
      '<p class="note">Your plate is only used to match your visits to this lot. You can turn AUTO off at any time.</p>' +
      '<button class="btn" type="button" data-action="back">Back</button>';
  }

  function viewMessages() {
    var list = state.messages.length
      ? state.messages.map(function (m) { return '<div class="bubble">' + esc(m.msg) + '<time>' + fmt(m.t) + '</time></div>'; }).join("")
      : '<p class="sub">No texts yet.</p>';
    return '<h1>Texts from Lot 7</h1><div class="msg-list">' + list + '</div>' +
      '<button class="btn ghost" type="button" data-action="back">Back</button>';
  }

  var views = { register: viewRegister, confirm: viewConfirm, pay: viewPay, done: viewDone, auto: viewAuto, messages: viewMessages };
  var prev = "register";

  function render() {
    $("screen").innerHTML = (views[state.screen] || viewRegister)();
    renderChrome();
  }
  function renderChrome() {
    $("sbTime").textContent = fmt(now()).replace(/\s?[AP]M/i, "");
    $("sbSignal").textContent = state.weak ? "1 bar ▮" : "5G ▮▮▮";
    $("msgBadge").hidden = !state.unread; $("msgBadge").textContent = state.unread;
    $("wizTime").textContent = fmt(now());
    var s = state.session;
    $("wizSession").textContent = s ? "Session: " + dur(elapsed(s)) + " parked, owes $" + charge(elapsed(s)) : "No active session";
    $("wizSignal").checked = !!state.weak;
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
      text("You're registered at Lot 7. Plate " + p.plate + ". Free parking until " + fmt(freeUntil(now())) + ". We'll remind you " + REMIND_BEFORE + " min before.");
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
      text("You left Lot 7 at " + fmt(now()) + " after " + dur(elapsed(s)) + ". You owe $" + total.toFixed(2) + ". Tap to pay.");
      prev = "confirm"; go("pay"); return;
    }
    state.last = { plate: s.plate, start: s.start, end: now(), total: total };
    state.session = null; save();
    text(total
      ? "Payment received: $" + total.toFixed(2) + " for " + dur((state.last.end - state.last.start) / 60000) + " at Lot 7. Thanks!"
      : "You left Lot 7 at " + fmt(now()) + ". Time parked: " + dur((state.last.end - state.last.start) / 60000) + ". Total: $0.00. Thanks!");
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

  document.addEventListener("click", function (e) {
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
          a.disabled = true; a.textContent = "Point your camera at the plate…";
          break; // the wizard completes the scan
        case "howAuto": prev = state.screen; go("auto"); break;
        case "messages": prev = state.screen === "messages" ? prev : state.screen; state.unread = 0; go("messages"); break;
        case "back": go(prev === "auto" || prev === "messages" ? "register" : prev); break;
        case "calendar": toast("Reminder added for " + fmt(freeUntil(state.session.start) - REMIND_BEFORE * 60000)); break;
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

  $("notif").addEventListener("click", function () { $("notif").hidden = true; prev = state.screen; state.unread = 0; go("messages"); });
  $("wizSignal").addEventListener("change", function () { state.weak = this.checked; save(); renderChrome(); });

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
      case "returning": state.profile = Object.assign({}, DEMO); state.session = null; go("register"); break;
      case "scan":
        if (state.screen !== "register" || !$("plate")) { toast("Wizard: open the registration form first"); return; }
        readForm(); draft.plate = DEMO.plate; draft.state = DEMO.state; errors.plate = null; render(); toast("Plate read: " + DEMO.plate); break;
      case "autoEnter":
        var p = state.profile && state.profile.auto ? state.profile : Object.assign({}, DEMO);
        state.profile = p; startSession(p);
        text("Welcome back to Lot 7. AUTO checked in " + p.plate + " at " + fmt(now()) + ". Free parking until " + fmt(freeUntil(now())) + ".");
        go("confirm"); break;
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
    if (state.screen === "confirm" || state.screen === "register") { var y = $("screen").scrollTop; readFormIfRegister(); render(); $("screen").scrollTop = y; }
    else renderChrome();
  }, 15000);
  function readFormIfRegister() { if (state.screen === "register") readForm(); }

  render();
})();
