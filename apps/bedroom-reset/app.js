import { LEVELS, levelForPoints, nextLevel, BADGES, earnedBadges } from "../shared/config.js";
import { callApi } from "../shared/api.js";
import { compressImage } from "../shared/image.js";

const DEVICE_TOKEN_KEY = "homelife_kid_token";
const DEVICE_NAME_KEY = "homelife_kid_name";
const DEVICE_AVATAR_KEY = "homelife_kid_avatar";
const CHECKLIST_KEY_PREFIX = "bedroom-reset-checklist-v8:";
const STREAK_CACHE_KEY_PREFIX = "bedroom-reset-streak-cache-v7:";
const BEDROOM_ITEMS_CACHE_KEY = "bedroom-reset-items-cache-v1";

const kidPicker = document.getElementById("kidPicker");
const codeForm = document.getElementById("codeForm");
const codeInput = document.getElementById("codeInput");
const codeError = document.getElementById("codeError");
const roomTitleEl = document.getElementById("roomTitle");
const roomSubtitleEl = document.getElementById("roomSubtitle");
const roomSwitcherEl = document.getElementById("roomSwitcher");
const checklistEl = document.getElementById("checklist");
const kidNameEl = document.getElementById("kidName");
const switchKidLink = document.getElementById("switchKidLink");
const doneCount = document.getElementById("doneCount");
const totalCount = document.getElementById("totalCount");
const percentText = document.getElementById("percentText");
const pie = document.getElementById("pie");
const streakCount = document.getElementById("streakCount");
const resetBtn = document.getElementById("resetBtn");
const modeBtn = document.getElementById("modeBtn");
const focusCard = document.getElementById("focusCard");
const focusTask = document.getElementById("focusTask");
const focusHint = document.getElementById("focusHint");
const focusDoneBtn = document.getElementById("focusDoneBtn");
const passBtn = document.getElementById("passBtn");
const tryBtn = document.getElementById("tryBtn");
const starBtn = document.getElementById("starBtn");
const parentResult = document.getElementById("parentResult");
const syncStatusEl = document.getElementById("syncStatus");
const levelTitleEl = document.getElementById("levelTitle");
const levelPointsEl = document.getElementById("levelPoints");
const levelBarFillEl = document.getElementById("levelBarFill");
const levelNextEl = document.getElementById("levelNext");
const badgeShelfEl = document.getElementById("badgeShelf");

const pinModal = document.getElementById("pinModal");
const pinTitleEl = document.getElementById("pinTitle");
const pinDotsEl = document.getElementById("pinDots");
const pinPadEl = document.getElementById("pinPad");
const pinErrorEl = document.getElementById("pinError");
const pinCancelBtn = document.getElementById("pinCancel");

const confirmModal = document.getElementById("confirmModal");
const confirmTextEl = document.getElementById("confirmText");
const confirmYesBtn = document.getElementById("confirmYes");
const confirmNoBtn = document.getElementById("confirmNo");

const toastEl = document.getElementById("toast");
const toastEmojiEl = document.getElementById("toastEmoji");
const toastTextEl = document.getElementById("toastText");

const photoGrid = document.getElementById("photoGrid");
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxClose = document.getElementById("lightboxClose");

const aiScoreCard = document.getElementById("aiScoreCard");
const aiScoreBtn = document.getElementById("aiScoreBtn");
const aiScoreInput = document.getElementById("aiScoreInput");
const aiScoreStatus = document.getElementById("aiScoreStatus");
const aiScoreError = document.getElementById("aiScoreError");

let photos = [];
let aiScore = null;
let aiScoreMode = "off";
let aiScoreThreshold = 8;
let aiScorePollTimeout = null;

let boxes = [];
let oneThingMode = false;
let token = null;
let lastSyncOk = null;
let lastKnownLevel = 1;
let streakState = { current_streak: 0, best_streak: 0, total_points: 0, total_passes: 0, parent_result: "No parent check yet today." };

