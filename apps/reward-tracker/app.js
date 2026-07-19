import { callApi } from "../shared/api.js";

// Same key Parent Dashboard uses - a parent already logged in there on this
// device is automatically logged in here too, since both apps share an
// origin (just a different path) and localStorage is scoped per-origin.
const TOKEN_KEY = "homelife_parent_token";
const DARK_MODE_KEY = "homelife_reward_dark_mode";
const PIN_PROTECTION_KEY = "homelife_reward_pin_protection";
const PIN_UNLOCK_MS = 5 * 60 * 1000;
const UNDO_TOAST_MS = 5000;
const SPIN_SOUND_KEY = "homelife_spin_sound"; // stores a preset name now, not "0"/"1" - see spinSoundPreset()
const SPIN_DURATION_KEY = "homelife_spin_duration";
const SPIN_DURATION_DEFAULT = 2.6;
const SPIN_DURATION_MIN = 2;
const SPIN_DURATION_MAX = 8;

// kids has no colour column - assigned client-side by position instead, so
// it's stable across loads without needing a schema change just for this.
const KID_PALETTE = ["#ff5c8a", "#009688", "#7d5fff", "#f2994a", "#2196f3", "#8bc34a"];

// Spin sound presets - "off" is handled separately (no config needed), the
// rest are named tick-tone + landing-tone configs for playTone(). "chimes"
// is the original sound, kept as the default so nobody's existing
// preference silently changes.
const SPIN_SOUND_PRESETS = {
  chimes: {
    tick: { freq: 500, type: "square", gain: 0.05 },
    landing: [
      { freq: 660, type: "sine", dur: 0.18, gain: 0.16, delay: 0 },
      { freq: 880, type: "sine", dur: 0.25, gain: 0.16, delay: 0.08 },
    ],
  },
  arcade: {
    tick: { freq: 720, type: "sawtooth", gain: 0.045 },
    landing: [
      { freq: 523, type: "square", dur: 0.12, gain: 0.14, delay: 0 },
      { freq: 659, type: "square", dur: 0.12, gain: 0.14, delay: 0.1 },
      { freq: 784, type: "square", dur: 0.2, gain: 0.15, delay: 0.2 },
    ],
  },
  retro: {
    tick: { freq: 380, type: "square", gain: 0.05 },
    landing: [
      { freq: 440, type: "square", dur: 0.1, gain: 0.14, delay: 0 },
      { freq: 440, type: "square", dur: 0.1, gain: 0.14, delay: 0.14 },
    ],
  },
};

// Same fixed 9-icon set the backend validates against - a family picks any
// 3 as an alternative to the 4-digit PIN. A parent sets which 3 in Parent
// Dashboard; this app only ever verifies a guess, never sees the answer.
const PARENT_ICON_SET = [
  { id: "dragon", emoji: "🐉" },
  { id: "castle", emoji: "🏰" },
  { id: "crown", emoji: "👑" },
  { id: "potion", emoji: "🧪" },
  { id: "treasure", emoji: "💰" },
  { id: "ship", emoji: "🏴‍☠️" },
  { id: "owl", emoji: "🦉" },
  { id: "crystal", emoji: "💎" },
  { id: "sword", emoji: "⚔️" },
];

const AVATAR_SUGGESTIONS = ["🌸", "🌟", "🦄", "⭐", "🦁", "🐬", "🚀", "🎨", "🐱", "🐶"];

const gate = document.getElementById("gate");
const codeForm = document.getElementById("codeForm");
const codeInput = document.getElementById("codeInput");
const codeError = document.getElementById("codeError");
const appEl = document.getElementById("app");
const switchFamilyLink = document.getElementById("switchFamilyLink");
const darkModeBtn = document.getElementById("darkModeBtn");
const darkModeIcon = document.getElementById("darkModeIcon");
const settingsBtn = document.getElementById("settingsBtn");
const kidViewBtn = document.getElementById("kidViewBtn");

const menuBtn = document.getElementById("menuBtn");
const menuDropdown = document.getElementById("menuDropdown");
const editModeBtn = document.getElementById("editModeBtn");
const editingBadge = document.getElementById("editingBadge");

const kidPickerRow = document.getElementById("kidPickerRow");
const modeSwitch = document.getElementById("modeSwitch");
const quickView = document.getElementById("quickView");
const spinView = document.getElementById("spinView");
const tableView = document.getElementById("tableView");
const insightsView = document.getElementById("insightsView");
const historyView = document.getElementById("historyView");
const activeKidBanner = document.getElementById("activeKidBanner");
const tileGrid = document.getElementById("tileGrid");
const wheel = document.getElementById("wheel");
const wheelLegend = document.getElementById("wheelLegend");
const spinBtn = document.getElementById("spinBtn");
const spinResult = document.getElementById("spinResult");
const bonusSpinRow = document.getElementById("bonusSpinRow");
const bonusSpinText = document.getElementById("bonusSpinText");
const rewardTable = document.getElementById("rewardTable");
const insightsContent = document.getElementById("insightsContent");
const historyList = document.getElementById("historyList");
const manageCatBtn = document.getElementById("manageCatBtn");

const confirmModal = document.getElementById("confirmModal");
const confirmTextEl = document.getElementById("confirmText");
const confirmYesBtn = document.getElementById("confirmYes");
const confirmNoBtn = document.getElementById("confirmNo");

const manageReasonsBtn2 = document.getElementById("manageReasonsBtn2");

const reasonsModal = document.getElementById("reasonsModal");
const reasonsModalClose = document.getElementById("reasonsModalClose");
const reasonsTypeSwitch = document.getElementById("reasonsTypeSwitch");
const reasonsList = document.getElementById("reasonsList");
const newReasonLabel = document.getElementById("newReasonLabel");
const addReasonBtn = document.getElementById("addReasonBtn");
const reasonsError = document.getElementById("reasonsError");

const catModal = document.getElementById("catModal");
const catModalClose = document.getElementById("catModalClose");
const catList = document.getElementById("catList");
const newCatLabel = document.getElementById("newCatLabel");
const newCatColor = document.getElementById("newCatColor");
const addCatBtn = document.getElementById("addCatBtn");
const catError = document.getElementById("catError");
const catUnusedSummary = document.getElementById("catUnusedSummary");

const spinReasonsList = document.getElementById("spinReasonsList");
const manageSpinReasonsBtn = document.getElementById("manageSpinReasonsBtn");
const spinReasonsModal = document.getElementById("spinReasonsModal");
const spinReasonsModalClose = document.getElementById("spinReasonsModalClose");
const spinReasonsManageList = document.getElementById("spinReasonsManageList");
const newSpinReasonLabel = document.getElementById("newSpinReasonLabel");
const newSpinReasonPeriod = document.getElementById("newSpinReasonPeriod");
const addSpinReasonBtn = document.getElementById("addSpinReasonBtn");
const spinReasonsError = document.getElementById("spinReasonsError");

