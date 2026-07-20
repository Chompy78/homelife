import { BADGES, levelForPoints, earnedBadges } from "../shared/config.js";
import { callApi } from "../shared/api.js";
import { compressImage } from "../shared/image.js";
import { showAppVersion } from "../shared/version.js";

const TOKEN_KEY = "homelife_parent_token";
const REFRESH_INTERVAL_MS = 45000;

// Same fixed 9-icon set the backend validates against - a family picks any
// 3 as an alternative to the 4-digit PIN for Parent Check (order doesn't
// matter). Fixed layout here since this is *choosing* the password, not
// entering it - randomised-position entry only matters in the kid-facing
// apps that verify it.
const PARENT_ICON_SET = [
  { id: "dragon", emoji: "🐉", label: "Dragon" },
  { id: "castle", emoji: "🏰", label: "Castle" },
  { id: "crown", emoji: "👑", label: "Crown" },
  { id: "potion", emoji: "🧪", label: "Potion" },
  { id: "treasure", emoji: "💰", label: "Treasure" },
  { id: "ship", emoji: "🏴‍☠️", label: "Pirate Ship" },
  { id: "owl", emoji: "🦉", label: "Owl" },
  { id: "crystal", emoji: "💎", label: "Crystal" },
  { id: "sword", emoji: "⚔️", label: "Sword" },
];

const gate = document.getElementById("gate");
const codeForm = document.getElementById("codeForm");
const codeInput = document.getElementById("codeInput");
const codeError = document.getElementById("codeError");
const appEl = document.getElementById("app");
const familyHeading = document.getElementById("familyHeading");
const switchFamilyLink = document.getElementById("switchFamilyLink");

const displayNameInput = document.getElementById("displayNameInput");
const pinInput = document.getElementById("pinInput");
const familyIconInput = document.getElementById("familyIconInput");
const authMethodPin = document.getElementById("authMethodPin");
const authMethodIcons = document.getElementById("authMethodIcons");
const pinMethodFields = document.getElementById("pinMethodFields");
const iconMethodFields = document.getElementById("iconMethodFields");
const iconPickerGrid = document.getElementById("iconPickerGrid");
const iconPickerError = document.getElementById("iconPickerError");
const publicToggle = document.getElementById("publicToggle");
const aiScoreModeInput = document.getElementById("aiScoreModeInput");
const aiScoreThresholdInput = document.getElementById("aiScoreThresholdInput");
const aiScoreThresholdRow = document.getElementById("aiScoreThresholdRow");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const settingsSaved = document.getElementById("settingsSaved");

const newKidName = document.getElementById("newKidName");
const newKidAvatar = document.getElementById("newKidAvatar");
const addKidBtn = document.getElementById("addKidBtn");
const addKidError = document.getElementById("addKidError");

const bedroomItemsAdminEl = document.getElementById("bedroomItemsAdmin");
const newBedroomItemLabel = document.getElementById("newBedroomItemLabel");
const newBedroomItemCategory = document.getElementById("newBedroomItemCategory");
const addBedroomItemBtn = document.getElementById("addBedroomItemBtn");
const addBedroomItemError = document.getElementById("addBedroomItemError");

const cardsEl = document.getElementById("cards");
const roomCardsEl = document.getElementById("roomCards");
const refreshBtn = document.getElementById("refreshBtn");
const lastUpdatedEl = document.getElementById("lastUpdated");

const newRoomType = document.getElementById("newRoomType");
const newRoomName = document.getElementById("newRoomName");
const addRoomBtn = document.getElementById("addRoomBtn");
const addRoomError = document.getElementById("addRoomError");

const confirmModal = document.getElementById("confirmModal");
const confirmTextEl = document.getElementById("confirmText");
const confirmYesBtn = document.getElementById("confirmYes");
const confirmNoBtn = document.getElementById("confirmNo");

const photoInput = document.getElementById("photoInput");
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxClose = document.getElementById("lightboxClose");

const aiModal = document.getElementById("aiModal");
const aiModalTitle = document.getElementById("aiModalTitle");
const aiModalClose = document.getElementById("aiModalClose");
const aiFingerprintText = document.getElementById("aiFingerprintText");
const aiFingerprintSaveBtn = document.getElementById("aiFingerprintSaveBtn");
const aiFingerprintClearBtn = document.getElementById("aiFingerprintClearBtn");
const aiFingerprintRegenBtn = document.getElementById("aiFingerprintRegenBtn");
const aiFingerprintPending = document.getElementById("aiFingerprintPending");
const aiFingerprintSaved = document.getElementById("aiFingerprintSaved");
const aiHistoryList = document.getElementById("aiHistoryList");

const MAX_PHOTOS = 3;
let photoUploadTarget = null; // { type: 'kid' | 'room', id }

let token = null;
let refreshTimer = null;

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