// A kid always has their own bedroom (type "bedroom"), plus zero or more
// shared family rooms (type "shared") fetched at login. Everything below is
// written against `activeRoom` so the same UI works for either.
let sharedRoomsList = [];
let activeRoom = { type: "bedroom", id: null, name: "Bedroom Reset", icon: "🛏️", items: null };

function roomStorageKey(prefix) {
  const key = activeRoom.type === "bedroom" ? "bedroom" : activeRoom.id;
  return `${prefix}${key}`;
}

// --- Room-aware API calls --------------------------------------------------

function getRoomState() {
  return activeRoom.type === "bedroom"
    ? callApi("get_kid_state", { token })
    : callApi("get_family_room_state", { token, room_id: activeRoom.id });
}
function updateRoomItem(itemId, checked) {
  return activeRoom.type === "bedroom"
    ? callApi("update_checklist_item", { token, item_id: itemId, checked })
    : callApi("update_family_room_item", { token, room_id: activeRoom.id, item_id: itemId, checked });
}
function roomParentCheck(eventType, pin) {
  return activeRoom.type === "bedroom"
    ? callApi("parent_check", { token, event_type: eventType, pin })
    : callApi("family_room_parent_check", { token, room_id: activeRoom.id, event_type: eventType, pin });
}
function roomTryAgain() {
  return activeRoom.type === "bedroom"
    ? callApi("parent_try_again", { token })
    : callApi("family_room_try_again", { token, room_id: activeRoom.id });
}
function roomResetDay() {
  return activeRoom.type === "bedroom"
    ? callApi("reset_day", { token })
    : callApi("family_room_reset_day", { token, room_id: activeRoom.id });
}
// The bedroom's progress lives under `streak`, a shared room's under `progress` - same shape either way.
function progressOf(data) {
  return activeRoom.type === "bedroom" ? data.streak : data.progress;
}
function submitRoomPhotoForScoring(base64, contentType, photoTakenAt) {
  return activeRoom.type === "bedroom"
    ? callApi("submit_photo_for_scoring", { token, image_base64: base64, content_type: contentType, photo_taken_at: photoTakenAt })
    : callApi("submit_photo_for_scoring", { token, room_id: activeRoom.id, image_base64: base64, content_type: contentType, photo_taken_at: photoTakenAt });
}

// --- Room switcher -----------------------------------------------------

function renderRoomSwitcher() {
  roomSwitcherEl.innerHTML = "";
  const rooms = [{ type: "bedroom", id: null, name: `${localStorage.getItem(DEVICE_NAME_KEY) || "My"} Room`, icon: localStorage.getItem(DEVICE_AVATAR_KEY) || "🛏️" }];
  sharedRoomsList.forEach((r) => rooms.push({ type: "shared", id: r.id, name: r.name, icon: r.icon }));
  if (rooms.length < 2) return; // nothing to switch between yet
  rooms.forEach((r) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "roomPill" + (r.type === activeRoom.type && r.id === activeRoom.id ? " active" : "");
    pill.innerHTML = `<span class="roomPillIcon">${r.icon}</span><span>${r.name}</span>`;
    pill.addEventListener("click", () => {
      if (r.type === activeRoom.type && r.id === activeRoom.id) return;
      switchRoom(r);
    });
    roomSwitcherEl.appendChild(pill);
  });
}

function switchRoom(room) {
  clearTimeout(aiScorePollTimeout);
  activeRoom = { ...room, items: null };
  oneThingMode = false;
  bootRoom();
}

// --- Checklist rendering -----------------------------------------------

// Bedroom items carry their own category (grouped into sections, family-
// customizable); a shared room's items are flat, grouped under the room name.
function groupByCategory(items) {
  const order = [];
  const map = new Map();
  items.forEach((item) => {
    const cat = item.category || "Checklist";
    if (!map.has(cat)) {
      map.set(cat, []);
      order.push(cat);
    }
    map.get(cat).push(item);
  });
  return order.map((cat) => ({ category: cat, items: map.get(cat) }));
}