const pinModal = document.getElementById("pinModal");
const pinModalTitle = document.getElementById("pinModalTitle");
const pinSub = document.getElementById("pinSub");
const pinForm = document.getElementById("pinForm");
const pinInput = document.getElementById("pinInput");
const pinIconsGrid = document.getElementById("pinIconsGrid");
const pinError = document.getElementById("pinError");
const pinCancelBtn = document.getElementById("pinCancelBtn");

const settingsModal = document.getElementById("settingsModal");
const settingsModalClose = document.getElementById("settingsModalClose");
const pinProtectionToggle = document.getElementById("pinProtectionToggle");
const spinSoundPresetSelect = document.getElementById("spinSoundPresetSelect");
const spinDurationSlider = document.getElementById("spinDurationSlider");
const spinDurationValue = document.getElementById("spinDurationValue");
const avatarList = document.getElementById("avatarList");
const resetHistoryBtn = document.getElementById("resetHistoryBtn");

const kidView = document.getElementById("kidView");
const kidViewCards = document.getElementById("kidViewCards");
const kidViewExitBtn = document.getElementById("kidViewExitBtn");

const toastContainer = document.getElementById("toastContainer");

let token = null;
let state = { kids: [], categories: [], balances: {}, history: [], notes: [] };
let reasonsType = "earn";
let insights = [];
let selectedKidId = null;
let mode = "quick";
let tableEditMode = false; // View Mode is the default; Table view only
let kidViewOnlyKidId = null; // set when opened via ?kid=name - Kid View then shows just that one card
let parentAuthMethod = "pin"; // "pin" or "icons" - which the family has chosen, refreshed each loadState()
let pinSelectedIcons = [];

// --- Confirm modal -----------------------------------------------------

let confirmResolve = null;
function askConfirm(text) {
  confirmTextEl.textContent = text;
  confirmModal.classList.remove("hidden");
  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}
confirmYesBtn.addEventListener("click", () => {
  confirmModal.classList.add("hidden");
  if (confirmResolve) confirmResolve(true);
  confirmResolve = null;
});
confirmNoBtn.addEventListener("click", () => {
  confirmModal.classList.add("hidden");
  if (confirmResolve) confirmResolve(false);
  confirmResolve = null;
});

// --- PIN lock ------------------------------------------------------------
// Gates Spend, deleting a category, Reset, and leaving Kid View. Earn is
// always unlocked. The unlock is in-memory only (not persisted), so it
// naturally resets on reload as well as after 5 minutes.

let pinUnlockedUntil = 0;
let pinResolve = null;

function pinProtectionOn() {
  return localStorage.getItem(PIN_PROTECTION_KEY) !== "0"; // on by default
}

// Migrates the old on/off boolean ("0"/"1") to a preset name - anything
// already stored as "0" becomes "off", "1" or unset becomes the default
// "chimes" preset (the original sound), any valid preset name (including
// "off" itself) passes through unchanged.
function spinSoundPreset() {
  const raw = localStorage.getItem(SPIN_SOUND_KEY);
  // Object.hasOwn (not `in`) - `in` walks the prototype chain, so a stored
  // value like "toString" would otherwise pass as a "valid" preset name.
  if (raw === "off" || Object.hasOwn(SPIN_SOUND_PRESETS, raw || "")) return raw;
  return raw === "0" ? "off" : "chimes";
}

function getSpinDurationSeconds() {
  const raw = localStorage.getItem(SPIN_DURATION_KEY);
  if (raw === null) return SPIN_DURATION_DEFAULT; // Number(null) is 0, not NaN - handle "never set" explicitly
  const stored = Number(raw);
  if (!Number.isFinite(stored)) return SPIN_DURATION_DEFAULT;
  return Math.min(SPIN_DURATION_MAX, Math.max(SPIN_DURATION_MIN, stored));
}

function requirePin(title, run) {
  if (!pinProtectionOn() || Date.now() < pinUnlockedUntil) {
    run();
    return;
  }
  const usingIcons = parentAuthMethod === "icons";
  pinModalTitle.textContent = title;
  pinSub.textContent = usingIcons ? "Pick the 3 parent icons (any order)." : "A parent's 4-digit PIN is needed for this.";
  pinError.classList.add("hidden");
  pinForm.classList.toggle("hidden", usingIcons);
  pinIconsGrid.classList.toggle("hidden", !usingIcons);
  if (usingIcons) {
    pinSelectedIcons = [];
    renderPinIconsGrid();
  } else {
    pinInput.value = "";
    setTimeout(() => pinInput.focus(), 50);
  }
  pinModal.classList.remove("hidden");
  pinResolve = run;
}

// Shared by both methods - a successful check unlocks for PIN_UNLOCK_MS and
// runs whatever action was waiting; a failed one reports the error but
// leaves the modal open so the parent can try again.
async function submitParentSecret(payload) {
  const res = await callApi("verify_pin", { token, ...payload });
  if (!res.ok) return false;
  pinUnlockedUntil = Date.now() + PIN_UNLOCK_MS;
  pinModal.classList.add("hidden");
  const run = pinResolve;
  pinResolve = null;
  if (run) run();
  return true;
}

pinForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pin = pinInput.value.trim();
  if (!pin) return;
  const btn = pinForm.querySelector(".pinSubmit");
  btn.disabled = true;
  const ok = await submitParentSecret({ pin });
  btn.disabled = false;
  if (!ok) {
    pinError.textContent = "Wrong PIN. Try again.";
    pinError.classList.remove("hidden");
    pinInput.value = "";
    pinInput.focus();
  }
});

function shuffledIconSet() {
  const arr = [...PARENT_ICON_SET];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function renderPinIconsGrid() {
  pinIconsGrid.innerHTML = "";
  shuffledIconSet().forEach((icon) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.id = icon.id;
    btn.textContent = icon.emoji;
    btn.classList.toggle("selected", pinSelectedIcons.includes(icon.id));
    btn.addEventListener("click", () => onPinIconTap(icon.id));
    pinIconsGrid.appendChild(btn);
  });
}

async function onPinIconTap(iconId) {
  pinError.classList.add("hidden");
  if (pinSelectedIcons.includes(iconId)) {
    pinSelectedIcons = pinSelectedIcons.filter((id) => id !== iconId);
    renderPinIconsGrid();
    return;
  }
  if (pinSelectedIcons.length >= 3) return; // ignore a 4th tap rather than replacing one - keeps the gesture simple
  pinSelectedIcons = [...pinSelectedIcons, iconId];
  if (pinSelectedIcons.length < 3) {
    renderPinIconsGrid();
    return;
  }
  // Third icon picked - auto-submit, no separate "unlock" tap needed.
  const ok = await submitParentSecret({ icons: pinSelectedIcons });
  if (!ok) {
    pinError.textContent = "Not quite. Try again.";
    pinError.classList.remove("hidden");
    pinSelectedIcons = [];
    renderPinIconsGrid();
    pinIconsGrid.classList.remove("shake");
    requestAnimationFrame(() => pinIconsGrid.classList.add("shake"));
  }
}