const EVENT_LABELS = {
  parent_pass: "✅ Passed by a parent",
  parent_star: "⭐ Great job from a parent",
  parent_try_again: "🔁 Try again",
  reset: "🔄 Big reset",
  ai_auto_pass: "🤖 Auto-approved by AI",
};

function aiScoreThumbHtml(photoUrl) {
  if (!photoUrl) return "";
  return `<img class="aiScoreLineThumb" src="${photoUrl}" data-photo-url="${photoUrl}" alt="Submitted photo" />`;
}

function aiScoreLineHtml(aiScore) {
  if (!aiScore) return "";
  if (aiScore.status === "pending") return `<div class="aiScoreLine">🤖 Waiting for AI score...</div>`;
  if (aiScore.status === "failed") {
    return `<div class="aiScoreLine aiScoreLineRejected">${aiScoreThumbHtml(aiScore.photo_url)}<span>🤔 Not scored${aiScore.rejection_reason ? ` - ${aiScore.rejection_reason}` : ""}</span></div>`;
  }
  return `<div class="aiScoreLine">${aiScoreThumbHtml(aiScore.photo_url)}<span>🤖 ${aiScore.score}/10${aiScore.comment ? ` - ${aiScore.comment}` : ""}</span></div>`;
}

function aiScoreButtonHtml(aiScoreMode) {
  if (!aiScoreMode || aiScoreMode === "off") return "";
  return `<button type="button" class="adminBtn aiScoreDetailsBtn" style="width:100%">📊 AI scoring: history &amp; room fingerprint</button>`;
}

function pctClass(pct) {
  if (pct >= 100) return "high";
  if (pct >= 50) return "mid";
  return "low";
}

function formatWhen(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
}

function last7Dates() {
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    dates.push({ iso: `${y}-${m}-${day}`, label: d.toLocaleDateString("en-AU", { weekday: "narrow" }) });
  }
  return dates;
}

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

function enterApp() {
  gate.classList.add("hidden");
  appEl.classList.remove("hidden");
  render(true);
  scheduleAutoRefresh();
}

// --- Settings ---------------------------------------------------------------

function updateAiScoreThresholdVisibility() {
  const needsThreshold = aiScoreModeInput.value === "nudge" || aiScoreModeInput.value === "auto_approve";
  aiScoreThresholdRow.classList.toggle("hidden", !needsThreshold);
}
aiScoreModeInput.addEventListener("change", updateAiScoreThresholdVisibility);

// --- Parent verification method: PIN or a 3-of-9 icon picker -------------

let selectedAuthIcons = [];

function updateAuthMethodVisibility() {
  const usingIcons = authMethodIcons.checked;
  pinMethodFields.classList.toggle("hidden", usingIcons);
  iconMethodFields.classList.toggle("hidden", !usingIcons);
}
authMethodPin.addEventListener("change", updateAuthMethodVisibility);
authMethodIcons.addEventListener("change", updateAuthMethodVisibility);

function renderIconPicker() {
  iconPickerGrid.innerHTML = "";
  PARENT_ICON_SET.forEach((icon) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.id = icon.id;
    btn.title = icon.label;
    btn.textContent = icon.emoji;
    btn.classList.toggle("selected", selectedAuthIcons.includes(icon.id));
    btn.addEventListener("click", () => {
      iconPickerError.classList.add("hidden");
      if (selectedAuthIcons.includes(icon.id)) {
        selectedAuthIcons = selectedAuthIcons.filter((id) => id !== icon.id);
      } else if (selectedAuthIcons.length < 3) {
        selectedAuthIcons = [...selectedAuthIcons, icon.id];
      } else {
        iconPickerError.textContent = "Only 3 icons - tap one to deselect it first.";
        iconPickerError.classList.remove("hidden");
        return;
      }
      renderIconPicker();
    });
    iconPickerGrid.appendChild(btn);
  });
}
renderIconPicker();

saveSettingsBtn.addEventListener("click", async () => {
  const patch = {};
  if (displayNameInput.value.trim()) patch.display_name = displayNameInput.value.trim();
  patch.icon = familyIconInput.value;
  patch.is_public = publicToggle.checked;
  patch.ai_score_mode = aiScoreModeInput.value;
  const threshold = parseInt(aiScoreThresholdInput.value, 10);
  if (Number.isInteger(threshold) && threshold >= 1 && threshold <= 10) patch.ai_score_auto_threshold = threshold;

  if (authMethodIcons.checked) {
    if (selectedAuthIcons.length !== 3) {
      iconPickerError.textContent = "Pick exactly 3 icons before saving.";
      iconPickerError.classList.remove("hidden");
      return;
    }
    patch.parent_auth_method = "icons";
    patch.parent_icons = selectedAuthIcons;
  } else {
    patch.parent_auth_method = "pin";
    if (/^\d{4}$/.test(pinInput.value.trim())) patch.parent_pin = pinInput.value.trim();
  }

  saveSettingsBtn.disabled = true;
  const res = await callApi("update_family_settings", { token, ...patch });
  saveSettingsBtn.disabled = false;
  if (res.ok) {
    settingsSaved.classList.remove("hidden");
    setTimeout(() => settingsSaved.classList.add("hidden"), 2000);
  }
});