function renderChecklist() {
  checklistEl.innerHTML = "";
  const categories =
    activeRoom.type === "bedroom"
      ? groupByCategory(activeRoom.items || [])
      : [{ category: activeRoom.name, items: (activeRoom.items || []).map((i) => ({ id: i.id, label: i.label })) }];
  categories.forEach((cat) => {
    const section = document.createElement("section");
    section.className = "category";
    const h2 = document.createElement("h2");
    h2.innerHTML = `${cat.category} <span class="catBadge"></span>`;
    section.appendChild(h2);
    cat.items.forEach((item) => {
      const label = document.createElement("label");
      label.className = "item";
      label.innerHTML = `<input type="checkbox" data-id="${item.id}"><span class="itemText">${item.label}</span>`;
      section.appendChild(label);
    });
    checklistEl.appendChild(section);
  });
  boxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
  totalCount.textContent = boxes.length;
  boxes.forEach((box) =>
    box.addEventListener("change", () => {
      updateItem(box);
      updateEverything();
      saveLocalChecklist();
      syncItem(box.dataset.id, box.checked);
    })
  );
}

// --- Code entry ------------------------------------------------------------

const prefillCode = new URLSearchParams(location.search).get("code");
if (prefillCode) codeInput.value = prefillCode.toUpperCase();

codeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = codeInput.value.trim();
  if (!code) return;
  codeError.classList.add("hidden");
  const submitBtn = codeForm.querySelector(".codeSubmit");
  submitBtn.disabled = true;
  const res = await callApi("redeem_kid_code", { code });
  submitBtn.disabled = false;
  if (!res.ok) {
    codeError.textContent = res.error || "Something went wrong. Try again.";
    codeError.classList.remove("hidden");
    return;
  }
  token = res.data.token;
  localStorage.setItem(DEVICE_TOKEN_KEY, token);
  localStorage.setItem(DEVICE_NAME_KEY, res.data.kid.name);
  localStorage.setItem(DEVICE_AVATAR_KEY, res.data.kid.avatar);
  sharedRoomsList = res.data.shared_rooms || [];
  kidPicker.classList.add("hidden");
  boot();
});

switchKidLink.addEventListener("click", async (e) => {
  e.preventDefault();
  const ok = await askConfirm("Switch which kid this tablet belongs to?");
  if (!ok) return;
  localStorage.removeItem(DEVICE_TOKEN_KEY);
  localStorage.removeItem(DEVICE_NAME_KEY);
  localStorage.removeItem(DEVICE_AVATAR_KEY);
  location.reload();
});

// --- Local cache + server sync -------------------------------------------

function loadLocalChecklist() {
  const saved = JSON.parse(localStorage.getItem(roomStorageKey(CHECKLIST_KEY_PREFIX)) || "{}");
  boxes.forEach((box) => {
    box.checked = !!saved[box.dataset.id];
    updateItem(box);
  });
}

function saveLocalChecklist() {
  const state = {};
  boxes.forEach((box) => (state[box.dataset.id] = box.checked));
  localStorage.setItem(roomStorageKey(CHECKLIST_KEY_PREFIX), JSON.stringify(state));
}

function loadLocalStreakCache() {
  const cached = JSON.parse(localStorage.getItem(roomStorageKey(STREAK_CACHE_KEY_PREFIX)) || "null");
  streakState = cached || { current_streak: 0, best_streak: 0, total_points: 0, total_passes: 0, parent_result: "No parent check yet today." };
  lastKnownLevel = levelForPoints(streakState.total_points || 0).level;
}

function saveLocalStreakCache() {
  localStorage.setItem(roomStorageKey(STREAK_CACHE_KEY_PREFIX), JSON.stringify(streakState));
}

