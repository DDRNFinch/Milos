(function (global) {
  "use strict";

  if (!global.document || !global.MilosCore) return;

  const C = global.MilosCore;
  const VERSION = "2.12";
  const STORAGE_KEY = "milos-planning-v1";
  const MAX_VISIBLE_PER_DAY = 3;
  const TYPE_LABELS = Object.freeze({
    review: "Review",
    observation: "Observation",
    both: "Review & Observation",
  });

  let monthCursor = startOfMonth(new Date());
  let lastOpenedDate = "";

  function h(value) {
    return C.escapeHtml ? C.escapeHtml(String(value == null ? "" : value)) : String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
  }

  function clean(value, max) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max || 240);
  }

  function startOfMonth(value) {
    const date = value instanceof Date ? value : new Date(value);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function dateKey(year, monthIndex, day) {
    return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
  }

  function todayKey() {
    const now = new Date();
    return dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function validDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
  }

  function validTime(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || "")) ? String(value) : "";
  }

  function typeValue(value) {
    return Object.prototype.hasOwnProperty.call(TYPE_LABELS, value) ? value : "review";
  }

  function typeLabel(value) {
    return TYPE_LABELS[typeValue(value)];
  }

  function readPlans() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item) => ({
        id: clean(item && item.id, 100),
        profileId: clean(item && item.profileId, 100),
        date: validDate(item && item.date),
        type: typeValue(item && item.type),
        time: validTime(item && item.time),
        address: clean(item && item.address, 300),
        createdAt: Number(item && item.createdAt) || Date.now(),
        updatedAt: Number(item && item.updatedAt) || Number(item && item.createdAt) || Date.now(),
      })).filter((item) => item.id && item.profileId && item.date);
    } catch (_) {
      return [];
    }
  }

  function writePlans(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function profiles() {
    return typeof C.getProfiles === "function" ? C.getProfiles() : [];
  }

  function profileFor(id) {
    return typeof C.getProfile === "function" ? C.getProfile(id) : profiles().find((profile) => profile.id === id) || null;
  }

  function profileCalendarName(profile) {
    if (!profile || !profile.name) return "Removed";
    const parts = clean(profile.name, 100).split(/\s+/).filter(Boolean);
    return parts[0] || "Learner";
  }

  function monthLabel() {
    return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(monthCursor);
  }

  function fullDateLabel(value) {
    const parts = String(value || "").split("-").map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return value || "";
    return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      .format(new Date(parts[0], parts[1] - 1, parts[2]));
  }

  function layerRegion() {
    return document.getElementById("modalRegion");
  }

  function ensureStyle() {
    if (document.getElementById("milos-planning-v212-style")) return;
    const style = document.createElement("style");
    style.id = "milos-planning-v212-style";
    style.textContent = `
      .milos-planning-layer{position:fixed;inset:0;z-index:10040;background:linear-gradient(180deg,#f7fbff 0%,#edf5ff 100%);overflow:auto;-webkit-overflow-scrolling:touch;color:#17324d}
      .milos-planning-shell{width:min(760px,100%);min-height:100%;margin:0 auto;padding:max(18px,env(safe-area-inset-top)) 14px max(28px,env(safe-area-inset-bottom))}
      .milos-planning-header{display:grid;grid-template-columns:42px 1fr 42px;align-items:center;gap:8px;margin-bottom:16px}
      .milos-planning-header h2{margin:0;text-align:center;font-size:22px;font-weight:750;letter-spacing:-.02em}
      .milos-planning-icon{width:42px;height:42px;border:0;border-radius:50%;background:rgba(255,255,255,.82);box-shadow:0 5px 18px rgba(29,83,132,.09);font:inherit;font-size:24px;color:#245d91}
      .milos-planning-monthbar{display:grid;grid-template-columns:42px 1fr 42px;align-items:center;gap:8px;margin:2px 0 12px}
      .milos-planning-monthbar strong{text-align:center;font-size:18px}
      .milos-planning-key{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 14px}
      .milos-planning-key span{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:#31536f}
      .milos-planning-key i{width:12px;height:12px;border-radius:999px;display:inline-block}
      .milos-plan-review{--plan-bg:#dceeff;--plan-text:#245f93;--plan-border:#b9daf8}
      .milos-plan-observation{--plan-bg:#8ec4f4;--plan-text:#103f69;--plan-border:#75b2e7}
      .milos-plan-both{--plan-bg:#2f8fef;--plan-text:#fff;--plan-border:#2f8fef}
      .milos-planning-weekdays,.milos-planning-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
      .milos-planning-weekdays{margin-bottom:4px}.milos-planning-weekdays span{text-align:center;font-size:10px;font-weight:800;color:#71869a;padding:4px 0}
      .milos-planning-day{min-width:0;min-height:88px;border:1px solid rgba(94,139,177,.16);border-radius:12px;background:rgba(255,255,255,.76);padding:5px;display:flex;flex-direction:column;gap:4px}
      .milos-planning-day.is-empty{background:transparent;border-color:transparent}
      .milos-planning-day.is-today{box-shadow:inset 0 0 0 1.5px #2f8fef}
      .milos-planning-date{align-self:flex-start;width:25px;height:25px;border:0;border-radius:50%;background:transparent;color:#24445f;font:inherit;font-size:11px;font-weight:800;padding:0}
      .milos-planning-day.is-today .milos-planning-date{background:#2f8fef;color:#fff}
      .milos-plan-pill{width:100%;border:1px solid var(--plan-border);background:var(--plan-bg);color:var(--plan-text);border-radius:7px;padding:3px 4px;font:inherit;font-size:9px;font-weight:800;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}
      .milos-plan-more{border:0;background:transparent;color:#4b7598;font:inherit;font-size:9px;font-weight:800;text-align:left;padding:1px 3px}
      .milos-planning-empty{padding:22px 8px;text-align:center;color:#6d8294;font-size:13px}
      .milos-planning-editor,.milos-planning-card{background:rgba(255,255,255,.9);border:1px solid rgba(80,132,176,.14);box-shadow:0 12px 36px rgba(31,76,116,.08);border-radius:22px;padding:18px}
      .milos-planning-editor h3,.milos-planning-card h3{margin:0 0 4px;font-size:21px}.milos-planning-editor>p,.milos-planning-card>p{margin:0 0 16px;color:#6b8194;font-size:13px}
      .milos-planning-field{display:grid;gap:6px;margin:13px 0}.milos-planning-field>span{font-size:12px;font-weight:800;color:#355976}
      .milos-planning-field input,.milos-planning-field select{width:100%;box-sizing:border-box;border:1px solid #c9dbea;border-radius:13px;background:#fff;padding:12px 13px;font:inherit;color:#17324d;outline:none}
      .milos-planning-field input:focus,.milos-planning-field select:focus{border-color:#2f8fef;box-shadow:0 0 0 3px rgba(47,143,239,.12)}
      .milos-planning-type{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:6px}.milos-planning-type label{position:relative}.milos-planning-type input{position:absolute;opacity:0;pointer-events:none}.milos-planning-type span{display:flex;min-height:44px;align-items:center;justify-content:center;text-align:center;border:1px solid var(--plan-border);background:var(--plan-bg);color:var(--plan-text);border-radius:12px;padding:5px;font-size:10px;font-weight:800;opacity:.55}.milos-planning-type input:checked+span{opacity:1;box-shadow:0 0 0 2px #fff,0 0 0 4px rgba(47,143,239,.28)}
      .milos-planning-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:15px}.milos-planning-actions .is-wide{grid-column:1/-1}
      .milos-planning-primary,.milos-planning-secondary,.milos-planning-danger{border:0;border-radius:13px;padding:12px 13px;font:inherit;font-weight:800}.milos-planning-primary{background:#2f8fef;color:#fff}.milos-planning-secondary{background:#e8f2fb;color:#245d91}.milos-planning-danger{background:#fff0f0;color:#a23d3d}
      .milos-planning-detail{display:grid;gap:10px;margin:17px 0}.milos-planning-detail div{display:grid;gap:2px;padding:11px 12px;border-radius:13px;background:#f5f9fd}.milos-planning-detail small{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#7890a5}.milos-planning-detail strong{font-size:14px;color:#24455f}.milos-planning-typebadge{display:inline-flex;width:max-content;max-width:100%;border:1px solid var(--plan-border);background:var(--plan-bg);color:var(--plan-text);border-radius:999px;padding:6px 10px;font-size:11px;font-weight:800;margin:6px 0 0}
      .milos-planning-agenda{display:grid;gap:8px}.milos-planning-agenda button{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid var(--plan-border);background:var(--plan-bg);color:var(--plan-text);border-radius:13px;padding:11px 12px;text-align:left;font:inherit}.milos-planning-agenda strong{font-size:13px}.milos-planning-agenda small{font-size:10px;opacity:.82}
      @media(max-width:430px){.milos-planning-shell{padding-left:8px;padding-right:8px}.milos-planning-day{min-height:82px;padding:4px;border-radius:9px}.milos-planning-grid,.milos-planning-weekdays{gap:2px}.milos-plan-pill{font-size:8.5px;padding:3px}.milos-planning-type span{font-size:9px}.milos-planning-editor,.milos-planning-card{border-radius:18px;padding:15px}}
    `;
    document.head.appendChild(style);
  }

  function dayPlans(date, allPlans) {
    return allPlans.filter((item) => item.date === date).sort((a, b) => {
      const timeCompare = (a.time || "99:99").localeCompare(b.time || "99:99");
      if (timeCompare) return timeCompare;
      const aName = profileCalendarName(profileFor(a.profileId));
      const bName = profileCalendarName(profileFor(b.profileId));
      return aName.localeCompare(bName);
    });
  }

  function planPill(plan) {
    const profile = profileFor(plan.profileId);
    const name = profileCalendarName(profile);
    return `<button type="button" class="milos-plan-pill milos-plan-${h(plan.type)}" data-plan-action="open-booking" data-id="${h(plan.id)}" title="${h(`${profile ? profile.name : "Removed learner"} · ${typeLabel(plan.type)}`)}">${h(name)}</button>`;
  }

  function calendarGrid() {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const leading = (new Date(year, month, 1).getDay() + 6) % 7;
    const allPlans = readPlans();
    const today = todayKey();
    const cells = [];
    for (let i = 0; i < leading; i += 1) cells.push('<div class="milos-planning-day is-empty" aria-hidden="true"></div>');
    for (let day = 1; day <= days; day += 1) {
      const date = dateKey(year, month, day);
      const items = dayPlans(date, allPlans);
      const visible = items.slice(0, MAX_VISIBLE_PER_DAY);
      const more = Math.max(0, items.length - visible.length);
      cells.push(`<div class="milos-planning-day${date === today ? " is-today" : ""}">
        <button type="button" class="milos-planning-date" data-plan-action="new-booking" data-date="${date}" aria-label="Plan a visit for ${h(fullDateLabel(date))}">${day}</button>
        ${visible.map(planPill).join("")}
        ${more ? `<button type="button" class="milos-plan-more" data-plan-action="open-date" data-date="${date}">+${more}</button>` : ""}
      </div>`);
    }
    return cells.join("");
  }

  function keyHtml() {
    return `<div class="milos-planning-key" aria-label="Visit type key">
      <span><i class="milos-plan-review"></i>Review</span>
      <span><i class="milos-plan-observation"></i>Observation</span>
      <span><i class="milos-plan-both"></i>Review &amp; Observation</span>
    </div>`;
  }

  function header(title, closeLabel) {
    return `<div class="milos-planning-header">
      <button type="button" class="milos-planning-icon" data-plan-action="${closeLabel === "Back" ? "open-calendar" : "close-planning"}" aria-label="${h(closeLabel || "Close")}">${closeLabel === "Back" ? "‹" : "×"}</button>
      <h2>${h(title)}</h2><span></span>
    </div>`;
  }

  function renderCalendar() {
    ensureStyle();
    const region = layerRegion();
    if (!region) return;
    region.innerHTML = `<section class="milos-planning-layer" role="dialog" aria-modal="true" aria-label="Milos planning calendar">
      <div class="milos-planning-shell">
        ${header("Planning", "Close")}
        <div class="milos-planning-monthbar">
          <button type="button" class="milos-planning-icon" data-plan-action="previous-month" aria-label="Previous month">‹</button>
          <strong>${h(monthLabel())}</strong>
          <button type="button" class="milos-planning-icon" data-plan-action="next-month" aria-label="Next month">›</button>
        </div>
        ${keyHtml()}
        <div class="milos-planning-weekdays" aria-hidden="true"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
        <div class="milos-planning-grid">${calendarGrid()}</div>
      </div>
    </section>`;
  }

  function profileOptions(selectedId) {
    const list = profiles();
    return list.map((profile) => `<option value="${h(profile.id)}"${profile.id === selectedId ? " selected" : ""}>${h(profile.name)}</option>`).join("");
  }

  function typeChoices(selected) {
    return ["review", "observation", "both"].map((type) => `<label class="milos-plan-${type}"><input type="radio" name="type" value="${type}"${type === selected ? " checked" : ""}><span>${h(typeLabel(type))}</span></label>`).join("");
  }

  function renderEditor(date, planId) {
    ensureStyle();
    const region = layerRegion();
    if (!region) return;
    const allPlans = readPlans();
    const plan = planId ? allPlans.find((item) => item.id === planId) : null;
    const chosenDate = validDate((plan && plan.date) || date) || todayKey();
    lastOpenedDate = chosenDate;
    const list = profiles();
    if (!list.length) {
      region.innerHTML = `<section class="milos-planning-layer" role="dialog" aria-modal="true"><div class="milos-planning-shell">${header("Planning", "Back")}<div class="milos-planning-card"><h3>Add a learner first</h3><p>Planning uses the learner profiles already stored locally in Milos.</p><button type="button" class="milos-planning-primary" data-action="new-learner">Add learner</button></div></div></section>`;
      return;
    }
    const selectedProfileId = plan && profileFor(plan.profileId) ? plan.profileId : list[0].id;
    const selectedType = plan ? plan.type : "review";
    region.innerHTML = `<section class="milos-planning-layer" role="dialog" aria-modal="true" aria-label="${plan ? "Edit planned visit" : "Add planned visit"}">
      <div class="milos-planning-shell">
        ${header(plan ? "Edit planned visit" : "Add planned visit", "Back")}
        <form class="milos-planning-editor" data-plan-form="booking">
          <h3>${h(fullDateLabel(chosenDate))}</h3><p>${plan ? "Update this visit or change its date." : "Choose the learner and what you plan to complete."}</p>
          <input type="hidden" name="id" value="${h(plan ? plan.id : "")}">
          <label class="milos-planning-field"><span>Date</span><input type="date" name="date" required value="${h(chosenDate)}"></label>
          <label class="milos-planning-field"><span>Learner</span><select name="profileId" required>${profileOptions(selectedProfileId)}</select></label>
          <div class="milos-planning-field"><span>Visit type</span><div class="milos-planning-type">${typeChoices(selectedType)}</div></div>
          <label class="milos-planning-field"><span>Time (optional)</span><input type="time" name="time" value="${h(plan ? plan.time : "")}"></label>
          <label class="milos-planning-field"><span>Address (optional)</span><input type="text" name="address" maxlength="300" value="${h(plan ? plan.address : "")}" placeholder="Site or workplace address" autocomplete="street-address"></label>
          <div class="milos-planning-actions">
            <button type="button" class="milos-planning-secondary" data-plan-action="open-calendar">Cancel</button>
            <button type="submit" class="milos-planning-primary">${plan ? "Save changes" : "Save visit"}</button>
          </div>
        </form>
      </div>
    </section>`;
  }

  function renderBooking(planId) {
    ensureStyle();
    const region = layerRegion();
    if (!region) return;
    const plan = readPlans().find((item) => item.id === planId);
    if (!plan) { renderCalendar(); return; }
    lastOpenedDate = plan.date;
    const profile = profileFor(plan.profileId);
    const learnerName = profile ? profile.name : "Removed learner";
    const reviewButton = plan.type === "review" || plan.type === "both" ? `<button type="button" class="milos-planning-primary" data-action="start-review" data-id="${h(plan.profileId)}">Start Review</button>` : "";
    const observationButton = plan.type === "observation" || plan.type === "both" ? `<button type="button" class="milos-planning-primary" data-action="start-observation" data-id="${h(plan.profileId)}">Start Observation</button>` : "";
    region.innerHTML = `<section class="milos-planning-layer" role="dialog" aria-modal="true" aria-label="Planned visit for ${h(learnerName)}">
      <div class="milos-planning-shell">
        ${header("Planned visit", "Back")}
        <article class="milos-planning-card">
          <h3>${h(learnerName)}</h3><span class="milos-planning-typebadge milos-plan-${h(plan.type)}">${h(typeLabel(plan.type))}</span>
          <div class="milos-planning-detail">
            <div><small>Date</small><strong>${h(fullDateLabel(plan.date))}${plan.time ? ` · ${h(plan.time)}` : ""}</strong></div>
            ${plan.address ? `<div><small>Address</small><strong>${h(plan.address)}</strong></div>` : ""}
          </div>
          <div class="milos-planning-actions">
            ${plan.address ? `<button type="button" class="milos-planning-secondary is-wide" data-plan-action="navigate" data-id="${h(plan.id)}">Navigate</button>` : ""}
            ${profile ? reviewButton : ""}${profile ? observationButton : ""}
            <button type="button" class="milos-planning-secondary" data-plan-action="edit-booking" data-id="${h(plan.id)}">Edit</button>
            <button type="button" class="milos-planning-danger" data-plan-action="delete-booking" data-id="${h(plan.id)}">Delete</button>
          </div>
        </article>
      </div>
    </section>`;
  }

  function renderDateAgenda(date) {
    ensureStyle();
    const region = layerRegion();
    if (!region) return;
    lastOpenedDate = validDate(date) || todayKey();
    const items = dayPlans(lastOpenedDate, readPlans());
    region.innerHTML = `<section class="milos-planning-layer" role="dialog" aria-modal="true"><div class="milos-planning-shell">
      ${header("Planned visits", "Back")}
      <article class="milos-planning-card"><h3>${h(fullDateLabel(lastOpenedDate))}</h3><p>${items.length} planned ${items.length === 1 ? "visit" : "visits"}</p>
        <div class="milos-planning-agenda">${items.map((plan) => {
          const profile = profileFor(plan.profileId);
          return `<button type="button" class="milos-plan-${h(plan.type)}" data-plan-action="open-booking" data-id="${h(plan.id)}"><span><strong>${h(profile ? profile.name : "Removed learner")}</strong><br><small>${h(typeLabel(plan.type))}${plan.time ? ` · ${h(plan.time)}` : ""}</small></span><span>›</span></button>`;
        }).join("")}</div>
        <button type="button" class="milos-planning-primary" style="width:100%;margin-top:14px" data-plan-action="new-booking" data-date="${h(lastOpenedDate)}">Add another visit</button>
      </article>
    </div></section>`;
  }

  function navigationUrl(address) {
    const destination = encodeURIComponent(clean(address, 300));
    const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    return isIOS
      ? `https://maps.apple.com/?daddr=${destination}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
  }

  function shiftMonth(amount) {
    monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + amount, 1);
    renderCalendar();
  }

  function syncMore() {
    const panel = document.getElementById("viewPanel");
    if (!panel) return;
    const heading = panel.querySelector(".detail-header h2");
    if (!heading || clean(heading.textContent, 40) !== "More") return;
    const list = panel.querySelector(".milos-view .option-list");
    if (list && !list.querySelector('[data-plan-action="open-planning"]')) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-row milos-option-row";
      button.dataset.planAction = "open-planning";
      button.innerHTML = '<span class="option-row-copy"><span>Planning</span><small>Reviews and observations calendar</small></span>';
      list.insertBefore(button, list.firstChild);
    }
    const version = panel.querySelector(".milos-version");
    if (version) version.textContent = `Milos Beta · v${VERSION}`;
  }

  function closePlanning() {
    const region = layerRegion();
    if (region) region.innerHTML = "";
  }

  function saveForm(form) {
    const data = new FormData(form);
    const id = clean(data.get("id"), 100);
    const profileId = clean(data.get("profileId"), 100);
    const date = validDate(data.get("date"));
    const type = typeValue(clean(data.get("type"), 30));
    const time = validTime(data.get("time"));
    const address = clean(data.get("address"), 300);
    if (!profileFor(profileId)) throw new Error("Choose a learner.");
    if (!date) throw new Error("Choose a date.");
    const items = readPlans();
    const now = Date.now();
    const current = id ? items.find((item) => item.id === id) : null;
    const record = {
      id: current ? current.id : (typeof C.uid === "function" ? C.uid("plan") : `plan-${now}-${Math.random().toString(36).slice(2, 8)}`),
      profileId,
      date,
      type,
      time,
      address,
      createdAt: current ? current.createdAt : now,
      updatedAt: now,
    };
    if (current) items.splice(items.indexOf(current), 1, record);
    else items.push(record);
    writePlans(items);
    const parts = date.split("-").map(Number);
    monthCursor = new Date(parts[0], parts[1] - 1, 1);
    renderBooking(record.id);
  }

  document.addEventListener("submit", (event) => {
    const form = event.target && event.target.closest ? event.target.closest('[data-plan-form="booking"]') : null;
    if (!form) return;
    event.preventDefault();
    try { saveForm(form); }
    catch (error) { global.alert(error && error.message ? error.message : "That planned visit could not be saved."); }
  });

  document.addEventListener("click", (event) => {
    const start = event.target && event.target.closest ? event.target.closest('.milos-planning-layer [data-action="start-review"], .milos-planning-layer [data-action="start-observation"], .milos-planning-layer [data-action="new-learner"]') : null;
    if (start) {
      closePlanning();
      return;
    }

    const target = event.target && event.target.closest ? event.target.closest("[data-plan-action]") : null;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const action = target.dataset.planAction;
    const id = clean(target.dataset.id, 100);
    const date = validDate(target.dataset.date);

    if (action === "open-planning") { monthCursor = startOfMonth(new Date()); renderCalendar(); return; }
    if (action === "close-planning") { closePlanning(); return; }
    if (action === "open-calendar") { renderCalendar(); return; }
    if (action === "previous-month") { shiftMonth(-1); return; }
    if (action === "next-month") { shiftMonth(1); return; }
    if (action === "new-booking") { renderEditor(date || lastOpenedDate || todayKey(), ""); return; }
    if (action === "open-booking") { renderBooking(id); return; }
    if (action === "edit-booking") {
      const plan = readPlans().find((item) => item.id === id);
      if (plan) renderEditor(plan.date, plan.id);
      return;
    }
    if (action === "open-date") { renderDateAgenda(date); return; }
    if (action === "delete-booking") {
      const plan = readPlans().find((item) => item.id === id);
      if (!plan) { renderCalendar(); return; }
      const profile = profileFor(plan.profileId);
      if (!global.confirm(`Delete the planned ${typeLabel(plan.type).toLowerCase()} for ${profile ? profile.name : "this learner"}?`)) return;
      writePlans(readPlans().filter((item) => item.id !== id));
      renderCalendar();
      return;
    }
    if (action === "navigate") {
      const plan = readPlans().find((item) => item.id === id);
      if (!plan || !plan.address) return;
      global.open(navigationUrl(plan.address), "_blank", "noopener,noreferrer");
    }
  }, true);

  ensureStyle();
  const root = document.getElementById("viewPanel") || document.getElementById("milosApp");
  if (root) {
    syncMore();
    new MutationObserver(() => syncMore()).observe(root, { childList: true, subtree: true });
  }

  global.MilosPlanning = Object.freeze({
    version: VERSION,
    storageKey: STORAGE_KEY,
    typeLabel,
    getPlans: readPlans,
    open: function () { monthCursor = startOfMonth(new Date()); renderCalendar(); },
  });
})(window);
