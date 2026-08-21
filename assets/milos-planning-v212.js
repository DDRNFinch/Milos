(function (global) {
  "use strict";

  if (!global.document || !global.MilosCore) return;

  const C = global.MilosCore;
  const VERSION = "2.12";
  const STORAGE_KEY = "milos-planning-v1";
  const MAX_VISIBLE = 3;
  const TYPES = Object.freeze({
    review: "Review",
    observation: "Observation",
    both: "Review & Observation",
  });

  let monthCursor = monthStart(new Date());
  let returnDate = "";

  function h(value) {
    return C.escapeHtml(String(value == null ? "" : value));
  }

  function clean(value, max) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max || 240);
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function monthStart(value) {
    const date = value instanceof Date ? value : new Date(value);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function dateKey(year, month, day) {
    return `${year}-${pad(month + 1)}-${pad(day)}`;
  }

  function todayKey() {
    const now = new Date();
    return dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function safeDate(value) {
    const text = String(value || "");
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
  }

  function safeTime(value) {
    const text = String(value || "");
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
  }

  function typeValue(value) {
    return Object.prototype.hasOwnProperty.call(TYPES, value) ? value : "review";
  }

  function typeLabel(value) {
    return TYPES[typeValue(value)];
  }

  function readPlans() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(data)) return [];
      return data.map((item) => ({
        id: clean(item && item.id, 100),
        profileId: clean(item && item.profileId, 100),
        date: safeDate(item && item.date),
        type: typeValue(item && item.type),
        time: safeTime(item && item.time),
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
    return typeof C.getProfile === "function" ? C.getProfile(id) : profiles().find((item) => item.id === id) || null;
  }

  function shortName(profile) {
    const parts = clean(profile && profile.name, 100).split(/\s+/).filter(Boolean);
    return parts[0] || "Removed";
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

  function region() {
    return document.getElementById("modalRegion");
  }

  function ensureStyle() {
    if (document.getElementById("milos-planning-v212-style")) return;
    const style = document.createElement("style");
    style.id = "milos-planning-v212-style";
    style.textContent = `
      .milos-planning-layer{position:fixed;inset:0;z-index:10040;background:linear-gradient(180deg,#f7fbff,#edf5ff);overflow:auto;-webkit-overflow-scrolling:touch;color:#17324d}
      .milos-planning-shell{width:min(760px,100%);min-height:100%;margin:auto;box-sizing:border-box;padding:max(18px,env(safe-area-inset-top)) 10px max(28px,env(safe-area-inset-bottom))}
      .milos-planning-header,.milos-planning-monthbar{display:grid;grid-template-columns:42px 1fr 42px;align-items:center;gap:8px}.milos-planning-header{margin-bottom:15px}.milos-planning-header h2,.milos-planning-monthbar strong{text-align:center;margin:0}.milos-planning-header h2{font-size:22px}.milos-planning-monthbar strong{font-size:18px}
      .milos-planning-icon{width:42px;height:42px;border:0;border-radius:50%;background:rgba(255,255,255,.86);box-shadow:0 5px 18px rgba(29,83,132,.09);font:inherit;font-size:24px;color:#245d91}
      .milos-planning-key{display:flex;gap:9px;flex-wrap:wrap;margin:12px 2px}.milos-planning-key span{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:800;color:#42617b}.milos-planning-key i{width:11px;height:11px;border-radius:50%}
      .milos-plan-review{--plan-bg:#dceeff;--plan-text:#245f93;--plan-border:#b9daf8}.milos-plan-observation{--plan-bg:#8ec4f4;--plan-text:#103f69;--plan-border:#75b2e7}.milos-plan-both{--plan-bg:#2f8fef;--plan-text:#fff;--plan-border:#2f8fef}
      .milos-planning-weekdays,.milos-planning-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}.milos-planning-weekdays span{text-align:center;font-size:9px;font-weight:800;color:#71869a;padding:4px 0}
      .milos-planning-day{min-width:0;min-height:86px;border:1px solid rgba(94,139,177,.16);border-radius:10px;background:rgba(255,255,255,.76);padding:4px;display:flex;flex-direction:column;gap:3px}.milos-planning-day.is-empty{background:transparent;border-color:transparent}.milos-planning-day.is-today{box-shadow:inset 0 0 0 1.5px #2f8fef}
      .milos-planning-date{align-self:flex-start;width:24px;height:24px;border:0;border-radius:50%;background:transparent;color:#24445f;font:inherit;font-size:10px;font-weight:800;padding:0}.milos-planning-day.is-today .milos-planning-date{background:#2f8fef;color:#fff}
      .milos-plan-pill{width:100%;border:1px solid var(--plan-border);background:var(--plan-bg);color:var(--plan-text);border-radius:7px;padding:3px;font:inherit;font-size:8.5px;font-weight:800;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}.milos-plan-more{border:0;background:transparent;color:#4b7598;font:inherit;font-size:8.5px;font-weight:800;text-align:left;padding:1px 3px}
      .milos-planning-card,.milos-planning-editor{background:rgba(255,255,255,.92);border:1px solid rgba(80,132,176,.14);box-shadow:0 12px 36px rgba(31,76,116,.08);border-radius:20px;padding:17px}.milos-planning-card h3,.milos-planning-editor h3{margin:0 0 4px;font-size:21px}.milos-planning-card>p,.milos-planning-editor>p{margin:0 0 15px;color:#6b8194;font-size:13px}
      .milos-planning-field{display:grid;gap:6px;margin:13px 0}.milos-planning-field>span{font-size:11px;font-weight:800;color:#355976}.milos-planning-field input,.milos-planning-field select{width:100%;box-sizing:border-box;border:1px solid #c9dbea;border-radius:13px;background:#fff;padding:12px 13px;font:inherit;color:#17324d;outline:none}.milos-planning-field input:focus,.milos-planning-field select:focus{border-color:#2f8fef;box-shadow:0 0 0 3px rgba(47,143,239,.12)}
      .milos-planning-type{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.milos-planning-type label{position:relative}.milos-planning-type input{position:absolute;opacity:0}.milos-planning-type span{display:flex;min-height:43px;align-items:center;justify-content:center;text-align:center;border:1px solid var(--plan-border);background:var(--plan-bg);color:var(--plan-text);border-radius:11px;padding:5px;font-size:9px;font-weight:800;opacity:.55}.milos-planning-type input:checked+span{opacity:1;box-shadow:0 0 0 2px #fff,0 0 0 4px rgba(47,143,239,.25)}
      .milos-planning-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:15px}.milos-planning-actions .is-wide{grid-column:1/-1}.milos-planning-primary,.milos-planning-secondary,.milos-planning-danger{border:0;border-radius:13px;padding:12px;font:inherit;font-weight:800}.milos-planning-primary{background:#2f8fef;color:#fff}.milos-planning-secondary{background:#e8f2fb;color:#245d91}.milos-planning-danger{background:#fff0f0;color:#a23d3d}
      .milos-planning-typebadge{display:inline-flex;border:1px solid var(--plan-border);background:var(--plan-bg);color:var(--plan-text);border-radius:999px;padding:6px 10px;font-size:10px;font-weight:800}.milos-planning-detail{display:grid;gap:9px;margin:16px 0}.milos-planning-detail div{display:grid;gap:2px;padding:11px;border-radius:12px;background:#f5f9fd}.milos-planning-detail small{font-size:9px;font-weight:800;text-transform:uppercase;color:#7890a5}.milos-planning-detail strong{font-size:13px;color:#24455f}
      .milos-planning-agenda{display:grid;gap:8px}.milos-planning-agenda button{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid var(--plan-border);background:var(--plan-bg);color:var(--plan-text);border-radius:12px;padding:11px;text-align:left;font:inherit}.milos-planning-agenda strong{font-size:13px}.milos-planning-agenda small{font-size:10px}
      @media(max-width:430px){.milos-planning-shell{padding-left:7px;padding-right:7px}.milos-planning-day{min-height:80px;padding:3px}.milos-planning-weekdays,.milos-planning-grid{gap:2px}.milos-plan-pill{font-size:8px}}
    `;
    document.head.appendChild(style);
  }

  function header(title, back) {
    return `<div class="milos-planning-header"><button type="button" class="milos-planning-icon" data-plan-action="${back ? "calendar" : "close"}" aria-label="${back ? "Back to calendar" : "Close planning"}">${back ? "‹" : "×"}</button><h2>${h(title)}</h2><span></span></div>`;
  }

  function keyHtml() {
    return `<div class="milos-planning-key" aria-label="Visit type key"><span><i class="milos-plan-review"></i>Review</span><span><i class="milos-plan-observation"></i>Observation</span><span><i class="milos-plan-both"></i>Review &amp; Observation</span></div>`;
  }

  function plansFor(date) {
    return readPlans().filter((plan) => plan.date === date).sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99") || shortName(profileFor(a.profileId)).localeCompare(shortName(profileFor(b.profileId))));
  }

  function planPill(plan) {
    const profile = profileFor(plan.profileId);
    return `<button type="button" class="milos-plan-pill milos-plan-${h(plan.type)}" data-plan-action="booking" data-id="${h(plan.id)}" title="${h(`${profile ? profile.name : "Removed learner"} · ${typeLabel(plan.type)}`)}">${h(shortName(profile))}</button>`;
  }

  function calendarGrid() {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const leading = (new Date(year, month, 1).getDay() + 6) % 7;
    const today = todayKey();
    const cells = Array.from({ length: leading }, () => '<div class="milos-planning-day is-empty" aria-hidden="true"></div>');
    for (let day = 1; day <= days; day += 1) {
      const date = dateKey(year, month, day);
      const items = plansFor(date);
      const visible = items.slice(0, MAX_VISIBLE);
      cells.push(`<div class="milos-planning-day${date === today ? " is-today" : ""}"><button type="button" class="milos-planning-date" data-plan-action="new" data-date="${date}" aria-label="Plan visit for ${h(fullDateLabel(date))}">${day}</button>${visible.map(planPill).join("")}${items.length > MAX_VISIBLE ? `<button type="button" class="milos-plan-more" data-plan-action="agenda" data-date="${date}">+${items.length - MAX_VISIBLE}</button>` : ""}</div>`);
    }
    return cells.join("");
  }

  function renderCalendar() {
    ensureStyle();
    const target = region();
    if (!target) return;
    target.innerHTML = `<section class="milos-planning-layer" role="dialog" aria-modal="true" aria-label="Milos planning calendar"><div class="milos-planning-shell">${header("Planning", false)}<div class="milos-planning-monthbar"><button type="button" class="milos-planning-icon" data-plan-action="previous" aria-label="Previous month">‹</button><strong>${h(monthLabel())}</strong><button type="button" class="milos-planning-icon" data-plan-action="next" aria-label="Next month">›</button></div>${keyHtml()}<div class="milos-planning-weekdays" aria-hidden="true"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div><div class="milos-planning-grid">${calendarGrid()}</div></div></section>`;
  }

  function profileOptions(selected) {
    return profiles().map((profile) => `<option value="${h(profile.id)}"${profile.id === selected ? " selected" : ""}>${h(profile.name)}</option>`).join("");
  }

  function typeChoices(selected) {
    return Object.keys(TYPES).map((type) => `<label class="milos-plan-${type}"><input type="radio" name="type" value="${type}"${type === selected ? " checked" : ""}><span>${h(typeLabel(type))}</span></label>`).join("");
  }

  function renderEditor(date, id) {
    ensureStyle();
    const target = region();
    if (!target) return;
    const plan = id ? readPlans().find((item) => item.id === id) : null;
    const selectedDate = safeDate((plan && plan.date) || date) || todayKey();
    returnDate = selectedDate;
    const learnerProfiles = profiles();
    if (!learnerProfiles.length) {
      target.innerHTML = `<section class="milos-planning-layer" role="dialog" aria-modal="true"><div class="milos-planning-shell">${header("Planning", true)}<article class="milos-planning-card"><h3>Add a learner first</h3><p>Planning uses the learner profiles already stored locally in Milos.</p><button type="button" class="milos-planning-primary" data-plan-action="add-learner">Add learner</button></article></div></section>`;
      return;
    }
    const selectedProfile = plan && profileFor(plan.profileId) ? plan.profileId : learnerProfiles[0].id;
    target.innerHTML = `<section class="milos-planning-layer" role="dialog" aria-modal="true" aria-label="${plan ? "Edit planned visit" : "Add planned visit"}"><div class="milos-planning-shell">${header(plan ? "Edit planned visit" : "Add planned visit", true)}<form class="milos-planning-editor" data-plan-form="booking"><h3>${h(fullDateLabel(selectedDate))}</h3><p>${plan ? "Update the visit details below." : "Choose the learner and what you plan to complete."}</p><input type="hidden" name="id" value="${h(plan ? plan.id : "")}"><label class="milos-planning-field"><span>Date</span><input type="date" name="date" required value="${h(selectedDate)}"></label><label class="milos-planning-field"><span>Learner</span><select name="profileId" required>${profileOptions(selectedProfile)}</select></label><div class="milos-planning-field"><span>Visit type</span><div class="milos-planning-type">${typeChoices(plan ? plan.type : "review")}</div></div><label class="milos-planning-field"><span>Time (optional)</span><input type="time" name="time" value="${h(plan ? plan.time : "")}"></label><label class="milos-planning-field"><span>Address (optional)</span><input type="text" name="address" maxlength="300" autocomplete="street-address" value="${h(plan ? plan.address : "")}" placeholder="Site or workplace address"></label><div class="milos-planning-actions"><button type="button" class="milos-planning-secondary" data-plan-action="calendar">Cancel</button><button type="submit" class="milos-planning-primary">${plan ? "Save changes" : "Save visit"}</button></div></form></div></section>`;
  }

  function renderBooking(id) {
    ensureStyle();
    const target = region();
    const plan = readPlans().find((item) => item.id === id);
    if (!target || !plan) { renderCalendar(); return; }
    returnDate = plan.date;
    const profile = profileFor(plan.profileId);
    const name = profile ? profile.name : "Removed learner";
    const startReview = profile && (plan.type === "review" || plan.type === "both") ? `<button type="button" class="milos-planning-primary" data-plan-action="start-review" data-id="${h(plan.profileId)}">Start Review</button>` : "";
    const startObservation = profile && (plan.type === "observation" || plan.type === "both") ? `<button type="button" class="milos-planning-primary" data-plan-action="start-observation" data-id="${h(plan.profileId)}">Start Observation</button>` : "";
    target.innerHTML = `<section class="milos-planning-layer" role="dialog" aria-modal="true" aria-label="Planned visit for ${h(name)}"><div class="milos-planning-shell">${header("Planned visit", true)}<article class="milos-planning-card"><h3>${h(name)}</h3><span class="milos-planning-typebadge milos-plan-${h(plan.type)}">${h(typeLabel(plan.type))}</span><div class="milos-planning-detail"><div><small>Date</small><strong>${h(fullDateLabel(plan.date))}${plan.time ? ` · ${h(plan.time)}` : ""}</strong></div>${plan.address ? `<div><small>Address</small><strong>${h(plan.address)}</strong></div>` : ""}</div><div class="milos-planning-actions">${plan.address ? `<button type="button" class="milos-planning-secondary is-wide" data-plan-action="navigate" data-id="${h(plan.id)}">Navigate</button>` : ""}${startReview}${startObservation}<button type="button" class="milos-planning-secondary" data-plan-action="edit" data-id="${h(plan.id)}">Edit</button><button type="button" class="milos-planning-danger" data-plan-action="delete" data-id="${h(plan.id)}">Delete</button></div></article></div></section>`;
  }

  function renderAgenda(date) {
    ensureStyle();
    const target = region();
    if (!target) return;
    returnDate = safeDate(date) || todayKey();
    const items = plansFor(returnDate);
    target.innerHTML = `<section class="milos-planning-layer" role="dialog" aria-modal="true"><div class="milos-planning-shell">${header("Planned visits", true)}<article class="milos-planning-card"><h3>${h(fullDateLabel(returnDate))}</h3><p>${items.length} planned ${items.length === 1 ? "visit" : "visits"}</p><div class="milos-planning-agenda">${items.map((plan) => { const profile = profileFor(plan.profileId); return `<button type="button" class="milos-plan-${h(plan.type)}" data-plan-action="booking" data-id="${h(plan.id)}"><span><strong>${h(profile ? profile.name : "Removed learner")}</strong><br><small>${h(typeLabel(plan.type))}${plan.time ? ` · ${h(plan.time)}` : ""}</small></span><span>›</span></button>`; }).join("")}</div><button type="button" class="milos-planning-primary" style="width:100%;margin-top:14px" data-plan-action="new" data-date="${h(returnDate)}">Add another visit</button></article></div></section>`;
  }

  function navigationUrl(address) {
    const destination = encodeURIComponent(clean(address, 300));
    const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    return isIOS ? `https://maps.apple.com/?daddr=${destination}&dirflg=d` : `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
  }

  function closePlanning() {
    const target = region();
    if (target) target.innerHTML = "";
  }

  function launchMilos(action, profileId) {
    closePlanning();
    const app = document.getElementById("milosApp");
    if (!app) return;
    const button = document.createElement("button");
    button.type = "button";
    button.hidden = true;
    button.dataset.action = action;
    if (profileId) button.dataset.id = profileId;
    app.appendChild(button);
    button.click();
    button.remove();
  }

  function saveBooking(form) {
    const data = new FormData(form);
    const id = clean(data.get("id"), 100);
    const profileId = clean(data.get("profileId"), 100);
    const date = safeDate(data.get("date"));
    if (!profileFor(profileId)) throw new Error("Choose a learner.");
    if (!date) throw new Error("Choose a date.");
    const items = readPlans();
    const current = id ? items.find((item) => item.id === id) : null;
    const now = Date.now();
    const record = {
      id: current ? current.id : (typeof C.uid === "function" ? C.uid("plan") : `plan-${now}`),
      profileId,
      date,
      type: typeValue(clean(data.get("type"), 30)),
      time: safeTime(data.get("time")),
      address: clean(data.get("address"), 300),
      createdAt: current ? current.createdAt : now,
      updatedAt: now,
    };
    if (current) items.splice(items.indexOf(current), 1, record); else items.push(record);
    writePlans(items);
    const parts = date.split("-").map(Number);
    monthCursor = new Date(parts[0], parts[1] - 1, 1);
    renderBooking(record.id);
  }

  function syncMore() {
    const panel = document.getElementById("viewPanel");
    const heading = panel && panel.querySelector(".detail-header h2");
    if (!heading || clean(heading.textContent, 40) !== "More") return;
    const list = panel.querySelector(".milos-view .option-list");
    if (list && !list.querySelector('[data-plan-action="open"]')) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-row milos-option-row";
      button.dataset.planAction = "open";
      button.innerHTML = '<span class="option-row-copy"><span>Planning</span><small>Reviews and observations calendar</small></span>';
      list.insertBefore(button, list.firstChild);
    }
    const version = panel.querySelector(".milos-version");
    const versionText = `Milos Beta · v${VERSION}`;
    if (version && version.textContent !== versionText) version.textContent = versionText;
  }

  document.addEventListener("submit", (event) => {
    const form = event.target && event.target.closest ? event.target.closest('[data-plan-form="booking"]') : null;
    if (!form) return;
    event.preventDefault();
    try { saveBooking(form); }
    catch (error) { global.alert(error && error.message ? error.message : "That planned visit could not be saved."); }
  }, true);

  document.addEventListener("click", (event) => {
    const milosAction = event.target && event.target.closest ? event.target.closest('[data-action="open-more"], [data-action="back"]') : null;
    if (milosAction) setTimeout(syncMore, 0);

    const target = event.target && event.target.closest ? event.target.closest("[data-plan-action]") : null;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const action = target.dataset.planAction;
    const id = clean(target.dataset.id, 100);
    const date = safeDate(target.dataset.date);

    if (action === "open") { monthCursor = monthStart(new Date()); renderCalendar(); return; }
    if (action === "close") { closePlanning(); return; }
    if (action === "calendar") { renderCalendar(); return; }
    if (action === "previous") { monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1); renderCalendar(); return; }
    if (action === "next") { monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1); renderCalendar(); return; }
    if (action === "new") { renderEditor(date || returnDate || todayKey(), ""); return; }
    if (action === "booking") { renderBooking(id); return; }
    if (action === "agenda") { renderAgenda(date); return; }
    if (action === "edit") { const plan = readPlans().find((item) => item.id === id); if (plan) renderEditor(plan.date, plan.id); return; }
    if (action === "delete") {
      const plan = readPlans().find((item) => item.id === id);
      if (!plan) { renderCalendar(); return; }
      const profile = profileFor(plan.profileId);
      if (global.confirm(`Delete the planned ${typeLabel(plan.type).toLowerCase()} for ${profile ? profile.name : "this learner"}?`)) {
        writePlans(readPlans().filter((item) => item.id !== id));
        renderCalendar();
      }
      return;
    }
    if (action === "navigate") {
      const plan = readPlans().find((item) => item.id === id);
      if (plan && plan.address) global.open(navigationUrl(plan.address), "_blank", "noopener,noreferrer");
      return;
    }
    if (action === "start-review") { launchMilos("start-review", id); return; }
    if (action === "start-observation") { launchMilos("start-observation", id); return; }
    if (action === "add-learner") { launchMilos("new-learner", ""); }
  }, true);

  ensureStyle();
  syncMore();

  global.MilosPlanning = Object.freeze({
    version: VERSION,
    storageKey: STORAGE_KEY,
    typeLabel,
    getPlans: readPlans,
    open: function () { monthCursor = monthStart(new Date()); renderCalendar(); },
  });
})(window);