async function fetchAndReconcile() {
  const res = await getRoomState();
  if (!res.ok) {
    lastSyncOk = false;
    renderSyncStatus();
    return;
  }
  lastSyncOk = true;

  if (activeRoom.type === "shared") {
    activeRoom.items = res.data.items || [];
    renderChecklist();
    loadLocalChecklist();
    const stateMap = Object.fromEntries((res.data.state || []).map((s) => [s.item_id, s.checked]));
    const toReconcile = [];
    boxes.forEach((box) => {
      const id = box.dataset.id;
      if (id in stateMap) {
        box.checked = stateMap[id];
        updateItem(box);
      } else if (box.checked) {
        toReconcile.push(id);
      }
    });
    applyStreak(res.data.progress, { celebrate: false });
    photos = res.data.photos || [];
    renderPhotos();
    applyAiScore(res.data.ai_score, res.data.ai_score_mode, res.data.ai_score_auto_threshold);
    saveLocalChecklist();
    renderSyncStatus();
    updateEverything();
    for (const id of toReconcile) syncItem(id, true);
    return;
  }

  activeRoom.items = res.data.bedroom_items || [];
  localStorage.setItem(BEDROOM_ITEMS_CACHE_KEY, JSON.stringify(activeRoom.items));
  renderChecklist();
  loadLocalChecklist();
  const serverMap = Object.fromEntries((res.data.items || []).map((i) => [i.item_id, i.checked]));
  const toReconcile = [];
  boxes.forEach((box) => {
    const id = box.dataset.id;
    if (id in serverMap) {
      box.checked = serverMap[id];
      updateItem(box);
    } else if (box.checked) {
      toReconcile.push(id);
    }
  });
  applyStreak(res.data.streak, { celebrate: false });
  photos = res.data.photos || [];
  renderPhotos();
  applyAiScore(res.data.ai_score, res.data.ai_score_mode, res.data.ai_score_auto_threshold);
  sharedRoomsList = res.data.shared_rooms || [];
  renderRoomSwitcher();
  saveLocalChecklist();
  renderSyncStatus();
  updateEverything();
  for (const id of toReconcile) syncItem(id, true);
}

async function syncItem(itemId, checked) {
  const res = await updateRoomItem(itemId, checked);
  if (!res.ok) {
    lastSyncOk = false;
    renderSyncStatus();
    return;
  }
  lastSyncOk = true;
  renderSyncStatus();
  const pts = (res.data.points_awarded || 0) + (res.data.completion_bonus || 0);
  if (res.data.completion_bonus > 0) {
    showToast("🌟", `Room complete! +${res.data.completion_bonus} points`);
    confettiBurst(28);
  }
  applyStreak(progressOf(res.data), { celebrate: pts > 0 });
}

function renderSyncStatus() {
  if (!syncStatusEl) return;
  if (!navigator.onLine) {
    syncStatusEl.textContent = "📴 Offline - saved on this tablet";
  } else if (lastSyncOk === false) {
    syncStatusEl.textContent = "💾 Saved on this tablet (not synced yet)";
  } else if (lastSyncOk === true) {
    syncStatusEl.textContent = "☁️ Synced";
  } else {
    syncStatusEl.textContent = "💾 Saved on this tablet";
  }
}
window.addEventListener("online", renderSyncStatus);
window.addEventListener("offline", renderSyncStatus);

// --- Streak / level / badge UI --------------------------------------------

function applyStreak(streak, { celebrate = true } = {}) {
  if (!streak) return;
  streakState = streak;
  saveLocalStreakCache();
  const level = levelForPoints(streak.total_points || 0);
  if (celebrate && level.level > lastKnownLevel) {
    showToast("🎉", `Level up! You're now a ${level.title}`, 3200);
    confettiBurst(36);
  }
  lastKnownLevel = level.level;
  updateProgress();
  updateLevelUI();
  updateBadgesUI();
}