pinCancelBtn.addEventListener("click", () => {
  pinModal.classList.add("hidden");
  pinResolve = null;
  pinSelectedIcons = [];
});

// --- Table View Mode / Edit Mode ------------------------------------------
// View Mode (default) hides the +/- controls so the table reads cleanly;
// Edit Mode brings them back. Purely a display toggle - every tap still
// saves immediately either way, there's no separate "save" step.

editModeBtn.addEventListener("click", () => {
  tableEditMode = !tableEditMode;
  editModeBtn.textContent = tableEditMode ? "Done" : "Edit";
  editModeBtn.classList.toggle("active", tableEditMode);
  editingBadge.classList.toggle("hidden", !tableEditMode);
  renderTable();
});

// --- Overflow menu ---------------------------------------------------------
// Everything that isn't Edit/Done or the menu button itself: Kid View,
// Settings, dark mode, and the two category/reason management screens.

menuBtn.addEventListener("click", () => {
  menuDropdown.classList.toggle("hidden");
});
menuDropdown.addEventListener("click", (e) => {
  if (e.target.closest("button")) menuDropdown.classList.add("hidden");
});
document.addEventListener("click", (e) => {
  if (!menuDropdown.classList.contains("hidden") && !menuDropdown.contains(e.target) && e.target !== menuBtn) {
    menuDropdown.classList.add("hidden");
  }
});

// --- Dark mode -----------------------------------------------------------

function applyDarkMode(on) {
  document.documentElement.classList.toggle("dark", on);
  darkModeIcon.textContent = on ? "☀️" : "🌙";
}
applyDarkMode(localStorage.getItem(DARK_MODE_KEY) === "1");
darkModeBtn.addEventListener("click", () => {
  const on = !document.documentElement.classList.contains("dark");
  localStorage.setItem(DARK_MODE_KEY, on ? "1" : "0");
  applyDarkMode(on);
});

// --- Gate / code entry -----------------------------------------------------

codeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = codeInput.value.trim();
  if (!code) return;
  codeError.classList.add("hidden");
  const btn = codeForm.querySelector(".codeSubmit");
  btn.disabled = true;
  const res = await callApi("redeem_parent_code", { code });
  btn.disabled = false;
  if (!res.ok) {
    codeError.textContent = res.error || "Something went wrong. Try again.";
    codeError.classList.remove("hidden");
    return;
  }
  token = res.data.token;
  localStorage.setItem(TOKEN_KEY, token);
  enterApp();
});

switchFamilyLink.addEventListener("click", async (e) => {
  e.preventDefault();
  const ok = await askConfirm("Switch to a different family's parent code on this device?");
  if (!ok) return;
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
});

async function enterApp() {
  gate.classList.add("hidden");
  appEl.classList.remove("hidden");
  await loadState();
  maybeOpenKidViewFromUrl();
}

// --- Data loading -----------------------------------------------------

async function loadState() {
  const [stateRes, insightsRes, authRes] = await Promise.all([
    callApi("get_reward_state", { token }),
    callApi("get_reward_insights", { token }),
    callApi("get_family_auth_method", { token }),
  ]);
  if (!stateRes.ok) {
    if (stateRes.error === "session_expired") {
      localStorage.removeItem(TOKEN_KEY);
      location.reload();
      return;
    }
    return;
  }
  state = stateRes.data;
  insights = insightsRes.ok ? insightsRes.data.insights : [];
  if (authRes.ok) parentAuthMethod = authRes.data.method;
  if (!selectedKidId || !state.kids.some((k) => k.id === selectedKidId)) {
    selectedKidId = state.kids[0]?.id || null;
  }
  renderAll();
  if (!kidView.classList.contains("hidden")) renderKidView();
}

function kidColour(kidId) {
  const kid = state.kids.find((k) => k.id === kidId);
  if (kid?.theme_color) return kid.theme_color;
  const idx = state.kids.findIndex((k) => k.id === kidId);
  return KID_PALETTE[idx % KID_PALETTE.length] || "#888";
}

function balanceFor(kidId, categoryId) {
  return state.balances[kidId]?.[categoryId]?.balance || 0;
}
function totalFor(kidId) {
  const byCategory = state.balances[kidId] || {};
  return Object.values(byCategory).reduce((sum, c) => sum + c.balance, 0);
}

// --- Rendering -----------------------------------------------------

function renderAll() {
  updateHeaderForMode();
  renderKidPicker();
  renderActiveKidBanner();
  renderRewardRows();
  renderWheel();
  renderBonusSpinRow();
  renderSpinReasonsList();
  renderTable();
  renderInsights();
  renderHistory();
}

// No per-kid total here (deliberately) - it's still visible in Table view's
// columns and the Insights tab, so the compact picker doesn't need to
// duplicate it, keeping each chip (and the header row) as small as possible.
function renderKidPicker() {
  kidPickerRow.innerHTML = "";
  state.kids.forEach((kid) => {
    const btn = document.createElement("button");
    btn.className = "kidChip" + (kid.id === selectedKidId ? " selected" : "");
    btn.style.setProperty("--kid-colour", kidColour(kid.id));
    btn.innerHTML = `<span class="kidChipAvatar">${kid.avatar_emoji || "⭐"}</span><span>${escapeHtml(kid.name)}</span>`;
    btn.addEventListener("click", () => {
      selectedKidId = kid.id;
      renderAll();
    });
    kidPickerRow.appendChild(btn);
  });
}

modeSwitch.querySelectorAll(".modeBtn").forEach((btn) => {
  btn.addEventListener("click", () => {
    mode = btn.dataset.mode;
    modeSwitch.querySelectorAll(".modeBtn").forEach((b) => b.classList.toggle("active", b === btn));
    quickView.classList.toggle("hidden", mode !== "quick");
    spinView.classList.toggle("hidden", mode !== "spin");
    tableView.classList.toggle("hidden", mode !== "table");
    insightsView.classList.toggle("hidden", mode !== "insights");
    historyView.classList.toggle("hidden", mode !== "history");
    renderActiveKidBanner();
    updateHeaderForMode();
    // wheel.clientWidth reads 0 while #spinView has display:none, so any
    // renderWheel() that ran while this tab was hidden positioned the
    // wedge labels using the 300px fallback - re-render now that the
    // section is actually visible and its real size can be measured.
    if (mode === "spin") renderWheel();
  });
});

// The sticky app bar's kid picker only makes sense for Quick Tap/Spin
// (one active kid at a time); Table view shows every kid as its own
// column instead, so it gets Edit/Done there rather than a kid picker.
function updateHeaderForMode() {
  kidPickerRow.classList.toggle("hidden", mode !== "quick" && mode !== "spin");
  editModeBtn.classList.toggle("hidden", mode !== "table");
}

