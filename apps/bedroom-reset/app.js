import { CHECKLIST, LEVELS, levelForPoints, nextLevel, BADGES, earnedBadges } from "../shared/config.js";
import { callApi } from "../shared/api.js";
import { compressImage } from "../shared/image.js";

const DEVICE_TOKEN_KEY = "homelife_kid_token";
const DEVICE_NAME_KEY = "homelife_kid_name";
const DEVICE_AVATAR_KEY = "homelife_kid_avatar";
const CHECKLIST_KEY = "bedroom-reset-checklist-v6";
const STREAK_CACHE_KEY = "bedroom-reset-streak-cache-v6";

const kidPicker = document.getElementById("kidPicker");
const codeForm = document.getElementById("codeForm");
const codeInput = document.getElementById("codeInput");
const codeError = document.getElementById("codeError");
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
const mumResult = document.getElementById("mumResult");
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
const photoInput = document.getElementById("photoInput");
const photoError = document.getElementById("photoError");
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxClose = document.getElementById("lightboxClose");
const lightboxDelete = document.getElementById("lightboxDelete");

const MAX_PHOTOS = 3;
let photos = [];
let lightboxPhotoId = null;

let boxes = [];
let oneThingMode = false;
let token = null;
let lastSyncOk = null;
let lastKnownLevel = 1;
let streakState = { current_streak: 0, best_streak: 0, total_points: 0, total_passes: 0, mum_result: "No Mum check yet today." };

// --- Checklist rendering -----------------------------------------------

function renderChecklist() {
  checklistEl.innerHTML = "";
  CHECKLIST.forEach((cat) => {
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
  const saved = JSON.parse(localStorage.getItem(CHECKLIST_KEY) || "{}");
  boxes.forEach((box) => {
    box.checked = !!saved[box.dataset.id];
    updateItem(box);
  });
}

function saveLocalChecklist() {
  const state = {};
  boxes.forEach((box) => (state[box.dataset.id] = box.checked));
  localStorage.setItem(CHECKLIST_KEY, JSON.stringify(state));
}

function loadLocalStreakCache() {
  const cached = JSON.parse(localStorage.getItem(STREAK_CACHE_KEY) || "null");
  if (cached) {
    streakState = cached;
    lastKnownLevel = levelForPoints(streakState.total_points || 0).level;
  }
}

function saveLocalStreakCache() {
  localStorage.setItem(STREAK_CACHE_KEY, JSON.stringify(streakState));
}

async function fetchAndReconcile() {
  const res = await callApi("get_kid_state", { token });
  if (!res.ok) {
    lastSyncOk = false;
    renderSyncStatus();
    return;
  }
  lastSyncOk = true;
  const serverMap = Object.fromEntries((res.data.items || []).map((i) => [i.item_id, i.checked]));
  const toReconcile = [];
  boxes.forEach((box) => {
    const id = box.dataset.id;
    if (id in serverMap) {
      box.checked = serverMap[id];
      updateItem(box);
    } else if (box.checked) {
      // checked while offline before this item ever synced - push it now
      toReconcile.push(id);
    }
  });
  applyStreak(res.data.streak, { celebrate: false });
  photos = res.data.photos || [];
  renderPhotos();
  saveLocalChecklist();
  renderSyncStatus();
  updateEverything();
  for (const id of toReconcile) syncItem(id, true);
}

async function syncItem(itemId, checked) {
  const res = await callApi("update_checklist_item", { token, item_id: itemId, checked });
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
  applyStreak(res.data.streak, { celebrate: pts > 0 });
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
  photoGrid.innerHTML = "";
  photos.forEach((photo) => {
    const tile = document.createElement("div");
    tile.className = "photoTile";
    tile.innerHTML = `<img src="${photo.url}" alt="Tidy room example" loading="lazy" />`;
    tile.querySelector("img").addEventListener("click", () => openLightbox(photo));
    photoGrid.appendChild(tile);
  });
  if (photos.length < MAX_PHOTOS) {
    const addTile = document.createElement("button");
    addTile.type = "button";
    addTile.className = "addPhotoTile";
    addTile.textContent = "+";
    addTile.addEventListener("click", () => photoInput.click());
    photoGrid.appendChild(addTile);
  }
}

photoInput.addEventListener("change", async () => {
  const file = photoInput.files[0];
  photoInput.value = "";
  if (!file) return;
  photoError.classList.add("hidden");
  try {
    const { base64, contentType } = await compressImage(file);
    const res = await callApi("upload_reference_photo", { token, image_base64: base64, content_type: contentType });
    if (!res.ok) {
      photoError.textContent = res.error === "max_photos_reached" ? "You already have 3 photos - remove one first." : "Couldn't upload that photo. Try again.";
      photoError.classList.remove("hidden");
      return;
    }
    photos = res.data.photos;
    renderPhotos();
  } catch (err) {
    photoError.textContent = "Couldn't read that photo. Try a different one.";
    photoError.classList.remove("hidden");
  }
});

function openLightbox(photo) {
  lightboxPhotoId = photo.id;
  lightboxImg.src = photo.url;
  lightbox.classList.remove("hidden");
}
function closeLightbox() {
  lightbox.classList.add("hidden");
  lightboxPhotoId = null;
}
lightboxClose.addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});
lightboxDelete.addEventListener("click", async () => {
  if (!lightboxPhotoId) return;
  const ok = await askConfirm("Remove this photo?");
  if (!ok) return;
  const res = await callApi("delete_reference_photo", { token, photo_id: lightboxPhotoId });
  if (res.ok) {
    photos = res.data.photos;
    renderPhotos();
  }
  closeLightbox();
});

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