addKidBtn.addEventListener("click", async () => {
  const name = newKidName.value.trim();
  if (!name) {
    addKidError.textContent = "Enter a name first.";
    addKidError.classList.remove("hidden");
    return;
  }
  addKidError.classList.add("hidden");
  addKidBtn.disabled = true;
  const res = await callApi("manage_kid", { token, kidAction: "add", name, avatar: newKidAvatar.value });
  addKidBtn.disabled = false;
  if (!res.ok) {
    addKidError.textContent = "Could not add that kid. Try again.";
    addKidError.classList.remove("hidden");
    return;
  }
  newKidName.value = "";
  render(false);
});

// --- Kid admin actions --------------------------------------------------

async function renameKid(kid) {
  const name = prompt(`Rename ${kid.name} to:`, kid.name);
  if (!name || !name.trim() || name.trim() === kid.name) return;
  await callApi("manage_kid", { token, kidAction: "rename", kid_id: kid.id, name: name.trim() });
  render(false);
}

async function regenerateCode(kid) {
  const ok = await askConfirm(`Generate a new code for ${kid.name}? Their old code (${kid.kid_code}) will stop working, and any tablet already set up with it will need the new one entered again.`);
  if (!ok) return;
  await callApi("manage_kid", { token, kidAction: "regenerate_code", kid_id: kid.id });
  render(false);
}

async function removeKid(kid) {
  const ok = await askConfirm(`Remove ${kid.name} completely? This deletes all their progress, streaks and points. This cannot be undone.`);
  if (!ok) return;
  await callApi("manage_kid", { token, kidAction: "remove", kid_id: kid.id });
  render(false);
}

function copyKidLink(kid) {
  const url = `${location.origin}${location.pathname.replace(/parent-dashboard\/?$/, "bedroom-reset/")}?code=${encodeURIComponent(kid.kid_code)}`;
  navigator.clipboard?.writeText(url).catch(() => {});
}

// --- Reference photos --------------------------------------------------

function startPhotoUpload(type, id) {
  photoUploadTarget = { type, id };
  photoInput.click();
}

photoInput.addEventListener("change", async () => {
  const file = photoInput.files[0];
  const target = photoUploadTarget;
  photoInput.value = "";
  photoUploadTarget = null;
  if (!file || !target) return;
  try {
    const { base64, contentType } = await compressImage(file);
    const res =
      target.type === "kid"
        ? await callApi("upload_reference_photo", { token, kid_id: target.id, image_base64: base64, content_type: contentType })
        : await callApi("upload_family_room_photo", { token, room_id: target.id, image_base64: base64, content_type: contentType });
    if (res.ok) render(false);
    else alert(res.error === "max_photos_reached" ? "That already has 3 photos - remove one first." : "Couldn't upload that photo.");
  } catch (err) {
    alert("Couldn't read that photo. Try a different one.");
  }
});

function openLightbox(photo) {
  if (!photo) return;
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

// --- AI scoring modal: room fingerprint editor + score history -----------

let aiModalTarget = null; // { kind: 'kid' | 'room', id }
let aiHistoryRows = [];
let aiHistoryFilter = "all";

const AI_HISTORY_LABELS = {
  scored: (row) => `<span class="aiHistoryBadge aiHistoryBadgeGood">✅ ${row.score}/10</span>`,
  failed: () => `<span class="aiHistoryBadge aiHistoryBadgeBad">🚫 Rejected</span>`,
};

function formatWhenFull(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function renderAiHistoryList() {
  const rows = aiHistoryFilter === "all" ? aiHistoryRows : aiHistoryRows.filter((r) => r.status === aiHistoryFilter);
  if (!rows.length) {
    aiHistoryList.innerHTML = `<p class="loading">No ${aiHistoryFilter === "all" ? "" : aiHistoryFilter === "scored" ? "legit " : "rejected "}attempts yet.</p>`;
    return;
  }
  aiHistoryList.innerHTML = rows
    .map((row) => {
      const badge = (AI_HISTORY_LABELS[row.status] || (() => ""))(row);
      const detail = row.status === "scored" ? row.comment || "" : row.rejection_reason || "";
      return `<div class="aiHistoryRow"><span class="aiHistoryThumbSlot">${aiScoreThumbHtml(row.photo_url)}</span>${badge}<span class="aiHistoryDetail">${detail}</span><span class="aiHistoryWhen">${formatWhenFull(row.created_at)}</span></div>`;
    })
    .join("");
  aiHistoryList.querySelectorAll(".aiScoreLineThumb").forEach((thumb) => {
    thumb.addEventListener("click", () => openLightbox({ url: thumb.dataset.photoUrl }));
  });
}

document.querySelectorAll(".aiFilterBtn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".aiFilterBtn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    aiHistoryFilter = btn.dataset.filter;
    renderAiHistoryList();
  });
});

