(function (global) {
  "use strict";

  const C = global.MilosCore;
  if (!C) return;

  const VERSION = "2.28";
  const STORE_KEY = "milos-calendar-bookings-v1";
  const DAY_RANGE = 90;
  const pad = (n) => String(n).padStart(2, "0");

  function dateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  function fromKey(key) {
    const [y, m, d] = String(key).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
  }
  function addDays(date, amount) {
    const out = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
    out.setDate(out.getDate() + amount);
    return out;
  }
  function esc(value) {
    return C.escapeHtml ? C.escapeHtml(value) : String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }
  function clean(value, max) {
    return C.cleanText ? C.cleanText(value, max || 300) : String(value == null ? "" : value).trim().slice(0, max || 300);
  }
  function readBookings() {
    try {
      const value = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) { return []; }
  }
  function writeBookings(rows) {
    localStorage.setItem(STORE_KEY, JSON.stringify(rows));
  }
  function uid() {
    return C.uid ? C.uid("booking") : `booking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  function profileName(id) {
    const profile = (C.getProfiles ? C.getProfiles() : []).find((item) => item.id === id);
    return profile ? profile.name : "";
  }
  function prettyDate(key) {
    return fromKey(key).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  function eventTypeLabel(type) {
    return ({ review: "Review", observation: "Observation", witness: "Witness testimony", meeting: "Meeting", other: "Booking" })[type] || "Booking";
  }

  function derivedEvents(key) {
    const rows = [];
    readBookings().filter((item) => item.date === key).forEach((item) => rows.push(Object.assign({ source: "booking", removable: true }, item)));

    (C.getReviews ? C.getReviews() : []).forEach((review) => {
      const profile = C.getProfile ? C.getProfile(review.profileId) : null;
      const learner = profile ? profile.name : "Learner";
      const reviewDate = review.reviewDate || review.date || "";
      if (reviewDate === key) rows.push({ id: `review-${review.id}`, source: "review-record", type: "review", date: key, time: review.startTime || "", title: `Review · ${learner}`, note: "Completed review", removable: false });
      if (review.nextReviewDate === key) rows.push({ id: `review-due-${review.id}`, source: "review-due", type: "review", date: key, time: "", title: `Review due · ${learner}`, note: "Next review date", removable: false });
    });

    (C.getObservations ? C.getObservations() : []).forEach((observation) => {
      if (observation.observationDate !== key) return;
      const profile = C.getProfile ? C.getProfile(observation.profileId) : null;
      rows.push({ id: `observation-${observation.id}`, source: "observation-record", type: "observation", date: key, time: observation.startTime || "", title: `${observation.method || "Observation"} · ${profile ? profile.name : "Learner"}`, note: observation.unitNumber ? `Unit ${observation.unitNumber}` : "Completed observation", removable: false });
    });

    return rows.sort((a, b) => String(a.time || "99:99").localeCompare(String(b.time || "99:99")) || String(a.title || "").localeCompare(String(b.title || "")));
  }

  function dayHtml(date) {
    const key = dateKey(date);
    const today = key === dateKey(new Date());
    const count = derivedEvents(key).length;
    const weekday = date.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase();
    const month = date.toLocaleDateString("en-GB", { month: "short" }).toUpperCase();
    return `<button type="button" class="mcal-day${today ? " is-today" : ""}" data-mcal-date="${key}" ${today ? 'aria-current="date"' : ""} aria-label="${esc(prettyDate(key))}${count ? `, ${count} booking${count === 1 ? "" : "s"}` : ""}"><span>${weekday}</span><strong>${date.getDate()}</strong><small>${today ? "TODAY" : month}</small><i aria-hidden="true">${count ? `${'<b></b>'.repeat(Math.min(3, count))}${count > 3 ? `<em>${count}</em>` : ""}` : ""}</i></button>`;
  }

  function mount() {
    const dock = document.querySelector(".progress-dock");
    if (!dock || dock.dataset.mcalMounted === "1") return false;
    dock.dataset.mcalMounted = "1";
    dock.classList.add("mcal-host");
    const today = new Date();
    const days = [];
    for (let i = -DAY_RANGE; i <= DAY_RANGE; i += 1) days.push(dayHtml(addDays(today, i)));
    dock.innerHTML = `<section class="mcal-shell" aria-label="Milos weekday calendar"><div class="mcal-head"><span>Schedule</span><button type="button" data-mcal-today>Today</button></div><div class="mcal-strip" id="milosCalendarStrip">${days.join("")}</div></section>`;
    requestAnimationFrame(scrollTodayIntoView);
    return true;
  }

  function refreshCalendar() {
    const strip = document.getElementById("milosCalendarStrip");
    if (!strip) return;
    const selected = strip.querySelector(".mcal-day.is-selected")?.dataset.mcalDate || "";
    const today = new Date();
    const html = [];
    for (let i = -DAY_RANGE; i <= DAY_RANGE; i += 1) html.push(dayHtml(addDays(today, i)));
    strip.innerHTML = html.join("");
    if (selected) strip.querySelector(`[data-mcal-date="${selected}"]`)?.classList.add("is-selected");
  }

  function scrollTodayIntoView() {
    document.querySelector('.mcal-day[aria-current="date"]')?.scrollIntoView({ behavior: "instant", block: "nearest", inline: "center" });
  }

  function layer() {
    let el = document.getElementById("milosCalendarLayer");
    if (!el) {
      el = document.createElement("section");
      el.id = "milosCalendarLayer";
      el.className = "mcal-layer";
      el.hidden = true;
      document.body.appendChild(el);
    }
    return el;
  }
  function closeLayer() {
    const el = layer();
    el.hidden = true;
    el.innerHTML = "";
  }
  function eventRow(item) {
    const type = eventTypeLabel(item.type);
    return `<article class="mcal-event"><span class="mcal-event-dot" data-type="${esc(item.type || "other")}"></span><div><small>${esc([item.time, type].filter(Boolean).join(" · "))}</small><strong>${esc(item.title || type)}</strong>${item.note ? `<p>${esc(item.note)}</p>` : ""}</div>${item.removable ? `<button type="button" data-mcal-delete="${esc(item.id)}" aria-label="Delete booking">×</button>` : ""}</article>`;
  }

  function openDay(key, formOpen) {
    document.querySelectorAll(".mcal-day").forEach((button) => button.classList.toggle("is-selected", button.dataset.mcalDate === key));
    const events = derivedEvents(key);
    const profiles = C.getProfiles ? C.getProfiles() : [];
    const el = layer();
    el.hidden = false;
    el.innerHTML = `<div class="mcal-scrim" data-mcal-close></div><div class="mcal-sheet" role="dialog" aria-modal="true" aria-labelledby="mcalDateTitle"><header><div><small>MILOS SCHEDULE</small><h2 id="mcalDateTitle">${esc(prettyDate(key))}</h2></div><button type="button" data-mcal-close aria-label="Close">×</button></header><div class="mcal-events">${events.length ? events.map(eventRow).join("") : '<div class="mcal-empty">Nothing booked for this day.</div>'}</div><button type="button" class="mcal-add" data-mcal-add="${key}">+ Add booking</button>${formOpen ? `<form class="mcal-form" data-mcal-form data-date="${key}"><div class="mcal-grid"><label><span>Type</span><select name="type"><option value="review">Review</option><option value="observation">Observation</option><option value="witness">Witness testimony</option><option value="meeting">Meeting</option><option value="other">Other</option></select></label><label><span>Time</span><input name="time" type="time" value="09:00"></label></div><label><span>Learner (optional)</span><select name="profileId"><option value="">No learner</option>${profiles.map((profile) => `<option value="${esc(profile.id)}">${esc(profile.name)}</option>`).join("")}</select></label><label><span>Title / note (optional)</span><input name="title" maxlength="120" placeholder="Add a short note"></label><button type="submit">Save booking</button></form>` : ""}</div>`;
  }

  function saveBooking(form) {
    const data = new FormData(form);
    const type = clean(data.get("type"), 30) || "other";
    const profileId = clean(data.get("profileId"), 100);
    const learner = profileId ? profileName(profileId) : "";
    const typedTitle = clean(data.get("title"), 120);
    const item = {
      id: uid(),
      date: clean(form.dataset.date, 20),
      time: clean(data.get("time"), 10),
      type,
      profileId,
      title: typedTitle || [eventTypeLabel(type), learner].filter(Boolean).join(" · "),
      createdAt: Date.now()
    };
    const rows = readBookings();
    rows.push(item);
    writeBookings(rows);
    refreshCalendar();
    openDay(item.date, false);
  }

  function removeBooking(id) {
    const rows = readBookings();
    const removed = rows.find((item) => item.id === id);
    if (!removed) return;
    writeBookings(rows.filter((item) => item.id !== id));
    refreshCalendar();
    openDay(removed.date, false);
  }

  document.addEventListener("click", (event) => {
    const day = event.target.closest && event.target.closest("[data-mcal-date]");
    if (day) { event.preventDefault(); openDay(day.dataset.mcalDate, false); return; }
    if (event.target.closest && event.target.closest("[data-mcal-today]")) { event.preventDefault(); scrollTodayIntoView(); return; }
    const add = event.target.closest && event.target.closest("[data-mcal-add]");
    if (add) { event.preventDefault(); openDay(add.dataset.mcalAdd, true); return; }
    const del = event.target.closest && event.target.closest("[data-mcal-delete]");
    if (del) { event.preventDefault(); removeBooking(del.dataset.mcalDelete); return; }
    if (event.target.closest && event.target.closest("[data-mcal-close]")) { event.preventDefault(); closeLayer(); }
  }, true);

  document.addEventListener("submit", (event) => {
    const form = event.target.closest && event.target.closest("[data-mcal-form]");
    if (!form) return;
    event.preventDefault();
    saveBooking(form);
  }, true);

  function start() {
    if (mount()) return;
    const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); });
    observer.observe(document.getElementById("milosApp") || document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
  global.setInterval(() => { if (document.getElementById("milosCalendarStrip")) refreshCalendar(); }, 60000);

  global.MilosWeekCalendar = Object.freeze({ version: VERSION, readBookings, derivedEvents, dateKey });
})(window);
