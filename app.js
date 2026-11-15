(() => {
  "use strict";

  const KEY_SESSIONS = "focused.sessions.v1";
  const KEY_ACTIVE = "focused.active.v1";
  const KEY_ACTS = "focused.activities.v1";
  const DEFAULT_ACT = { id: "focus", name: "Focus" };
  const NAME_MAX = 24;
  const HEARTBEAT_MS = 5000;
  const PROBE_MS = 30000;
  const PING_WAIT_MS = 700;
  const MIN_SESSION_MS = 60000; // under a minute is not saved
  const STRIP_DAYS = 28;

  const tabId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const channel = "BroadcastChannel" in window ? new BroadcastChannel("focused") : null;

  const $ = (id) => document.getElementById(id);
  const el = {
    barDate: $("bar-date"), storageError: $("storage-error"), shell: document.querySelector(".shell"),
    back: $("back"), title: $("title"), rename: $("rename"), renameForm: $("rename-form"), renameInput: $("rename-input"),
    actTools: $("act-tools"), delAct: $("del-act"), delActConfirm: $("del-act-confirm"), delActQ: $("del-act-q"), delActYes: $("del-act-yes"), delActNo: $("del-act-no"),
    home: $("home"), cards: $("cards"), detail: $("detail"),
    label: $("timer-label"), time: $("timer-time"), go: $("go"), goIcon: $("go-icon"), goText: $("go-text"),
    today: $("s-today"), week: $("s-week"), month: $("s-month"), streak: $("s-streak"),
    calTitle: $("cal-title"), grid: $("grid"), prev: $("prev"), thisMonth: $("this-month"), next: $("next"),
    logTitle: $("log-title"), logTotal: $("log-total"), logEmpty: $("log-empty"), logTable: $("log-table"), logBody: $("log-body"), status: $("status"),
    wipe: $("wipe"), wipeConfirm: $("wipe-confirm"), wipeQ: $("wipe-q"), wipeYes: $("wipe-yes"), wipeNo: $("wipe-no"), wipeStatus: $("wipe-status"),
    focus: $("focus"), focusLabel: $("focus-label"), focusTime: $("focus-time"), focusToday: $("focus-today"),
    pause: $("pause"), pauseIcon: $("pause-icon"), pauseText: $("pause-text"), finish: $("finish"),
  };

  /* Storage */
  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      el.storageError.hidden = false;
      return fallback;
    }
  }
  function write(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      el.storageError.hidden = false;
      return false;
    }
  }
  const getSessions = () => {
    const s = read(KEY_SESSIONS, []);
    return Array.isArray(s) ? s : [];
  };
  const getActive = () => read(KEY_ACTIVE, null);

  /* Activities. A session without an activity belongs to the default one. */
  const getActs = () => {
    const a = read(KEY_ACTS, null);
    return Array.isArray(a) ? a : [DEFAULT_ACT];
  };
  const actOf = (s) => (s && s.act) || DEFAULT_ACT.id;
  // A session is one sitting: its running stretches, with the pauses between them left out.
  const segsOf = (s) => s.segs || [[s.start, s.end]];
  const durOf = (s) => segsOf(s).reduce((t, [a, b]) => t + (b - a), 0);
  // The running sitting's stretches so far, the open one ending now.
  const liveSegs = (a, now) => (a.segs || []).concat(a.start ? [[a.start, now]] : []);
  const elapsedOf = (a, now) => liveSegs(a, now).reduce((t, [x, y]) => t + (y - x), 0);
  const findAct = (id) => getActs().find((x) => x.id === id) || null;
  const actName = (id) => { const a = findAct(id); return a ? a.name : "Deleted activity"; };
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  // One activity's saved sessions and, if it is the one running, the running session.
  function slice(id) {
    return { sessions: getSessions().filter((s) => actOf(s) === id), active: active && actOf(active) === id ? active : null };
  }

  /* Dates */
  const pad = (n) => String(n).padStart(2, "0");
  const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const mondayOf = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
  const fmtClock = (ms) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const fmtLongDay = (d) => d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });

  function fmtDur(ms) {
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  function fmtShort(ms) {
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  function fmtElapsed(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  }

  /* Totals per day, splitting sessions that cross midnight */
  function dayTotals(sessions, act, now) {
    const totals = new Map();
    const segs = sessions.flatMap(segsOf).concat(act ? liveSegs(act, now) : []);
    for (const [start, end] of segs) {
      let a = start;
      while (a < end) {
        const d = new Date(a);
        const nextMidnight = addDays(startOfDay(d), 1).getTime();
        const b = Math.min(end, nextMidnight);
        const k = dayKey(d);
        totals.set(k, (totals.get(k) || 0) + (b - a));
        a = b;
      }
    }
    return totals;
  }
  function summary(totals, now) {
    const t0 = startOfDay(new Date(now));
    const sumRange = (from, to) => {
      let sum = 0;
      for (let d = from; d <= to; d = addDays(d, 1)) sum += totals.get(dayKey(d)) || 0;
      return sum;
    };
    let streak = 0;
    let d = (totals.get(dayKey(t0)) || 0) >= 60000 ? t0 : addDays(t0, -1);
    while ((totals.get(dayKey(d)) || 0) >= 60000) { streak++; d = addDays(d, -1); }
    return {
      today: totals.get(dayKey(t0)) || 0,
      week: sumRange(mondayOf(t0), t0),
      month: sumRange(new Date(t0.getFullYear(), t0.getMonth(), 1), t0),
      streak,
    };
  }
  function heat(ms) {
    const m = ms / 60000;
    if (m < 1) return "";
    if (m < 30) return "h1";
    if (m < 60) return "h2";
    if (m < 120) return "h3";
    return "h4";
  }

  /* State */
  let active = getActive();
  let owner = false;
  let heartbeatTimer = null;
  let probeTimer = null;
  let tickTimer = null;
  let undo = null;

  // Route: "#/" is home; "#/<activity>" and "#/<activity>/<yyyy-mm-dd>" are one activity's dashboard.
  const today0 = startOfDay(new Date());
  let route = { act: null };
  let selected = dayKey(today0);
  let viewMonth = new Date(today0.getFullYear(), today0.getMonth(), 1);

  function readHash() {
    const m = /^#\/([^/]+)(?:\/(\d{4}-\d{2}-\d{2}))?$/.exec(location.hash);
    const id = m ? decodeURIComponent(m[1]) : null;
    if (!id || !findAct(id)) {
      route = { act: null };
      if (location.hash && location.hash !== "#/") history.replaceState(null, "", "#/");
      return;
    }
    if (route.act !== id) resetPanels();
    route = { act: id };
    const d = m[2] ? parseKey(m[2]) : null;
    const ok = d && !isNaN(d);
    selected = ok ? m[2] : dayKey(new Date());
    const base = ok ? d : new Date();
    viewMonth = new Date(base.getFullYear(), base.getMonth(), 1);
  }
  function go(hash) {
    if (location.hash === hash) { readHash(); render(); }
    else location.hash = hash;
  }
  function setSelected(k) {
    selected = k;
    const d = parseKey(k);
    viewMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    history.replaceState(null, "", `#/${encodeURIComponent(route.act)}/${k}`);
    render();
  }

  /* Session control.
     The active sitting lives in storage as { act, since, segs: closed stretches, start: open stretch or null when paused }.
     Finishing saves it as one session if its running time reaches a minute. */
  function startSession(act) {
    if (getActive()) { active = getActive(); render(); return; }
    const now = Date.now();
    active = { tab: tabId, act, since: now, segs: [], start: now, last: now };
    if (!write(KEY_ACTIVE, active)) { active = null; return; }
    becomeOwner();
    render();
  }

  function finalize(a, end) {
    if (!a) return;
    const segs = (a.segs || []).concat(a.start ? [[a.start, Math.max(a.start, end)]] : []);
    const since = a.since || a.start;
    const total = segs.reduce((t, [x, y]) => t + (y - x), 0);
    const sessions = getSessions();
    if (segs.length && total >= MIN_SESSION_MS && !sessions.some((s) => s.start === since)) {
      sessions.push({ id: `${since}`, start: since, end: segs[segs.length - 1][1], act: actOf(a), segs });
      sessions.sort((x, y) => x.start - y.start);
      write(KEY_SESSIONS, sessions);
    }
    write(KEY_ACTIVE, null);
  }

  function finishSession() {
    const a = getActive();
    if (a) finalize(a, Date.now());
    if (channel) channel.postMessage({ type: "stopped" });
    active = null;
    releaseOwner();
    render();
  }
  function pauseSession() {
    const a = getActive();
    if (!a || !a.start) return;
    a.segs = (a.segs || []).concat([[a.start, Date.now()]]);
    a.start = null;
    write(KEY_ACTIVE, a);
    active = a;
    render();
  }
  function resumeSession() {
    const a = getActive();
    if (!a || a.start) return;
    a.start = Date.now();
    a.last = a.start;
    write(KEY_ACTIVE, a);
    active = a;
    render();
  }

  function becomeOwner() {
    owner = true;
    clearInterval(probeTimer);
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
  }
  function releaseOwner() {
    owner = false;
    clearInterval(heartbeatTimer);
    clearInterval(probeTimer);
    heartbeatTimer = probeTimer = null;
  }
  function beat() {
    if (!owner) return;
    const a = getActive();
    if (!a || a.tab !== tabId) { active = a; releaseOwner(); render(); return; }
    a.last = Date.now();
    write(KEY_ACTIVE, a);
    active = a;
  }

  /* A session owned by another tab: ask whether that tab is still open.
     No answer means the tab closed without saving, so the session ends at its last heartbeat. */
  function probe() {
    const a = getActive();
    if (!a || a.tab === tabId) return;
    if (!channel) {
      if (Date.now() - a.last > 3 * 60000) { finalize(a, a.last); active = null; render(); }
      return;
    }
    let answered = false;
    const onMsg = (ev) => { if (ev.data && ev.data.type === "pong" && ev.data.start === a.since) answered = true; };
    channel.addEventListener("message", onMsg);
    channel.postMessage({ type: "ping", start: a.since });
    setTimeout(() => {
      channel.removeEventListener("message", onMsg);
      const still = getActive();
      if (!answered && still && still.since === a.since) {
        finalize(still, still.last);
        active = null;
        render();
      }
    }, PING_WAIT_MS);
  }

  if (channel) {
    channel.addEventListener("message", (ev) => {
      if (ev.data && ev.data.type === "ping" && owner && active && ev.data.start === active.since) {
        channel.postMessage({ type: "pong", start: active.since });
      }
    });
  }

  function syncFromStorage() {
    active = getActive();
    if (active && active.tab === tabId) { if (!owner) becomeOwner(); }
    else {
      if (owner) releaseOwner();
      if (active && !probeTimer) probeTimer = setInterval(probe, PROBE_MS);
      if (!active) { clearInterval(probeTimer); probeTimer = null; }
    }
    render();
  }

  window.addEventListener("storage", (ev) => {
    if ([KEY_ACTIVE, KEY_SESSIONS, KEY_ACTS, null].includes(ev.key)) syncFromStorage();
  });

  // Closing or leaving the tab ends the session at that moment.
  window.addEventListener("pagehide", () => {
    if (owner) { finalize(getActive(), Date.now()); releaseOwner(); }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") beat();
    else syncFromStorage();
  });
  window.addEventListener("pageshow", (ev) => { if (ev.persisted) syncFromStorage(); });

  /* Rendering: header */
  function renderHeader() {
    const a = route.act ? findAct(route.act) : null;
    el.back.hidden = !a;
    el.actTools.hidden = !a;
    if (a && !el.renameForm.hidden) return;
    el.title.textContent = a ? a.name : "Focused";
    if (!active) document.title = a ? `${a.name} · Focused` : "Focused";
  }

  /* Rendering: home */
  let cardsKey = "";
  let addingAct = false;
  function renderHome(now) {
    const t0 = startOfDay(new Date(now));
    const cards = getActs().map((a) => {
      const sl = slice(a.id);
      const totals = dayTotals(sl.sessions, sl.active, now);
      const sm = summary(totals, now);
      const strip = [];
      for (let i = STRIP_DAYS - 1; i >= 0; i--) strip.push(`<span class="strip-day ${heat(totals.get(dayKey(addDays(t0, -i))) || 0)}"></span>`);
      const meta = [`${fmtDur(sm.week)} this week`];
      if (sm.streak) meta.push(`${plural(sm.streak, "day")} in a row`);
      return `<li><a class="act-card" href="#/${encodeURIComponent(a.id)}">` +
        `<span class="card-top"><span class="card-name">${esc(a.name)}</span>${sl.active ? `<span class="card-run${sl.active.start ? "" : " is-paused"}">${sl.active.start ? "Running" : "Paused"}</span>` : ""}</span>` +
        `<span class="card-figure">${fmtDur(sm.today)} <span class="card-unit">today</span></span>` +
        `<span class="card-meta">${meta.join(" · ")}</span>` +
        `<span class="strip" aria-hidden="true">${strip.join("")}</span></a></li>`;
    });
    cards.push(addingAct
      ? `<li><form class="act-card act-new" id="new-form"><label class="card-name" for="new-name">New activity</label>` +
        `<input class="new-input" id="new-name" maxlength="${NAME_MAX}" placeholder="Reading, Gym, Piano" autocomplete="off">` +
        `<span class="new-actions"><button class="ctl primary" type="submit">Add</button><button class="ctl" type="button" id="new-cancel">Cancel</button></span></form></li>`
      : `<li><button class="act-card act-add" type="button" id="new-open"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>New activity</button></li>`);
    const html = cards.join("");
    if (html !== cardsKey) {
      const typing = document.activeElement && document.activeElement.id === "new-name" ? document.activeElement.value : null;
      el.cards.innerHTML = html;
      cardsKey = html;
      const input = $("new-name");
      if (typing != null && input) { input.value = typing; input.focus(); }
    }
  }
  function addAct(name) {
    name = name.trim().slice(0, NAME_MAX);
    if (!name) { $("new-name").focus(); return; }
    const acts = getActs();
    if (!acts.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
      acts.push({ id: "a" + Date.now().toString(36), name });
      write(KEY_ACTS, acts);
    }
    addingAct = false;
    render();
    $("new-open").focus();
  }

  /* Rendering: one activity */
  function renderTimer() {
    const busy = active && actOf(active) !== route.act; // another activity is running in another tab
    el.go.disabled = !!busy;
    el.goText.textContent = `Start ${actName(route.act)}`;
    el.label.textContent = busy ? `${actName(actOf(active))} is running` : "Ready";
    el.time.textContent = "0:00";
  }

  let focusOpen = false;
  function renderFocus(now) {
    const open = !!active;
    if (open) {
      const paused = !active.start;
      const elapsed = elapsedOf(active, now);
      el.focusTime.textContent = fmtElapsed(elapsed);
      el.focusLabel.textContent = paused ? "Paused" : `Since ${fmtClock(active.since || active.start)}`;
      el.pauseText.textContent = paused ? "Resume" : "Pause";
      el.pauseIcon.innerHTML = paused ? '<path d="M8 4l20 12-20 12z"/>' : '<path d="M8 5h6v22H8zM18 5h6v22h-6z"/>';
      el.finish.hidden = !paused;
      el.focus.classList.toggle("is-paused", paused);
      const sl = slice(actOf(active));
      el.focusToday.textContent = fmtDur(dayTotals(sl.sessions, sl.active, now).get(dayKey(new Date(now))) || 0);
      document.title = `${paused ? "Paused · " : ""}${fmtElapsed(elapsed)} ${actName(actOf(active))}`;
    }

    if (open !== focusOpen) {
      focusOpen = open;
      el.focus.hidden = !open;
      el.shell.inert = open;
      document.body.classList.toggle("is-focusing", open);
      if (open) el.pause.focus();
      else {
        renderHeader();
        if (!el.detail.hidden) el.go.focus();
      }
    }
  }

  function renderStats(totals, now) {
    const sm = summary(totals, now);
    el.today.textContent = fmtDur(sm.today);
    el.week.textContent = fmtDur(sm.week);
    el.month.textContent = fmtDur(sm.month);
    el.streak.textContent = String(sm.streak);
  }

  let gridKey = "";
  function renderCalendar(totals, now) {
    const t0 = startOfDay(new Date(now));
    const y = viewMonth.getFullYear(), mo = viewMonth.getMonth();
    el.calTitle.textContent = viewMonth.toLocaleDateString([], { month: "long", year: "numeric" });
    el.next.disabled = new Date(y, mo + 1, 1) > t0;
    el.thisMonth.disabled = y === t0.getFullYear() && mo === t0.getMonth();

    const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.day : null;
    const daysIn = new Date(y, mo + 1, 0).getDate();
    const lead = (new Date(y, mo, 1).getDay() + 6) % 7;
    const parts = [];
    const dows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for (const n of dows) parts.push(`<span class="dow" aria-hidden="true">${n}</span>`);
    for (let i = 0; i < lead; i++) parts.push('<span class="day is-pad" aria-hidden="true"></span>');
    for (let day = 1; day <= daysIn; day++) {
      const d = new Date(y, mo, day);
      const k = dayKey(d);
      const ms = totals.get(k) || 0;
      const future = d > t0;
      const isToday = k === dayKey(t0);
      const name = d.toLocaleDateString([], { day: "numeric", month: "long" });
      const label = `${isToday ? "Today, " : ""}${name}, ${ms >= 60000 ? fmtDur(ms) : "nothing logged"}`;
      parts.push(
        `<button type="button" class="day ${heat(ms)}${future ? " is-future" : ""}" data-day="${k}" aria-pressed="${k === selected}" aria-label="${label}"${future ? " disabled" : ""}>` +
        `<span class="day-num">${isToday ? `<span class="today-n">${day}</span>` : day}</span>` +
        `<span class="day-min">${ms >= 60000 ? fmtShort(ms) : ""}</span></button>`
      );
    }
    const html = parts.join("");
    if (html !== gridKey) {
      el.grid.innerHTML = html;
      gridKey = html;
      if (focused) { const f = el.grid.querySelector(`[data-day="${focused}"]`); if (f) f.focus(); }
    }
  }

  let logKey = "";
  function renderLog(sl, totals, now) {
    const d = parseKey(selected);
    const isToday = selected === dayKey(new Date(now));
    el.logTitle.textContent = isToday ? `Today, ${fmtLongDay(d)}` : fmtLongDay(d);
    el.logTotal.textContent = fmtDur(totals.get(selected) || 0);

    const from = d.getTime(), to = addDays(d, 1).getTime();
    const rows = sl.sessions.filter((s) => s.end > from && s.start < to);
    const live = sl.active && (sl.active.since || sl.active.start) < to && now > from;
    const sig = route.act + selected + rows.map((s) => s.id).join(",") + (live ? "live" : "");
    if (sig === logKey && !live) return;
    logKey = sig;

    const html = rows.map((s) =>
      `<tr><td>${fmtClock(s.start)}</td><td>${fmtClock(s.end)}</td><td class="len">${fmtDur(durOf(s))}</td>` +
      `<td><button type="button" class="link-btn" data-del="${s.id}" aria-label="Delete session from ${fmtClock(s.start)} to ${fmtClock(s.end)}">Delete</button></td></tr>`
    );
    if (live) html.push(`<tr><td>${fmtClock(sl.active.since || sl.active.start)}</td><td>${sl.active.start ? "Running" : "Paused"}</td><td class="len">${fmtDur(elapsedOf(sl.active, now))}</td><td></td></tr>`);
    el.logBody.innerHTML = html.join("");
    el.logTable.hidden = html.length === 0;
    el.logEmpty.hidden = html.length !== 0;
  }

  function render() {
    const now = Date.now();
    el.barDate.textContent = new Date(now).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (route.act && !findAct(route.act)) { route = { act: null }; history.replaceState(null, "", "#/"); }
    const onHome = !route.act;
    el.home.hidden = !onHome;
    el.detail.hidden = onHome;
    renderHeader();
    if (onHome) renderHome(now);
    else {
      const sl = slice(route.act);
      const totals = dayTotals(sl.sessions, sl.active, now);
      renderTimer();
      renderStats(totals, now);
      renderCalendar(totals, now);
      renderLog(sl, totals, now);
      el.wipe.disabled = sl.sessions.length === 0;
    }
    renderFocus(now);
    clearInterval(tickTimer);
    tickTimer = active ? setInterval(tick, 500) : null;
  }

  let lastMinute = -1;
  function tick() {
    if (!active) return;
    const now = Date.now();
    renderFocus(now);
    const minute = Math.floor(elapsedOf(active, now) / 60000);
    if (minute !== lastMinute) { lastMinute = minute; render(); }
  }

  /* Events: timer and focus view */
  el.go.addEventListener("click", () => { if (route.act) startSession(route.act); });
  el.pause.addEventListener("click", () => { const a = getActive(); if (a && a.start) pauseSession(); else resumeSession(); });
  el.finish.addEventListener("click", finishSession);

  /* Events: home */
  el.cards.addEventListener("click", (ev) => {
    if (ev.target.closest("#new-open")) { addingAct = true; render(); $("new-name").focus(); }
    else if (ev.target.closest("#new-cancel")) { addingAct = false; render(); $("new-open").focus(); }
  });
  el.cards.addEventListener("submit", (ev) => {
    ev.preventDefault();
    addAct($("new-name").value);
  });
  el.cards.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && ev.target.id === "new-name") { addingAct = false; render(); $("new-open").focus(); }
  });

  /* Events: rename and delete the activity */
  function resetPanels() {
    el.renameForm.hidden = true;
    el.title.hidden = false;
    closeDelAct(false);
    closeWipe(false);
    el.wipeStatus.textContent = "";
    clearUndo();
  }
  el.rename.addEventListener("click", () => {
    el.renameInput.value = actName(route.act);
    el.title.hidden = true;
    el.actTools.classList.add("is-renaming");
    el.renameForm.hidden = false;
    el.renameInput.focus();
    el.renameInput.select();
  });
  function closeRename() {
    el.renameForm.hidden = true;
    el.title.hidden = false;
    el.actTools.classList.remove("is-renaming");
    render();
    el.rename.focus();
  }
  el.renameForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const name = el.renameInput.value.trim().slice(0, NAME_MAX);
    const acts = getActs();
    const a = acts.find((x) => x.id === route.act);
    if (a && name) { a.name = name; write(KEY_ACTS, acts); }
    closeRename();
  });
  el.renameForm.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closeRename(); });
  $("rename-cancel").addEventListener("click", closeRename);

  el.delAct.addEventListener("click", () => {
    const sl = slice(route.act);
    const n = sl.sessions.length;
    el.delActQ.textContent = `Delete ${actName(route.act)}${n ? ` and its ${plural(n, "session")}` : ""}? This can't be undone.`;
    el.actTools.classList.add("is-deleting");
    el.delActConfirm.hidden = false;
    el.delActNo.focus();
  });
  function closeDelAct(focusBack) {
    el.delActConfirm.hidden = true;
    el.actTools.classList.remove("is-deleting");
    if (focusBack) el.delAct.focus();
  }
  el.delActNo.addEventListener("click", () => closeDelAct(true));
  el.delActConfirm.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closeDelAct(true); });
  el.delActYes.addEventListener("click", () => {
    const id = route.act;
    write(KEY_ACTS, getActs().filter((x) => x.id !== id));
    write(KEY_SESSIONS, getSessions().filter((x) => actOf(x) !== id));
    closeDelAct(false);
    go("#/");
  });

  /* Events: delete all of this activity's sessions, first press asks */
  function askWipe() {
    const n = slice(route.act).sessions.length;
    if (!n) return;
    el.wipeQ.textContent = `Delete all ${plural(n, "session")} of ${actName(route.act)}? This can't be undone.`;
    el.wipeStatus.textContent = "";
    el.wipe.hidden = true;
    el.wipeConfirm.hidden = false;
    el.wipeNo.focus();
  }
  function closeWipe(focusBack) {
    el.wipeConfirm.hidden = true;
    el.wipe.hidden = false;
    if (focusBack) el.wipe.focus();
  }
  el.wipe.addEventListener("click", askWipe);
  el.wipeNo.addEventListener("click", () => closeWipe(true));
  el.wipeConfirm.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closeWipe(true); });
  el.wipeYes.addEventListener("click", () => {
    const all = getSessions();
    const kept = all.filter((x) => actOf(x) !== route.act);
    const n = all.length - kept.length;
    write(KEY_SESSIONS, kept);
    clearUndo();
    closeWipe(false);
    el.wipeStatus.textContent = `Deleted ${plural(n, "session")}.`;
    render();
    el.wipeStatus.setAttribute("tabindex", "-1");
    el.wipeStatus.focus();
  });

  /* Events: calendar and day log */
  el.grid.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-day]");
    if (b && !b.disabled) setSelected(b.dataset.day);
  });
  el.prev.addEventListener("click", () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); render(); });
  el.next.addEventListener("click", () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); render(); });
  el.thisMonth.addEventListener("click", () => setSelected(dayKey(new Date())));
  window.addEventListener("hashchange", () => { readHash(); render(); window.scrollTo(0, 0); });

  el.logBody.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-del]");
    if (!b) return;
    const sessions = getSessions();
    const idx = sessions.findIndex((s) => s.id === b.dataset.del);
    if (idx < 0) return;
    const [removed] = sessions.splice(idx, 1);
    write(KEY_SESSIONS, sessions);
    if (undo) clearTimeout(undo.timer);
    undo = { session: removed, timer: setTimeout(clearUndo, 8000) };
    el.status.innerHTML = `Session deleted.<button type="button" class="link-btn" id="undo">Undo</button>`;
    render();
    $("undo").focus();
  });
  el.status.addEventListener("click", (ev) => {
    if (!ev.target.closest("#undo") || !undo) return;
    const sessions = getSessions();
    if (!sessions.some((s) => s.id === undo.session.id)) {
      sessions.push(undo.session);
      sessions.sort((x, y) => x.start - y.start);
      write(KEY_SESSIONS, sessions);
    }
    clearUndo();
    render();
  });
  function clearUndo() {
    if (undo) clearTimeout(undo.timer);
    undo = null;
    el.status.textContent = "";
  }

  /* Boot */
  readHash();
  if (active) {
    if (active.tab === tabId) becomeOwner();
    else { probe(); probeTimer = setInterval(probe, PROBE_MS); }
  }
  render();
})();