async function loadAiHistory() {
  if (!aiModalTarget) return;
  aiHistoryList.innerHTML = `<p class="loading">Loading...</p>`;
  const key = aiModalTarget.kind === "kid" ? "kid_id" : "room_id";
  const res = await callApi("get_photo_score_history", { token, [key]: aiModalTarget.id });
  if (!res.ok) {
    aiHistoryList.innerHTML = `<p class="error">Couldn't load history.</p>`;
    return;
  }
  aiHistoryRows = res.data.history || [];
  renderAiHistoryList();
}

let aiFingerprintPollTimer = null;
let aiFingerprintPollAttempts = 0;
const AI_FINGERPRINT_POLL_MS = 8000;
const AI_FINGERPRINT_POLL_MAX_ATTEMPTS = 22; // ~3 minutes

function setFingerprintPending(pending) {
  aiFingerprintPending.classList.toggle("hidden", !pending);
  aiFingerprintSaveBtn.disabled = pending;
  aiFingerprintClearBtn.disabled = pending;
  aiFingerprintRegenBtn.disabled = pending;
}

function stopFingerprintPoll() {
  clearTimeout(aiFingerprintPollTimer);
  aiFingerprintPollTimer = null;
  aiFingerprintPollAttempts = 0;
}

async function pollFingerprintRegen() {
  if (!aiModalTarget) return;
  aiFingerprintPollAttempts += 1;
  const res = await callApi("get_family_dashboard", { token });
  if (res.ok) {
    const target =
      aiModalTarget.kind === "kid"
        ? res.data.kids.find((k) => k.id === aiModalTarget.id)
        : res.data.rooms.find((r) => r.id === aiModalTarget.id);
    if (target && !target.room_fingerprint_regen_requested_at) {
      // Done (or the worker gave up because reference photos disappeared) -
      // either way there's nothing left pending, so stop and show what landed.
      aiFingerprintText.value = target.room_fingerprint || "";
      setFingerprintPending(false);
      stopFingerprintPoll();
      aiFingerprintSaved.textContent = target.room_fingerprint
        ? "✅ New fingerprint ready!"
        : "Regeneration finished with nothing to show - check reference photos still exist.";
      aiFingerprintSaved.classList.remove("hidden");
      setTimeout(() => aiFingerprintSaved.classList.add("hidden"), 5000);
      return;
    }
  }
  if (aiFingerprintPollAttempts >= AI_FINGERPRINT_POLL_MAX_ATTEMPTS) {
    stopFingerprintPoll();
    return;
  }
  aiFingerprintPollTimer = setTimeout(pollFingerprintRegen, AI_FINGERPRINT_POLL_MS);
}

function openAiModal(kind, id, label, fingerprint, regenRequestedAt) {
  aiModalTarget = { kind, id };
  aiModalTitle.textContent = `📊 AI Scoring - ${label}`;
  aiFingerprintText.value = fingerprint || "";
  aiFingerprintSaved.classList.add("hidden");
  stopFingerprintPoll();
  setFingerprintPending(!!regenRequestedAt);
  if (regenRequestedAt) pollFingerprintRegen();
  aiHistoryFilter = "all";
  document.querySelectorAll(".aiFilterBtn").forEach((b) => b.classList.toggle("active", b.dataset.filter === "all"));
  aiModal.classList.remove("hidden");
  loadAiHistory();
}
function closeAiModal() {
  aiModal.classList.add("hidden");
  aiModalTarget = null;
  stopFingerprintPoll();
}
aiModalClose.addEventListener("click", closeAiModal);
aiModal.addEventListener("click", (e) => {
  if (e.target === aiModal) closeAiModal();
});

async function saveFingerprint(fingerprint, savedMessage = "Saved!") {
  if (!aiModalTarget) return;
  const key = aiModalTarget.kind === "kid" ? "kid_id" : "room_id";
  const res = await callApi("update_room_fingerprint", { token, [key]: aiModalTarget.id, fingerprint });
  if (!res.ok) return;
  aiFingerprintText.value = res.data.room_fingerprint || "";
  aiFingerprintSaved.textContent = savedMessage;
  aiFingerprintSaved.classList.remove("hidden");
  setTimeout(() => aiFingerprintSaved.classList.add("hidden"), 4000);
  render(false);
}
aiFingerprintSaveBtn.addEventListener("click", () => saveFingerprint(aiFingerprintText.value.trim()));
aiFingerprintClearBtn.addEventListener("click", async () => {
  const ok = await askConfirm("Clear this fingerprint? The AI won't write a new one until a photo is next submitted for scoring - it doesn't happen right away.");
  if (!ok) return;
  saveFingerprint("", "Cleared! A new fingerprint will be generated automatically the next time a photo is submitted for AI scoring - not immediately.");
});
aiFingerprintRegenBtn.addEventListener("click", async () => {
  if (!aiModalTarget) return;
  const ok = await askConfirm("Ask the AI to write a fresh fingerprint from the current reference photos right now? This needs your home AI worker to be running, and can take a minute or two.");
  if (!ok) return;
  const key = aiModalTarget.kind === "kid" ? "kid_id" : "room_id";
  const res = await callApi("request_fingerprint_regeneration", { token, [key]: aiModalTarget.id });
  if (!res.ok) {
    if (res.error === "no_reference_photos") {
      aiFingerprintSaved.textContent = "Add at least one reference photo first - there's nothing for the AI to look at yet.";
      aiFingerprintSaved.classList.remove("hidden");
      setTimeout(() => aiFingerprintSaved.classList.add("hidden"), 5000);
    }
    return;
  }
  aiFingerprintText.value = "";
  setFingerprintPending(true);
  pollFingerprintRegen();
  render(false);
});