function updateLevelUI() {
  if (!levelTitleEl) return;
  const points = streakState.total_points || 0;
  const level = levelForPoints(points);
  const next = nextLevel(points);
  levelTitleEl.textContent = `Level ${level.level} - ${level.title}`;
  levelPointsEl.textContent = `${points} points`;
  if (next) {
    const span = next.minPoints - level.minPoints;
    const into = points - level.minPoints;
    const pct = span > 0 ? Math.min(100, Math.round((into / span) * 100)) : 100;
    levelBarFillEl.style.width = `${pct}%`;
    levelNextEl.textContent = `${next.minPoints - points} points to ${next.title}`;
  } else {
    levelBarFillEl.style.width = "100%";
    levelNextEl.textContent = "Top level reached!";
  }
}

function updateBadgesUI() {
  if (!badgeShelfEl) return;
  const stats = {
    bestStreak: streakState.best_streak || 0,
    totalPasses: streakState.total_passes || 0,
    level: levelForPoints(streakState.total_points || 0).level,
  };
  const earnedIds = new Set(earnedBadges(stats).map((b) => b.id));
  badgeShelfEl.innerHTML = BADGES.map((b) => {
    const earned = earnedIds.has(b.id);
    return `<div class="badge ${earned ? "earned" : "locked"}" title="${b.label}"><span class="badgeEmoji">${b.emoji}</span><span class="badgeLabel">${b.label}</span></div>`;
  }).join("");
}

function updateCategories() {
  document.querySelectorAll(".category").forEach((section) => {
    const catBoxes = Array.from(section.querySelectorAll('input[type="checkbox"]'));
    const badge = section.querySelector(".catBadge");
    if (!badge) return;
    badge.textContent = catBoxes.length > 0 && catBoxes.every((b) => b.checked) ? "✅" : "";
  });
}

// --- Reference photo gallery ------------------------------------------

function renderPhotos() {
  // View-only for kids - adding/removing reference photos is a parent-dashboard action.
  photoGrid.innerHTML = "";
  photos.forEach((photo) => {
    const tile = document.createElement("div");
    tile.className = "photoTile";
    tile.innerHTML = `<img src="${photo.url}" alt="Tidy room example" loading="lazy" />`;
    tile.querySelector("img").addEventListener("click", () => openLightbox(photo));
    photoGrid.appendChild(tile);
  });
}

function openLightbox(photo) {
  lightboxImg.src = photo.url;
  lightbox.classList.remove("hidden");
}
function closeLightbox() {
  lightbox.classList.add("hidden");
}
lightboxClose.addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});

// --- AI room score -------------------------------------------------------
// Optional, off by default per family. A kid can snap a photo and a
// self-hosted vision model (polled by a local worker, not run here) scores
// it for tidiness. Never a substitute for Parent Check unless a parent has
// explicitly turned on auto-approve for their family.

function applyAiScore(score, mode, threshold) {
  aiScore = score;
  aiScoreMode = mode || "off";
  aiScoreThreshold = threshold || 8;
  renderAiScoreCard();
  scheduleAiScorePollIfNeeded();
}

function scheduleAiScorePollIfNeeded() {
  clearTimeout(aiScorePollTimeout);
  if (aiScore?.status === "pending") {
    aiScorePollTimeout = setTimeout(() => fetchAndReconcile(), 20000);
  }
}

