import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  KIDS,
  CHECKLIST,
  MUM_PIN,
  POINTS,
  LEVELS,
  levelForPoints,
  nextLevel,
  BADGES,
  earnedBadges,
} from "../shared/config.js";

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

let supabase = null;
let supabaseLoadFailed = false;
async function getSupabase() {
  if (supabase) return supabase;
  if (supabaseLoadFailed) return null;
  try {
    const { createClient } = await withTimeout(import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"), 6000);
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (err) {
    // CDN unreachable, blocked or too slow (captive portal, flaky wifi) - app keeps working from local storage.
    // Don't retry every tap for the rest of this page load; a fresh reload will try again.
    supabaseLoadFailed = true;
  }
  return supabase;
}

const DEVICE_KID_KEY = "homelife_kid_id";
const DEVICE_KID_NAME_KEY = "homelife_kid_name";
const CHECKLIST_KEY = "bedroom-reset-checklist-v4";
const META_KEY = "bedroom-reset-meta-v5";

const checklistEl = document.getElementById("checklist");
const kidPicker = document.getElementById("kidPicker");
const kidGrid = document.getElementById("kidGrid");
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

let boxes = [];
let oneThingMode = false;
let currentKid = null;
let lastSyncOk = null;
let meta = {
  streak: 0,
  bestStreak: 0,
  lastPassDate: null,
  mumResult: "No Mum check yet today.",
  totalPoints: 0,
  totalPasses: 0,
  pointsAwardedItems: [],
  completionBonusAwarded: false,
};

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
      markChecked(box, box.checked);
      updateEverything();
      syncItem(box.dataset.id, box.checked);
      syncStreak();
    })
  );
}

function dateString(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// --- Kid picker ----------------------------------------------------------

function findKidById(id) {
  return KIDS.find((k) => k.id === id) || null;
}

function renderKidPicker() {
  kidGrid.innerHTML = "";
  KIDS.forEach((kid) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "kidBtn";
    btn.innerHTML = `<span class="kidAvatar">${kid.avatar}</span><span>${kid.name}</span>`;
    btn.addEventListener("click", () => chooseKid(kid));
    kidGrid.appendChild(btn);
  });
}

function chooseKid(kid) {
  localStorage.setItem(DEVICE_KID_KEY, kid.id);
  localStorage.setItem(DEVICE_KID_NAME_KEY, kid.name);
  currentKid = kid;
  kidPicker.classList.add("hidden");
  boot();
}

switchKidLink.addEventListener("click", async (e) => {
  e.preventDefault();
  const ok = await askConfirm("Switch which kid this tablet belongs to?");
  if (!ok) return;
  localStorage.removeItem(DEVICE_KID_KEY);
  localStorage.removeItem(DEVICE_KID_NAME_KEY);
  location.reload();
});

// --- Local + remote state -------------------------------------------------

function loadLocalState() {
  const saved = JSON.parse(localStorage.getItem(CHECKLIST_KEY) || "{}");
  meta = Object.assign(meta, JSON.parse(localStorage.getItem(META_KEY) || "{}"));
  boxes.forEach((box) => {
    box.checked = !!saved[box.dataset.id];
    updateItem(box);
  });
}