// Shared by Quick Tap and Spin - both act on selectedKidId, so both show
// "who this affects" the same way. Hidden for Table/Insights/History,
// which aren't single-kid-at-a-time interactions.
function renderActiveKidBanner() {
  const kid = state.kids.find((k) => k.id === selectedKidId);
  appEl.style.setProperty("--kid-colour", kid ? kidColour(kid.id) : "#888");
  activeKidBanner.classList.toggle("hidden", !kid || (mode !== "quick" && mode !== "spin"));
  if (!kid) return;
  const verb = mode === "spin" ? "Spinning for" : "Now tapping rewards for";
  activeKidBanner.innerHTML = `<span class="activeKidAvatar">${kid.avatar_emoji || "⭐"}</span> ${verb} <strong>${escapeHtml(kid.name)}</strong>`;
}

// Each row has its own +/- so a tap is one click instead of toggling an
// Earn/Spend mode first, then tapping the category.
function renderRewardRows() {
  tileGrid.innerHTML = "";
  if (!selectedKidId) return;
  const kidId = selectedKidId;
  state.categories.forEach((cat) => {
    const row = document.createElement("div");
    row.className = "rewardRow";
    row.style.setProperty("--tile-colour", cat.color);
    row.innerHTML = `
      <span class="rewardSwatch"></span>
      <span class="rewardLabel">${escapeHtml(cat.label)}</span>
      <span class="rewardBalance">${balanceFor(kidId, cat.id)}</span>
      <button type="button" class="rewardBtn rewardMinus" data-cat="${cat.id}">−</button>
      <button type="button" class="rewardBtn rewardPlus" data-cat="${cat.id}">+</button>
    `;
    row.querySelector(".rewardMinus").addEventListener("click", () => tapReward(kidId, cat.id, "spend"));
    row.querySelector(".rewardPlus").addEventListener("click", () => tapReward(kidId, cat.id, "earn"));
    tileGrid.appendChild(row);
  });
}

// --- Spin wheel: one wedge per reward category, coloured the same as
// everywhere else. Landing logs a real earn exactly like tapping + does -
// except landing on "Spin twice" (the seeded default category, meaning
// "spin the wheel two more times") triggers two bonus spins instead of a
// literal +1 tally entry for it, since that's what it actually represents.
let wheelRotation = 0;
let spinning = false;
let winningCategoryId = null;
let wheelWedges = []; // [{ cat, start, end }] in degrees - kept in sync with the rendered wheel for weighted landing
const MAX_SPINS_PER_ROUND = 25; // safety cap against a runaway chain (e.g. every category renamed to "Spin twice")

// --- Spin sound - synthesized with Web Audio, no sound files needed. A
// series of ticks that spread out over the spin (like a wheel clicking
// past pegs, slowing down), then a two-note chime on landing. ---------

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(ctx, freq, startTime, duration, type, peakGain) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function playSpinTicks(durationSeconds) {
  const preset = SPIN_SOUND_PRESETS[spinSoundPreset()];
  if (!preset) return; // "off"
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  const tickCount = Math.round(10 + durationSeconds * 4); // more ticks for a longer spin
  for (let i = 0; i < tickCount; i++) {
    const t = i / tickCount;
    const eased = 1 - (1 - t) * (1 - t); // spreads ticks out near the end, matching the wheel's own deceleration
    playTone(ctx, preset.tick.freq, now + eased * durationSeconds, 0.04, preset.tick.type, preset.tick.gain);
  }
}

function playLandingChime() {
  const preset = SPIN_SOUND_PRESETS[spinSoundPreset()];
  if (!preset) return; // "off"
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  preset.landing.forEach((tone) => playTone(ctx, tone.freq, now + tone.delay, tone.dur, tone.type, tone.gain));
}

// Wedge width is proportional to spin_weight, so a plain uniform-random
// landing angle is already correctly weighted - no separate weighted-pick
// step needed, the geometry does it.
function renderWheel() {
  const cats = state.categories;
  wheelLegend.innerHTML = "";
  wheel.querySelectorAll(".wheelLabel").forEach((el) => el.remove());
  wheelWedges = [];
  if (!cats.length) {
    wheel.style.background = "var(--line)";
    spinBtn.disabled = true;
    return;
  }
  const totalWeight = cats.reduce((sum, cat) => sum + (cat.spin_weight || 1), 0);
  const stops = [];
  let angle = 0;
  cats.forEach((cat) => {
    const span = ((cat.spin_weight || 1) / totalWeight) * 360;
    stops.push(`${cat.color} ${angle}deg ${angle + span}deg`);
    wheelWedges.push({ cat, start: angle, end: angle + span });
    angle += span;
  });
  wheel.style.background = `conic-gradient(${stops.join(", ")})`;

  // Labels are children of #wheel itself, so they rotate together with it
  // during a spin (no separate animation to keep in sync) - positioned
  // radially at each wedge's middle angle, at ~62% of the wheel's radius.
  // Computed in JS (not a CSS percentage) since translate() on a
  // top:50%/left:50% element is relative to the label's own box, not the
  // wheel's - and .wheelWrap's size is itself responsive (min(320px, 88vw)).
  const wheelRadiusPx = (wheel.clientWidth || 300) / 2;
  const labelRadiusPx = wheelRadiusPx * 0.62;
  cats.forEach((cat, i) => {
    const wedge = wheelWedges[i];
    const midAngle = (wedge.start + wedge.end) / 2;
    const label = document.createElement("span");
    label.className = "wheelLabel";
    label.textContent = cat.label;
    label.style.transform = `rotate(${midAngle}deg) translateY(-${labelRadiusPx}px) rotate(${-midAngle}deg) translate(-50%, -50%)`;
    wheel.appendChild(label);
  });

  cats.forEach((cat) => {
    const item = document.createElement("span");
    item.className = "wheelLegendItem" + (cat.id === winningCategoryId ? " winning" : "");
    item.dataset.cat = cat.id;
    item.innerHTML = `<span class="catSwatch" style="background:${cat.color}"></span>${escapeHtml(cat.label)}`;
    wheelLegend.appendChild(item);
  });
  spinBtn.disabled = !selectedKidId || spinning;
  spinBtn.classList.toggle("hidden", spinning);
}

spinBtn.addEventListener("click", () => spin());

function renderBonusSpinRow() {
  const kid = state.kids.find((k) => k.id === selectedKidId);
  const count = kid?.bonus_spins || 0;
  bonusSpinRow.classList.toggle("hidden", count === 0);
  bonusSpinText.textContent = `${count} bonus spin${count === 1 ? "" : "s"} available`;
}

const SPIN_REASON_PERIOD_LABEL = { daily: "once a day", weekly: "once a week", monthly: "once a month" };