function renderAiScoreCard() {
  if (!aiScoreCard) return;
  if (aiScoreMode === "off") {
    aiScoreCard.classList.add("hidden");
    return;
  }
  aiScoreCard.classList.remove("hidden");
  aiScoreError.classList.add("hidden");

  const pending = aiScore?.status === "pending";
  aiScoreBtn.disabled = pending;
  aiScoreBtn.textContent = pending ? "⏳ Scoring in progress..." : "📸 Score my room with AI";

  if (!aiScore) {
    aiScoreStatus.textContent = "Take a photo and see what the AI thinks!";
    aiScoreStatus.className = "aiScoreStatus";
    return;
  }
  if (pending) {
    aiScoreStatus.textContent = "⏳ Waiting for your AI score...";
    aiScoreStatus.className = "aiScoreStatus";
    return;
  }

  if (aiScore.status === "failed") {
    aiScoreStatus.className = "aiScoreStatus";
    aiScoreStatus.textContent = `🤔 ${aiScore.rejection_reason || "That photo couldn't be scored - try a clearer photo of the room."}`;
    return;
  }

  const passed = (aiScore.score || 0) >= aiScoreThreshold;
  aiScoreStatus.className = "aiScoreStatus scored" + (passed ? " good" : "");
  let text = `🤖 ${aiScore.score}/10 - ${aiScore.comment || ""}`;
  if (passed && aiScoreMode === "nudge") text += " Looks great - go ask a parent to check!";
  if (passed && aiScoreMode === "auto_approve") text += " Auto-approved!";
  aiScoreStatus.textContent = text;
}

if (aiScoreBtn) aiScoreBtn.addEventListener("click", () => aiScoreInput.click());
if (aiScoreInput) {
  aiScoreInput.addEventListener("change", async () => {
    const file = aiScoreInput.files[0];
    aiScoreInput.value = "";
    if (!file) return;
    aiScoreError.classList.add("hidden");
    try {
      // Captured from the source file before compression re-encodes it (which
      // strips this along with any other EXIF data) - lets the server check
      // the photo is actually fresh, not an old one reused from the gallery.
      const photoTakenAt = new Date(file.lastModified || Date.now()).toISOString();
      const { base64, contentType } = await compressImage(file, { maxDim: 900, quality: 0.6 });
      const res = await submitRoomPhotoForScoring(base64, contentType, photoTakenAt);
      if (!res.ok) {
        const messages = {
          already_pending: "You already have a photo waiting to be scored.",
          photo_too_old: "That photo looks old - take a fresh one of your room right now.",
          photo_timestamp_required: "Couldn't tell when that photo was taken. Try taking a new one.",
          photo_timestamp_invalid: "That photo's timestamp looks wrong. Try taking a new one.",
        };
        aiScoreError.textContent = messages[res.error] || "Couldn't submit that photo. Try again.";
        aiScoreError.classList.remove("hidden");
        return;
      }
      aiScore = res.data.request;
      renderAiScoreCard();
      scheduleAiScorePollIfNeeded();
    } catch (err) {
      aiScoreError.textContent = "Couldn't read that photo. Try a different one.";
      aiScoreError.classList.remove("hidden");
    }
  });
}

