(function (global) {
  "use strict";

  const C = global.MilosCore;
  const app = document.getElementById("milosApp");
  if (!C || !app) return;

  const STORAGE_KEY = "milos-planning-v1";
  const VERSION = "2.12";
  const TYPE_META = Object.freeze({
    review: { label: "Review", short: "R", className: "is-review" },
    observation: { label: "Observation", short: "O", className: "is-observation" },
    both: { label: "Review & Observation", short: "R&O", className: "is-both" },
  });

  const ui = {
    open: false,
    month: startOfMonth(new Date()),
    mode: "calendar",
    selectedDate: "",
    selectedPlanId: "",
    editPlanId: "",
  };

  function clean(value, max) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max || 500);
  }

  function h(value) {
    return C.escapeHtml ? C.escapeHtml(value) : clean(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[char]);
  }

  function profileList() {
    return Array.isArray(C.getProfiles && C.getProfiles()) ? C.getProfiles() : [];
  }

  function profileById(id) {
    return C.getProfile ? C.getProfile(id) : profileList().find((profile) => profile.id === id) || null;
  }

  function firstName(name) {
    return clean(name, 100).split(/\s+/)[0] || "Learner";
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function dateKey(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function localToday() {
    const date = new Date();
    return dateKey(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function parseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(value, 10));
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value, options) {
    const date = parseDate(value);
    if (!date) return value || "";
    return new Intl.DateTimeFormat("en-GB", options || {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    }).format(date);
  }

  function monthLabel(date) {
    return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(date);
  }

  function makeId() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") return global.crypto.randomUUID();
    return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function readPlans() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item) => ({
        id: clean(item && item.id, 120),
        date: clean(item && item.date, 10),
        profileId: clean(item && item.profileId, 160),
        type: TYPE_META[item && item.type] ? item.type : "review",
        time: clean(item && item.time, 5),
        address: clean(item && item.address, 350),
        createdAt: clean(item && item.createdAt, 40),
        updatedAt: clean(item && item.updatedAt, 40),
      })).filter((item) => item.id && parseDate(item.date) && item.profileId);
    } catch (_) {
      return [];
    }
  }

  function writePlans(plans) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  }

  function sortedPlans(plans) {
    return [...plans].sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare) return dateCompare;
      const timeCompare = (a.time || "99:99").localeCompare(b.time || "99:99");
      if (timeCompare) return timeCompare;
      const aProfile = profileById(a.profileId);
      const bProfile = profileById(b.profileId);
      return clean(aProfile && aProfile.name).localeCompare(clean(bProfile && bProfile.name));
    });
  }

  function plansForDate(date) {
    return sortedPlans(readPlans().filter((plan) => plan.date === date));
  }

  function planById(id) {
    return readPlans().find((plan) => plan.id === id) || null;
  }

  function upcomingCount() {
    const today = localToday();
    return readPlans().filter((plan) => plan.date >= today).length;
  }

  function ensureLayer() {
    let layer = document.getElementById("milosPlanningLayer");
    if (layer) return layer;
    layer = document.createElement("section");
    layer.id = "milosPlanningLayer";
    layer.className = "milos-planning-layer";
    layer.setAttribute("aria-label", "Milos planning calendar");
    layer.hidden = true;
    document.body.appendChild(layer);
    return layer;
  }

  function showPlannerToast(message, error) {
    const layer = ensureLayer();
    let region = layer.querySelector(".milos-planning-toast-region");
    if (!region) {
      region = document.createElement("div");
      region.className = "milos-planning-toast-region";
      layer.appendChild(region);
    }
    region.innerHTML = `<div class="milos-planning-toast${error ? " is-error" : ""}">${h(message)}</div>`;
    setTimeout(() => {
      if (region) region.innerHTML = "";
    }, 2600);
  }

  function typeKey() {
    return `<div class="milos-planning-key" aria-label="Visit type key">
      <span><i class="is-review"></i>Review</span>
      <span><i class="is-observation"></i>Observation</span>
      <span><i class="is-both"></i>Review &amp; Observation</span>
    </div>`;
  }

  function calendarCells() {
    const year = ui.month.getFullYear();
    const month = ui.month.getMonth();
    const firstWeekdayMondayBased = (new Date(year, month, 1).getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((firstWeekdayMondayBased + days) / 7) * 7;
    const today = localToday();
    const cells = [];

    for (let index = 0; index < totalCells; index += 1) {
      const day = index - firstWeekdayMondayBased + 1;
      if (day < 1 || day > days) {
        cells.push('<div class="milos-planning-day is-empty" aria-hidden="true"></div>');
        continue;
      }
      const key = dateKey(year, month, day);
      const plans = plansForDate(key);
      const visible = plans.slice(0, 3);
      const extra = Math.max(0, plans.length - visible.length);
      const pills = visible.map((plan) => {
        const meta = TYPE_META[plan.type];
        const profile = profileById(plan.profileId);
        const name = profile ? firstName(profile.name) : "Removed";
        return `<button type="button" class="milos-plan-pill ${meta.className}" data-planning-action="open-plan" data-id="${h(plan.id)}" aria-label="${h(`${name}, ${meta.label}`)}">${h(name)}</button>`;
      }).join("");

      cells.push(`<div class="milos-planning-day${key === today ? " is-today" : ""}" data-planning-action="add-date" data-date="${h(key)}" role="button" tabindex="0" aria-label="${h(`Add visit on ${formatDate(key)}`)}">
        <span class="milos-planning-day-number">${day}</span>
        <div class="milos-planning-day-plans">${pills}${extra ? `<span class="milos-plan-more">+${extra}</span>` : ""}</div>
      </div>`);
    }
    return cells.join("");
  }

  function renderCalendar() {
    const layer = ensureLayer();
    layer.innerHTML = `<div class="milos-planning-shell">
      <header class="milos-planning-header">
        <button type="button" class="milos-planning-icon" data-planning-action="close" aria-label="Close Planning">‹</button>
        <div><strong>Planning</strong><small>Reviews &amp; observations</small></div>
        <button type="button" class="milos-planning-today" data-planning-action="today">Today</button>
      </header>
      <div class="milos-planning-body">
        ${typeKey()}
        <div class="milos-planning-monthbar">
          <button type="button" data-planning-action="prev-month" aria-label="Previous month">‹</button>
          <strong>${h(monthLabel(ui.month))}</strong>
          <button type="button" data-planning-action="next-month" aria-label="Next month">›</button>
        </div>
        <div class="milos-planning-weekdays" aria-hidden="true">
          <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
        </div>
        <div class="milos-planning-calendar">${calendarCells()}</div>
        <p class="milos-planning-hint">Tap a date to add a learner. Tap a learner name to open the planned visit.</p>
      </div>
      <div class="milos-planning-toast-region" aria-live="polite"></div>
    </div>`;
  }

  function learnerOptions(selectedId) {
    const list = profileList();
    if (!list.length) return '<option value="">No learner profiles available</option>';
    return `<option value="">Select learner</option>${list.map((profile) =>
      `<option value="${h(profile.id)}"${profile.id === selectedId ? " selected" : ""}>${h(profile.name)}</option>`
    ).join("")}`;
  }

  function typeChoices(selected) {
    return Object.entries(TYPE_META).map(([value, meta]) => `<label class="milos-planning-type ${meta.className}">
      <input type="radio" name="type" value="${h(value)}"${selected === value ? " checked" : ""}>
      <span>${h(meta.label)}</span>
    </label>`).join("");
  }

  function renderForm(plan) {
    const layer = ensureLayer();
    const value = plan || {};
    const date = value.date || ui.selectedDate || localToday();
    const heading = plan ? "Edit planned visit" : "Add planned visit";
    layer.innerHTML = `<div class="milos-planning-shell">
      <header class="milos-planning-header">
        <button type="button" class="milos-planning-icon" data-planning-action="calendar" aria-label="Back to calendar">‹</button>
        <div><strong>${h(heading)}</strong><small>${h(formatDate(date))}</small></div>
        <span class="milos-planning-header-spacer"></span>
      </header>
      <div class="milos-planning-body is-form">
        <form class="milos-planning-form" data-planning-form>
          <input type="hidden" name="planId" value="${h(value.id || "")}">
          <label class="milos-planning-field"><span>Date</span><input type="date" name="date" value="${h(date)}" required></label>
          <label class="milos-planning-field"><span>Learner</span><select name="profileId" required>${learnerOptions(value.profileId || "")}</select></label>
          <fieldset class="milos-planning-types">
            <legend>Visit type</legend>
            ${typeChoices(value.type || "review")}
          </fieldset>
          <label class="milos-planning-field"><span>Time <small>optional</small></span><input type="time" name="time" value="${h(value.time || "")}"></label>
          <label class="milos-planning-field"><span>Address <small>optional</small></span><input type="text" name="address" maxlength="350" autocomplete="street-address" value="${h(value.address || "")}" placeholder="Site or employer address"></label>
          <p class="milos-planning-local-note">Planning details stay on this device. An address is only sent to your maps app when you press Navigate.</p>
          <button type="submit" class="milos-planning-primary"${profileList().length ? "" : " disabled"}>${plan ? "Save changes" : "Add to calendar"}</button>
          ${plan ? `<button type="button" class="milos-planning-delete" data-planning-action="delete-plan" data-id="${h(plan.id)}">Delete planned visit</button>` : ""}
        </form>
      </div>
      <div class="milos-planning-toast-region" aria-live="polite"></div>
    </div>`;
  }

  function renderDetail(plan) {
    const layer = ensureLayer();
    const profile = profileById(plan.profileId);
    const meta = TYPE_META[plan.type];
    const name = profile ? profile.name : "Removed learner";
    const actions = [];
    if (profile && (plan.type === "review" || plan.type === "both")) {
      actions.push(`<button type="button" class="milos-planning-primary" data-planning-action="start-review" data-profile-id="${h(plan.profileId)}">Start Review</button>`);
    }
    if (profile && (plan.type === "observation" || plan.type === "both")) {
      actions.push(`<button type="button" class="milos-planning-primary is-secondary" data-planning-action="start-observation" data-profile-id="${h(plan.profileId)}">Start Observation</button>`);
    }

    layer.innerHTML = `<div class="milos-planning-shell">
      <header class="milos-planning-header">
        <button type="button" class="milos-planning-icon" data-planning-action="calendar" aria-label="Back to calendar">‹</button>
        <div><strong>${h(name)}</strong><small>${h(meta.label)}</small></div>
        <button type="button" class="milos-planning-edit" data-planning-action="edit-plan" data-id="${h(plan.id)}">Edit</button>
      </header>
      <div class="milos-planning-body is-detail">
        <div class="milos-planning-visit-card ${meta.className}">
          <span class="milos-planning-visit-type">${h(meta.short)}</span>
          <div><strong>${h(name)}</strong><small>${h(formatDate(plan.date))}${plan.time ? ` · ${h(plan.time)}` : ""}</small></div>
        </div>
        ${plan.address ? `<section class="milos-planning-address"><span>Address</span><p>${h(plan.address)}</p><button type="button" data-planning-action="navigate" data-address="${h(plan.address)}">Navigate</button></section>` : ""}
        <div class="milos-planning-start-actions">${actions.join("") || '<p class="milos-planning-local-note">This learner profile is no longer available.</p>'}</div>
        <button type="button" class="milos-planning-delete" data-planning-action="delete-plan" data-id="${h(plan.id)}">Delete planned visit</button>
      </div>
      <div class="milos-planning-toast-region" aria-live="polite"></div>
    </div>`;
  }

  function render() {
    if (!ui.open) return;
    if (ui.mode === "form") {
      renderForm(ui.editPlanId ? planById(ui.editPlanId) : null);
      return;
    }
    if (ui.mode === "detail") {
      const plan = planById(ui.selectedPlanId);
      if (plan) {
        renderDetail(plan);
        return;
      }
      ui.mode = "calendar";
    }
    renderCalendar();
  }

  function openPlanning() {
    ui.open = true;
    ui.mode = "calendar";
    ui.selectedDate = "";
    ui.selectedPlanId = "";
    ui.editPlanId = "";
    const layer = ensureLayer();
    layer.hidden = false;
    document.documentElement.classList.add("milos-planning-open");
    render();
  }

  function closePlanning() {
    ui.open = false;
    const layer = ensureLayer();
    layer.hidden = true;
    layer.innerHTML = "";
    document.documentElement.classList.remove("milos-planning-open");
    decorateMore();
  }

  function openDate(date) {
    ui.selectedDate = date;
    ui.editPlanId = "";
    ui.mode = "form";
    render();
  }

  function openPlan(id) {
    if (!planById(id)) return;
    ui.selectedPlanId = id;
    ui.mode = "detail";
    render();
  }

  function editPlan(id) {
    if (!planById(id)) return;
    ui.editPlanId = id;
    ui.mode = "form";
    render();
  }

  function savePlanFromForm(form) {
    const data = new FormData(form);
    const id = clean(data.get("planId"), 120);
    const date = clean(data.get("date"), 10);
    const profileId = clean(data.get("profileId"), 160);
    const type = clean(data.get("type"), 20);
    const time = clean(data.get("time"), 5);
    const address = clean(data.get("address"), 350);

    if (!parseDate(date) || !profileById(profileId) || !TYPE_META[type]) {
      showPlannerToast("Choose a date, learner and visit type.", true);
      return;
    }

    const plans = readPlans();
    const now = new Date().toISOString();
    const existingIndex = id ? plans.findIndex((plan) => plan.id === id) : -1;
    const next = {
      id: existingIndex >= 0 ? plans[existingIndex].id : makeId(),
      date,
      profileId,
      type,
      time,
      address,
      createdAt: existingIndex >= 0 ? plans[existingIndex].createdAt : now,
      updatedAt: now,
    };
    if (existingIndex >= 0) plans.splice(existingIndex, 1, next);
    else plans.push(next);
    writePlans(plans);

    const parsed = parseDate(date);
    if (parsed) ui.month = startOfMonth(parsed);
    ui.selectedPlanId = next.id;
    ui.editPlanId = "";
    ui.mode = "detail";
    render();
    decorateMore();
    showPlannerToast(existingIndex >= 0 ? "Planned visit updated." : "Added to Planning.");
  }

  function deletePlan(id) {
    const plan = planById(id);
    if (!plan) return;
    const profile = profileById(plan.profileId);
    const name = profile ? profile.name : "this learner";
    if (!global.confirm(`Delete the planned ${TYPE_META[plan.type].label.toLowerCase()} for ${name}?`)) return;
    writePlans(readPlans().filter((item) => item.id !== id));
    ui.mode = "calendar";
    ui.selectedPlanId = "";
    ui.editPlanId = "";
    render();
    decorateMore();
    showPlannerToast("Planned visit deleted.");
  }

  function navigationUrl(address) {
    const destination = encodeURIComponent(address);
    const apple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && "ontouchend" in document;
    return apple
      ? `https://maps.apple.com/?daddr=${destination}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
  }

  function navigate(address) {
    const value = clean(address, 350);
    if (!value) return;
    const url = navigationUrl(value);
    const opened = global.open(url, "_blank", "noopener,noreferrer");
    if (!opened) global.location.href = url;
  }

  function bridgeToMilos(action, profileId) {
    if (!profileById(profileId)) {
      showPlannerToast("That learner profile is no longer available.", true);
      return;
    }
    closePlanning();
    const bridge = document.createElement("button");
    bridge.type = "button";
    bridge.hidden = true;
    bridge.dataset.action = action;
    bridge.dataset.id = profileId;
    app.appendChild(bridge);
    bridge.click();
    bridge.remove();
  }

  function decorateMore() {
    const moreButton = document.querySelector('#viewPanel [data-action="open-more"]');
    if (moreButton) {
      const note = moreButton.querySelector(".option-row-copy small");
      if (note) note.textContent = "Planning, assessor details and privacy";
    }

    const settingsButton = document.querySelector('#viewPanel [data-action="open-settings"]');
    if (!settingsButton) return;
    const list = settingsButton.closest(".option-list");
    if (!list || list.querySelector("[data-milos-planning-open]")) return;

    const count = upcomingCount();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option-row milos-option-row";
    button.dataset.milosPlanningOpen = "true";
    button.innerHTML = `<span class="option-row-copy"><span>Planning</span><small>${h(count ? `${count} upcoming ${count === 1 ? "visit" : "visits"}` : "Reviews and observations calendar")}</small></span>`;
    list.insertBefore(button, settingsButton);

    const page = settingsButton.closest(".milos-page");
    const guide = page && page.querySelector(".milos-guidance");
    if (guide) {
      const strong = guide.querySelector("strong");
      const copy = guide.querySelector("p");
      if (strong) strong.textContent = "Plan assessor visits in one place.";
      if (copy) copy.textContent = "Add reviews and observations to the calendar, then open the learner or navigate to site from the booking.";
    }
  }

  function scheduleDecorate() {
    if (scheduleDecorate.pending) return;
    scheduleDecorate.pending = true;
    queueMicrotask(() => {
      scheduleDecorate.pending = false;
      decorateMore();
    });
  }

  function handlePlanningAction(target) {
    const action = target.dataset.planningAction;
    if (!action) return false;

    if (action === "close") closePlanning();
    else if (action === "calendar") {
      ui.mode = "calendar";
      ui.editPlanId = "";
      ui.selectedPlanId = "";
      render();
    } else if (action === "today") {
      const date = new Date();
      ui.month = startOfMonth(date);
      ui.mode = "calendar";
      render();
    } else if (action === "prev-month") {
      ui.month = new Date(ui.month.getFullYear(), ui.month.getMonth() - 1, 1);
      render();
    } else if (action === "next-month") {
      ui.month = new Date(ui.month.getFullYear(), ui.month.getMonth() + 1, 1);
      render();
    } else if (action === "add-date") openDate(target.dataset.date);
    else if (action === "open-plan") openPlan(target.dataset.id);
    else if (action === "edit-plan") editPlan(target.dataset.id);
    else if (action === "delete-plan") deletePlan(target.dataset.id);
    else if (action === "navigate") navigate(target.dataset.address);
    else if (action === "start-review") bridgeToMilos("start-review", target.dataset.profileId);
    else if (action === "start-observation") bridgeToMilos("start-observation", target.dataset.profileId);
    else return false;

    return true;
  }

  document.addEventListener("click", (event) => {
    const planningOpen = event.target && event.target.closest ? event.target.closest("[data-milos-planning-open]") : null;
    if (planningOpen) {
      event.preventDefault();
      openPlanning();
      return;
    }

    const target = event.target && event.target.closest ? event.target.closest("[data-planning-action]") : null;
    if (!target || !ui.open) return;
    event.preventDefault();
    event.stopPropagation();
    handlePlanningAction(target);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (!ui.open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (ui.mode === "calendar") closePlanning();
      else {
        ui.mode = "calendar";
        ui.editPlanId = "";
        ui.selectedPlanId = "";
        render();
      }
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && event.target && event.target.matches(".milos-planning-day[data-date]")) {
      event.preventDefault();
      openDate(event.target.dataset.date);
    }
  });

  document.addEventListener("submit", (event) => {
    if (!ui.open || !event.target.matches("[data-planning-form]")) return;
    event.preventDefault();
    savePlanFromForm(event.target);
  });

  function installObserver() {
    const panel = document.getElementById("viewPanel");
    if (!panel || panel.__milosPlanningObserver) return;
    panel.__milosPlanningObserver = true;
    new MutationObserver(scheduleDecorate).observe(panel, { childList: true });
    decorateMore();
  }

  const style = document.createElement("style");
  style.id = "milos-planning-v212-style";
  style.textContent = `
    .milos-planning-layer[hidden]{display:none!important}
    .milos-planning-layer{position:fixed;inset:0;z-index:1000;background:linear-gradient(180deg,#f9fcff 0%,#f4f9ff 56%,#eaf4ff 100%);color:#202022;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable","Segoe UI",sans-serif}
    .milos-planning-layer:before{content:"";position:absolute;inset:auto -22vw -18vh 18vw;height:52vh;background:radial-gradient(circle,rgba(47,143,239,.16),transparent 66%);pointer-events:none}
    .milos-planning-shell{position:relative;display:grid;grid-template-rows:auto minmax(0,1fr);width:min(52rem,100%);height:100%;margin:0 auto;padding:max(.7rem,env(safe-area-inset-top)) .75rem max(.75rem,env(safe-area-inset-bottom))}
    .milos-planning-header{display:grid;grid-template-columns:3rem minmax(0,1fr) auto;align-items:center;gap:.55rem;min-height:3.6rem;padding:.15rem .1rem .65rem}
    .milos-planning-header>div{display:grid;gap:.08rem;text-align:center}.milos-planning-header strong{font-size:1.02rem;font-weight:620}.milos-planning-header small{color:#7d8690;font-size:.68rem}
    .milos-planning-icon,.milos-planning-today,.milos-planning-edit,.milos-planning-monthbar button{border:0;background:transparent;color:#2f8fef;cursor:pointer;-webkit-tap-highlight-color:transparent}
    .milos-planning-icon{width:2.75rem;height:2.75rem;border-radius:50%;font-size:2rem;line-height:1}
    .milos-planning-today,.milos-planning-edit{min-width:3rem;padding:.55rem .25rem;font-size:.78rem;font-weight:560}
    .milos-planning-header-spacer{width:3rem}
    .milos-planning-body{min-height:0;overflow:auto;padding:.2rem .05rem 1rem;scrollbar-width:none}.milos-planning-body::-webkit-scrollbar{display:none}
    .milos-planning-key{display:flex;justify-content:center;flex-wrap:wrap;gap:.42rem .8rem;margin:.05rem 0 .8rem;padding:.58rem .7rem;border:1px solid rgba(47,143,239,.09);border-radius:999px;background:rgba(255,255,255,.68);box-shadow:0 8px 30px rgba(43,102,158,.04)}
    .milos-planning-key span{display:flex;align-items:center;gap:.28rem;color:#62707c;font-size:.64rem;white-space:nowrap}.milos-planning-key i{width:.65rem;height:.65rem;border-radius:50%}
    .milos-planning-key .is-review,.milos-plan-pill.is-review{background:#dceeff;color:#15598f}.milos-planning-key .is-observation,.milos-plan-pill.is-observation{background:#92c7f5;color:#104f83}.milos-planning-key .is-both,.milos-plan-pill.is-both{background:#2f8fef;color:#fff}
    .milos-planning-monthbar{display:grid;grid-template-columns:2.8rem 1fr 2.8rem;align-items:center;margin-bottom:.48rem}.milos-planning-monthbar strong{text-align:center;font-size:1.08rem;font-weight:620;letter-spacing:-.02em}.milos-planning-monthbar button{height:2.6rem;border-radius:50%;font-size:1.7rem}
    .milos-planning-weekdays,.milos-planning-calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:.24rem}
    .milos-planning-weekdays{padding:0 .05rem .28rem}.milos-planning-weekdays span{text-align:center;color:#89939d;font-size:.58rem;font-weight:590;text-transform:uppercase}
    .milos-planning-day{position:relative;min-height:5.3rem;padding:.34rem .22rem;border:1px solid rgba(47,143,239,.07);border-radius:.82rem;background:rgba(255,255,255,.63);cursor:pointer;overflow:hidden;-webkit-tap-highlight-color:transparent}
    .milos-planning-day.is-empty{border-color:transparent;background:transparent;cursor:default}.milos-planning-day.is-today{border-color:rgba(47,143,239,.55);box-shadow:inset 0 0 0 1px rgba(47,143,239,.08)}
    .milos-planning-day-number{display:grid;place-items:center;width:1.42rem;height:1.42rem;margin:0 auto .22rem;border-radius:50%;font-size:.67rem;font-weight:600}.milos-planning-day.is-today .milos-planning-day-number{background:#2f8fef;color:#fff}
    .milos-planning-day-plans{display:grid;gap:.17rem}.milos-plan-pill{display:block;width:100%;min-width:0;padding:.24rem .16rem;border:0;border-radius:.42rem;overflow:hidden;font-size:.58rem;font-weight:580;line-height:1.08;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent}
    .milos-plan-more{display:block;text-align:center;color:#6c7d8c;font-size:.56rem;font-weight:600}.milos-planning-hint{margin:.75rem .25rem 0;color:#7a8792;font-size:.68rem;text-align:center;line-height:1.4}
    .milos-planning-body.is-form,.milos-planning-body.is-detail{width:min(34rem,100%);margin:0 auto;padding-top:.55rem}
    .milos-planning-form{display:grid;gap:.82rem}.milos-planning-field{display:grid;gap:.36rem}.milos-planning-field>span,.milos-planning-types legend,.milos-planning-address>span{color:#65727d;font-size:.72rem;font-weight:560}.milos-planning-field small{font-weight:400;color:#929aa1}
    .milos-planning-field input,.milos-planning-field select{width:100%;min-height:3.35rem;padding:0 1rem;border:1px solid rgba(47,143,239,.13);border-radius:1rem;outline:none;background:rgba(255,255,255,.82);color:#25282b;font-size:.9rem}.milos-planning-field input:focus,.milos-planning-field select:focus{border-color:rgba(47,143,239,.65);box-shadow:0 0 0 3px rgba(47,143,239,.09)}
    .milos-planning-types{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.42rem;padding:0;border:0}.milos-planning-types legend{grid-column:1/-1;margin-bottom:.36rem}
    .milos-planning-type input{position:absolute;opacity:0;pointer-events:none}.milos-planning-type span{display:grid;place-items:center;min-height:3.15rem;padding:.4rem;border:1px solid rgba(47,143,239,.12);border-radius:.9rem;background:rgba(255,255,255,.72);color:#4e6171;font-size:.69rem;font-weight:580;text-align:center;cursor:pointer}
    .milos-planning-type.is-review input:checked+span{background:#dceeff;border-color:#b8daf6;color:#15598f}.milos-planning-type.is-observation input:checked+span{background:#92c7f5;border-color:#70b2e9;color:#104f83}.milos-planning-type.is-both input:checked+span{background:#2f8fef;border-color:#2f8fef;color:#fff}
    .milos-planning-local-note{margin:.05rem 0;color:#7d8993;font-size:.66rem;line-height:1.42}
    .milos-planning-primary{width:100%;min-height:3.35rem;padding:.7rem 1rem;border:0;border-radius:999px;background:#2f8fef;color:#fff;font-weight:610;cursor:pointer;box-shadow:0 10px 24px rgba(47,143,239,.18);-webkit-tap-highlight-color:transparent}.milos-planning-primary:disabled{opacity:.4;cursor:not-allowed}.milos-planning-primary.is-secondary{background:#84bff2;color:#0e4f84;box-shadow:none}
    .milos-planning-delete{width:100%;padding:.75rem;border:0;background:transparent;color:#c4525c;font-size:.76rem;font-weight:560;cursor:pointer}
    .milos-planning-visit-card{display:flex;align-items:center;gap:.8rem;padding:1rem;border-radius:1.15rem;background:rgba(255,255,255,.78);box-shadow:0 10px 32px rgba(42,95,145,.07)}.milos-planning-visit-type{display:grid;place-items:center;min-width:3.1rem;height:3.1rem;padding:.2rem .45rem;border-radius:.9rem;font-size:.74rem;font-weight:720}
    .milos-planning-visit-card.is-review .milos-planning-visit-type{background:#dceeff;color:#15598f}.milos-planning-visit-card.is-observation .milos-planning-visit-type{background:#92c7f5;color:#104f83}.milos-planning-visit-card.is-both .milos-planning-visit-type{background:#2f8fef;color:#fff}
    .milos-planning-visit-card>div{display:grid;gap:.2rem}.milos-planning-visit-card>div strong{font-size:1rem}.milos-planning-visit-card>div small{color:#78858f;font-size:.72rem}
    .milos-planning-address{margin-top:.85rem;padding:1rem;border:1px solid rgba(47,143,239,.09);border-radius:1.1rem;background:rgba(255,255,255,.68)}.milos-planning-address p{margin:.4rem 0 .7rem;font-size:.82rem;line-height:1.42}.milos-planning-address button{padding:.55rem .9rem;border:0;border-radius:999px;background:#e4f1fc;color:#17639f;font-size:.72rem;font-weight:600;cursor:pointer}
    .milos-planning-start-actions{display:grid;gap:.55rem;margin-top:1rem}.milos-planning-toast-region{position:absolute;left:50%;bottom:max(1rem,env(safe-area-inset-bottom));z-index:3;width:min(28rem,calc(100% - 2rem));transform:translateX(-50%);pointer-events:none}.milos-planning-toast{padding:.72rem 1rem;border-radius:999px;background:rgba(24,40,54,.9);color:#fff;font-size:.72rem;text-align:center;box-shadow:0 12px 30px rgba(0,0,0,.14);backdrop-filter:blur(12px)}.milos-planning-toast.is-error{background:rgba(144,49,58,.92)}
    @media(max-width:540px){.milos-planning-shell{padding-left:.42rem;padding-right:.42rem}.milos-planning-day{min-height:4.55rem;padding:.28rem .13rem;border-radius:.68rem}.milos-plan-pill{font-size:.52rem;padding:.22rem .1rem}.milos-planning-weekdays,.milos-planning-calendar{gap:.16rem}.milos-planning-key{gap:.34rem .55rem}.milos-planning-key span{font-size:.59rem}.milos-planning-types{gap:.3rem}.milos-planning-type span{font-size:.62rem;padding:.3rem}}
    @media(max-height:700px){.milos-planning-day{min-height:4.15rem}.milos-planning-key{margin-bottom:.45rem;padding:.42rem .6rem}.milos-planning-monthbar{margin-bottom:.28rem}}
    @media(prefers-reduced-motion:reduce){.milos-planning-layer *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
  `;
  document.head.appendChild(style);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installObserver, { once: true });
  } else {
    installObserver();
  }

  global.MilosPlanning = Object.freeze({
    version: VERSION,
    storageKey: STORAGE_KEY,
    open: openPlanning,
    getPlans: () => sortedPlans(readPlans()),
  });
})(window);