// The "tick yes" list for the currently selected kid - a reason already
// used this period is greyed out rather than hidden, so a parent can still
// see it's configured and when it'll next be available.
function renderSpinReasonsList() {
  spinReasonsList.innerHTML = "";
  const reasons = state.spin_reasons || [];
  if (!reasons.length || !selectedKidId) return;
  const availability = state.spin_credit_availability?.[selectedKidId] || {};
  reasons.forEach((reason) => {
    const available = availability[reason.id] !== false;
    const row = document.createElement("div");
    row.className = "spinReasonRow";
    row.innerHTML = `
      <div class="spinReasonInfo">
        <span class="spinReasonLabel">${escapeHtml(reason.label)}</span>
        <span class="spinReasonPeriod">${SPIN_REASON_PERIOD_LABEL[reason.period] || "once a week"}</span>
      </div>
      <button type="button" class="spinReasonGrantBtn" data-id="${reason.id}" ${available ? "" : "disabled"}>${available ? "Yes!" : "Used"}</button>
    `;
    spinReasonsList.appendChild(row);
  });
  spinReasonsList.querySelectorAll(".spinReasonGrantBtn:not(:disabled)").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const res = await callApi("grant_spin_credit", { token, kid_id: selectedKidId, reason_id: btn.dataset.id });
      if (!res.ok) {
        // A 409 (already_granted_this_period) means another device or app
        // granted this exact reason since our last loadState() - resync to
        // the real "Used" state instead of re-enabling a button that will
        // just 409 again on retry.
        if (res.error === "already_granted_this_period") {
          showErrorToast("Someone already used that one this period.");
          await loadState();
        } else {
          showErrorToast("Couldn't grant that spin - try again.");
          btn.disabled = false;
        }
        return;
      }
      await loadState();
    });
  });
}

async function spin() {
  if (spinning || !selectedKidId) return;
  const kidId = selectedKidId;
  spinning = true;
  spinBtn.disabled = true;
  spinBtn.classList.add("hidden");
  winningCategoryId = null;
  spinResult.classList.add("hidden");

  // Bonus spins earned from named reasons (grant_spin_credit) are
  // consumed as extra automatic spins chained onto this one - same
  // mechanic the "Spin twice" category already uses, just seeded from a
  // server-tracked count instead of a wheel result.
  const consumeRes = await callApi("consume_bonus_spins", { token, kid_id: kidId });
  const bonusSpins = consumeRes.ok ? consumeRes.data.consumed : 0;
  if (bonusSpins > 0) {
    const kid = state.kids.find((k) => k.id === kidId);
    if (kid) kid.bonus_spins = 0;
    renderBonusSpinRow();
  }

  let spinsLeft = 1 + bonusSpins;
  let spinsDone = 0;
  while (spinsLeft > 0 && spinsDone < MAX_SPINS_PER_ROUND) {
    spinsLeft -= 1;
    spinsDone += 1;
    const cat = await runOneSpin();
    if (!cat) break;
    if (cat.label.trim().toLowerCase() === "spin twice") {
      spinResult.textContent = `🎡 ${cat.label} - two more spins coming up!`;
      spinResult.classList.remove("hidden");
      spinsLeft += 2;
      await new Promise((r) => setTimeout(r, 700));
    } else {
      spinResult.textContent = `🎉 ${kidName(kidId)} won ${cat.label}!`;
      spinResult.classList.remove("hidden");
      await tapReward(kidId, cat.id, "earn", `🎡 Spinner: ${cat.label}`);
      if (spinsLeft > 0) await new Promise((r) => setTimeout(r, 900)); // let the result be read before the next bonus spin
    }
  }

  spinning = false;
  spinBtn.disabled = !selectedKidId;
  spinBtn.classList.remove("hidden");
}

// One physical wheel rotation - always spins forward from wherever it
// currently sits (never snaps back), lands under the fixed top pointer.
async function runOneSpin() {
  if (!wheelWedges.length) return null;
  const targetAngle = Math.random() * 360; // uniform - wedge width already encodes weight, so this is correctly weighted by construction
  const wedge = wheelWedges.find((w) => targetAngle >= w.start && targetAngle < w.end) || wheelWedges[wheelWedges.length - 1];
  const cat = wedge.cat;

  const base = ((360 - targetAngle) % 360 + 360) % 360;
  const current = ((wheelRotation % 360) + 360) % 360;
  const forwardDelta = ((base - current) % 360 + 360) % 360;
  wheelRotation += forwardDelta + 4 * 360;
  const duration = getSpinDurationSeconds();
  wheel.style.transitionDuration = `${duration}s`;
  wheel.style.transform = `rotate(${wheelRotation}deg)`;
  playSpinTicks(duration);

  await new Promise((resolve) => {
    const onEnd = () => {
      wheel.removeEventListener("transitionend", onEnd);
      resolve();
    };
    wheel.addEventListener("transitionend", onEnd);
  });

  winningCategoryId = cat.id;
  wheelLegend.querySelectorAll(".wheelLegendItem").forEach((el) => el.classList.toggle("winning", el.dataset.cat === cat.id));
  playLandingChime();
  return cat;
}

function renderTable() {
  if (!state.kids.length) {
    rewardTable.innerHTML = "";
    return;
  }
  let html = "<thead><tr><th>Category</th>";
  state.kids.forEach((kid) => {
    html += `<th style="color:${kidColour(kid.id)}">${kid.avatar_emoji || "⭐"} ${escapeHtml(kid.name)}</th>`;
  });
  html += "</tr></thead><tbody>";
  state.categories.forEach((cat) => {
    html += `<tr><td><span class="catSwatch" style="background:${cat.color}"></span>${escapeHtml(cat.label)}</td>`;
    state.kids.forEach((kid) => {
      const cell = state.balances[kid.id]?.[cat.id] || { earned: 0, spent: 0, balance: 0 };
      // View Mode (default) shows just the number - Edit Mode adds the
      // +/- controls back in. Same cell data either way, just less to look
      // at when the parent's only reading the table, not tapping it.
      const balanceHtml = tableEditMode
        ? `<div class="cellButtons">
            <button type="button" class="cellMinus" data-kid="${kid.id}" data-cat="${cat.id}" data-type="spend">−</button>
            <span class="cellBalance">${cell.balance}</span>
            <button type="button" class="cellPlus" data-kid="${kid.id}" data-cat="${cat.id}" data-type="earn">+</button>
          </div>`
        : `<div class="cellBalance">${cell.balance}</div>`;
      html += `<td>${balanceHtml}<div class="cellSub">earned ${cell.earned} · spent ${cell.spent}</div></td>`;
    });
    html += "</tr>";
  });
  html += "</tbody>";
  rewardTable.innerHTML = html;
  rewardTable.querySelectorAll("button[data-kid]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const { kid, cat, type } = btn.dataset;
      tapReward(kid, cat, type);
    });
  });
}

// --- Insights (fairness view): weekly/monthly earned per kid, all-time
// balance and top category. Bars are coloured by kid identity (the same
// per-kid colour used everywhere else in the app), with the amount and the
// kid's name+avatar as direct labels - no separate legend needed.

