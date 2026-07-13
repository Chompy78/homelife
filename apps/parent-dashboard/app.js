import { BADGES, levelForPoints, earnedBadges } from "../shared/config.js";
import { callApi } from "../shared/api.js";
import { compressImage } from "../shared/image.js";

const TOKEN_KEY = "homelife_parent_token";
const REFRESH_INTERVAL_MS = 45000;

const gate = document.getElementById("gate");
const codeForm = document.getElementById("codeForm");
const codeInput = document.getElementById("codeInput");
const codeError = document.getElementById("codeError");
const appEl = document.getElementById("app");
const familyHeading = document.getElementById("familyHeading");
const switchFamilyLink = document.getElementById("switchFamilyLink");

const displayNameInput = document.getElementById("displayNameInput");
const pinInput = document.getElementById("pinInput");
const publicToggle = document.getElementById("publicToggle");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const settingsSaved = document.getElementById("settingsSaved");

const newKidName = document.getElementById("newKidName");
const newKidAvatar = document.getElementById("newKidAvatar");
const addKidBtn = document.getElementById("addKidBtn");
const addKidError = document.getElementById("addKidError");

const cardsEl = document.getElementById("cards");
const refreshBtn = document.getElementById("refreshBtn");
const lastUpdatedEl = document.getElementById("lastUpdated");

const confirmModal = document.getElementById("confirmModal");
const confirmTextEl = document.getElementById("confirmText");
const confirmYesBtn = document.getElementById("confirmYes");
const confirmNoBtn = document.getElementById("confirmNo");

const photoInput = document.getElementById("photoInput");
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxClose = document.getElementById("lightboxClose");
const lightboxDelete = document.getElementById("lightboxDelete");

const MAX_PHOTOS = 3;
let photoUploadTargetKidId = null;
let lightboxPhotoId = null;

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
  mum_pass: "✅ Passed by Mum",
  mum_star: "⭐ Great job from Mum",
  mum_try_again: "🔁 Try again",
  reset: "🔄 Big reset",
};

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

saveSettingsBtn.addEventListener("click", async () => {
  const patch = {};
  if (displayNameInput.value.trim()) patch.display_name = displayNameInput.value.trim();
  if (/^\d{4}$/.test(pinInput.value.trim())) patch.mum_pin = pinInput.value.trim();
  patch.is_public = publicToggle.checked;
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

function startPhotoUpload(kidId) {
  photoUploadTargetKidId = kidId;
  photoInput.click();
}

photoInput.addEventListener("change", async () => {
  const file = photoInput.files[0];
  const kidId = photoUploadTargetKidId;
  photoInput.value = "";
  photoUploadTargetKidId = null;
  if (!file || !kidId) return;
  try {
    const { base64, contentType } = await compressImage(file);
    const res = await callApi("upload_reference_photo", { token, kid_id: kidId, image_base64: base64, content_type: contentType });
    if (res.ok) render(false);
    else alert(res.error === "max_photos_reached" ? "That kid already has 3 photos - remove one first." : "Couldn't upload that photo.");
  } catch (err) {
    alert("Couldn't read that photo. Try a different one.");
  }
});

function openLightbox(photo) {
  if (!photo) return;
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
  await callApi("delete_reference_photo", { token, photo_id: lightboxPhotoId });
  closeLightbox();
  render(false);
});

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
    kidLogs.filter((l) => ["mum_pass", "mum_star"].includes(l.event_type) && l.log_date >= since).map((l) => l.log_date)
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
    mumResult: streak.mum_result || "No Mum check yet today.",
    history,
    passedDates,
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
  const photoTiles = photos.map((p) => `<div class="photoTile" data-photo-id="${p.id}"><img src="${p.url}" alt="Tidy room example" /></div>`).join("");
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
    <div class="mumResult">${data.mumResult}</div>
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
  card.querySelectorAll(".photoTile").forEach((tile) => {
    const photo = photos.find((p) => p.id === tile.dataset.photoId);
    tile.querySelector("img").addEventListener("click", () => openLightbox(photo));
  });
  const addPhotoTile = card.querySelector(".addPhotoTile");
  if (addPhotoTile) addPhotoTile.addEventListener("click", () => startPhotoUpload(data.kid.id));
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
  const { family, kids, streaks, states, logs, checklist_total } = res.data;

  familyHeading.textContent = family.name;
  // Don't clobber the settings fields while someone's mid-edit on an auto-refresh tick.
  const editingSettings = [displayNameInput, pinInput].includes(document.activeElement);
  if (!editingSettings) {
    displayNameInput.value = family.display_name;
    pinInput.value = family.mum_pin;
    publicToggle.checked = family.is_public;
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
  lastUpdatedEl.textContent = `Updated ${new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}`;
}

function scheduleAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => render(false), REFRESH_INTERVAL_MS);
}

refreshBtn.addEventListener("click", () => render(true));

token = localStorage.getItem(TOKEN_KEY);
if (token) {
  enterApp();
} else {
  gate.classList.remove("hidden");
  codeInput.focus();
}
