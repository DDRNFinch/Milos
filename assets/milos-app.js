(function (global) {
  "use strict";

  const C = global.MilosCore;
  const Q = global.MilosQR;
  const M = global.MilosMedia;
  const P = global.MilosPDF;
  const app = document.getElementById("milosApp");
  if (!app || !C || !Q || !M || !P) return;

  const state = {
    ready: false,
    open: false,
    view: "root",
    previousView: "root",
    selectedProfileId: "",
    course: null,
    loadingCourse: false,
    reviewDraft: null,
    completedReview: null,
    observationDraft: null,
    completedObservation: null,
    helpOpen: false,
    remindersOpen: false,
    onboardingStep: C.getSettings().onboardingComplete ? null : 0,
    pose: "idle",
  };

  const signaturePads = new Map();

  const viewTitles = {
    root: "",
    learners: "Learners",
    "learner-new": "Add Learner",
    "learner-detail": "Learner Profile",
    reviews: "Reviews",
    "review-wizard": "Progress Review",
    "review-complete": "Review Complete",
    observations: "Observation",
    "observation-wizard": "Assessor Observation",
    "observation-complete": "Observation Complete",
    more: "More",
    settings: "Assessor Details",
    privacy: "Private By Design",
  };

  const helpByView = {
    learners: "Create a local learner profile, then scan the learner's Evia progress QR. Milos imports course progress but deliberately leaves out names, photos and contact details.",
    "learner-detail": "This profile joins the name you entered locally to the learner's anonymous Evia progress record. Scan a new QR whenever you need the latest course position.",
    reviews: "Choose a learner to conduct and record a three-way apprenticeship progress review. Milos carries the latest Evia progress and targets into the review.",
    "review-wizard": "Complete each review step in order. The provider and apprentice signatures are required before the professional PDF is created.",
    observations: "Choose a learner, then follow the same course, job and evidence route used in Evia. Only criteria personally observed as competent are returned to Evia.",
    "observation-wizard": "Work through one observation at a time. Select the exact course criteria, record what you saw, attach media if useful, then sign the assessment decision.",
    more: "This area keeps assessor settings, privacy information and future Milos tools together without crowding the main menu.",
    settings: "Your assessor name and organisation stay on this device and are used on review and observation PDFs.",
    privacy: "Milos has no accounts, analytics or cloud database. Learner names, signatures and media remain in this browser on this device.",
  };

  function h(value) { return C.escapeHtml(value); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function firstName(value) { return C.cleanText(value, 100).split(/\s+/)[0] || "there"; }
  function settings() { return C.getSettings(); }
  function profiles() { return C.getProfiles(); }
  function reviews() { return C.getReviews(); }
  function observations() { return C.getObservations(); }
  function selectedProfile() { return state.selectedProfileId ? C.getProfile(state.selectedProfileId) : null; }

  function shell() {
    app.innerHTML = `
      <div class="ambient ambient-one" aria-hidden="true"></div>
      <div class="ambient ambient-two" aria-hidden="true"></div>
      <div class="app-top-controls">
        <div class="reminder-control">
          <button type="button" class="reminder-button" data-action="toggle-reminders" aria-label="Milos reminders" aria-expanded="false">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 10a4.5 4.5 0 0 1 9 0c0 5 2 5.4 2 6.5h-13c0-1.1 2-1.5 2-6.5Z"></path><path d="M10 19h4"></path></svg>
            <span class="reminder-count" hidden></span>
          </button>
          <div id="reminderMenu"></div>
        </div>
      </div>
      <button type="button" class="evia-anchor milos-anchor" data-action="avatar" aria-label="Open Milos" aria-expanded="false">
        <span class="evia-float">
          <span class="evia-halo" aria-hidden="true"></span>
          <span class="evia-face expression-idle" id="milosFace" aria-hidden="true">
            <span class="evia-eyes"><span class="evia-eye eye-left"></span><span class="evia-eye eye-right"></span></span>
          </span>
        </span>
      </button>
      <div class="milos-home-copy" id="homeCopy" aria-hidden="false"><strong>Milos</strong><span>Tap me to get started</span></div>
      <section class="menu-stage" id="menuStage" aria-hidden="true" aria-label="Milos assessor assistant">
        <div class="menu-shell is-workspace milos-menu-shell">
          <div class="view-panel" id="viewPanel"></div>
        </div>
      </section>
      <section class="progress-dock" aria-label="Milos activity"><div class="progress-row" id="progressRow"></div></section>
      <div id="toastRegion"></div>
      <div id="modalRegion"></div>
      <div id="onboardingRegion"></div>
    `;
  }

  function setPose(pose) {
    state.pose = pose || "idle";
    const face = document.getElementById("milosFace");
    if (!face) return;
    face.className = `evia-face expression-${state.pose}`;
  }

  function activityStats() {
    const learnerCount = profiles().length;
    const reviewCount = reviews().length;
    const observationCount = observations().length;
    const synced = learnerCount ? Math.round((profiles().filter((profile) => C.latestSnapshot(profile)).length / learnerCount) * 100) : 0;
    return { learnerCount, reviewCount, observationCount, synced };
  }

  function arch(label, name, value, percent, action) {
    const amount = Math.max(0, Math.min(100, Number(percent || 0)));
    return `<button type="button" class="progress-arch milos-arch" data-action="${action}" aria-label="${h(name)}: ${h(value)}">
      <svg viewBox="0 0 100 62" aria-hidden="true"><path class="arch-track" pathLength="100" d="M 9 54 A 41 41 0 0 1 91 54"></path><path class="arch-value" pathLength="100" d="M 9 54 A 41 41 0 0 1 91 54" style="stroke-dasharray:${amount} 100"></path></svg>
      <span class="arch-label">${h(label)}</span><span class="arch-number">${h(value)}</span>
    </button>`;
  }

  function renderDock() {
    const stats = activityStats();
    const row = document.getElementById("progressRow");
    if (!row) return;
    row.innerHTML = [
      arch("LRN", "Learners", stats.learnerCount, Math.min(100, stats.learnerCount * 10), "open-learners"),
      arch("REV", "Reviews", stats.reviewCount, Math.min(100, stats.reviewCount * 12.5), "open-reviews"),
      arch("OBS", "Observations", stats.observationCount, Math.min(100, stats.observationCount * 12.5), "open-observations"),
      arch("QR", "Learners synced from Evia", `${stats.synced}%`, stats.synced, "open-learners"),
    ].join("");
  }

  function reminderItems() {
    const items = [];
    const allProfiles = profiles();
    const unsynced = allProfiles.filter((profile) => !C.latestSnapshot(profile));
    if (unsynced.length) items.push(`${unsynced.length} learner ${unsynced.length === 1 ? "profile needs" : "profiles need"} an Evia QR scan`);
    const overdue = allProfiles.filter((profile) => {
      const latest = C.reviewsForProfile(profile.id)[0];
      if (!latest) return true;
      const next = Date.parse(`${latest.nextReviewDate || ""}T23:59:59`);
      return Number.isFinite(next) && next < Date.now();
    });
    if (overdue.length) items.push(`${overdue.length} progress ${overdue.length === 1 ? "review is" : "reviews are"} due`);
    if (observations().length) items.push(`${observations().length} signed ${observations().length === 1 ? "observation is" : "observations are"} stored on this device`);
    return items;
  }

  function renderReminders() {
    const button = app.querySelector(".reminder-button");
    const count = app.querySelector(".reminder-count");
    const menu = document.getElementById("reminderMenu");
    if (!button || !count || !menu) return;
    const items = reminderItems();
    button.classList.toggle("has-update", items.length > 0);
    button.setAttribute("aria-expanded", state.remindersOpen ? "true" : "false");
    count.hidden = !items.length;
    count.textContent = String(Math.min(9, items.length));
    menu.innerHTML = state.remindersOpen ? `<div class="reminder-menu" role="menu">${items.length ? items.map((item) => `<button type="button" role="menuitem" data-action="dismiss-reminders">${h(item)}</button>`).join("") : "<p>You're up to date.</p>"}</div>` : "";
  }

  function toast(message, tone) {
    const region = document.getElementById("toastRegion");
    if (!region) return;
    region.innerHTML = `<div class="app-toast is-visible${tone === "error" ? " is-error" : ""}" role="status">${h(message)}</div>`;
    setTimeout(() => {
      const item = region.querySelector(".app-toast");
      if (item) item.classList.remove("is-visible");
      setTimeout(() => { if (region) region.innerHTML = ""; }, 350);
    }, 3000);
  }

  function optionRow(title, note, action, id, extra) {
    return `<button type="button" class="option-row milos-option-row" data-action="${h(action)}"${id ? ` data-id="${h(id)}"` : ""}>
      <span class="option-row-copy"><span>${h(title)}</span>${note ? `<small>${h(note)}</small>` : ""}</span>${extra || ""}
    </button>`;
  }

  function guidance(title, copy, mark) {
    return `<div class="milos-guidance"><span>${h(mark || "M")}</span><div><strong>${h(title)}</strong><p>${h(copy)}</p></div></div>`;
  }

  function emptyState(title, copy, action, label) {
    return `<div class="milos-empty"><span class="milos-empty-mark" aria-hidden="true"></span><h3>${h(title)}</h3><p>${h(copy)}</p>${action ? `<button type="button" class="milos-primary" data-action="${h(action)}">${h(label)}</button>` : ""}</div>`;
  }

  function renderRoot() {
    const stats = activityStats();
    return `<div class="milos-root-view">
      <div class="milos-intro"><h2>What would you like to do?</h2><p>I’ll keep learner progress, reviews and observations mapped to the right course.</p></div>
      <div class="option-list milos-main-options">
        ${optionRow("Learners", stats.learnerCount ? `${stats.learnerCount} local ${stats.learnerCount === 1 ? "profile" : "profiles"}` : "Add profiles and scan Evia progress", "open-learners")}
        ${optionRow("Reviews", stats.reviewCount ? `${stats.reviewCount} completed ${stats.reviewCount === 1 ? "review" : "reviews"}` : "Conduct a three-way progress review", "open-reviews")}
        ${optionRow("Observation", stats.observationCount ? `${stats.observationCount} signed ${stats.observationCount === 1 ? "observation" : "observations"}` : "Observe and map course criteria", "open-observations")}
        ${optionRow("More", "Assessor details and future tools", "open-more")}
      </div>
      <div class="milos-privacy-pill"><span aria-hidden="true">○</span> Names, signatures and media stay on this device</div>
    </div>`;
  }

  function profileStatus(profile) {
    const snapshot = C.latestSnapshot(profile);
    const route = C.routeById(profile.courseRouteId);
    if (!route) return "Course not set";
    if (!snapshot) return `${route.shortTitle} · QR not scanned`;
    return `${route.shortTitle} · ${route.learningLabel} ${Number(snapshot.learningHours || 0).toFixed(1)}h`;
  }

  function renderLearners() {
    const list = profiles();
    return `<div class="milos-page">
      ${guidance("Learner names stay in Milos.", "The Evia QR only updates non-personal course progress and targets.")}
      <button type="button" class="milos-primary" data-action="new-learner">Add learner</button>
      <div class="milos-list">${list.map((profile) => optionRow(profile.name, profileStatus(profile), "open-learner", profile.id, C.latestSnapshot(profile) ? "<span class=\"milos-sync-dot is-synced\" title=\"Evia progress imported\"></span>" : "<span class=\"milos-sync-dot\" title=\"No Evia progress\"></span>")).join("")}</div>
      ${!list.length ? emptyState("No learner profiles yet", "Add a learner name, then scan their shared Evia progress QR.", "new-learner", "Add first learner") : ""}
    </div>`;
  }

  function courseOptions(selected) {
    return `<option value="">Scan Evia QR later</option>${C.COURSE_ROUTES.map((route) => `<option value="${h(route.id)}"${selected === route.id ? " selected" : ""}>${h(route.title)}</option>`).join("")}`;
  }

  function renderLearnerForm(profile) {
    const value = profile || {};
    return `<form class="milos-page milos-form" data-form="learner">
      ${guidance(profile ? "Edit the local learner profile." : "Start with the learner's name.", "Course progress can be added securely from Evia after this profile is saved.")}
      <input type="hidden" name="profileId" value="${h(value.id || "")}">
      <label class="milos-field is-required"><span>Learner full name</span><input name="name" type="text" required maxlength="100" autocomplete="off" value="${h(value.name || "")}" placeholder="Full name"></label>
      <label class="milos-field"><span>Local reference (optional)</span><input name="localReference" type="text" maxlength="80" value="${h(value.localReference || "")}" placeholder="College or cohort reference"></label>
      <label class="milos-field"><span>Course (optional until QR scan)</span><select name="courseRouteId">${courseOptions(value.courseRouteId || "")}</select></label>
      <div class="milos-field-split">
        <label class="milos-field"><span>Start date</span><input name="startDate" type="date" value="${h(value.startDate || "")}"></label>
        <label class="milos-field"><span>Planned end date</span><input name="endDate" type="date" value="${h(value.endDate || "")}"></label>
      </div>
      <button type="submit" class="milos-primary">${profile ? "Save learner" : "Create learner profile"}</button>
    </form>`;
  }

  function metricCard(label, value, note) {
    return `<div class="milos-metric"><span>${h(label)}</span><strong>${h(value)}</strong>${note ? `<small>${h(note)}</small>` : ""}</div>`;
  }

  function renderLearnerDetail() {
    const profile = selectedProfile();
    if (!profile) return emptyState("Learner not found", "Return to Learners and choose a profile.", "open-learners", "Back to learners");
    const snapshot = C.latestSnapshot(profile);
    const course = state.course;
    const route = C.routeById(profile.courseRouteId);
    const metrics = course ? C.metricsFor(profile, course) : { toc: C.timeOnCoursePercent(profile.startDate, profile.endDate), coverage: 0, completed: snapshot ? snapshot.completedCodes.length : 0, total: 0, learningHours: snapshot ? snapshot.learningHours : 0, learningTarget: snapshot ? snapshot.learningTarget : route ? route.learningTarget : 0, learningPercent: 0 };
    const targetList = snapshot && snapshot.targets && snapshot.targets.length
      ? `<div class="milos-target-list">${snapshot.targets.map((target) => `<div><span>${h(target.code || "Target")}</span><p>${h(target.title)}</p><small>${target.dueDate ? `Due ${h(C.formatDate(target.dueDate, false))}` : "No due date supplied"}</small></div>`).join("")}</div>`
      : `<p class="milos-muted">No current Evia targets were included in the latest scan.</p>`;
    return `<div class="milos-page learner-profile-view">
      <div class="milos-profile-heading"><div><span>Learner</span><h3>${h(profile.name)}</h3><p>${h(profile.localReference || "Local profile")}</p></div><button type="button" class="milos-icon-button" data-action="edit-learner" aria-label="Edit learner">•••</button></div>
      <div class="milos-profile-course"><span>${h(route ? route.coverageLabel : "Course")}</span><strong>${h(route ? route.title : "Course not set")}</strong><small>${h(profile.startDate ? `${C.formatDate(profile.startDate, false)} — ${C.formatDate(profile.endDate, false)}` : "Course dates not supplied")}</small></div>
      <div class="milos-metric-grid">
        ${metricCard("TOC", `${metrics.toc || 0}%`, "elapsed")}
        ${metricCard(route ? route.coverageLabel : "Coverage", course ? `${metrics.coverage}%` : String(metrics.completed || 0), course ? `${metrics.completed}/${metrics.total}` : "recorded")}
        ${metricCard(route ? route.learningLabel : "OTJ / GLH", `${Number(metrics.learningHours || 0).toFixed(1)}h`, metrics.learningTarget ? `of ${Number(metrics.learningTarget).toFixed(0)}h` : "target not set")}
        ${metricCard("Evia QR", snapshot ? C.formatDate(snapshot.importedAt, false) : "Not scanned", snapshot ? "latest import" : "scan required")}
      </div>
      <div class="milos-action-grid">
        <button type="button" class="milos-primary" data-action="scan-profile" data-id="${h(profile.id)}">Scan Evia progress</button>
        <button type="button" class="milos-secondary" data-action="start-review" data-id="${h(profile.id)}">Start review</button>
        <button type="button" class="milos-secondary" data-action="start-observation" data-id="${h(profile.id)}">Start observation</button>
      </div>
      <section class="milos-section"><div class="milos-section-heading"><span>Current Evia targets</span><small>${snapshot && snapshot.targets ? snapshot.targets.length : 0}</small></div>${targetList}</section>
      <section class="milos-section"><div class="milos-section-heading"><span>Progress QR privacy</span></div><p class="milos-muted">${snapshot ? `Imported course progress only${snapshot.ignoredPersonalFields && snapshot.ignoredPersonalFields.length ? `. Milos discarded ${snapshot.ignoredPersonalFields.length} personal field ${snapshot.ignoredPersonalFields.length === 1 ? "name" : "names"}.` : "."}` : "No QR data has been imported."} Names, photos, signatures and contact details are never retained from a progress QR.</p></section>
      <button type="button" class="milos-danger-link" data-action="delete-learner" data-id="${h(profile.id)}">Delete learner profile</button>
    </div>`;
  }

  function renderMore() {
    const value = settings();
    return `<div class="milos-page">
      ${guidance("Milos will grow with your assessor workflow.", "The fourth main area is ready for future tools without changing the three core routes.")}
      <div class="option-list">
        ${optionRow("Assessor details", value.assessorName || "Add your name and organisation", "open-settings")}
        ${optionRow("Private by design", "Offline storage and QR safeguards", "open-privacy")}
        ${optionRow("Future Milos tools", "More features will appear here", "future-tools")}
      </div>
      <div class="milos-version">Milos Beta · v1</div>
    </div>`;
  }

  function renderSettings() {
    const value = settings();
    return `<form class="milos-page milos-form" data-form="settings">
      ${guidance("These details identify your documents.", "They stay on this device and are not included in learner-facing QR codes.")}
      <label class="milos-field is-required"><span>Assessor full name</span><input name="assessorName" required maxlength="100" value="${h(value.assessorName)}" autocomplete="name"></label>
      <label class="milos-field"><span>Organisation</span><input name="organisation" maxlength="140" value="${h(value.organisation)}" autocomplete="organization"></label>
      <label class="milos-field"><span>Role / job title</span><input name="role" maxlength="100" value="${h(value.role || "Assessor")}"></label>
      <label class="milos-toggle"><span><strong>Reduce motion</strong><small>Minimise avatar and page movement</small></span><input type="checkbox" name="reduceMotion"${value.reduceMotion ? " checked" : ""}></label>
      <button type="submit" class="milos-primary">Save assessor details</button>
    </form>`;
  }

  function renderPrivacy() {
    return `<div class="milos-page">
      ${guidance("Learner information stays under your control.", "Milos is a local-first assessor tool with no account, analytics or cloud database.")}
      <div class="milos-privacy-list">
        <article><span>1</span><div><strong>Local learner profiles</strong><p>Names, local references, reviews and signatures are stored only in this browser on this device.</p></div></article>
        <article><span>2</span><div><strong>Private observation media</strong><p>Photos, videos and audio are stored in the browser's private IndexedDB storage and are not uploaded.</p></div></article>
        <article><span>3</span><div><strong>Non-personal progress QR</strong><p>Evia progress QR codes contain course identifiers, dates, hours, completion states and targets—not names, photos or contact details.</p></div></article>
        <article><span>4</span><div><strong>Minimal return QR</strong><p>The Milos observation QR contains only a pseudonymous learner reference, course, date, observation ID and observed criteria.</p></div></article>
      </div>
    </div>`;
  }

  function currentViewHtml() {
    if (state.view === "root") return renderRoot();
    if (state.view === "learners") return renderLearners();
    if (state.view === "learner-new") return renderLearnerForm(state.selectedProfileId ? selectedProfile() : null);
    if (state.view === "learner-detail") return renderLearnerDetail();
    if (state.view === "reviews") return renderReviews();
    if (state.view === "review-wizard") return renderReviewWizard();
    if (state.view === "review-complete") return renderReviewComplete();
    if (state.view === "observations") return renderObservations();
    if (state.view === "observation-wizard") return renderObservationWizard();
    if (state.view === "observation-complete") return renderObservationComplete();
    if (state.view === "more") return renderMore();
    if (state.view === "settings") return renderSettings();
    if (state.view === "privacy") return renderPrivacy();
    return renderRoot();
  }

  function renderStage() {
    const panel = document.getElementById("viewPanel");
    const stage = document.getElementById("menuStage");
    const avatar = app.querySelector(".milos-anchor");
    const homeCopy = document.getElementById("homeCopy");
    if (!panel || !stage || !avatar || !homeCopy) return;
    app.classList.toggle("is-ready", state.ready);
    app.classList.toggle("is-open", state.open);
    app.classList.toggle("is-reduced-motion", settings().reduceMotion);
    stage.setAttribute("aria-hidden", state.open ? "false" : "true");
    avatar.setAttribute("aria-expanded", state.open ? "true" : "false");
    avatar.setAttribute("aria-label", state.open && state.view !== "root" ? "Open Milos help" : state.open ? "Close Milos menu" : "Open Milos menu");
    homeCopy.setAttribute("aria-hidden", state.open ? "true" : "false");
    if (!state.open) return;
    const title = viewTitles[state.view] || "Milos";
    panel.innerHTML = `<div class="view-panel-inner${state.view === "root" ? " is-root" : ""}">${state.view !== "root" ? `<div class="detail-header"><button type="button" class="back-button" data-action="back" aria-label="Back from ${h(title)}"><span aria-hidden="true">‹</span></button><h2>${h(title)}</h2><span class="header-spacer" aria-hidden="true"></span></div>` : ""}<div class="view-content milos-view">${currentViewHtml()}</div></div>`;
    bindAfterRender();
  }

  function render() {
    renderStage();
    renderDock();
    renderReminders();
    renderOnboarding();
    renderHelp();
  }

  function navigate(view, previous) {
    state.previousView = previous || state.view || "root";
    state.view = view;
    state.open = true;
    state.remindersOpen = false;
    render();
  }

  async function selectProfile(id, view) {
    state.selectedProfileId = id;
    state.course = null;
    state.loadingCourse = true;
    navigate(view || "learner-detail", "learners");
    const profile = selectedProfile();
    if (profile && profile.courseRouteId) {
      try { state.course = await C.loadCourse(profile.courseRouteId); }
      catch (error) { toast(error.message, "error"); }
    }
    state.loadingCourse = false;
    render();
  }

  function goBack() {
    if (state.view === "learner-new") { navigate(state.selectedProfileId ? "learner-detail" : "learners", "root"); return; }
    if (state.view === "learner-detail") { navigate("learners", "root"); return; }
    if (state.view === "settings" || state.view === "privacy") { navigate("more", "root"); return; }
    if (state.view === "review-wizard" && state.reviewDraft) {
      if (state.reviewDraft.step > 0) { state.reviewDraft.step -= 1; render(); return; }
      navigate("reviews", "root"); return;
    }
    if (state.view === "review-complete") { navigate("reviews", "root"); return; }
    if (state.view === "observation-wizard" && state.observationDraft) {
      if (state.observationDraft.step > 0) { state.observationDraft.step -= 1; render(); return; }
      navigate("observations", "root"); return;
    }
    if (state.view === "observation-complete") { navigate("observations", "root"); return; }
    if (["learners", "reviews", "observations", "more"].includes(state.view)) { state.view = "root"; render(); return; }
    navigate(state.previousView || "root", "root");
  }

  function formObject(form) {
    const data = new FormData(form);
    const result = {};
    for (const [key, value] of data.entries()) result[key] = value;
    return result;
  }

  function renderOnboarding() {
    const region = document.getElementById("onboardingRegion");
    if (!region) return;
    const step = state.onboardingStep;
    app.classList.toggle("is-onboarding", step !== null);
    if (step === null) { region.innerHTML = ""; return; }
    const value = settings();
    let body = "";
    if (step === 0) body = `<p class="onboarding-kicker">Hello, I'm Milos</p><h1>What's your full name?</h1><p class="onboarding-copy">Your name will be used on assessor observations and progress review documents created in Milos.</p><form class="name-form" data-form="onboarding-name"><label class="sr-only" for="assessorOnboardingName">Full name</label><div class="name-pill"><input id="assessorOnboardingName" name="assessorName" type="text" value="${h(value.assessorName)}" placeholder="Enter your full name" autocomplete="name" maxlength="100"><button type="submit" aria-label="Continue"><span aria-hidden="true">→</span></button></div></form>`;
    if (step === 1) body = `<p class="onboarding-kicker">Great to meet you</p><h1>${h(firstName(value.assessorName))}, I'll keep every decision mapped.</h1><p class="onboarding-copy">Learner details stay on this device. Evia and Milos exchange only the minimum course information through QR codes.</p><form class="onboarding-extra" data-form="onboarding-details"><label class="milos-field"><span>Organisation (optional)</span><input name="organisation" value="${h(value.organisation)}" autocomplete="organization" placeholder="College or provider"></label><label class="milos-field"><span>Role / job title</span><input name="role" value="${h(value.role || "Assessor")}"></label><button type="submit" class="onboarding-action">Continue <span aria-hidden="true">→</span></button></form><div class="onboarding-dots"><span class="is-current"></span><span></span></div>`;
    if (step === 2) body = `<p class="onboarding-kicker">Your assessor assistant</p><h1>Learners. Reviews. Observations.</h1><p class="onboarding-copy compact-copy">Tap Milos to open four simple routes. Scan Evia for current progress, complete the assessor record and return verified observation mappings without exposing personal data.</p><button type="button" class="onboarding-action" data-action="finish-onboarding">Open Milos <span aria-hidden="true">→</span></button><div class="onboarding-dots"><span></span><span class="is-current"></span></div>`;
    region.innerHTML = `<section class="onboarding-layer onboarding-step-${step}" role="dialog" aria-modal="true"><div class="onboarding-panel">${body}</div></section>`;
  }

  function renderHelp() {
    const region = document.getElementById("modalRegion");
    if (!region || !state.helpOpen) return;
    if (region.querySelector(".milos-qr-layer")) return;
    const copy = helpByView[state.view] || "Choose one area and complete the visible steps in order. Milos keeps the course mapping and document record together.";
    region.innerHTML = `<section class="milos-help-layer" role="dialog" aria-modal="true"><div class="milos-help-card"><button type="button" data-action="close-help" aria-label="Close">×</button><span>Milos+</span><h2>What this page is for</h2><p>${h(copy)}</p><button type="button" class="milos-primary" data-action="close-help">Got it</button></div></section>`;
  }

  function bindAfterRender() {
    if (state.view === "review-wizard" && state.reviewDraft && state.reviewDraft.step === 5) bindReviewSignatures();
    if (state.view === "observation-wizard" && state.observationDraft && state.observationDraft.step === 6) bindObservationSignatures();
    if (state.view === "observation-complete") renderCompletedObservationQr();
  }

  function wizardHeading(step, total, label) {
    return `<div class="milos-wizard-heading"><span>${h(label || "Progress")}</span><small>${step + 1} of ${total}</small><div>${Array.from({ length: total }, (_, index) => `<i class="${index <= step ? "is-active" : ""}"></i>`).join("")}</div></div>`;
  }

  function renderReviews() {
    const learnerProfiles = profiles();
    const allReviews = reviews().slice().sort((a, b) => (b.completedAt || b.createdAt || 0) - (a.completedAt || a.createdAt || 0));
    return `<div class="milos-page">
      ${guidance("Reviews start with the latest Evia progress.", "Milos then records the three-way discussion, actions, training-plan progress and signatures.")}
      <div class="milos-list">${learnerProfiles.map((profile) => {
        const latest = C.reviewsForProfile(profile.id)[0];
        const note = latest ? `Last review ${C.formatDate(latest.reviewDate, false)} · ${latest.overallStatus || "Completed"}` : `${profileStatus(profile)} · No review yet`;
        return optionRow(profile.name, note, "start-review", profile.id, `<span class="milos-small-action">Review</span>`);
      }).join("")}</div>
      ${!learnerProfiles.length ? emptyState("Add a learner first", "A local learner profile is needed before you can conduct a progress review.", "new-learner", "Add learner") : ""}
      ${allReviews.length ? `<section class="milos-section"><div class="milos-section-heading"><span>Completed reviews</span><small>${allReviews.length}</small></div><div class="milos-history-list">${allReviews.map((review) => {
        const profile = C.getProfile(review.profileId);
        return `<button type="button" data-action="review-history" data-id="${h(review.id)}"><span><strong>${h(profile ? profile.name : "Removed learner")}</strong><small>${h(C.formatDate(review.reviewDate, false))} · ${h(review.overallStatus || "Completed")}</small></span><em>PDF</em></button>`;
      }).join("")}</div></section>` : ""}
    </div>`;
  }

  function reviewSnapshotView(draft, profile, course) {
    const snapshot = C.latestSnapshot(profile);
    const metrics = course ? C.metricsFor(profile, course) : { toc: C.timeOnCoursePercent(profile.startDate, profile.endDate), coverage: 0, completed: 0, total: 0, learningHours: 0, learningTarget: 0 };
    const changed = course ? C.codesSinceLastReview(profile.id, metrics.completedCodes) : [];
    draft.newCodes = snapshot && snapshot.changedCodes && snapshot.changedCodes.length ? snapshot.changedCodes : changed;
    draft.snapshot = snapshot || {};
    return `<div class="milos-page">
      ${wizardHeading(0, 6, "Latest course position")}
      ${guidance(snapshot ? "Evia progress is ready for review." : "No Evia progress QR has been imported.", snapshot ? "Check the snapshot below or scan a newer QR before continuing." : "You can continue with the manually entered course, but scanning Evia gives a stronger progress record.")}
      <div class="milos-profile-course"><span>${h(course.coverageLabel)}</span><strong>${h(course.title)}</strong><small>${h(profile.startDate ? `${C.formatDate(profile.startDate, false)} — ${C.formatDate(profile.endDate, false)}` : "Course dates not supplied")}</small></div>
      <div class="milos-metric-grid">
        ${metricCard("TOC", `${metrics.toc}%`, "elapsed")}
        ${metricCard(course.coverageLabel, `${metrics.coverage}%`, `${metrics.completed}/${metrics.total}`)}
        ${metricCard(course.learningLabel, `${Number(metrics.learningHours).toFixed(1)}h`, `of ${Number(metrics.learningTarget).toFixed(0)}h`)}
        ${metricCard("New", String(draft.newCodes.length), `since review`)}
      </div>
      <section class="milos-section"><div class="milos-section-heading"><span>Current Evia targets</span><small>${snapshot && snapshot.targets ? snapshot.targets.length : 0}</small></div>${snapshot && snapshot.targets && snapshot.targets.length ? `<div class="milos-target-list">${snapshot.targets.map((target) => `<div><span>${h(target.code || "Target")}</span><p>${h(target.title)}</p><small>${target.dueDate ? `Due ${h(C.formatDate(target.dueDate, false))}` : "No due date"}</small></div>`).join("")}</div>` : `<p class="milos-muted">No current targets were included in the latest Evia QR.</p>`}</section>
      <div class="milos-action-grid"><button type="button" class="milos-secondary" data-action="scan-profile" data-id="${h(profile.id)}">Scan newer QR</button><button type="button" class="milos-primary" data-action="review-next">Continue</button></div>
    </div>`;
  }

  function renderReviewWizard() {
    const draft = state.reviewDraft;
    const profile = selectedProfile();
    const course = state.course;
    if (!draft || !profile || !course) return emptyState("Review not ready", "Choose a learner with a course before starting the review.", "open-reviews", "Back to reviews");
    const step = draft.step || 0;
    if (step === 0) return reviewSnapshotView(draft, profile, course);
    if (step === 1) return `<form class="milos-page milos-form" data-form="review-meeting">
      ${wizardHeading(step, 6, "Three-way meeting")}
      ${guidance("Record who took part and how.", "The employer should attend the majority of reviews. If they cannot attend, record how they were given the opportunity to contribute.")}
      <div class="milos-field-split"><label class="milos-field is-required"><span>Review date</span><input required name="reviewDate" type="date" value="${h(draft.reviewDate)}"></label><label class="milos-field is-required"><span>Meeting format</span><select required name="meetingFormat"><option${draft.meetingFormat === "Face to face" ? " selected" : ""}>Face to face</option><option${draft.meetingFormat === "Virtual" ? " selected" : ""}>Virtual</option><option${draft.meetingFormat === "Email" ? " selected" : ""}>Email</option></select></label></div>
      <label class="milos-field"><span>Location / meeting link</span><input name="location" maxlength="180" value="${h(draft.location)}" placeholder="Site, college, office or online"></label>
      <label class="milos-field is-required"><span>Provider representative</span><input required name="providerName" maxlength="100" value="${h(draft.providerName)}"></label>
      <label class="milos-field"><span>Employer representative</span><input name="employerName" maxlength="100" value="${h(draft.employerName)}" placeholder="Name and role"></label>
      <label class="milos-field is-required"><span>Employer attendance</span><select required name="employerAttendance"><option value="Attended"${draft.employerAttendance === "Attended" ? " selected" : ""}>Attended</option><option value="Contributed before the review"${draft.employerAttendance === "Contributed before the review" ? " selected" : ""}>Contributed before the review</option><option value="Contributed after the review"${draft.employerAttendance === "Contributed after the review" ? " selected" : ""}>Contributed after the review</option><option value="Unable to contribute"${draft.employerAttendance === "Unable to contribute" ? " selected" : ""}>Unable to contribute</option></select></label>
      <label class="milos-field"><span>Employer contribution / opportunity offered</span><textarea name="employerContribution" rows="4" placeholder="Record their contribution, or how and when they were invited to contribute.">${h(draft.employerContribution)}</textarea></label>
      <button type="submit" class="milos-primary">Continue</button>
    </form>`;
    if (step === 2) return `<form class="milos-page milos-form" data-form="review-progress">
      ${wizardHeading(step, 6, "Progress and training plan")}
      ${guidance("Discuss progress against the agreed plan.", `Include previous actions, training delivered, ${course.learningLabel} pace and any evidence outside the provider's control.`)}
      <label class="milos-field is-required"><span>Previous actions and training delivered</span><textarea required name="previousActions" rows="5" placeholder="What was agreed last time, and what has been delivered since?">${h(draft.previousActions)}</textarea></label>
      <label class="milos-field is-required"><span>Evidence and training discussed or collected</span><textarea required name="trainingEvidence" rows="5" placeholder="Include workplace or employer-held training evidence.">${h(draft.trainingEvidence)}</textarea></label>
      <label class="milos-field is-required"><span>Overall progress against the training plan</span><textarea required name="overallProgress" rows="5" placeholder="Compare current progress with what was planned.">${h(draft.overallProgress)}</textarea></label>
      <label class="milos-field is-required"><span>${h(course.learningLabel)} progress and any slippage</span><textarea required name="learningProgress" rows="4" placeholder="Record whether hours and planned learning are on track, including any slippage.">${h(draft.learningProgress)}</textarea></label>
      <label class="milos-field"><span>English, maths and mandatory qualifications</span><textarea name="qualifications" rows="4" placeholder="Progress, support, qualifications and assessment position.">${h(draft.qualifications)}</textarea></label>
      <label class="milos-field is-required"><span>Training plan changes</span><textarea required name="trainingPlanChanges" rows="4" placeholder="Record changes needed, or confirm that no update is required.">${h(draft.trainingPlanChanges)}</textarea></label>
      <label class="milos-field is-required"><span>Overall position</span><select required name="overallStatus"><option value="On track"${draft.overallStatus === "On track" ? " selected" : ""}>On track</option><option value="Attention required"${draft.overallStatus === "Attention required" ? " selected" : ""}>Attention required</option><option value="Off track"${draft.overallStatus === "Off track" ? " selected" : ""}>Off track</option></select></label>
      <button type="submit" class="milos-primary">Continue</button>
    </form>`;
    if (step === 3) return `<form class="milos-page milos-form" data-form="review-support">
      ${wizardHeading(step, 6, "Support and contributions")}
      ${guidance("Give each party a clear voice.", "Record concerns, changes of circumstance, support needs, wellbeing and the comments made by all three parties.")}
      <label class="milos-field is-required"><span>Concerns, changes of circumstance or support needs</span><textarea required name="supportNeeds" rows="5" placeholder="Record concerns or confirm that none were raised.">${h(draft.supportNeeds)}</textarea></label>
      <label class="milos-field is-required"><span>Wellbeing and safeguarding check</span><textarea required name="wellbeing" rows="4" placeholder="Record the check-in and any support or signposting.">${h(draft.wellbeing)}</textarea></label>
      <label class="milos-field is-required"><span>Apprentice comments</span><textarea required name="apprenticeComments" rows="4">${h(draft.apprenticeComments)}</textarea></label>
      <label class="milos-field"><span>Employer comments</span><textarea name="employerComments" rows="4">${h(draft.employerComments)}</textarea></label>
      <label class="milos-field is-required"><span>Provider comments</span><textarea required name="providerComments" rows="4">${h(draft.providerComments)}</textarea></label>
      <button type="submit" class="milos-primary">Continue</button>
    </form>`;
    if (step === 4) return `<form class="milos-page milos-form" data-form="review-targets">
      ${wizardHeading(step, 6, "Agreed actions")}
      ${guidance("Set specific actions for the next review.", "Each action should be clear, dated and linked to a course criterion where useful.")}
      <div class="milos-target-editor">${(draft.targets || []).map((target, index) => `<div class="milos-target-edit-row" data-target-index="${index}"><label class="milos-field is-wide"><span>Action ${index + 1}</span><textarea name="targetTitle" rows="3" required>${h(target.title)}</textarea></label><label class="milos-field"><span>${h(course.coverageLabel)} code</span><input name="targetCode" maxlength="32" value="${h(target.code || "")}" placeholder="Optional"></label><label class="milos-field"><span>Due date</span><input name="targetDue" type="date" value="${h(target.dueDate || "")}"></label><button type="button" class="milos-remove-button" data-action="review-remove-target" data-index="${index}">Remove</button></div>`).join("")}</div>
      <button type="button" class="milos-secondary" data-action="review-add-target">Add another action</button>
      <label class="milos-field is-required"><span>Next review date</span><input required name="nextReviewDate" type="date" value="${h(draft.nextReviewDate)}"></label>
      <button type="submit" class="milos-primary">Continue to signatures</button>
    </form>`;
    return `<div class="milos-page">
      ${wizardHeading(5, 6, "Declarations and signatures")}
      ${guidance("Sign the agreed review record.", "The provider and apprentice signatures are required. Add the employer signature when they are present and able to sign.")}
      <div class="milos-review-summary"><span>${h(draft.overallStatus)}</span><strong>${h(profile.name)}</strong><p>${h(C.formatDate(draft.reviewDate, false))} · next review ${h(C.formatDate(draft.nextReviewDate, false))}</p><small>${(draft.targets || []).length} agreed ${(draft.targets || []).length === 1 ? "action" : "actions"}</small></div>
      ${signatureBox("Provider", "reviewProviderSignature", draft.providerName, "Provider representative", true)}
      ${signatureBox("Apprentice", "reviewApprenticeSignature", profile.name, "Apprentice", true)}
      ${signatureBox("Employer", "reviewEmployerSignature", draft.employerName || "Employer representative", "Employer representative", false)}
      <button type="button" class="milos-primary" id="completeReviewButton" data-action="review-complete" disabled>Complete review & download PDF</button>
      <p class="milos-form-note">Completing the review stores it locally and downloads the signed PDF.</p>
    </div>`;
  }

  function signatureBox(label, canvasId, name, role, required) {
    return `<div class="milos-signature-card"><div class="milos-signature-heading"><span>${h(label)} signature${required ? " · required" : " · optional"}</span><button type="button" data-action="clear-signature" data-canvas="${h(canvasId)}">Clear</button></div><canvas id="${h(canvasId)}" class="milos-signature-pad" aria-label="${h(label)} signature"></canvas><div><strong>${h(name)}</strong><small>${h(role)}</small></div></div>`;
  }

  function renderReviewComplete() {
    const review = state.completedReview;
    const profile = review ? C.getProfile(review.profileId) : selectedProfile();
    if (!review || !profile) return emptyState("Review not found", "Return to Reviews to open a saved record.", "open-reviews", "Back to reviews");
    return `<div class="milos-page milos-complete-view">
      <div class="milos-complete-mark" aria-hidden="true">✓</div><span class="milos-kicker">Review complete</span><h3>${h(profile.name)}</h3><p>${h(C.formatDate(review.reviewDate, false))} · ${h(review.overallStatus)}</p>
      <div class="milos-metric-grid">${metricCard("Actions", String((review.targets || []).length), "agreed")}${metricCard("Next review", C.formatDate(review.nextReviewDate, false), "scheduled")}${metricCard("New progress", String((review.newCodes || []).length), "course items")}${metricCard("Signatures", review.signatures && review.signatures.employer && review.signatures.employer.dataUrl ? "3" : "2", "captured")}</div>
      <button type="button" class="milos-primary" data-action="review-download" data-id="${h(review.id)}">Download review PDF</button>
      <button type="button" class="milos-secondary" data-action="open-learner" data-id="${h(profile.id)}">Open learner profile</button>
      <p class="milos-form-note">The PDF records the progress snapshot, three-way discussion, actions, comments and signatures.</p>
    </div>`;
  }
  function renderObservations() {
    const learnerProfiles = profiles();
    const saved = observations().slice().sort((a, b) => (b.completedAt || b.createdAt || 0) - (a.completedAt || a.createdAt || 0));
    return `<div class="milos-page">
      ${guidance("Observe against the learner's live course.", "Scan Evia first, then follow its category, job and opportunity route to map exactly what you personally observe.")}
      <div class="milos-list">${learnerProfiles.map((profile) => {
        const latest = C.observationsForProfile(profile.id)[0];
        const note = latest ? `Last observation ${C.formatDate(latest.observationDate, false)} · ${(latest.observedCodes || []).length} observed` : `${profileStatus(profile)} · No observation yet`;
        return optionRow(profile.name, note, "start-observation", profile.id, `<span class="milos-small-action">Observe</span>`);
      }).join("")}</div>
      ${!learnerProfiles.length ? emptyState("Add a learner first", "A local learner profile is needed before you can conduct an observation.", "new-learner", "Add learner") : ""}
      ${saved.length ? `<section class="milos-section"><div class="milos-section-heading"><span>Completed observations</span><small>${saved.length}</small></div><div class="milos-history-list">${saved.map((observation) => {
        const profile = C.getProfile(observation.profileId);
        return `<button type="button" data-action="observation-history" data-id="${h(observation.id)}"><span><strong>${h(profile ? profile.name : "Removed learner")}</strong><small>${h(C.formatDate(observation.observationDate, false))} · ${h(observation.opportunityTitle || observation.jobTitle || "Course observation")}</small></span><em>${(observation.observedCodes || []).length} ${h(observation.coverageLabel || "items")}</em></button>`;
      }).join("")}</div></section>` : ""}
    </div>`;
  }

  function observationSelection(draft, course) {
    const categories = Array.isArray(course && course.siteData) ? course.siteData : [];
    const category = categories.find((item) => item.id === draft.categoryId) || null;
    const jobs = category && Array.isArray(category.jobs) ? category.jobs : [];
    const job = jobs.find((item) => item.id === draft.jobId) || null;
    const opportunities = job && Array.isArray(job.opps) ? job.opps : [];
    const opportunity = opportunities.find((item) => item.id === draft.opportunityId) || null;
    return { categories, category, jobs, job, opportunities, opportunity };
  }

  function observationSnapshotView(draft, profile, course) {
    const snapshot = C.latestSnapshot(profile);
    const metrics = C.metricsFor(profile, course);
    return `<div class="milos-page">
      ${wizardHeading(0, 7, "Latest course position")}
      ${guidance(snapshot ? "Evia progress is ready." : "No Evia progress QR has been imported.", snapshot ? "Check the snapshot or scan a newer QR before selecting the activity you will observe." : "You can draft the record using the selected course, but a full Evia QR scan is required before Milos can create the return QR.")}
      <div class="milos-profile-course"><span>${h(course.coverageLabel)}</span><strong>${h(course.title)}</strong><small>${h(profile.startDate ? `${C.formatDate(profile.startDate, false)} — ${C.formatDate(profile.endDate, false)}` : "Course dates not supplied")}</small></div>
      <div class="milos-metric-grid">
        ${metricCard("TOC", `${metrics.toc}%`, "elapsed")}
        ${metricCard(course.coverageLabel, `${metrics.coverage}%`, `${metrics.completed}/${metrics.total}`)}
        ${metricCard(course.learningLabel, `${Number(metrics.learningHours).toFixed(1)}h`, `of ${Number(metrics.learningTarget).toFixed(0)}h`)}
        ${metricCard("Evia QR", snapshot ? C.formatDate(snapshot.importedAt, false) : "Not scanned", "latest")}
      </div>
      <div class="milos-action-grid"><button type="button" class="milos-secondary" data-action="scan-profile" data-id="${h(profile.id)}">Scan newer QR</button><button type="button" class="milos-primary" data-action="observation-next">Choose activity</button></div>
    </div>`;
  }

  function selectionList(items, action, noteBuilder) {
    return `<div class="milos-choice-list">${items.map((item) => `<button type="button" data-action="${h(action)}" data-id="${h(item.id)}"><span><strong>${h(item.title)}</strong>${noteBuilder ? `<small>${h(noteBuilder(item))}</small>` : ""}</span><i aria-hidden="true">›</i></button>`).join("")}</div>`;
  }

  function renderObservationWizard() {
    const draft = state.observationDraft;
    const profile = selectedProfile();
    const course = state.course;
    if (!draft || !profile || !course) return emptyState("Observation not ready", "Choose a learner with a course before starting the observation.", "open-observations", "Back to observations");
    const step = Number(draft.step || 0);
    const selected = observationSelection(draft, course);
    if (step === 0) return observationSnapshotView(draft, profile, course);
    if (step === 1) return `<div class="milos-page">${wizardHeading(step, 7, "Choose a work category")}${guidance("Use the same route as Evia.", "Choose the broad area of work you are going to observe.")}${selected.categories.length ? selectionList(selected.categories, "observation-category", (item) => `${(item.jobs || []).length} job ${(item.jobs || []).length === 1 ? "route" : "routes"}`) : emptyState("No observation routes", "This course pack does not yet include workplace observation routes.", "open-observations", "Back")}</div>`;
    if (step === 2) return `<div class="milos-page">${wizardHeading(step, 7, selected.category ? selected.category.title : "Choose a job")}${guidance("Choose the job being carried out.", "Milos will then show the evidence opportunity and its mapped course criteria.")}${selected.category ? selectionList(selected.jobs, "observation-job", (item) => `${(item.opps || []).length} observation ${(item.opps || []).length === 1 ? "opportunity" : "opportunities"}`) : emptyState("Choose a category", "Return one step and select the work category first.")}</div>`;
    if (step === 3) return `<div class="milos-page">${wizardHeading(step, 7, selected.job ? selected.job.title : "Choose an opportunity")}${guidance("Choose what you will directly observe.", "The wording and mapped criteria come from the learner's Evia course pack.")}${selected.job ? selectionList(selected.opportunities, "observation-opportunity", (item) => `${(item.codes || []).length} mapped ${course.coverageLabel} · ${item.instruction || "Observation opportunity"}`) : emptyState("Choose a job", "Return one step and select the job first.")}</div>`;
    if (step === 4) {
      const latest = new Set((C.latestSnapshot(profile) || {}).completedCodes || []);
      return `<form class="milos-page milos-form" data-form="observation-criteria">
        ${wizardHeading(step, 7, `${course.coverageLabel} mapping`)}
        ${guidance("Decide what this observation can evidence.", "Keep only criteria that can be judged directly. You will record the outcome for every selected item.")}
        <div class="milos-opportunity-card"><span>${h(selected.category ? selected.category.title : "Activity")}</span><strong>${h(selected.opportunity ? selected.opportunity.title : draft.opportunityTitle)}</strong><p>${h(selected.opportunity ? selected.opportunity.instruction : draft.instruction)}</p>${selected.opportunity && selected.opportunity.question ? `<small>Suggested question: ${h(selected.opportunity.question)}</small>` : ""}</div>
        <div class="milos-criteria-editor">${(draft.criteria || []).map((criterion, index) => `<article class="milos-criterion-row"><label><input type="checkbox" data-criterion-include data-index="${index}"${criterion.included !== false ? " checked" : ""}><span><strong>${h(criterion.code)}</strong><small>${h(criterion.description || "Course criterion")}</small>${latest.has(criterion.code) ? `<em>Already present in latest Evia progress</em>` : ""}</span></label><select data-criterion-outcome data-index="${index}" aria-label="Outcome for ${h(criterion.code)}"><option value="Observed"${criterion.outcome === "Observed" ? " selected" : ""}>Observed</option><option value="Partially observed"${criterion.outcome === "Partially observed" ? " selected" : ""}>Partially observed</option><option value="Not observed"${criterion.outcome === "Not observed" ? " selected" : ""}>Not observed</option></select></article>`).join("")}</div>
        <button type="submit" class="milos-primary">Record observation</button>
      </form>`;
    }
    if (step === 5) return `<form class="milos-page milos-form" data-form="observation-record">
      ${wizardHeading(step, 7, "Observation record")}
      ${guidance("Record what you saw and how you judged it.", "Use factual, specific language and distinguish direct observation from questioning or supporting media.")}
      <div class="milos-field-split"><label class="milos-field is-required"><span>Observation date</span><input required name="observationDate" type="date" value="${h(draft.observationDate)}"></label><label class="milos-field"><span>Location</span><input name="location" maxlength="180" value="${h(draft.location)}" placeholder="Site, workshop or workplace"></label></div>
      <div class="milos-field-split"><label class="milos-field"><span>Start time</span><input name="startTime" type="time" value="${h(draft.startTime)}"></label><label class="milos-field"><span>Finish time</span><input name="endTime" type="time" value="${h(draft.endTime)}"></label></div>
      <label class="milos-field is-required"><span>Activity personally observed</span><textarea required name="activityObserved" rows="6" placeholder="Describe the task, conditions, sequence and what the learner did.">${h(draft.activityObserved)}</textarea></label>
      <label class="milos-field is-required"><span>Safe working, PPE and controls</span><textarea required name="safetyNotes" rows="4" placeholder="Record safe practice and any intervention.">${h(draft.safetyNotes)}</textarea></label>
      <label class="milos-field is-required"><span>Performance, quality and checks</span><textarea required name="qualityNotes" rows="5" placeholder="Record tolerances, checks, quality and independence.">${h(draft.qualityNotes)}</textarea></label>
      <label class="milos-field"><span>Knowledge questions and learner responses</span><textarea name="questionsAndAnswers" rows="5" placeholder="${h(draft.question || "Record questions asked and the learner's responses.")}">${h(draft.questionsAndAnswers)}</textarea></label>
      <label class="milos-field is-required"><span>Assessor feedback</span><textarea required name="feedback" rows="4">${h(draft.feedback)}</textarea></label>
      <label class="milos-field"><span>Actions or further evidence required</span><textarea name="actions" rows="4">${h(draft.actions)}</textarea></label>
      <label class="milos-field is-required"><span>Overall assessment</span><select required name="rating"><option value="Competent"${draft.rating === "Competent" ? " selected" : ""}>Competent</option><option value="Competent with actions"${draft.rating === "Competent with actions" ? " selected" : ""}>Competent with actions</option><option value="Further evidence required"${draft.rating === "Further evidence required" ? " selected" : ""}>Further evidence required</option></select></label>
      <section class="milos-section"><div class="milos-section-heading"><span>Supporting media (optional)</span><small>${(draft.media || []).length}</small></div><p class="milos-muted">Media remains in private browser storage and is embedded or referenced in the PDF. It is never placed in the return QR.</p><div class="milos-media-actions"><label class="milos-secondary milos-file-button">Take photo<input type="file" accept="image/*" capture="environment" data-observation-media></label><label class="milos-secondary milos-file-button">Record video<input type="file" accept="video/*" capture="environment" data-observation-media></label><label class="milos-secondary milos-file-button">Add files<input type="file" accept="image/*,video/*,audio/*" multiple data-observation-media></label></div>${(draft.media || []).length ? `<div class="milos-media-list">${draft.media.map((item) => `<div><span><strong>${h(item.name)}</strong><small>${h(item.type || "Media")} · ${Math.max(1, Math.round(Number(item.size || 0) / 1024))} KB</small></span><button type="button" data-action="observation-remove-media" data-id="${h(item.id)}">Remove</button></div>`).join("")}</div>` : ""}</section>
      <button type="submit" class="milos-primary">Continue to signatures</button>
    </form>`;
    const observedCount = (draft.criteria || []).filter((criterion) => criterion.outcome === "Observed").length;
    return `<div class="milos-page">
      ${wizardHeading(6, 7, "Decision and signatures")}
      ${guidance("Authenticate the assessor decision.", "Your signature is required. The learner may also sign to acknowledge that the feedback was received.")}
      <div class="milos-review-summary"><span>${h(draft.rating)}</span><strong>${h(profile.name)}</strong><p>${h(draft.opportunityTitle)} · ${h(C.formatDate(draft.observationDate, false))}</p><small>${observedCount} ${h(course.coverageLabel)} ${(observedCount === 1 ? "item" : "items")} will receive a blue o in Evia</small></div>
      ${signatureBox("Assessor", "observationAssessorSignature", draft.assessorName, settings().role || "Assessor", true)}
      ${signatureBox("Learner acknowledgement", "observationLearnerSignature", profile.name, "Learner", false)}
      <button type="button" class="milos-primary" id="completeObservationButton" data-action="observation-complete" disabled>Complete, create QR & download PDF</button>
      <p class="milos-form-note">The return QR contains no learner name, media, comments or signatures.</p>
    </div>`;
  }

  function renderObservationComplete() {
    const observation = state.completedObservation;
    const profile = observation ? C.getProfile(observation.profileId) : selectedProfile();
    if (!observation || !profile) return emptyState("Observation not found", "Return to Observations to open a saved record.", "open-observations", "Back to observations");
    return `<div class="milos-page milos-complete-view">
      <div class="milos-complete-mark is-observation" aria-hidden="true">o</div><span class="milos-kicker">Observation complete</span><h3>${h(profile.name)}</h3><p>${h(C.formatDate(observation.observationDate, false))} · ${h(observation.opportunityTitle || "Course observation")}</p>
      <div class="milos-observation-qr" id="completedObservationQr"></div>
      <h4>Return this result to Evia</h4><p class="milos-muted">Scan the QR in Evia to place a blue <strong>o</strong> beside ${(observation.observedCodes || []).length} observed ${h(observation.coverageLabel || "course")} ${(observation.observedCodes || []).length === 1 ? "item" : "items"}.</p>
      <div class="milos-action-grid"><button type="button" class="milos-primary" data-action="observation-download" data-id="${h(observation.id)}">Download PDF</button><button type="button" class="milos-secondary" data-action="observation-download-qr" data-id="${h(observation.id)}">Save QR image</button></div>
      <button type="button" class="milos-secondary" data-action="open-learner" data-id="${h(profile.id)}">Open learner profile</button>
      <div class="milos-privacy-pill"><span aria-hidden="true">○</span> QR excludes names, media, notes and signatures</div>
    </div>`;
  }

  function signatureRecord(name, role, dataUrl) {
    return dataUrl ? { name: C.cleanText(name, 100), role: C.cleanText(role, 100), signedAt: Date.now(), dataUrl } : null;
  }

  function bindSignature(canvasId, existing, onChange) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const pad = M.signaturePad(canvas, { initialDataUrl: existing && existing.dataUrl, onChange });
    signaturePads.set(canvasId, pad);
    return pad;
  }

  function bindReviewSignatures() {
    signaturePads.clear();
    const draft = state.reviewDraft;
    const profile = selectedProfile();
    if (!draft || !profile) return;
    draft.signatures = draft.signatures || {};
    const refresh = () => {
      const button = document.getElementById("completeReviewButton");
      if (button) button.disabled = !(draft.signatures.provider && draft.signatures.provider.dataUrl && draft.signatures.apprentice && draft.signatures.apprentice.dataUrl);
    };
    bindSignature("reviewProviderSignature", draft.signatures.provider, (url) => { draft.signatures.provider = signatureRecord(draft.providerName, "Provider representative", url); refresh(); });
    bindSignature("reviewApprenticeSignature", draft.signatures.apprentice, (url) => { draft.signatures.apprentice = signatureRecord(profile.name, "Apprentice", url); refresh(); });
    bindSignature("reviewEmployerSignature", draft.signatures.employer, (url) => { draft.signatures.employer = signatureRecord(draft.employerName || "Employer representative", "Employer representative", url); refresh(); });
    refresh();
  }

  function bindObservationSignatures() {
    signaturePads.clear();
    const draft = state.observationDraft;
    const profile = selectedProfile();
    if (!draft || !profile) return;
    const refresh = () => {
      const button = document.getElementById("completeObservationButton");
      if (button) button.disabled = !(draft.signature && draft.signature.dataUrl);
    };
    bindSignature("observationAssessorSignature", draft.signature, (url) => { draft.signature = signatureRecord(draft.assessorName, settings().role || "Assessor", url); refresh(); });
    bindSignature("observationLearnerSignature", draft.learnerSignature, (url) => { draft.learnerSignature = signatureRecord(profile.name, "Learner", url); refresh(); });
    refresh();
  }

  function renderCompletedObservationQr() {
    const container = document.getElementById("completedObservationQr");
    const observation = state.completedObservation;
    if (!container || !observation || !observation.qrPayload) return;
    try { Q.render(container, observation.qrPayload, { size: 292, label: "Milos observation return QR for Evia" }); }
    catch (error) { container.innerHTML = `<p class="milos-error">${h(error.message)}</p>`; }
  }

  shell();
  requestAnimationFrame(() => { state.ready = true; render(); });

  setInterval(() => {
    if (settings().reduceMotion || state.onboardingStep !== null) return;
    const poses = ["idle", "look-down", "look-up-left", "look-up-right", "curious", "smile", "double-blink"];
    setPose(poses[Math.floor(Math.random() * poses.length)]);
  }, 5200);

  global.addEventListener("beforeunload", () => Q.stopCamera());

  app.addEventListener("submit", handleSubmit);
  app.addEventListener("click", handleClick);
  app.addEventListener("change", handleChange);

  async function handleSubmit(event) {
    const form = event.target.closest("form[data-form]");
    if (!form) return;
    event.preventDefault();
    const kind = form.dataset.form;
    const values = formObject(form);
    try {
      if (kind === "onboarding-name") {
        if (!C.cleanText(values.assessorName, 100)) throw new Error("Add your full name to continue.");
        C.saveSettings({ assessorName: values.assessorName });
        state.onboardingStep = 1;
        setPose("happy-bounce");
        render();
        return;
      }
      if (kind === "onboarding-details") {
        C.saveSettings({ organisation: values.organisation, role: values.role || "Assessor" });
        state.onboardingStep = 2;
        render();
        return;
      }
      if (kind === "settings") {
        C.saveSettings({ assessorName: values.assessorName, organisation: values.organisation, role: values.role || "Assessor", reduceMotion: form.elements.reduceMotion.checked });
        toast("Assessor details saved.");
        navigate("more", "root");
        return;
      }
      if (kind === "learner") {
        const payload = { name: values.name, localReference: values.localReference, courseRouteId: values.courseRouteId, startDate: values.startDate, endDate: values.endDate };
        const profile = values.profileId ? C.updateProfile(values.profileId, payload) : C.createProfile(payload);
        toast(values.profileId ? "Learner profile updated." : "Learner profile created.");
        await selectProfile(profile.id, "learner-detail");
        return;
      }
      if (kind === "qr-paste") {
        await importProgressText(values.qrText);
        return;
      }
      if (kind.startsWith("review-")) { await handleReviewSubmit(kind, form, values); return; }
      if (kind.startsWith("observation-")) { await handleObservationSubmit(kind, form, values); return; }
    } catch (error) {
      toast(error && error.message ? error.message : "That could not be saved.", "error");
    }
  }

  async function handleClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id || "";
    if (action === "avatar") {
      if (state.onboardingStep !== null) return;
      if (state.open && state.view !== "root") { state.helpOpen = true; render(); return; }
      state.open = !state.open;
      state.view = "root";
      state.remindersOpen = false;
      setPose(state.open ? "look-down" : "idle");
      render();
      return;
    }
    if (action === "back") { goBack(); return; }
    if (action === "toggle-reminders") { state.remindersOpen = !state.remindersOpen; renderReminders(); return; }
    if (action === "dismiss-reminders") { state.remindersOpen = false; renderReminders(); return; }
    if (action === "close-help") { state.helpOpen = false; document.getElementById("modalRegion").innerHTML = ""; return; }
    if (action === "finish-onboarding") { C.saveSettings({ onboardingComplete: true }); state.onboardingStep = null; state.open = false; setPose("happy-bounce"); render(); return; }
    if (action === "open-learners") { navigate("learners", "root"); return; }
    if (action === "open-reviews") { navigate("reviews", "root"); return; }
    if (action === "open-observations") { navigate("observations", "root"); return; }
    if (action === "open-more") { navigate("more", "root"); return; }
    if (action === "open-settings") { navigate("settings", "more"); return; }
    if (action === "open-privacy") { navigate("privacy", "more"); return; }
    if (action === "future-tools") { toast("This space is ready for the next Milos feature."); return; }
    if (action === "new-learner") { state.selectedProfileId = ""; navigate("learner-new", "learners"); return; }
    if (action === "open-learner") { await selectProfile(id, "learner-detail"); return; }
    if (action === "edit-learner") { navigate("learner-new", "learner-detail"); return; }
    if (action === "delete-learner") {
      const profile = C.getProfile(id);
      if (profile && global.confirm(`Delete ${profile.name}'s local profile, reviews and observations from this device?`)) {
        const mediaIds = C.observationsForProfile(id).flatMap((observation) => (observation.media || []).map((item) => item.id)).filter(Boolean);
        for (const mediaId of mediaIds) {
          try { await M.removeFile(mediaId); } catch (_) {}
        }
        C.removeProfile(id); state.selectedProfileId = ""; state.course = null; toast("Learner profile and local media deleted."); navigate("learners", "root");
      }
      return;
    }
    if (action === "scan-profile") { openQrScanner(id); return; }
    if (action === "close-qr") { closeQrScanner(); return; }
    if (action === "start-camera") { startQrCamera(); return; }
    if (action === "clear-signature") {
      const pad = signaturePads.get(button.dataset.canvas || "");
      if (pad) pad.clear();
      return;
    }
    if (action === "start-review") { await startReview(id); return; }
    if (action === "start-observation") { await startObservation(id); return; }
    if (action.startsWith("review-")) { await handleReviewAction(action, button); return; }
    if (action.startsWith("observation-")) { await handleObservationAction(action, button); return; }
  }

  async function handleChange(event) {
    if (event.target.matches("[data-qr-file]")) {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      try { await importProgressText(await Q.decodeImage(file)); }
      catch (error) { setQrStatus(error.message, true); }
      return;
    }
    if (event.target.matches("[data-observation-media]")) {
      await addObservationMedia(event.target);
    }
  }

  function openQrScanner(profileId) {
    state.selectedProfileId = profileId || state.selectedProfileId;
    const profile = selectedProfile();
    if (!profile) { toast("Select a learner first.", "error"); return; }
    const region = document.getElementById("modalRegion");
    region.innerHTML = `<section class="milos-qr-layer" role="dialog" aria-modal="true"><div class="milos-qr-sheet"><button type="button" class="milos-layer-close" data-action="close-qr" aria-label="Close">×</button><span class="milos-kicker">Evia progress</span><h2>Scan ${h(firstName(profile.name))}'s QR</h2><p>Only non-personal course progress will be imported.</p><div class="milos-scanner-frame"><video id="qrVideo" muted playsinline></video><div class="milos-scan-guide" aria-hidden="true"></div></div><div class="milos-action-grid"><button type="button" class="milos-primary" data-action="start-camera">Use camera</button><label class="milos-secondary milos-file-button">Choose QR image<input type="file" accept="image/*" data-qr-file></label></div><form class="milos-qr-paste" data-form="qr-paste"><label class="milos-field"><span>Or paste the Evia share code</span><textarea name="qrText" rows="3" placeholder="NISI:EVIA:PROGRESS:1:..."></textarea></label><button type="submit" class="milos-secondary">Import code</button></form><div class="milos-qr-status" id="qrStatus">Camera scanning works securely on the installed app or HTTPS site.</div></div></section>`;
  }

  function closeQrScanner() {
    Q.stopCamera();
    const region = document.getElementById("modalRegion");
    if (region) region.innerHTML = "";
  }

  function setQrStatus(message, error) {
    const status = document.getElementById("qrStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", !!error);
  }

  async function startQrCamera() {
    const video = document.getElementById("qrVideo");
    if (!video) return;
    setQrStatus("Starting the camera…", false);
    try {
      await Q.startCamera(video, importProgressText, (error) => setQrStatus(error.message, true));
      setQrStatus("Hold the Evia QR inside the square.", false);
    } catch (error) { setQrStatus(error.message, true); }
  }

  async function importProgressText(text) {
    try {
      const parsed = Q.parsePayload(text);
      if (parsed.type !== "progress") throw new Error("Choose an Evia progress QR, not an observation return QR.");
      const profile = C.attachProgress(state.selectedProfileId, parsed.value);
      closeQrScanner();
      state.course = await C.loadCourse(profile.courseRouteId);
      toast(parsed.courseOnly ? "Course added. Scan a full Evia progress QR when available." : "Evia course progress imported.");
      render();
    } catch (error) {
      setQrStatus(error.message || "The QR code could not be imported.", true);
      throw error;
    }
  }

  function currentProgressMetrics(profile, course, snapshot) {
    if (!snapshot) return C.metricsFor(profile, course);
    return C.metricsFor(Object.assign({}, profile, { snapshots: [snapshot] }), course);
  }

  function copyFields(draft, values, names, multiline) {
    names.forEach((name) => {
      draft[name] = multiline && multiline.includes(name)
        ? C.cleanMultiline(values[name], 6000)
        : C.cleanText(values[name], 240);
    });
  }

  function collectReviewTargets() {
    const draft = state.reviewDraft;
    const form = app.querySelector('form[data-form="review-targets"]');
    if (!draft || !form) return;
    draft.targets = Array.from(form.querySelectorAll(".milos-target-edit-row")).map((row) => ({
      id: (draft.targets[Number(row.dataset.targetIndex)] || {}).id || C.uid("target"),
      title: C.cleanText(row.querySelector('[name="targetTitle"]')?.value, 220),
      code: C.cleanText(row.querySelector('[name="targetCode"]')?.value, 32).toUpperCase(),
      dueDate: C.validDate(row.querySelector('[name="targetDue"]')?.value),
      status: "Agreed",
    })).filter((target) => target.title);
    draft.nextReviewDate = C.validDate(form.elements.nextReviewDate && form.elements.nextReviewDate.value);
  }

  async function startReview(profileId) {
    try {
      const profile = C.getProfile(profileId || state.selectedProfileId);
      if (!profile) throw new Error("Choose a learner first.");
      if (!profile.courseRouteId) throw new Error("Set the learner's course or scan their Evia progress QR first.");
      state.selectedProfileId = profile.id;
      state.course = await C.loadCourse(profile.courseRouteId);
      const latest = C.latestSnapshot(profile);
      const previous = C.reviewsForProfile(profile.id)[0];
      const assessor = settings();
      const inheritedTargets = latest && latest.targets && latest.targets.length
        ? latest.targets
        : [{ id: C.uid("target"), title: "", code: "", dueDate: C.addWeeks(today(), 4), status: "Agreed" }];
      state.reviewDraft = {
        step: 0,
        profileId: profile.id,
        courseRouteId: profile.courseRouteId,
        reviewDate: today(),
        nextReviewDate: C.addWeeks(today(), 12),
        meetingFormat: "Face to face",
        location: "",
        providerName: assessor.assessorName || "",
        employerName: "",
        employerAttendance: "Attended",
        employerContribution: "",
        previousActions: previous && previous.targets && previous.targets.length ? previous.targets.map((target) => target.title).join("; ") : "",
        trainingEvidence: "",
        overallProgress: "",
        learningProgress: "",
        qualifications: "",
        trainingPlanChanges: "",
        overallStatus: "On track",
        supportNeeds: "",
        wellbeing: "",
        apprenticeComments: "",
        employerComments: "",
        providerComments: "",
        targets: inheritedTargets.map((target) => ({ id: target.id || C.uid("target"), title: target.title || "", code: target.code || "", dueDate: target.dueDate || "", status: "Agreed" })),
        snapshot: latest || {},
        newCodes: [],
        signatures: {},
        createdAt: Date.now(),
      };
      state.completedReview = null;
      navigate("review-wizard", "reviews");
    } catch (error) { toast(error.message || "The review could not be started.", "error"); }
  }

  async function startObservation(profileId) {
    try {
      const profile = C.getProfile(profileId || state.selectedProfileId);
      if (!profile) throw new Error("Choose a learner first.");
      if (!profile.courseRouteId) throw new Error("Set the learner's course or scan their Evia progress QR first.");
      state.selectedProfileId = profile.id;
      state.course = await C.loadCourse(profile.courseRouteId);
      if (!state.course.siteData || !state.course.siteData.length) throw new Error("This course does not yet contain Evia observation routes.");
      const assessor = settings();
      state.observationDraft = {
        step: 0,
        profileId: profile.id,
        publicId: C.uid("obs").slice(0, 72),
        courseRouteId: profile.courseRouteId,
        coverageLabel: state.course.coverageLabel,
        snapshot: C.latestSnapshot(profile) || {},
        observationDate: today(),
        startTime: "",
        endTime: "",
        location: "",
        categoryId: "",
        categoryTitle: "",
        jobId: "",
        jobTitle: "",
        opportunityId: "",
        opportunityTitle: "",
        instruction: "",
        question: "",
        criteria: [],
        media: [],
        activityObserved: "",
        safetyNotes: "",
        qualityNotes: "",
        questionsAndAnswers: "",
        feedback: "",
        actions: "",
        rating: "Competent",
        assessorName: assessor.assessorName || "",
        signature: null,
        learnerSignature: null,
        createdAt: Date.now(),
      };
      state.completedObservation = null;
      navigate("observation-wizard", "observations");
    } catch (error) { toast(error.message || "The observation could not be started.", "error"); }
  }

  async function handleReviewSubmit(kind, form, values) {
    const draft = state.reviewDraft;
    if (!draft) throw new Error("The review draft is no longer available.");
    if (kind === "review-meeting") {
      copyFields(draft, values, ["meetingFormat", "location", "providerName", "employerName", "employerAttendance", "employerContribution"], ["employerContribution"]);
      draft.reviewDate = C.validDate(values.reviewDate);
      if (!draft.reviewDate || !draft.providerName) throw new Error("Add the review date and provider representative.");
      draft.step = 2;
    } else if (kind === "review-progress") {
      const fields = ["previousActions", "trainingEvidence", "overallProgress", "learningProgress", "qualifications", "trainingPlanChanges", "overallStatus"];
      copyFields(draft, values, fields, fields);
      if (!draft.previousActions || !draft.trainingEvidence || !draft.overallProgress || !draft.learningProgress || !draft.trainingPlanChanges) throw new Error("Complete each required progress field.");
      draft.step = 3;
    } else if (kind === "review-support") {
      const fields = ["supportNeeds", "wellbeing", "apprenticeComments", "employerComments", "providerComments"];
      copyFields(draft, values, fields, fields);
      if (!draft.supportNeeds || !draft.wellbeing || !draft.apprenticeComments || !draft.providerComments) throw new Error("Complete each required support and contribution field.");
      draft.step = 4;
    } else if (kind === "review-targets") {
      collectReviewTargets();
      if (!draft.targets.length) throw new Error("Add at least one agreed action.");
      if (!draft.nextReviewDate) throw new Error("Choose the next review date.");
      draft.step = 5;
    }
    render();
  }

  async function handleObservationSubmit(kind, form, values) {
    const draft = state.observationDraft;
    if (!draft) throw new Error("The observation draft is no longer available.");
    if (kind === "observation-criteria") {
      const chosen = [];
      form.querySelectorAll("[data-criterion-include]").forEach((checkbox) => {
        if (!checkbox.checked) return;
        const index = Number(checkbox.dataset.index);
        const current = draft.criteria[index];
        const outcome = form.querySelector(`[data-criterion-outcome][data-index="${index}"]`)?.value || "Observed";
        if (current) chosen.push(Object.assign({}, current, { included: true, outcome: C.cleanText(outcome, 40) }));
      });
      if (!chosen.length) throw new Error(`Select at least one ${state.course.coverageLabel} item for this observation.`);
      draft.criteria = chosen;
      draft.step = 5;
    } else if (kind === "observation-record") {
      captureObservationRecord(form, values);
      const required = ["observationDate", "activityObserved", "safetyNotes", "qualityNotes", "feedback", "rating"];
      if (required.some((name) => !draft[name])) throw new Error("Complete each required observation field.");
      draft.step = 6;
    }
    render();
  }

  async function handleReviewAction(action, button) {
    try {
      const draft = state.reviewDraft;
      if (action === "review-next") {
        if (!draft) throw new Error("The review draft is no longer available.");
        draft.step = Math.min(5, Number(draft.step || 0) + 1);
        render();
        return;
      }
      if (action === "review-add-target") {
        collectReviewTargets();
        state.reviewDraft.targets.push({ id: C.uid("target"), title: "", code: "", dueDate: C.addWeeks(today(), 4), status: "Agreed" });
        render();
        return;
      }
      if (action === "review-remove-target") {
        const index = Number(button.dataset.index);
        collectReviewTargets();
        state.reviewDraft.targets.splice(index, 1);
        if (!state.reviewDraft.targets.length) state.reviewDraft.targets.push({ id: C.uid("target"), title: "", code: "", dueDate: "", status: "Agreed" });
        render();
        return;
      }
      if (action === "review-complete") {
        if (!draft || !draft.signatures || !draft.signatures.provider || !draft.signatures.apprentice) throw new Error("Add the provider and apprentice signatures first.");
        const profile = selectedProfile();
        const latest = C.latestSnapshot(profile);
        const record = Object.assign({}, draft, { snapshot: latest || draft.snapshot || {}, completedAt: Date.now() });
        delete record.step;
        const saved = C.saveReview(record);
        state.completedReview = saved;
        state.reviewDraft = null;
        navigate("review-complete", "reviews");
        await P.reviewPdf(saved, profile, state.course, currentProgressMetrics(profile, state.course, saved.snapshot));
        toast("Review saved and PDF downloaded.");
        return;
      }
      const record = reviews().find((item) => item.id === button.dataset.id);
      if (!record) throw new Error("That review is no longer available.");
      const profile = C.getProfile(record.profileId);
      if (!profile) throw new Error("The learner profile for this review was removed.");
      state.selectedProfileId = profile.id;
      state.course = await C.loadCourse(record.courseRouteId || profile.courseRouteId);
      state.completedReview = record;
      if (action === "review-history") { navigate("review-complete", "reviews"); return; }
      if (action === "review-download") {
        await P.reviewPdf(record, profile, state.course, currentProgressMetrics(profile, state.course, record.snapshot));
        toast("Review PDF downloaded.");
      }
    } catch (error) { toast(error.message || "That review action could not be completed.", "error"); }
  }

  function captureObservationRecord(form, suppliedValues) {
    const draft = state.observationDraft;
    if (!draft || !form) return;
    const values = suppliedValues || formObject(form);
    const fields = ["location", "activityObserved", "safetyNotes", "qualityNotes", "questionsAndAnswers", "feedback", "actions", "rating"];
    copyFields(draft, values, fields, ["activityObserved", "safetyNotes", "qualityNotes", "questionsAndAnswers", "feedback", "actions"]);
    draft.observationDate = C.validDate(values.observationDate);
    draft.startTime = /^\d{2}:\d{2}$/.test(values.startTime || "") ? values.startTime : "";
    draft.endTime = /^\d{2}:\d{2}$/.test(values.endTime || "") ? values.endTime : "";
  }

  async function handleObservationAction(action, button) {
    try {
      const draft = state.observationDraft;
      if (action === "observation-next") {
        if (!draft) throw new Error("The observation draft is no longer available.");
        draft.step = Math.min(6, Number(draft.step || 0) + 1);
        render();
        return;
      }
      if (["observation-category", "observation-job", "observation-opportunity"].includes(action)) {
        if (!draft || !state.course) throw new Error("The observation draft is no longer available.");
        const selected = observationSelection(draft, state.course);
        if (action === "observation-category") {
          const category = selected.categories.find((item) => item.id === button.dataset.id);
          if (!category) throw new Error("That course category was not found.");
          Object.assign(draft, { categoryId: category.id, categoryTitle: category.title, jobId: "", jobTitle: "", opportunityId: "", opportunityTitle: "", criteria: [], step: 2 });
        } else if (action === "observation-job") {
          const job = selected.jobs.find((item) => item.id === button.dataset.id);
          if (!job) throw new Error("That job route was not found.");
          Object.assign(draft, { jobId: job.id, jobTitle: job.title, opportunityId: "", opportunityTitle: "", criteria: [], step: 3 });
        } else {
          const opportunity = selected.opportunities.find((item) => item.id === button.dataset.id);
          if (!opportunity) throw new Error("That observation opportunity was not found.");
          const codes = C.cleanCodes(opportunity.codes || []).filter((code) => !state.course.codes.length || state.course.codes.includes(code));
          Object.assign(draft, {
            opportunityId: opportunity.id,
            opportunityTitle: opportunity.title,
            instruction: opportunity.instruction || "",
            question: opportunity.question || "",
            criteria: codes.map((code) => ({ code, description: state.course.descriptions[code] || "Course criterion", outcome: "Observed", included: true })),
            step: 4,
          });
          if (!draft.criteria.length) throw new Error(`This opportunity has no valid ${state.course.coverageLabel} mapping.`);
        }
        render();
        return;
      }
      if (action === "observation-remove-media") {
        const form = app.querySelector('form[data-form="observation-record"]');
        if (form) captureObservationRecord(form);
        await M.removeFile(button.dataset.id);
        state.observationDraft.media = (state.observationDraft.media || []).filter((item) => item.id !== button.dataset.id);
        render();
        toast("Media removed.");
        return;
      }
      if (action === "observation-complete") {
        if (!draft || !draft.signature || !draft.signature.dataUrl) throw new Error("Add the assessor signature first.");
        const observedCodes = C.cleanCodes((draft.criteria || []).filter((item) => item.outcome === "Observed").map((item) => item.code));
        if (!observedCodes.length) throw new Error(`Mark at least one ${state.course.coverageLabel} item as Observed before creating the Evia QR.`);
        const profile = selectedProfile();
        const eviaSnapshot = C.latestSnapshot(profile);
        if (!eviaSnapshot || !eviaSnapshot.sharedId) throw new Error("Scan a full Evia progress QR before completing the observation so Evia can match the return result.");
        let saved = C.saveObservation(Object.assign({}, draft, { step: undefined, observedCodes, eviaSharedId: eviaSnapshot.sharedId, completedAt: Date.now() }));
        const qrPayload = Q.observationPayload(saved, profile, state.course);
        saved = C.saveObservation(Object.assign({}, saved, { qrPayload }));
        state.completedObservation = saved;
        state.observationDraft = null;
        navigate("observation-complete", "observations");
        await P.observationPdf(saved, profile, state.course, qrPayload);
        toast("Observation saved, QR created and PDF downloaded.");
        return;
      }
      const record = observations().find((item) => item.id === button.dataset.id);
      if (!record) throw new Error("That observation is no longer available.");
      const profile = C.getProfile(record.profileId);
      if (!profile) throw new Error("The learner profile for this observation was removed.");
      state.selectedProfileId = profile.id;
      state.course = await C.loadCourse(record.courseRouteId || profile.courseRouteId);
      state.completedObservation = record;
      if (action === "observation-history") { navigate("observation-complete", "observations"); return; }
      if (action === "observation-download") {
        await P.observationPdf(record, profile, state.course, record.qrPayload || Q.observationPayload(record, profile, state.course));
        toast("Observation PDF downloaded.");
        return;
      }
      if (action === "observation-download-qr") {
        const container = document.getElementById("completedObservationQr");
        if (!container) throw new Error("Open the completed observation before saving its QR.");
        Q.download(container, `${firstName(profile.name)}-Milos-Observation-QR.png`);
        toast("Observation QR image saved.");
      }
    } catch (error) { toast(error.message || "That observation action could not be completed.", "error"); }
  }

  async function addObservationMedia(input) {
    try {
      const draft = state.observationDraft;
      if (!draft) throw new Error("The observation draft is no longer available.");
      const files = Array.from(input.files || []);
      input.value = "";
      if (!files.length) return;
      const form = app.querySelector('form[data-form="observation-record"]');
      if (form) captureObservationRecord(form);
      if (files.some((file) => !/^(image|video|audio)\//.test(file.type || ""))) throw new Error("Choose photo, video or audio evidence only.");
      if (files.some((file) => file.size > 100 * 1024 * 1024)) throw new Error("Each media file must be smaller than 100 MB.");
      const existingSize = (draft.media || []).reduce((total, item) => total + Number(item.size || 0), 0);
      const newSize = files.reduce((total, file) => total + Number(file.size || 0), 0);
      if (existingSize + newSize > 500 * 1024 * 1024) throw new Error("This observation has reached the 500 MB local media limit.");
      toast("Saving media on this device…");
      const stored = await M.putFiles(files);
      draft.media = [...(draft.media || []), ...stored].slice(0, 30);
      render();
      toast(`${stored.length} media ${stored.length === 1 ? "file" : "files"} added.`);
    } catch (error) { toast(error.message || "The media could not be added.", "error"); }
  }
})(window);