function saveLocalState() {
  const state = {};
  boxes.forEach((box) => (state[box.dataset.id] = box.checked));
  localStorage.setItem(CHECKLIST_KEY, JSON.stringify(state));
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

async function fetchRemoteState() {
  if (!currentKid) return;
  try {
    const client = await getSupabase();
    if (!client) {
      lastSyncOk = false;
      renderSyncStatus();
      return;
    }
    const [{ data: items }, { data: streak }] = await Promise.all([
      client.from("kid_checklist_state").select("item_id, checked").eq("kid_id", currentKid.id),
      client.from("kid_streaks").select("*").eq("kid_id", currentKid.id).maybeSingle(),
    ]);
    if (items) {
      const map = Object.fromEntries(items.map((i) => [i.item_id, i.checked]));
      boxes.forEach((box) => {
        if (box.dataset.id in map) {
          box.checked = map[box.dataset.id];
          updateItem(box);
        }
      });
    }
    if (streak) {
      meta.streak = streak.current_streak || 0;
      meta.bestStreak = streak.best_streak || 0;
      meta.lastPassDate = streak.last_pass_date;
      meta.mumResult = streak.mum_result || meta.mumResult;
      meta.totalPoints = streak.total_points || 0;
      meta.totalPasses = streak.total_passes || 0;
    }
    lastSyncOk = true;
  } catch (err) {
    lastSyncOk = false;
  }
  renderSyncStatus();
}

async function syncItem(itemId, checked) {
  if (!currentKid) return;
  const client = await getSupabase();
  if (!client) {
    lastSyncOk = false;
    renderSyncStatus();
    return;
  }
  client
    .from("kid_checklist_state")
    .upsert({ kid_id: currentKid.id, item_id: itemId, checked, updated_at: new Date().toISOString() })
    .then(() => {
      lastSyncOk = true;
      renderSyncStatus();
    })
    .catch(() => {
      lastSyncOk = false;
      renderSyncStatus();
    });
}

async function syncStreak() {
  if (!currentKid) return;
  const client = await getSupabase();
  if (!client) {
    lastSyncOk = false;
    renderSyncStatus();
    return;
  }
  client
    .from("kid_streaks")
    .upsert({
      kid_id: currentKid.id,
      current_streak: meta.streak || 0,
      best_streak: meta.bestStreak || 0,
      last_pass_date: meta.lastPassDate,
      mum_result: meta.mumResult,
      total_points: meta.totalPoints || 0,
      total_passes: meta.totalPasses || 0,
      updated_at: new Date().toISOString(),
    })
    .then(() => {
      lastSyncOk = true;
      renderSyncStatus();
    })
    .catch(() => {
      lastSyncOk = false;
      renderSyncStatus();
    });
}

async function logProgress(eventType, done, total) {
  if (!currentKid) return;
  const client = await getSupabase();
  if (!client) return;
  client
    .from("kid_progress_log")
    .insert({
      kid_id: currentKid.id,
      items_done: done,
      items_total: total,
      percent_complete: total ? Math.round((done / total) * 100) : 0,
      event_type: eventType,
      mum_result: meta.mumResult,
      streak_at_time: meta.streak || 0,
    })
    .then(() => {})
    .catch(() => {});
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

// --- Points, levels, badges ---------------------------------------------

function awardPoints(amount) {
  const before = levelForPoints(meta.totalPoints || 0).level;
  meta.totalPoints = (meta.totalPoints || 0) + amount;
  const after = levelForPoints(meta.totalPoints).level;
  if (after > before) {
    const lvl = levelForPoints(meta.totalPoints);
    showToast("🎉", `Level up! You're now a ${lvl.title}`, 3200);
    confettiBurst(36);
  }
}

function checkCompletionBonus() {
  const done = boxes.filter((b) => b.checked).length;
  if (boxes.length > 0 && done === boxes.length && !meta.completionBonusAwarded) {
    meta.completionBonusAwarded = true;
    awardPoints(POINTS.DAY_COMPLETE_BONUS);
    showToast("🌟", `Room complete! +${POINTS.DAY_COMPLETE_BONUS} points`, 2600);
    confettiBurst(28);
  }
}

function markChecked(box, checked) {
  box.checked = checked;
  updateItem(box);
  if (checked && !meta.pointsAwardedItems.includes(box.dataset.id)) {
    meta.pointsAwardedItems.push(box.dataset.id);
    awardPoints(POINTS.ITEM_CHECK);
  }
  checkCompletionBonus();
}

function updateLevelUI() {
  if (!levelTitleEl) return;
  const points = meta.totalPoints || 0;
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
    bestStreak: meta.bestStreak || 0,
    totalPasses: meta.totalPasses || 0,
    level: levelForPoints(meta.totalPoints || 0).level,
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

// --- Confirm modal (replaces native confirm()) ---------------------------

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
        if (pinEntry.length >= 4) return;
        pinEntry += key;
        updatePinDots();
        if (pinEntry.length === 4) checkPin();
      });
    }
    pinPadEl.appendChild(btn);
  });
}

function updatePinDots() {
  const dots = pinDotsEl.querySelectorAll("span");
  dots.forEach((dot, i) => dot.classList.toggle("filled", i < pinEntry.length));
}