function renderBarChart(title, key) {
  const bars = insights
    .map((i) => {
      const kidId = i.kid_id;
      const kid = state.kids.find((k) => k.id === kidId);
      const value = i[key] || 0;
      return { kidId, avatar: kid?.avatar_emoji || "⭐", name: kid?.name || "?", value };
    })
    .filter((b) => state.kids.some((k) => k.id === b.kidId));
  const max = Math.max(1, ...bars.map((b) => b.value));
  const barsHtml = bars
    .map(
      (b) => `
      <div class="barGroup">
        <div class="barValue">${b.value}</div>
        <div class="bar" style="--kid-colour:${kidColour(b.kidId)};height:${Math.max(4, Math.round((b.value / max) * 100))}%"></div>
        <div class="barLabel">${b.avatar} ${escapeHtml(b.name)}</div>
      </div>`
    )
    .join("");
  return `<div class="insightsCard"><p class="insightsTitle">${title}</p><div class="barChart">${barsHtml || '<p class="empty">No data yet.</p>'}</div></div>`;
}

function renderInsights() {
  if (!insightsContent) return;
  if (!insights.length) {
    insightsContent.innerHTML = `<p class="empty">No activity yet.</p>`;
    return;
  }
  const statsRows = insights
    .map((i) => {
      const kid = state.kids.find((k) => k.id === i.kid_id);
      if (!kid) return "";
      return `
      <div class="insightsStatRow">
        <div class="insightsStatKid" style="color:${kidColour(kid.id)}">${kid.avatar_emoji || "⭐"} ${escapeHtml(kid.name)}</div>
        <div>
          <div class="insightsStatValue">${i.all_time_balance}</div>
          ${i.top_category ? `<div class="insightsTopCat">Top: ${escapeHtml(i.top_category.label)} (${i.top_category.amount})</div>` : ""}
        </div>
      </div>`;
    })
    .join("");

  insightsContent.innerHTML =
    renderBarChart("This week - earned", "weekly_earned") +
    renderBarChart("This month - earned", "monthly_earned") +
    `<div class="insightsCard"><p class="insightsTitle">All-time balance &amp; top category</p>${statsRows}</div>`;
}

function categoryLabel(id) {
  return state.categories.find((c) => c.id === id)?.label || "Unknown";
}
function categoryColour(id) {
  return state.categories.find((c) => c.id === id)?.color || "#888";
}
function kidName(id) {
  return state.kids.find((k) => k.id === id)?.name || "Unknown";
}
function kidAvatar(id) {
  return state.kids.find((k) => k.id === id)?.avatar_emoji || "⭐";
}

function formatWhen(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
}

function renderHistory() {
  historyList.innerHTML = "";
  if (!state.history.length) {
    historyList.innerHTML = `<p class="empty">No activity yet.</p>`;
    return;
  }
  state.history.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "historyRow";
    const sign = entry.delta > 0 ? "+" : "−";
    row.innerHTML = `
      <div class="historyMain">
        <div class="historyLine1" style="color:${kidColour(entry.kid_id)}">${kidAvatar(entry.kid_id)} ${escapeHtml(kidName(entry.kid_id))}</div>
        <div class="historyLine2"><span style="color:${categoryColour(entry.category_id)};font-weight:700">${escapeHtml(categoryLabel(entry.category_id))}</span> ${sign}1 · ${formatWhen(entry.created_at)}${entry.note ? ` · ${escapeHtml(entry.note)}` : ""}</div>
      </div>
      <button type="button" class="undoBtn" data-log="${entry.id}">Undo</button>
    `;
    historyList.appendChild(row);
  });
  historyList.querySelectorAll(".undoBtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = await askConfirm("Undo this entry?");
      if (!ok) return;
      btn.disabled = true;
      const res = await callApi("undo_reward_log", { token, log_id: Number(btn.dataset.log) });
      if (!res.ok) {
        // Previously silent on failure - the button just stayed disabled
        // forever with no feedback, which looks identical to "the button
        // doesn't work" no matter what the actual server-side cause was.
        btn.disabled = false;
        showErrorToast("Couldn't undo that entry - try again.");
        return;
      }
      await loadState();
    });
  });
}

// --- Note modal (earn/spend confirmation with a preset or custom reason) --

// A tap commits immediately - no PIN, no reason prompt, no modal in the
// way. The balance updates optimistically before the network round trip
// even starts, so a tap feels instant regardless of connection speed;
// loadState() below then reconciles with the server's real numbers
// (also picking up anything another device did) without blocking the
// visual update. Undo (5s toast, or History any time after) is the
// safety net that replaces the PIN as protection against a mis-tap.
async function tapReward(kidId, categoryId, type, note = "") {
  const forKid = (state.balances[kidId] ??= {});
  const cell = (forKid[categoryId] ??= { earned: 0, spent: 0, balance: 0 });
  if (type === "earn") {
    cell.earned += 1;
    cell.balance += 1;
  } else {
    cell.spent += 1;
    cell.balance -= 1;
  }
  renderAll();
  const res = await callApi("adjust_reward", { token, kid_id: kidId, category_id: categoryId, type, note });
  if (res.ok && res.data?.entry) showUndoToast(res.data.entry, kidId, categoryId, type);
  loadState();
}

// --- Reward reasons - a family's own customizable preset list. No longer
// shown on every tap (that's the whole point of the change above), but a
// parent can still curate the list here for whenever notes get used again.

manageReasonsBtn2.addEventListener("click", () => openReasonsModal());

function openReasonsModal() {
  reasonsError.classList.add("hidden");
  reasonsTypeSwitch.querySelectorAll(".typeBtn").forEach((b) => b.classList.toggle("active", b.dataset.type === reasonsType));
  renderReasonsList();
  reasonsModal.classList.remove("hidden");
}

reasonsTypeSwitch.querySelectorAll(".typeBtn").forEach((btn) => {
  btn.addEventListener("click", () => {
    reasonsType = btn.dataset.type;
    reasonsTypeSwitch.querySelectorAll(".typeBtn").forEach((b) => b.classList.toggle("active", b === btn));
    renderReasonsList();
  });
});

function renderReasonsList() {
  reasonsList.innerHTML = "";
  state.notes
    .filter((n) => n.type === reasonsType)
    .forEach((note) => {
      const row = document.createElement("div");
      row.className = "catRow";
      row.innerHTML = `
        <span class="reasonLabel">${escapeHtml(note.label)}</span>
        <button type="button" class="catDeleteBtn" data-id="${note.id}">🗑</button>
      `;
      reasonsList.appendChild(row);
    });

  reasonsList.querySelectorAll(".catDeleteBtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await callApi("manage_reward_notes", { token, itemAction: "delete", item_id: btn.dataset.id });
      await loadState();
      renderReasonsList();
    });
  });
}

addReasonBtn.addEventListener("click", async () => {
  const label = newReasonLabel.value.trim();
  reasonsError.classList.add("hidden");
  if (!label) {
    reasonsError.textContent = "Enter a reason first.";
    reasonsError.classList.remove("hidden");
    return;
  }
  await callApi("manage_reward_notes", { token, itemAction: "add", type: reasonsType, label });
  newReasonLabel.value = "";
  await loadState();
  renderReasonsList();
});