function confettiBurst(count = 24) {
  const container = document.createElement("div");
  container.className = "confettiContainer";
  document.body.appendChild(container);
  const colors = ["#5b8def", "#22a65a", "#f1c84b", "#f28c38", "#d94b4b"];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("span");
    piece.className = "confettiPiece";
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.3}s`;
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(piece);
  }
  setTimeout(() => container.remove(), 2000);
}

let toastTimer = null;
function showToast(emoji, text, duration = 2600) {
  toastEmojiEl.textContent = emoji;
  toastTextEl.textContent = text;
  toastEl.classList.remove("hidden");
  requestAnimationFrame(() => toastEl.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, duration);
}

// --- Confirm modal ---------------------------------------------------------

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

// --- Parent PIN modal ---------------------------------------------------------

let pinEntry = "";
let pinResolve = null;
let pinBusy = false;

function buildPinPad() {
  pinPadEl.innerHTML = "";
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];
  keys.forEach((key) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pinKey";
    if (key === "clear") {
      btn.textContent = "Clear";
      btn.classList.add("pinKeyWide");
      btn.addEventListener("click", () => {
        pinEntry = "";
        updatePinDots();
      });
    } else if (key === "back") {
      btn.textContent = "⌫";
      btn.addEventListener("click", () => {
        pinEntry = pinEntry.slice(0, -1);
        updatePinDots();
      });
    } else {
      btn.textContent = key;
      btn.addEventListener("click", () => {
        if (pinEntry.length >= 4 || pinBusy) return;
        pinEntry += key;
        updatePinDots();
        if (pinEntry.length === 4) submitPin();
      });
    }
    pinPadEl.appendChild(btn);
  });
}

function updatePinDots() {
  const dots = pinDotsEl.querySelectorAll("span");
  dots.forEach((dot, i) => dot.classList.toggle("filled", i < pinEntry.length));
}

async function submitPin() {
  pinBusy = true;
  const pin = pinEntry;
  const result = await pinResolve.checkFn(pin);
  pinBusy = false;
  if (result.ok) {
    pinErrorEl.classList.add("hidden");
    setTimeout(() => closePinModal(true), 150);
  } else {
    pinErrorEl.textContent = result.message || "Wrong PIN - try again.";
    pinErrorEl.classList.remove("hidden");
    pinDotsEl.classList.add("shake");
    setTimeout(() => {
      pinDotsEl.classList.remove("shake");
      pinEntry = "";
      updatePinDots();
    }, 400);
  }
}

function requestParentPin(title, checkFn) {
  pinTitleEl.textContent = title;
  pinEntry = "";
  updatePinDots();
  pinErrorEl.classList.add("hidden");
  pinModal.classList.remove("hidden");
  return new Promise((resolve) => {
    pinResolve = { resolve, checkFn };
  });
}

function closePinModal(result) {
  pinModal.classList.add("hidden");
  if (pinResolve) pinResolve.resolve(result);
  pinResolve = null;
}

pinCancelBtn.addEventListener("click", () => closePinModal(false));
buildPinPad();

// --- Progress / focus UI --------------------------------------------------

function updateItem(box) {
  const label = box.closest(".item");
  const text = label.querySelector(".itemText");
  label.classList.toggle("checked", box.checked);
  text.classList.toggle("done", box.checked);
}

function updateProgress() {
  const done = boxes.filter((b) => b.checked).length;
  const total = boxes.length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const degrees = total ? Math.round((done / total) * 360) : 0;
  doneCount.textContent = done;
  percentText.textContent = `${percent}%`;
  pie.style.background = `conic-gradient(var(--green) ${degrees}deg, #efeadf ${degrees}deg)`;
  streakCount.textContent = streakState.current_streak || 0;
  parentResult.textContent = streakState.parent_result || "No parent check yet today.";
}

function updateFocus() {
  if (!oneThingMode) {
    focusCard.classList.add("hidden");
    checklistEl.classList.remove("hidden");
    modeBtn.textContent = "Focus Mode: OFF";
    return;
  }
  focusCard.classList.remove("hidden");
  checklistEl.classList.add("hidden");
  modeBtn.textContent = "Focus Mode: ON";
  const next = boxes.find((b) => !b.checked);
  if (!next) {
    focusTask.textContent = "All jobs are done.";
    focusHint.textContent = "Ask a parent for the final room check.";
    focusDoneBtn.classList.add("hidden");
    return;
  }
  focusTask.textContent = next.closest(".item").querySelector(".itemText").textContent;
  focusHint.textContent = "Do this one thing properly. Then tap Done.";
  focusDoneBtn.classList.remove("hidden");
}

function updateEverything() {
  updateProgress();
  updateFocus();
  updateCategories();
  updateLevelUI();
  updateBadgesUI();
}

modeBtn.addEventListener("click", () => {
  oneThingMode = !oneThingMode;
  updateEverything();
});

focusDoneBtn.addEventListener("click", () => {
  const next = boxes.find((b) => !b.checked);
  if (!next) return;
  next.checked = true;
  updateItem(next);
  updateEverything();
  saveLocalChecklist();
  syncItem(next.dataset.id, true);
});