async function removePhoto(type, photo) {
  const ok = await askConfirm("Remove this photo?");
  if (!ok) return;
  if (type === "kid") await callApi("delete_reference_photo", { token, photo_id: photo.id });
  else await callApi("delete_family_room_photo", { token, photo_id: photo.id });
  render(false);
}

// --- Rendering ------------------------------------------------------------

function buildKidView(family, kid, streaks, states, logs, checklistTotal) {
  const streak = streaks.find((s) => s.kid_id === kid.id) || {};
  const items = states.filter((s) => s.kid_id === kid.id);
  const done = items.filter((i) => i.checked).length;
  const total = checklistTotal;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const kidLogs = logs.filter((l) => l.kid_id === kid.id);
  const history = kidLogs.slice(0, 5);
  const since = last7Dates()[0].iso;
  const passedDates = new Set(
    kidLogs.filter((l) => ["parent_pass", "parent_star"].includes(l.event_type) && l.log_date >= since).map((l) => l.log_date)
  );
  return {
    kid,
    percent,
    done,
    total,
    streak: streak.current_streak || 0,
    bestStreak: streak.best_streak || 0,
    totalPoints: streak.total_points || 0,
    totalPasses: streak.total_passes || 0,
    parentResult: streak.parent_result || "No parent check yet today.",
    history,
    passedDates,
    aiScoreMode: family.ai_score_mode || "off",
  };
}

function renderKidCard(data) {
  const level = levelForPoints(data.totalPoints);
  const earnedIds = new Set(
    earnedBadges({ bestStreak: data.bestStreak, totalPasses: data.totalPasses, level: level.level }).map((b) => b.id)
  );
  const badgeRow = BADGES.map(
    (b) => `<span class="badgeMini ${earnedIds.has(b.id) ? "earned" : ""}" title="${b.label}">${b.emoji}</span>`
  ).join("");

  const week = last7Dates()
    .map(
      (d) =>
        `<div class="weekDot"><span class="dot ${data.passedDates.has(d.iso) ? "pass" : ""}"></span><span class="day">${d.label}</span></div>`
    )
    .join("");

  const historyRows = data.history
    .map(
      (row) =>
        `<div class="historyRow"><span class="who">${EVENT_LABELS[row.event_type] || row.event_type}</span><span>${row.percent_complete}% · ${formatWhen(row.created_at)}</span></div>`
    )
    .join("");

  const photos = data.kid.photos || [];
  const photoTiles = photos
    .map((p) => `<div class="photoTile" data-photo-id="${p.id}"><img src="${p.url}" alt="Tidy room example" /><button type="button" class="removePhotoBtn" data-photo-id="${p.id}">✕</button></div>`)
    .join("");
  const addTile = photos.length < MAX_PHOTOS ? `<button type="button" class="addPhotoTile">+</button>` : "";

  const card = document.createElement("div");
  card.className = "kidCard";
  card.innerHTML = `
    <div class="kidCardHead">
      <span class="kidCardAvatar">${data.kid.avatar_emoji}</span>
      <div>
        <div class="kidCardName">${data.kid.name}</div>
        <div class="kidCardLevel">Level ${level.level} - ${level.title} · ${data.totalPoints} pts</div>
      </div>
    </div>
    <div class="statRow"><span>Today</span><span class="value pct ${pctClass(data.percent)}">${data.done}/${data.total} (${data.percent}%)</span></div>
    <div class="statRow"><span>Streak</span><span class="value">🔥 ${data.streak} day${data.streak === 1 ? "" : "s"} (best ${data.bestStreak})</span></div>
    <div class="parentResult">${data.parentResult}</div>
    ${aiScoreLineHtml(data.kid.ai_score)}
    ${aiScoreButtonHtml(data.aiScoreMode)}
    <div class="weekRow">${week}</div>
    <div class="badgeMiniShelf">${badgeRow}</div>
    <div class="kidPhotos">
      <div class="kidPhotosLabel">What Done Looks Like</div>
      <div class="photoGrid">${photoTiles}${addTile}</div>
    </div>
    <div class="history">
      <div class="historyTitle">Recent activity</div>
      ${historyRows || '<div class="historyRow"><span>No activity yet</span></div>'}
    </div>
    <div class="kidAdmin">
      <div class="kidCodeRow">
        <span class="kidCodeLabel">Their code</span>
        <span class="kidCode">${data.kid.kid_code}</span>
      </div>
      <div class="kidAdminButtons">
        <button type="button" class="adminBtn copyBtn">Copy link</button>
        <button type="button" class="adminBtn renameBtn">Rename</button>
        <button type="button" class="adminBtn regenBtn">New code</button>
        <button type="button" class="adminBtn removeBtn">Remove</button>
      </div>
    </div>
  `;
  card.querySelector(".copyBtn").addEventListener("click", () => copyKidLink(data.kid));
  card.querySelector(".renameBtn").addEventListener("click", () => renameKid(data.kid));
  card.querySelector(".regenBtn").addEventListener("click", () => regenerateCode(data.kid));
  card.querySelector(".removeBtn").addEventListener("click", () => removeKid(data.kid));
  const aiBtn = card.querySelector(".aiScoreDetailsBtn");
  if (aiBtn) aiBtn.addEventListener("click", () => openAiModal("kid", data.kid.id, data.kid.name, data.kid.room_fingerprint, data.kid.room_fingerprint_regen_requested_at));
  const aiThumb = card.querySelector(".aiScoreLineThumb");
  if (aiThumb) aiThumb.addEventListener("click", () => openLightbox({ url: aiThumb.dataset.photoUrl }));
  card.querySelectorAll(".photoTile").forEach((tile) => {
    const photo = photos.find((p) => p.id === tile.dataset.photoId);
    tile.querySelector("img").addEventListener("click", () => openLightbox(photo));
    tile.querySelector(".removePhotoBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      removePhoto("kid", photo);
    });
  });
  const addPhotoTile = card.querySelector(".addPhotoTile");
  if (addPhotoTile) addPhotoTile.addEventListener("click", () => startPhotoUpload("kid", data.kid.id));
  return card;
}