function checkPin() {
  if (pinEntry === MUM_PIN) {
    pinErrorEl.classList.add("hidden");
    setTimeout(() => closePinModal(true), 150);
  } else {
    pinErrorEl.classList.remove("hidden");
    pinDotsEl.classList.add("shake");
    setTimeout(() => {
      pinDotsEl.classList.remove("shake");
      pinEntry = "";
      updatePinDots();
    }, 400);
  }
}

function requestMumPin(title) {
  pinTitleEl.textContent = title;
  pinEntry = "";
  updatePinDots();
  pinErrorEl.classList.add("hidden");
  pinModal.classList.remove("hidden");
  return new Promise((resolve) => {
    pinResolve = resolve;
  });
}

function closePinModal(result) {
  pinModal.classList.add("hidden");
  if (pinResolve) pinResolve(result);
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
  streakCount.textContent = meta.streak || 0;
  mumResult.textContent = meta.mumResult || "No Mum check yet today.";
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
  saveLocalState();
}

modeBtn.addEventListener("click", () => {
  oneThingMode = !oneThingMode;
  updateEverything();
});

focusDoneBtn.addEventListener("click", () => {
  const next = boxes.find((b) => !b.checked);
  if (!next) return;
  markChecked(next, true);
  updateEverything();
  syncItem(next.dataset.id, true);
  syncStreak();
});

resetBtn.addEventListener("click", async () => {
  const ok = await askConfirm("Start a new day? This clears today's checklist. Streaks, points and badges are kept.");
  if (!ok) return;
  const doneSnapshot = boxes.filter((b) => b.checked).length;
  const totalSnapshot = boxes.length;
  logProgress("reset", doneSnapshot, totalSnapshot);
  boxes.forEach((box) => {
    box.checked = false;
    updateItem(box);
    syncItem(box.dataset.id, false);
  });
  meta.mumResult = "No Mum check yet today.";
  meta.pointsAwardedItems = [];
  meta.completionBonusAwarded = false;
  updateEverything();
  syncStreak();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

function mumPass(emoji, label, eventType, points) {
  const today = dateString(0);
  const yesterday = dateString(-1);
  const doneNow = boxes.filter((b) => b.checked).length;
  const totalNow = boxes.length;
  if (meta.lastPassDate === today) {
    meta.mumResult = `${emoji} ${label} Already counted for today.`;
  } else {
    meta.streak = meta.lastPassDate === yesterday ? (meta.streak || 0) + 1 : 1;
    meta.lastPassDate = today;
    meta.bestStreak = Math.max(meta.bestStreak || 0, meta.streak);
    meta.totalPasses = (meta.totalPasses || 0) + 1;
    meta.mumResult = `${emoji} ${label} ${meta.streak > 1 ? "Streak continued!" : "New streak started!"}`;
    awardPoints(points);
    showToast(emoji, `${label} +${points} points`);
    confettiBurst(28);
  }
  updateEverything();
  syncStreak();
  logProgress(eventType, doneNow, totalNow);
}

passBtn.addEventListener("click", async () => {
  const ok = await requestMumPin("Mum Check - Pass");
  if (ok) mumPass("✅", "Passed by Mum!", "mum_pass", POINTS.MUM_PASS);
});
starBtn.addEventListener("click", async () => {
  const ok = await requestMumPin("Mum Check - Great Job");
  if (ok) mumPass("⭐", "Great job from Mum!", "mum_star", POINTS.MUM_GREAT_JOB);
});
tryBtn.addEventListener("click", () => {
  const doneNow = boxes.filter((b) => b.checked).length;
  const totalNow = boxes.length;
  meta.mumResult = "🔁 Try again. Fix the missed jobs, then ask Mum to check again.";
  updateEverything();
  syncStreak();
  logProgress("mum_try_again", doneNow, totalNow);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

function boot() {
  kidNameEl.textContent = currentKid.name;
  document.title = `${currentKid.name}'s Bedroom Reset`;
  renderChecklist();
  loadLocalState();
  updateEverything();
  renderSyncStatus();
  fetchRemoteState().then(() => updateEverything());
}

const storedId = localStorage.getItem(DEVICE_KID_KEY);
const storedKid = storedId && findKidById(storedId);
if (storedKid) {
  currentKid = storedKid;
  kidPicker.classList.add("hidden");
  boot();
} else {
  renderKidPicker();
  kidPicker.classList.remove("hidden");
}