resetBtn.addEventListener("click", async () => {
  const ok = await askConfirm("Start a new day? This clears today's checklist. Streaks, points and badges are kept.");
  if (!ok) return;
  const res = await roomResetDay();
  boxes.forEach((box) => {
    box.checked = false;
    updateItem(box);
  });
  saveLocalChecklist();
  if (res.ok) applyStreak(progressOf(res.data), { celebrate: false });
  updateEverything();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

passBtn.addEventListener("click", () => {
  requestParentPin("Parent Check - Pass", async (pin) => {
    const res = await roomParentCheck("parent_pass", pin);
    if (res.ok) {
      applyStreak(progressOf(res.data));
      if (res.data.awarded_points > 0) showToast("✅", `Passed by a parent! ++${res.data.awarded_points} points`);
      updateEverything();
      return { ok: true };
    }
    if (res.error === "wrong_pin") return { ok: false, message: "Wrong PIN - try again." };
    return { ok: false, message: "Couldn't reach the server. Check the connection and try again." };
  });
});

starBtn.addEventListener("click", () => {
  requestParentPin("Parent Check - Great Job", async (pin) => {
    const res = await roomParentCheck("parent_star", pin);
    if (res.ok) {
      applyStreak(progressOf(res.data));
      if (res.data.awarded_points > 0) showToast("⭐", `Great job from a parent! ++${res.data.awarded_points} points`);
      updateEverything();
      return { ok: true };
    }
    if (res.error === "wrong_pin") return { ok: false, message: "Wrong PIN - try again." };
    return { ok: false, message: "Couldn't reach the server. Check the connection and try again." };
  });
});

tryBtn.addEventListener("click", async () => {
  const res = await roomTryAgain();
  if (res.ok) {
    applyStreak(progressOf(res.data), { celebrate: false });
    updateEverything();
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

function bootRoom() {
  aiScore = null;
  aiScoreMode = "off";
  if (aiScoreCard) aiScoreCard.classList.add("hidden");
  const kidName = localStorage.getItem(DEVICE_NAME_KEY) || "Kid";
  if (activeRoom.type === "bedroom") {
    roomTitleEl.textContent = "Bedroom Reset";
    roomSubtitleEl.textContent = "Tap each box when it is properly done. Hidden, shoved or stuffed does not count.";
    document.title = `${kidName}'s Bedroom Reset`;
  } else {
    roomTitleEl.textContent = `${activeRoom.icon} ${activeRoom.name}`;
    roomSubtitleEl.textContent = `The whole family shares this one - anyone can help finish it.`;
    document.title = `${activeRoom.name} - Homelife`;
  }
  kidNameEl.textContent = kidName;
  renderRoomSwitcher();
  loadLocalStreakCache();
  renderSyncStatus();
  if (activeRoom.type === "bedroom") {
    activeRoom.items = JSON.parse(localStorage.getItem(BEDROOM_ITEMS_CACHE_KEY) || "[]");
    renderChecklist();
    loadLocalChecklist();
    updateEverything();
  } else {
    // Item definitions for a shared room aren't known until fetched, so there's
    // nothing sensible to render from cache alone - clear out any previous room's
    // checklist rather than show stale items while the fetch is in flight.
    checklistEl.innerHTML = "";
    boxes = [];
    updateProgress();
    updateLevelUI();
    updateBadgesUI();
  }
  fetchAndReconcile();
}

function boot() {
  activeRoom = { type: "bedroom", id: null, name: "Bedroom Reset", icon: localStorage.getItem(DEVICE_AVATAR_KEY) || "🛏️", items: null };
  bootRoom();
}

token = localStorage.getItem(DEVICE_TOKEN_KEY);
if (token) {
  kidPicker.classList.add("hidden");
  boot();
} else {
  kidPicker.classList.remove("hidden");
  // Deliberately not auto-focusing: a programmatic focus() here (not from a
  // real tap) doesn't open the on-screen keyboard on Android Chrome, and
  // then a later real tap on the already-focused field doesn't fire a new
  // focus event either - so the keyboard never appears at all. Letting the
  // user's own tap do the focusing keeps it reliable everywhere.
}