// --- Bedroom checklist admin (family-wide, not per kid) -------------------

async function addBedroomItem() {
  const label = newBedroomItemLabel.value.trim();
  if (!label) {
    addBedroomItemError.textContent = "Enter an item first.";
    addBedroomItemError.classList.remove("hidden");
    return;
  }
  addBedroomItemError.classList.add("hidden");
  addBedroomItemBtn.disabled = true;
  const res = await callApi("manage_bedroom_items", { token, itemAction: "add", label, category: newBedroomItemCategory.value.trim() });
  addBedroomItemBtn.disabled = false;
  if (!res.ok) {
    addBedroomItemError.textContent = "Could not add that item. Try again.";
    addBedroomItemError.classList.remove("hidden");
    return;
  }
  newBedroomItemLabel.value = "";
  newBedroomItemCategory.value = "";
  render(false);
}

async function deleteBedroomItem(item) {
  const ok = await askConfirm(`Remove "${item.label}" from the bedroom checklist? This removes it for every kid.`);
  if (!ok) return;
  await callApi("manage_bedroom_items", { token, itemAction: "delete", item_id: item.id });
  render(false);
}

addBedroomItemBtn.addEventListener("click", addBedroomItem);

function renderBedroomItemsAdmin(items) {
  bedroomItemsAdminEl.innerHTML = "";
  if (!items || items.length === 0) {
    bedroomItemsAdminEl.innerHTML = `<p class="loading">No checklist items yet.</p>`;
    return;
  }
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
  order.forEach((cat) => {
    const group = document.createElement("div");
    group.className = "roomItemGroup";
    const label = document.createElement("div");
    label.className = "kidPhotosLabel";
    label.textContent = cat;
    group.appendChild(label);
    const list = document.createElement("div");
    list.className = "roomItemList";
    map.get(cat).forEach((item) => {
      const row = document.createElement("div");
      row.className = "roomItemRow";
      row.innerHTML = `<span>${item.label}</span><button type="button" class="removeItemBtn">✕</button>`;
      row.querySelector(".removeItemBtn").addEventListener("click", () => deleteBedroomItem(item));
      list.appendChild(row);
    });
    group.appendChild(list);
    bedroomItemsAdminEl.appendChild(group);
  });
}

// --- Shared room admin actions -------------------------------------------

async function addRoomItem(room) {
  const label = prompt(`Add a checklist item to ${room.name}:`);
  if (!label || !label.trim()) return;
  await callApi("manage_room_items", { token, room_id: room.id, itemAction: "add", label: label.trim() });
  render(false);
}

async function deleteRoomItem(room, item) {
  const ok = await askConfirm(`Remove "${item.label}" from ${room.name}'s checklist?`);
  if (!ok) return;
  await callApi("manage_room_items", { token, room_id: room.id, itemAction: "delete", item_id: item.id });
  render(false);
}