reasonsModalClose.addEventListener("click", () => reasonsModal.classList.add("hidden"));

// --- 5-second Undo toast - the fast path for correcting a mis-tap right
// after it happens, without opening History. History+Undo (with its own
// confirm dialog) still covers correcting an older entry.

function showUndoToast(entry, kidId, categoryId, type) {
  const sign = type === "spend" ? "−1" : "+1";
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `
    <div>
      <div>${kidAvatar(kidId)} ${escapeHtml(kidName(kidId))} ${sign} ${escapeHtml(categoryLabel(categoryId))}</div>
      <div class="toastBar"></div>
    </div>
    <button type="button" class="toastUndoBtn">Undo</button>
  `;
  const remove = () => toast.remove();
  const timer = setTimeout(remove, UNDO_TOAST_MS);
  toast.querySelector(".toastUndoBtn").addEventListener("click", async () => {
    clearTimeout(timer);
    remove();
    const res = await callApi("undo_reward_log", { token, log_id: entry.id });
    if (!res.ok) {
      showErrorToast("Couldn't undo that entry - try again.");
      return;
    }
    await loadState();
  });
  toastContainer.appendChild(toast);
}

// Same visual family as the undo toast, minus the undo button and countdown
// bar - a short-lived, self-dismissing way to surface a failure instead of
// letting an action silently do nothing.
function showErrorToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<div>${escapeHtml(message)}</div>`;
  setTimeout(() => toast.remove(), UNDO_TOAST_MS);
  toastContainer.appendChild(toast);
}

// --- Category management -----------------------------------------------

manageCatBtn.addEventListener("click", () => {
  catError.classList.add("hidden");
  renderCatList();
  catModal.classList.remove("hidden");
});
catModalClose.addEventListener("click", () => catModal.classList.add("hidden"));

// A category with zero taps across every kid - earned and spent both 0 - is
// flagged as unused so a parent can spot dead categories worth removing,
// without that being a reason to block or confirm the add/delete itself.
function categoryUsageTotal(catId) {
  return state.kids.reduce((sum, kid) => {
    const cell = state.balances[kid.id]?.[catId];
    return sum + (cell ? cell.earned + cell.spent : 0);
  }, 0);
}

function renderCatList() {
  catList.innerHTML = "";
  const unusedCount = state.categories.filter((cat) => categoryUsageTotal(cat.id) === 0).length;
  catUnusedSummary.classList.toggle("hidden", unusedCount === 0);
  if (unusedCount > 0) {
    catUnusedSummary.textContent = `⚠️ ${unusedCount} ${unusedCount === 1 ? "reward hasn't" : "rewards haven't"} been used yet - marked "Unused" below.`;
  }

  state.categories.forEach((cat) => {
    const unused = categoryUsageTotal(cat.id) === 0;
    const row = document.createElement("div");
    row.className = "catRow";
    const weight = cat.spin_weight || 1;
    row.innerHTML = `
      <input type="color" value="${cat.color}" data-id="${cat.id}" class="catColorInput" />
      <input type="text" value="${escapeAttr(cat.label)}" data-id="${cat.id}" class="catLabelInput" maxlength="60" />
      <select class="catWeightSelect" data-id="${cat.id}" title="Spin wheel odds - higher means more likely to land on this">
        ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${n === weight ? " selected" : ""}>${n}× spin odds</option>`).join("")}
      </select>
      ${unused ? '<span class="catUnusedBadge" title="No kid has earned or spent this reward yet">Unused</span>' : ""}
      <button type="button" class="catDeleteBtn" data-id="${cat.id}">🗑</button>
    `;
    catList.appendChild(row);
  });

  catList.querySelectorAll(".catColorInput").forEach((input) => {
    input.addEventListener("change", () => updateCategory(input.dataset.id, { color: input.value }));
  });
  catList.querySelectorAll(".catWeightSelect").forEach((select) => {
    select.addEventListener("change", () => updateCategory(select.dataset.id, { spin_weight: Number(select.value) }));
  });
  catList.querySelectorAll(".catLabelInput").forEach((input) => {
    input.addEventListener("change", () => {
      const label = input.value.trim();
      if (label) updateCategory(input.dataset.id, { label });
    });
  });
  catList.querySelectorAll(".catDeleteBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      requirePin("PIN needed to delete a category", async () => {
        const ok = await askConfirm("Delete this category? Its history will also be removed.");
        if (!ok) return;
        await callApi("manage_reward_categories", { token, itemAction: "delete", item_id: btn.dataset.id });
        await loadState();
        renderCatList();
      });
    });
  });
}

async function updateCategory(id, patch) {
  await callApi("manage_reward_categories", { token, itemAction: "update", item_id: id, ...patch });
  await loadState();
  renderCatList();
}

addCatBtn.addEventListener("click", async () => {
  const label = newCatLabel.value.trim();
  catError.classList.add("hidden");
  if (!label) {
    catError.textContent = "Enter a category name first.";
    catError.classList.remove("hidden");
    return;
  }
  await callApi("manage_reward_categories", { token, itemAction: "add", label, color: newCatColor.value });
  newCatLabel.value = "";
  await loadState();
  renderCatList();
});

// --- Manage bonus spin reasons ------------------------------------------

manageSpinReasonsBtn.addEventListener("click", () => {
  spinReasonsError.classList.add("hidden");
  renderSpinReasonsManageList();
  spinReasonsModal.classList.remove("hidden");
});
spinReasonsModalClose.addEventListener("click", () => spinReasonsModal.classList.add("hidden"));

function renderSpinReasonsManageList() {
  spinReasonsManageList.innerHTML = "";
  (state.spin_reasons || []).forEach((reason) => {
    const row = document.createElement("div");
    row.className = "catRow";
    // A trigger_key-linked reason (e.g. Bedroom Reset's AI score) is looked
    // up by that key, not by id - deleting it would silently and
    // permanently sever the automated grant with no way to relink it here,
    // so its delete button is replaced with an explanatory lock instead.
    const deleteControl = reason.trigger_key
      ? `<span class="catUnusedBadge" title="Linked to another app (e.g. Bedroom Reset) - can't be deleted here">🔒 Linked</span>`
      : `<button type="button" class="catDeleteBtn" data-id="${reason.id}">🗑</button>`;
    row.innerHTML = `
      <input type="text" value="${escapeAttr(reason.label)}" data-id="${reason.id}" class="catLabelInput" maxlength="60" />
      <select class="catWeightSelect" data-id="${reason.id}" title="How often this reason can grant a bonus spin">
        ${["daily", "weekly", "monthly"]
          .map((p) => `<option value="${p}"${p === reason.period ? " selected" : ""}>${p[0].toUpperCase() + p.slice(1)}</option>`)
          .join("")}
      </select>
      ${deleteControl}
    `;
    spinReasonsManageList.appendChild(row);
  });

  spinReasonsManageList.querySelectorAll(".catLabelInput").forEach((input) => {
    input.addEventListener("change", () => {
      const label = input.value.trim();
      if (label) updateSpinReason(input.dataset.id, { label });
    });
  });
  spinReasonsManageList.querySelectorAll(".catWeightSelect").forEach((select) => {
    select.addEventListener("change", () => updateSpinReason(select.dataset.id, { period: select.value }));
  });
  spinReasonsManageList.querySelectorAll(".catDeleteBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      requirePin("PIN needed to delete a bonus spin reason", async () => {
        const ok = await askConfirm("Delete this bonus spin reason?");
        if (!ok) return;
        const res = await callApi("manage_spin_reasons", { token, itemAction: "delete", item_id: btn.dataset.id });
        if (!res.ok) {
          showErrorToast("Couldn't delete that reason - try again.");
          return;
        }
        await loadState();
        renderSpinReasonsManageList();
      });
    });
  });
}

