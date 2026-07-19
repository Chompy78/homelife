import { LEVELS, levelForPoints, nextLevel, BADGES, earnedBadges } from "../shared/config.js";
import { callApi } from "../shared/api.js";
import { compressImage } from "../shared/image.js";
import { askConfirm } from "../shared/confirm.js";
import { openLightbox } from "../shared/lightbox.js";

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

const toastEl = document.getElementById("toast");
const toastEmojiEl = document.getElementById("toastEmoji");
const toastTextEl = document.getElementById("toastText");

const photoGrid = document.getElementById("photoGrid");

const aiScoreCard = document.getElementById("aiScoreCard");
const aiScoreBtn = document.getElementById("aiScoreBtn");
const aiScoreInput = document.getElementById("aiScoreInput");
const aiScoreThumb = document.getElementById("aiScoreThumb");
const aiScoreStatus = document.getElementById("aiScoreStatus");
const aiScoreError = document.getElementById("aiScoreError");

let photos = [];
let aiScore = null;
let aiScoreMode = "off";
let aiScoreThreshold = 8;
let aiScoreAvgSeconds = null;
let aiScorePollTimeout = null;
let aiScoreTickInterval = null;

let boxes = [];
let oneThingMode = false;
let token = null;
let lastSyncOk = null;
let lastKnownLevel = 1;
let streakState = { current_streak: 0, best_streak: 0, total_points: 0, total_passes: 0, parent_result: "No parent check yet today." };

// null until the first real badge check, so a fresh page load doesn't treat
// every already-earned badge as "new" and fire a burst of celebrations.
let knownBadgeIds = null;
// A small chance of a little unprompted confetti on an ordinary checkbox tick
// - not a real milestone, just a rare surprise. Kept low and toast-free so it
// stays a pleasant surprise rather than something that happens "every time".
const RANDOM_CELEBRATION_CHANCE = 0.08;

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

// Every room-scoped action needs a different backend action name depending on
// whether it's the kid's own bedroom or a shared family room (except photo
// scoring, which is the same action either way) - callRoomApi() picks the
// right name and adds room_id for shared rooms, so callers don't repeat that
// branch themselves.
const ROOM_ACTIONS = {
  getState: { bedroom: "get_kid_state", shared: "get_family_room_state" },
  updateItem: { bedroom: "update_checklist_item", shared: "update_family_room_item" },
  parentCheck: { bedroom: "parent_check", shared: "family_room_parent_check" },
  tryAgain: { bedroom: "parent_try_again", shared: "family_room_try_again" },
  resetDay: { bedroom: "reset_day", shared: "family_room_reset_day" },
  submitPhoto: { bedroom: "submit_photo_for_scoring", shared: "submit_photo_for_scoring" },
};

function callRoomApi(key, extraArgs = {}) {
  const isBedroom = activeRoom.type === "bedroom";
  const action = isBedroom ? ROOM_ACTIONS[key].bedroom : ROOM_ACTIONS[key].shared;
  const args = { token, ...extraArgs };
  if (!isBedroom) args.room_id = activeRoom.id;
  return callApi(action, args);
}