async function removeRoom(room) {
  const ok = await askConfirm(`Remove ${room.name} completely? This deletes its checklist, streak, points and history. This cannot be undone.`);
  if (!ok) return;
  await callApi("remove_family_room", { token, room_id: room.id });
  render(false);
}

addRoomBtn.addEventListener("click", async () => {
  addRoomError.classList.add("hidden");
  addRoomBtn.disabled = true;
  const res = await callApi("add_family_room", { token, room_type: newRoomType.value, name: newRoomName.value.trim() });
  addRoomBtn.disabled = false;
  if (!res.ok) {
    addRoomError.textContent = "Could not add that room. Try again.";
    addRoomError.classList.remove("hidden");
    return;
  }
  newRoomName.value = "";
  render(false);
});

function buildRoomView(room, family) {
  const done = room.state.filter((s) => s.checked).length;
  const total = room.items.length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const history = room.logs.slice(0, 5);
  const since = last7Dates()[0].iso;
  const passedDates = new Set(
    room.logs.filter((l) => ["parent_pass", "parent_star"].includes(l.event_type) && l.log_date >= since).map((l) => l.log_date)
  );
  return {
    room,
    percent,
    done,
    total,
    streak: room.progress.current_streak || 0,
    bestStreak: room.progress.best_streak || 0,
    totalPoints: room.progress.total_points || 0,
    totalPasses: room.progress.total_passes || 0,
    parentResult: room.progress.parent_result || "No parent check yet today.",
    history,
    passedDates,
    aiScoreMode: family.ai_score_mode || "off",
  };
}

function renderRoomCard(data) {
  const { room } = data;
  const level = levelForPoints(data.totalPoints);
  const earnedIds = new Set(
    earnedBadges({ bestStreak: data.bestStreak, totalPasses: data.totalPasses, level: level.level }).map((b) => b.id)
  );
  const badgeRow = BADGES.map(
    (b) => `<span class="badgeMini ${earnedIds.has(b.id) ? "earned" : ""}" title="${b.label}">${b.emoji}</span>`
  ).join("");

  const week = last7Dates()
    .map(
      (d) =>
        `<div class="weekDot"><span class="dot ${data.passedDates.has(d.iso) ? "pass" : ""}"></span><span class="day">${d.label}</span></div>`
    )
    .join("");

  const historyRows = data.history
    .map(
      (row) =>
        `<div class="historyRow"><span class="who">${EVENT_LABELS[row.event_type] || row.event_type}</span><span>${row.percent_complete}% · ${formatWhen(row.created_at)}</span></div>`
    )
    .join("");

  const photos = room.photos || [];
  const photoTiles = photos
    .map((p) => `<div class="photoTile" data-photo-id="${p.id}"><img src="${p.url}" alt="Tidy room example" /><button type="button" class="removePhotoBtn" data-photo-id="${p.id}">✕</button></div>`)
    .join("");
  const addPhotoTileHtml = photos.length < MAX_PHOTOS ? `<button type="button" class="addPhotoTile">+</button>` : "";

  const itemRows = room.items
    .map((item) => `<div class="roomItemRow" data-item-id="${item.id}"><span>${item.label}</span><button type="button" class="removeItemBtn">✕</button></div>`)
    .join("");

  const card = document.createElement("div");
  card.className = "kidCard";
  card.innerHTML = `
    <div class="kidCardHead">
      <span class="kidCardAvatar">${room.icon}</span>
      <div>
        <div class="kidCardName">${room.name}</div>
        <div class="kidCardLevel">Level ${level.level} - ${level.title} · ${data.totalPoints} pts (family)</div>
      </div>
    </div>
    <div class="statRow"><span>Today</span><span class="value pct ${pctClass(data.percent)}">${data.done}/${data.total} (${data.percent}%)</span></div>
    <div class="statRow"><span>Streak</span><span class="value">🔥 ${data.streak} day${data.streak === 1 ? "" : "s"} (best ${data.bestStreak})</span></div>
    <div class="parentResult">${data.parentResult}</div>
    ${aiScoreLineHtml(data.room.ai_score)}
    ${aiScoreButtonHtml(data.aiScoreMode)}
    <div class="weekRow">${week}</div>
    <div class="badgeMiniShelf">${badgeRow}</div>
    <div class="kidPhotos">
      <div class="kidPhotosLabel">What Done Looks Like</div>
      <div class="photoGrid">${photoTiles}${addPhotoTileHtml}</div>
    </div>
    <div class="roomItemsAdmin">
      <div class="kidPhotosLabel">Checklist items</div>
      <div class="roomItemList">${itemRows || '<div class="roomItemRow"><span>No items yet</span></div>'}</div>
      <div class="addItemRow">
        <button type="button" class="adminBtn addItemBtn" style="width:100%">+ Add an item</button>
      </div>
    </div>
    <div class="history">
      <div class="historyTitle">Recent activity</div>
      ${historyRows || '<div class="historyRow"><span>No activity yet</span></div>'}
    </div>
    <div class="kidAdmin">
      <div class="kidAdminButtons">
        <button type="button" class="adminBtn removeBtn">Remove room</button>
      </div>
    </div>
  `;
  card.querySelectorAll(".photoTile").forEach((tile) => {
    const photo = photos.find((p) => p.id === tile.dataset.photoId);
    tile.querySelector("img").addEventListener("click", () => openLightbox(photo));
    tile.querySelector(".removePhotoBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      removePhoto("room", photo);
    });
  });
  const addPhotoTile = card.querySelector(".addPhotoTile");
  if (addPhotoTile) addPhotoTile.addEventListener("click", () => startPhotoUpload("room", room.id));
  card.querySelectorAll(".roomItemRow").forEach((row) => {
    const item = room.items.find((i) => i.id === row.dataset.itemId);
    const btn = row.querySelector(".removeItemBtn");
    if (item && btn) btn.addEventListener("click", () => deleteRoomItem(room, item));
  });
  card.querySelector(".addItemBtn").addEventListener("click", () => addRoomItem(room));
  card.querySelector(".removeBtn").addEventListener("click", () => removeRoom(room));
  const aiBtn = card.querySelector(".aiScoreDetailsBtn");
  if (aiBtn) aiBtn.addEventListener("click", () => openAiModal("room", room.id, room.name, room.room_fingerprint, room.room_fingerprint_regen_requested_at));
  const aiThumb = card.querySelector(".aiScoreLineThumb");
  if (aiThumb) aiThumb.addEventListener("click", () => openLightbox({ url: aiThumb.dataset.photoUrl }));
  return card;
}