// --- Mum PIN modal ---------------------------------------------------------

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

function requestMumPin(title, checkFn) {
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
  mumResult.textContent = streakState.mum_result || "No Mum check yet today.";
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
    focusHint.textContent = "Ask Mum for the final room check.";
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
  const res = await callApi("reset_day", { token });
  boxes.forEach((box) => {
    box.checked = false;
    updateItem(box);
  });
  saveLocalChecklist();
  if (res.ok) applyStreak(res.data.streak, { celebrate: false });
  updateEverything();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

passBtn.addEventListener("click", () => {
  requestMumPin("Mum Check - Pass", async (pin) => {
    const res = await callApi("mum_check", { token, event_type: "mum_pass", pin });
    if (res.ok) {
      applyStreak(res.data.streak);
      if (res.data.awarded_points > 0) showToast("✅", `Passed by Mum! +${res.data.awarded_points} points`);
      updateEverything();
      return { ok: true };
    }
    if (res.error === "wrong_pin") return { ok: false, message: "Wrong PIN - try again." };
    return { ok: false, message: "Couldn't reach the server. Check the connection and try again." };
  });
});

starBtn.addEventListener("click", () => {
  requestMumPin("Mum Check - Great Job", async (pin) => {
    const res = await callApi("mum_check", { token, event_type: "mum_star", pin });
    if (res.ok) {
      applyStreak(res.data.streak);
      if (res.data.awarded_points > 0) showToast("⭐", `Great job from Mum! +${res.data.awarded_points} points`);
      updateEverything();
      return { ok: true };
    }
    if (res.error === "wrong_pin") return { ok: false, message: "Wrong PIN - try again." };
    return { ok: false, message: "Couldn't reach the server. Check the connection and try again." };
  });
});

tryBtn.addEventListener("click", async () => {
  const res = await callApi("mum_try_again", { token });
  if (res.ok) {
    applyStreak(res.data.streak, { celebrate: false });
    updateEverything();
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

function boot() {
  kidNameEl.textContent = localStorage.getItem(DEVICE_NAME_KEY) || "…";
  document.title = `${localStorage.getItem(DEVICE_NAME_KEY) || "Kid"}'s Bedroom Reset`;
  renderChecklist();
  loadLocalChecklist();
  loadLocalStreakCache();
  updateEverything();
  renderSyncStatus();
  fetchAndReconcile();
}

token = localStorage.getItem(DEVICE_TOKEN_KEY);
if (token) {
  kidPicker.classList.add("hidden");
  boot();
} else {
  kidPicker.classList.remove("hidden");
  codeInput.focus();
}
