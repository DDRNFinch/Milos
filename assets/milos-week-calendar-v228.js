(function (global) {
  "use strict";

  const C = global.MilosCore;
  if (!C) return;

  const VERSION = "2.30";
  const STORE_KEY = "milos-calendar-bookings-v1";
  const DAY_RANGE = 90;
  const pad = (n) => String(n).padStart(2, "0");

  function dateKey(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
  function fromKey(key) { const [y, m, d] = String(key).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0); }
  function addDays(date, amount) { const out = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0); out.setDate(out.getDate() + amount); return out; }
  function esc(value) { return C.escapeHtml ? C.escapeHtml(value) : String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])); }
  function clean(value, max) { return C.cleanText ? C.cleanText(value, max || 500) : String(value == null ? "" : value).trim().slice(0, max || 500); }
  function readBookings() { try { const value = JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch (_) { return []; } }
  function writeBookings(rows) { localStorage.setItem(STORE_KEY, JSON.stringify(rows)); }
  function uid() { return C.uid ? C.uid("booking") : `booking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
  function profileName(id) { const profile = (C.getProfiles ? C.getProfiles() : []).find((item) => item.id === id); return profile ? profile.name : ""; }
  function prettyDate(key) { return fromKey(key).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
  function eventTypeLabel(type) { return ({ review: "Review", observation: "Observation", witness: "Witness testimony", meeting: "Meeting", other: "Booking" })[type] || "Booking"; }
  function prettyTime(start, end) { return [start, end].filter(Boolean).join("–"); }
  function detail(label, value) { return value ? `<div class="mcal-detail"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>` : ""; }

  function derivedEvents(key) {
    const rows = [];
    readBookings().filter((item) => item.date === key).forEach((item) => rows.push(Object.assign({ source: "booking", editable: true, removable: true }, item)));

    (C.getReviews ? C.getReviews() : []).forEach((review) => {
      const profile = C.getProfile ? C.getProfile(review.profileId) : null;
      const learner = profile ? profile.name : "Learner";
      const reviewDate = review.reviewDate || review.date || "";
      if (reviewDate === key) rows.push({
        id: `review-${review.id}`, source: "review-record", sourceId: review.id, type: "review", date: key,
        time: review.startTime || "", endTime: review.endTime || "", title: `Review · ${learner}`, note: "Completed progress review",
        profileId: review.profileId || "", learner, location: review.location || "", editable: false, removable: false,
        details: { "Next review": review.nextReviewDate ? prettyDate(review.nextReviewDate) : "", "Status": review.status || review.overallStatus || "Completed" }
      });
      if (review.nextReviewDate === key) rows.push({
        id: `review-due-${review.id}`, source: "review-due", sourceId: review.id, type: "review", date: key, time: "", endTime: "",
        title: `Review due · ${learner}`, note: "Next review date from the previous review", profileId: review.profileId || "", learner,
        editable: false, removable: false, details: { "Previous review": reviewDate ? prettyDate(reviewDate) : "" }
      });
    });

    (C.getObservations ? C.getObservations() : []).forEach((observation) => {
      if (observation.observationDate !== key) return;
      const profile = C.getProfile ? C.getProfile(observation.profileId) : null;
      const area = observation.subcategoryTitle || observation.unitTitle || (observation.unitNumber ? `Unit ${observation.unitNumber}` : observation.jobTitle || observation.opportunityTitle || "");
      rows.push({
        id: `observation-${observation.id}`, source: "observation-record", sourceId: observation.id, type: observation.mode === "witness" ? "witness" : "observation",
        date: key, time: observation.startTime || "", endTime: observation.endTime || "", title: `${observation.method || "Observation"} · ${profile ? profile.name : "Learner"}`,
        note: area || "Completed observation", profileId: observation.profileId || "", learner: profile ? profile.name : "Learner",
        location: observation.location || "", editable: false, removable: false,
        details: { "Observation area": area, "Activity": observation.activityObserved || "", "Evidence": `${(observation.observedCodes || []).length || (observation.criteria || []).length || 0} ${observation.coverageLabel || "criteria"}` }
      });
    });

    return rows.sort((a, b) => String(a.time || "99:99").localeCompare(String(b.time || "99:99")) || String(a.title || "").localeCompare(String(b.title || "")));
  }

  function dayHtml(date) {
    const key = dateKey(date), today = key === dateKey(new Date()), count = derivedEvents(key).length;
    const weekday = date.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase();
    const month = date.toLocaleDateString("en-GB", { month: "short" }).toUpperCase();
    return `<button type="button" class="mcal-day${today ? " is-today" : ""}" data-mcal-date="${key}" ${today ? 'aria-current="date"' : ""} aria-label="${esc(prettyDate(key))}${count ? `, ${count} booking${count === 1 ? "" : "s"}` : ""}"><span>${weekday}</span><strong>${date.getDate()}</strong><small>${today ? "TODAY" : month}</small><i aria-hidden="true">${count ? `${'<b></b>'.repeat(Math.min(3, count))}${count > 3 ? `<em>${count}</em>` : ""}` : ""}</i></button>`;
  }

  function mount() {
    const dock = document.querySelector(".progress-dock");
    if (!dock || dock.dataset.mcalMounted === "1") return false;
    dock.dataset.mcalMounted = "1"; dock.classList.add("mcal-host");
    const today = new Date(), days = [];
    for (let i = -DAY_RANGE; i <= DAY_RANGE; i += 1) days.push(dayHtml(addDays(today, i)));
    dock.innerHTML = `<section class="mcal-shell" aria-label="Milos weekday calendar"><div class="mcal-head"><span>Schedule</span><button type="button" data-mcal-today>Today</button></div><div class="mcal-strip" id="milosCalendarStrip">${days.join("")}</div></section>`;
    requestAnimationFrame(scrollTodayIntoView); return true;
  }
  function refreshCalendar() {
    const strip = document.getElementById("milosCalendarStrip"); if (!strip) return;
    const selected = strip.querySelector(".mcal-day.is-selected")?.dataset.mcalDate || "", today = new Date(), html = [];
    for (let i = -DAY_RANGE; i <= DAY_RANGE; i += 1) html.push(dayHtml(addDays(today, i)));
    strip.innerHTML = html.join(""); if (selected) strip.querySelector(`[data-mcal-date="${selected}"]`)?.classList.add("is-selected");
  }
  function scrollTodayIntoView() { document.querySelector('.mcal-day[aria-current="date"]')?.scrollIntoView({ behavior: "instant", block: "nearest", inline: "center" }); }

  function layer() { let el = document.getElementById("milosCalendarLayer"); if (!el) { el = document.createElement("section"); el.id = "milosCalendarLayer"; el.className = "mcal-layer"; el.hidden = true; document.body.appendChild(el); } return el; }
  function closeLayer() { const el = layer(); el.hidden = true; el.innerHTML = ""; }

  function eventRow(item) {
    const type = eventTypeLabel(item.type), meta = [prettyTime(item.time, item.endTime), type].filter(Boolean).join(" · ");
    return `<button type="button" class="mcal-event mcal-event-open" data-mcal-event="${esc(item.id)}" data-mcal-source="${esc(item.source)}" data-mcal-event-date="${esc(item.date)}"><span class="mcal-event-dot" data-type="${esc(item.type || "other")}"></span><div><small>${esc(meta)}</small><strong>${esc(item.title || type)}</strong>${item.note ? `<p>${esc(item.note)}</p>` : ""}</div><i aria-hidden="true">›</i></button>`;
  }

  function bookingForm(key, item) {
    const profiles = C.getProfiles ? C.getProfiles() : [], editing = !!item;
    const value = item || { date: key, time: "09:00", endTime: "", type: "review", profileId: "", title: "", location: "", note: "" };
    return `<form class="mcal-form mcal-booking-editor" data-mcal-form data-date="${esc(value.date || key)}" data-booking-id="${editing ? esc(value.id) : ""}">
      <div class="mcal-grid"><label><span>Date</span><input name="date" type="date" value="${esc(value.date || key)}" required></label><label><span>Type</span><select name="type">${["review","observation","witness","meeting","other"].map((type) => `<option value="${type}"${value.type === type ? " selected" : ""}>${esc(eventTypeLabel(type))}</option>`).join("")}</select></label></div>
      <div class="mcal-grid"><label><span>Start</span><input name="time" type="time" value="${esc(value.time || "09:00")}"></label><label><span>Finish</span><input name="endTime" type="time" value="${esc(value.endTime || "")}"></label></div>
      <label><span>Learner</span><select name="profileId"><option value="">No learner</option>${profiles.map((profile) => `<option value="${esc(profile.id)}"${value.profileId === profile.id ? " selected" : ""}>${esc(profile.name)}</option>`).join("")}</select></label>
      <label><span>Title</span><input name="title" maxlength="120" value="${esc(value.title || "")}" placeholder="e.g. 12-week progress review"></label>
      <label><span>Location</span><input name="location" maxlength="160" value="${esc(value.location || "")}" placeholder="Site, college, workshop or online"></label>
      <label><span>Notes</span><textarea name="note" rows="3" maxlength="1000" placeholder="Anything you need for the appointment">${esc(value.note || "")}</textarea></label>
      <button type="submit">${editing ? "Save changes" : "Save booking"}</button>
    </form>`;
  }

  function openDay(key, formOpen) {
    document.querySelectorAll(".mcal-day").forEach((button) => button.classList.toggle("is-selected", button.dataset.mcalDate === key));
    const events = derivedEvents(key), el = layer(); el.hidden = false;
    el.innerHTML = `<div class="mcal-scrim" data-mcal-close></div><div class="mcal-sheet" role="dialog" aria-modal="true" aria-labelledby="mcalDateTitle"><header><div><small>MILOS SCHEDULE</small><h2 id="mcalDateTitle">${esc(prettyDate(key))}</h2></div><button type="button" data-mcal-close aria-label="Close">×</button></header><div class="mcal-events">${events.length ? events.map(eventRow).join("") : '<div class="mcal-empty">Nothing booked for this day.</div>'}</div><button type="button" class="mcal-add" data-mcal-add="${key}">+ Add booking</button>${formOpen ? bookingForm(key, null) : ""}</div>`;
  }

  function findEvent(id, source, key) { return derivedEvents(key).find((item) => item.id === id && item.source === source) || null; }
  function openEvent(item) {
    if (!item) return;
    const learner = item.learner || profileName(item.profileId), extras = item.details || {};
    const extraHtml = Object.entries(extras).map(([label, value]) => detail(label, value)).join("");
    const sourceNote = item.editable ? "This is a Milos booking. You can change its date or details." : item.source === "review-due" ? "This due date comes from the previous completed review." : "This item comes from a completed Milos record and is protected here.";
    const el = layer(); el.hidden = false;
    el.innerHTML = `<div class="mcal-scrim" data-mcal-close></div><div class="mcal-sheet mcal-detail-sheet" role="dialog" aria-modal="true"><header><div><small>${esc(eventTypeLabel(item.type).toUpperCase())}</small><h2>${esc(item.title || eventTypeLabel(item.type))}</h2></div><button type="button" data-mcal-close aria-label="Close">×</button></header><div class="mcal-detail-grid">${detail("Date", prettyDate(item.date))}${detail("Time", prettyTime(item.time, item.endTime) || "No time set")}${detail("Learner", learner)}${detail("Location", item.location)}${detail("Notes", item.note)}${extraHtml}</div><p class="mcal-source-note">${esc(sourceNote)}</p><div class="mcal-detail-actions"><button type="button" class="mcal-secondary" data-mcal-back-day="${esc(item.date)}">Back to day</button>${item.editable ? `<button type="button" class="mcal-primary-action" data-mcal-edit="${esc(item.id)}">Edit / reschedule</button><button type="button" class="mcal-danger" data-mcal-delete="${esc(item.id)}">Delete booking</button>` : ""}</div></div>`;
  }
  function openEdit(id) { const item = readBookings().find((row) => row.id === id); if (!item) return; const el = layer(); el.hidden = false; el.innerHTML = `<div class="mcal-scrim" data-mcal-close></div><div class="mcal-sheet" role="dialog" aria-modal="true"><header><div><small>EDIT BOOKING</small><h2>${esc(item.title || eventTypeLabel(item.type))}</h2></div><button type="button" data-mcal-close aria-label="Close">×</button></header>${bookingForm(item.date, item)}</div>`; }

  function saveBooking(form) {
    const data = new FormData(form), bookingId = clean(form.dataset.bookingId, 120), type = clean(data.get("type"), 30) || "other";
    const profileId = clean(data.get("profileId"), 100), learner = profileId ? profileName(profileId) : "", typedTitle = clean(data.get("title"), 120);
    const item = {
      id: bookingId || uid(), date: clean(data.get("date"), 20) || clean(form.dataset.date, 20), time: clean(data.get("time"), 10), endTime: clean(data.get("endTime"), 10),
      type, profileId, title: typedTitle || [eventTypeLabel(type), learner].filter(Boolean).join(" · "), location: clean(data.get("location"), 160), note: clean(data.get("note"), 1000),
      createdAt: Date.now(), updatedAt: Date.now()
    };
    const rows = readBookings(), index = rows.findIndex((row) => row.id === item.id);
    if (index >= 0) { item.createdAt = rows[index].createdAt || item.createdAt; rows[index] = item; } else rows.push(item);
    writeBookings(rows); refreshCalendar(); openDay(item.date, false);
  }
  function removeBooking(id) {
    const rows = readBookings(), removed = rows.find((item) => item.id === id); if (!removed) return;
    if (global.confirm && !global.confirm(`Delete ${removed.title || eventTypeLabel(removed.type)}?`)) return;
    writeBookings(rows.filter((item) => item.id !== id)); refreshCalendar(); openDay(removed.date, false);
  }

  document.addEventListener("click", (event) => {
    const day = event.target.closest && event.target.closest("[data-mcal-date]"); if (day) { event.preventDefault(); openDay(day.dataset.mcalDate, false); return; }
    if (event.target.closest && event.target.closest("[data-mcal-today]")) { event.preventDefault(); scrollTodayIntoView(); return; }
    const add = event.target.closest && event.target.closest("[data-mcal-add]"); if (add) { event.preventDefault(); openDay(add.dataset.mcalAdd, true); return; }
    const eventButton = event.target.closest && event.target.closest("[data-mcal-event]"); if (eventButton) { event.preventDefault(); openEvent(findEvent(eventButton.dataset.mcalEvent, eventButton.dataset.mcalSource, eventButton.dataset.mcalEventDate)); return; }
    const back = event.target.closest && event.target.closest("[data-mcal-back-day]"); if (back) { event.preventDefault(); openDay(back.dataset.mcalBackDay, false); return; }
    const edit = event.target.closest && event.target.closest("[data-mcal-edit]"); if (edit) { event.preventDefault(); openEdit(edit.dataset.mcalEdit); return; }
    const del = event.target.closest && event.target.closest("[data-mcal-delete]"); if (del) { event.preventDefault(); removeBooking(del.dataset.mcalDelete); return; }
    if (event.target.closest && event.target.closest("[data-mcal-close]")) { event.preventDefault(); closeLayer(); }
  }, true);
  document.addEventListener("submit", (event) => { const form = event.target.closest && event.target.closest("[data-mcal-form]"); if (!form) return; event.preventDefault(); saveBooking(form); }, true);

  function start() { if (mount()) return; const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); }); observer.observe(document.getElementById("milosApp") || document.body, { childList: true, subtree: true }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
  global.setInterval(() => { if (document.getElementById("milosCalendarStrip")) refreshCalendar(); }, 60000);

  global.MilosWeekCalendar = Object.freeze({ version: VERSION, readBookings, derivedEvents, dateKey, openDay });
})(window);