async function updateSpinReason(id, patch) {
  const res = await callApi("manage_spin_reasons", { token, itemAction: "update", item_id: id, ...patch });
  if (!res.ok) {
    showErrorToast("Couldn't update that reason - try again.");
    renderSpinReasonsManageList(); // revert the input back to the saved value
    return;
  }
  await loadState();
  renderSpinReasonsManageList();
}

addSpinReasonBtn.addEventListener("click", async () => {
  const label = newSpinReasonLabel.value.trim();
  spinReasonsError.classList.add("hidden");
  if (!label) {
    spinReasonsError.textContent = "Enter a reason first.";
    spinReasonsError.classList.remove("hidden");
    return;
  }
  const res = await callApi("manage_spin_reasons", { token, itemAction: "add", label, period: newSpinReasonPeriod.value });
  if (!res.ok) {
    spinReasonsError.textContent = "Couldn't add that reason - try again.";
    spinReasonsError.classList.remove("hidden");
    return;
  }
  newSpinReasonLabel.value = "";
  await loadState();
  renderSpinReasonsManageList();
});

// --- Settings (PIN protection toggle, kid avatars, reset history) ---------

settingsBtn.addEventListener("click", () => {
  pinProtectionToggle.checked = pinProtectionOn();
  spinSoundPresetSelect.value = spinSoundPreset();
  spinDurationSlider.value = String(getSpinDurationSeconds());
  spinDurationValue.textContent = getSpinDurationSeconds();
  renderAvatarList();
  settingsModal.classList.remove("hidden");
});
settingsModalClose.addEventListener("click", () => settingsModal.classList.add("hidden"));

pinProtectionToggle.addEventListener("change", () => {
  localStorage.setItem(PIN_PROTECTION_KEY, pinProtectionToggle.checked ? "1" : "0");
});

spinSoundPresetSelect.addEventListener("change", () => {
  localStorage.setItem(SPIN_SOUND_KEY, spinSoundPresetSelect.value);
});

spinDurationSlider.addEventListener("input", () => {
  localStorage.setItem(SPIN_DURATION_KEY, spinDurationSlider.value);
  spinDurationValue.textContent = spinDurationSlider.value;
});

function renderAvatarList() {
  avatarList.innerHTML = "";
  state.kids.forEach((kid) => {
    const row = document.createElement("div");
    row.className = "avatarRow";
    row.innerHTML = `
      <div class="avatarCurrentBtn">${kid.avatar_emoji || "⭐"}</div>
      <div class="avatarRowName">${escapeHtml(kid.name)}</div>
      <input type="color" class="kidColourInput" value="${kidColour(kid.id)}" data-kid="${kid.id}" title="${escapeAttr(kid.name)}'s colour" />
      <div class="avatarPicker" data-kid="${kid.id}"></div>
    `;
    row.querySelector(".kidColourInput").addEventListener("change", async (e) => {
      await callApi("manage_kid", { token, kidAction: "rename", kid_id: kid.id, color: e.target.value });
      await loadState();
      renderAvatarList();
    });
    const picker = row.querySelector(".avatarPicker");
    AVATAR_SUGGESTIONS.forEach((emoji) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = emoji;
      if (emoji === kid.avatar_emoji) b.classList.add("selected");
      b.addEventListener("click", async () => {
        await callApi("manage_kid", { token, kidAction: "rename", kid_id: kid.id, avatar: emoji });
        await loadState();
        renderAvatarList();
      });
      picker.appendChild(b);
    });
    avatarList.appendChild(row);
  });
}

resetHistoryBtn.addEventListener("click", () => {
  requirePin("PIN needed to reset", async () => {
    const ok = await askConfirm("Reset ALL reward history for every kid? Categories are kept. This can't be undone.");
    if (!ok) return;
    await callApi("reset_reward_history", { token });
    await loadState();
  });
});

// --- Kid View - read-only, giant cards, exit is PIN-gated -----------------

function renderKidView() {
  kidViewCards.innerHTML = "";
  const kids = kidViewOnlyKidId ? state.kids.filter((k) => k.id === kidViewOnlyKidId) : state.kids;
  kids.forEach((kid) => {
    const byCategory = state.categories.map((cat) => ({ cat, balance: balanceFor(kid.id, cat.id) })).filter((c) => c.balance !== 0);
    const card = document.createElement("div");
    card.className = "kidViewCard";
    card.innerHTML = `
      <div class="kidViewAvatar">${kid.avatar_emoji || "⭐"}</div>
      <div class="kidViewName" style="color:${kidColour(kid.id)}">${escapeHtml(kid.name)}</div>
      <div class="kidViewBalance">${totalFor(kid.id)}</div>
      <div class="kidViewCategories">
        ${byCategory
          .map(
            (c) =>
              `<div class="kidViewCatRow"><span><span class="catSwatch" style="background:${c.cat.color}"></span>${escapeHtml(c.cat.label)}</span><span>${c.balance}</span></div>`
          )
          .join("") || '<p class="empty">No activity yet.</p>'}
      </div>
    `;
    kidViewCards.appendChild(card);
  });
}

function openKidView() {
  renderKidView();
  kidView.classList.remove("hidden");
}

kidViewBtn.addEventListener("click", () => {
  kidViewOnlyKidId = null;
  openKidView();
});

kidViewExitBtn.addEventListener("click", () => {
  requirePin("PIN needed to exit Kid View", () => {
    kidView.classList.add("hidden");
  });
});

function maybeOpenKidViewFromUrl() {
  const name = new URLSearchParams(location.search).get("kid");
  if (!name) return;
  const kid = state.kids.find((k) => k.name.toLowerCase() === name.toLowerCase());
  if (!kid) return;
  kidViewOnlyKidId = kid.id;
  openKidView();
}

// --- Utilities -----------------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}

// --- Boot -----------------------------------------------------

token = localStorage.getItem(TOKEN_KEY);
if (token) enterApp();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}