async function render(showLoading) {
  if (showLoading) cardsEl.innerHTML = `<p class="loading">Loading...</p>`;
  const res = await callApi("get_family_dashboard", { token });
  if (!res.ok) {
    if (res.error === "session_expired") {
      localStorage.removeItem(TOKEN_KEY);
      location.reload();
      return;
    }
    cardsEl.innerHTML = `<p class="error">Could not load your family's progress. Check your internet connection.</p>`;
    return;
  }
  const { family, kids, streaks, states, logs, checklist_total, bedroom_items, rooms } = res.data;

  familyHeading.textContent = `${family.icon || "🏠"} ${family.name}`;
  renderBedroomItemsAdmin(bedroom_items || []);
  // Don't clobber the settings fields while someone's mid-edit on an auto-refresh tick.
  const editingSettings =
    [displayNameInput, pinInput, familyIconInput, aiScoreModeInput, aiScoreThresholdInput, authMethodPin, authMethodIcons].includes(document.activeElement) ||
    iconPickerGrid.contains(document.activeElement);
  if (!editingSettings) {
    displayNameInput.value = family.display_name;
    pinInput.value = family.parent_pin;
    familyIconInput.value = family.icon || "🏠";
    publicToggle.checked = family.is_public;
    aiScoreModeInput.value = family.ai_score_mode || "off";
    aiScoreThresholdInput.value = family.ai_score_auto_threshold || 8;
    const usingIcons = family.parent_auth_method === "icons";
    authMethodPin.checked = !usingIcons;
    authMethodIcons.checked = usingIcons;
    selectedAuthIcons = Array.isArray(family.parent_icons) ? family.parent_icons : [];
    renderIconPicker();
    updateAuthMethodVisibility();
    updateAiScoreThresholdVisibility();
  }

  cardsEl.innerHTML = "";
  if (kids.length === 0) {
    cardsEl.innerHTML = `<p class="loading">No kids yet - add one above.</p>`;
  } else {
    kids.forEach((kid) => {
      const data = buildKidView(family, kid, streaks, states, logs, checklist_total);
      cardsEl.appendChild(renderKidCard(data));
    });
  }

  roomCardsEl.innerHTML = "";
  if (!rooms || rooms.length === 0) {
    roomCardsEl.innerHTML = `<p class="loading">No shared rooms yet - add one above.</p>`;
  } else {
    rooms.forEach((room) => {
      const data = buildRoomView(room, family);
      roomCardsEl.appendChild(renderRoomCard(data));
    });
  }

  lastUpdatedEl.textContent = `Updated ${new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}`;
}

function scheduleAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => render(false), REFRESH_INTERVAL_MS);
}

refreshBtn.addEventListener("click", () => render(true));

showAppVersion("appVersion");

token = localStorage.getItem(TOKEN_KEY);
if (token) {
  enterApp();
} else {
  gate.classList.remove("hidden");
  // Deliberately not auto-focusing: a programmatic focus() here (not from a
  // real tap) doesn't open the on-screen keyboard on Android Chrome, and
  // then a later real tap on the already-focused field doesn't fire a new
  // focus event either - so the keyboard never appears at all. Letting the
  // user's own tap do the focusing keeps it reliable everywhere.
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}