function getRoomState() {
  return callRoomApi("getState");
}
function updateRoomItem(itemId, checked) {
  return callRoomApi("updateItem", { item_id: itemId, checked });
}
function roomParentCheck(eventType, pin) {
  return callRoomApi("parentCheck", { event_type: eventType, pin });
}
function roomTryAgain() {
  return callRoomApi("tryAgain");
}
function roomResetDay() {
  return callRoomApi("resetDay");
}
// The bedroom's progress lives under `streak`, a shared room's under `progress` - same shape either way.
function progressOf(data) {
  return activeRoom.type === "bedroom" ? data.streak : data.progress;
}
function submitRoomPhotoForScoring(base64, contentType, photoTakenAt) {
  return callRoomApi("submitPhoto", { image_base64: base64, content_type: contentType, photo_taken_at: photoTakenAt });
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
  clearInterval(aiScoreTickInterval);
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

// Each entry's `boxes` is that category's slice of the checkboxes just built,
// so updateCategories() can check completeness from memory instead of
// re-querying the DOM on every checkbox tap.
let categorySections = [];

function renderChecklist() {
  checklistEl.innerHTML = "";
  const categories =
    activeRoom.type === "bedroom"
      ? groupByCategory(activeRoom.items || [])
      : [{ category: activeRoom.name, items: (activeRoom.items || []).map((i) => ({ id: i.id, label: i.label })) }];
  const catBadgeEls = [];
  categories.forEach((cat) => {
    const section = document.createElement("section");
    section.className = "category";
    const h2 = document.createElement("h2");
    h2.innerHTML = `${cat.category} <span class="catBadge"></span>`;
    section.appendChild(h2);
    catBadgeEls.push(h2.querySelector(".catBadge"));
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
  categorySections = [];
  let offset = 0;
  categories.forEach((cat, i) => {
    categorySections.push({ badge: catBadgeEls[i], boxes: boxes.slice(offset, offset + cat.items.length) });
    offset += cat.items.length;
  });
  boxes.forEach((box) =>
    box.addEventListener("change", () => {
      updateItem(box);
      updateChecklistUI();
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

  const isBedroom = activeRoom.type === "bedroom";
  // A bedroom's item definitions/state map live under different field names
  // than a shared room's (see progressOf() for the same split on streak data).
  activeRoom.items = (isBedroom ? res.data.bedroom_items : res.data.items) || [];
  if (isBedroom) localStorage.setItem(BEDROOM_ITEMS_CACHE_KEY, JSON.stringify(activeRoom.items));
  renderChecklist();
  loadLocalChecklist();
  const stateMap = Object.fromEntries(((isBedroom ? res.data.items : res.data.state) || []).map((s) => [s.item_id, s.checked]));
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
  applyStreak(progressOf(res.data), { celebrate: false });
  photos = res.data.photos || [];
  renderPhotos();
  applyAiScore(res.data.ai_score, res.data.ai_score_mode, res.data.ai_score_auto_threshold, res.data.ai_score_avg_seconds);
  if (isBedroom) {
    sharedRoomsList = res.data.shared_rooms || [];
    renderRoomSwitcher();
  }
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
  // A level-up or new badge already gets its own toast + confetti inside
  // applyStreak - skip the room-complete/random ones below so they don't
  // stack a second burst on top and overwrite the more exciting message.
  const alreadyCelebrated = applyStreak(progressOf(res.data), { celebrate: pts > 0 });
  if (!alreadyCelebrated && res.data.completion_bonus > 0) {
    showToast("🌟", `Room complete! +${res.data.completion_bonus} points`);
    confettiBurst(28);
  } else if (!alreadyCelebrated && checked && res.data.points_awarded > 0 && Math.random() < RANDOM_CELEBRATION_CHANCE) {
    // A rare, toast-free flash of confetti on an ordinary tick - just a
    // little surprise, not tied to any real milestone.
    confettiBurst(12);
  }
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

// Returns true if it already showed its own celebration (level-up or a new
// badge), so a caller that's about to show its own toast/confetti for the
// same update (e.g. "Passed by a parent!") can skip it instead of stacking
// a second burst on top and overwriting the more exciting message.
function applyStreak(streak, { celebrate = true } = {}) {
  if (!streak) return false;
  streakState = streak;
  saveLocalStreakCache();
  const level = levelForPoints(streak.total_points || 0);
  const leveledUp = celebrate && level.level > lastKnownLevel;
  if (leveledUp) {
    showToast("🎉", `Level up! You're now a ${level.title}`, 3200);
    confettiBurst(36);
  }
  lastKnownLevel = level.level;
  updateProgress();
  updateLevelUI();
  const earnedIds = updateBadgesUI();
  // Only one celebration per update - a level-up already earned its confetti
  // above, so a badge unlocked in the very same tick doesn't pile a second
  // burst on top of it.
  let badgeEarned = false;
  if (celebrate && !leveledUp && knownBadgeIds) {
    const newBadge = BADGES.find((b) => earnedIds.has(b.id) && !knownBadgeIds.has(b.id));
    if (newBadge) {
      showToast(newBadge.emoji, `Badge earned: ${newBadge.label}!`, 3200);
      confettiBurst(30);
      badgeEarned = true;
    }
  }
  knownBadgeIds = earnedIds;
  return leveledUp || badgeEarned;
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
  const stats = {
    bestStreak: streakState.best_streak || 0,
    totalPasses: streakState.total_passes || 0,
    level: levelForPoints(streakState.total_points || 0).level,
  };
  const earnedIds = new Set(earnedBadges(stats).map((b) => b.id));
  if (badgeShelfEl) {
    badgeShelfEl.innerHTML = BADGES.map((b) => {
      const earned = earnedIds.has(b.id);
      return `<div class="badge ${earned ? "earned" : "locked"}" title="${b.label}"><span class="badgeEmoji">${b.emoji}</span><span class="badgeLabel">${b.label}</span></div>`;
    }).join("");
  }
  return earnedIds;
}

function updateCategories() {
  categorySections.forEach(({ badge, boxes: catBoxes }) => {
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

// --- AI room score -------------------------------------------------------
// Optional, off by default per family. A kid can snap a photo and a
// self-hosted vision model (polled by a local worker, not run here) scores
// it for tidiness. Never a substitute for Parent Check unless a parent has
// explicitly turned on auto-approve for their family.

function formatAiScoreSeconds(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

function applyAiScore(score, mode, threshold, avgSeconds) {
  aiScore = score;
  aiScoreMode = mode || "off";
  aiScoreThreshold = threshold || 8;
  aiScoreAvgSeconds = typeof avgSeconds === "number" ? avgSeconds : null;
  renderAiScoreCard();
  scheduleAiScorePollIfNeeded();
}

// A pending AI score is polled on its own lightweight timer rather than via
// fetchAndReconcile(), which would tear down and rebuild the whole checklist
// (and re-run photo/room-switcher/streak sync) just to refresh this one card.
async function pollAiScoreStatus() {
  const res = await getRoomState();
  if (!res.ok) return;
  applyAiScore(res.data.ai_score, res.data.ai_score_mode, res.data.ai_score_auto_threshold, res.data.ai_score_avg_seconds);
}

function scheduleAiScorePollIfNeeded() {
  clearTimeout(aiScorePollTimeout);
  clearInterval(aiScoreTickInterval);
  aiScoreTickInterval = null;
  if (aiScore?.status === "pending") {
    aiScorePollTimeout = setTimeout(() => pollAiScoreStatus(), 20000);
    // Ticks the "N seconds so far" text every second so a kid can see time
    // is actually passing, instead of tapping the (disabled) button again.
    aiScoreTickInterval = setInterval(() => renderAiScoreCard(), 1000);
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

  if (aiScoreThumb) {
    if (aiScore?.photo_url) {
      aiScoreThumb.src = aiScore.photo_url;
      aiScoreThumb.classList.remove("hidden");
    } else {
      aiScoreThumb.classList.add("hidden");
    }
  }

  const pending = aiScore?.status === "pending";
  aiScoreBtn.disabled = pending;
  aiScoreBtn.textContent = pending ? "⏳ Scoring in progress..." : "📸 Score my room with AI";

  if (!aiScore) {
    aiScoreStatus.textContent = aiScoreAvgSeconds
      ? `Take a photo and see what the AI thinks! Usually takes about ${formatAiScoreSeconds(aiScoreAvgSeconds)}.`
      : "Take a photo and see what the AI thinks!";
    aiScoreStatus.className = "aiScoreStatus";
    return;
  }
  if (pending) {
    const elapsedSeconds = Math.max(0, Math.round((Date.now() - new Date(aiScore.created_at).getTime()) / 1000));
    const elapsedText = `${formatAiScoreSeconds(elapsedSeconds)} so far`;
    aiScoreStatus.textContent = aiScoreAvgSeconds
      ? `⏳ Waiting for your AI score... ${elapsedText} (usually about ${formatAiScoreSeconds(aiScoreAvgSeconds)}) - no need to submit again, it's still working!`
      : `⏳ Waiting for your AI score... ${elapsedText}`;
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

if (aiScoreThumb) aiScoreThumb.addEventListener("click", () => openLightbox({ url: aiScore?.photo_url }));
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

// The parts that must reflect a checkbox's checked state immediately, on the
// optimistic local click - level/badges can't change until the server
// confirms the point award (see applyStreak(), which updates those once it
// does), so redoing them on every tap would just repeat unchanged work.
function updateChecklistUI() {
  updateProgress();
  updateFocus();
  updateCategories();
}

function updateEverything() {
  updateChecklistUI();
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
  updateChecklistUI();
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

function wireParentCheckButton(button, eventType, title, emoji, verb, confettiCount) {
  button.addEventListener("click", () => {
    requestParentPin(title, async (pin) => {
      const res = await roomParentCheck(eventType, pin);
      if (res.ok) {
        const alreadyCelebrated = applyStreak(progressOf(res.data));
        if (!alreadyCelebrated && res.data.awarded_points > 0) {
          showToast(emoji, `${verb} ++${res.data.awarded_points} points`);
          confettiBurst(confettiCount);
        }
        updateEverything();
        return { ok: true };
      }
      if (res.error === "wrong_pin") return { ok: false, message: "Wrong PIN - try again." };
      return { ok: false, message: "Couldn't reach the server. Check the connection and try again." };
    });
  });
}

wireParentCheckButton(passBtn, "parent_pass", "Parent Check - Pass", "✅", "Passed by a parent!", 16);
wireParentCheckButton(starBtn, "parent_star", "Parent Check - Great Job", "⭐", "Great job from a parent!", 24);

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
  applyAiScore(null, "off", null, null);
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
