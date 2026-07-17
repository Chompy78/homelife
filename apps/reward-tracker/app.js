import { callApi } from "../shared/api.js";

// Same key Parent Dashboard uses - a parent already logged in there on this
// device is automatically logged in here too, since both apps share an
// origin (just a different path) and localStorage is scoped per-origin.
const TOKEN_KEY = "homelife_parent_token";
const DARK_MODE_KEY = "homelife_reward_dark_mode";

// kids has no colour column - assigned client-side by position instead, so
// it's stable across loads without needing a schema change just for this.
const KID_PALETTE = ["#ff5c8a", "#009688", "#7d5fff", "#f2994a", "#2196f3", "#8bc34a"];

const PRESET_EARN_NOTES = [
  "Tidied room",
  "Did homework",
  "Kind to sibling",
  "Helped with chores",
  "Good manners",
  "Listened first time",
  "Great day at school",
];
const PRESET_SPEND_NOTES = ["Redeemed today", "Traded up", "Weekly treat", "Weekend outing"];

const gate = document.getElementById("gate");
const codeForm = document.getElementById("codeForm");
const codeInput = document.getElementById("codeInput");
const codeError = document.getElementById("codeError");
const appEl = document.getElementById("app");
const switchFamilyLink = document.getElementById("switchFamilyLink");
const darkModeBtn = document.getElementById("darkModeBtn");

const kidPickerRow = document.getElementById("kidPickerRow");
const modeSwitch = document.getElementById("modeSwitch");
const quickView = document.getElementById("quickView");
const tableView = document.getElementById("tableView");
const historyView = document.getElementById("historyView");
const earnSpendSwitch = document.querySelector(".earnSpendSwitch");
const tileGrid = document.getElementById("tileGrid");
const rewardTable = document.getElementById("rewardTable");
const historyList = document.getElementById("historyList");
const manageCatBtn = document.getElementById("manageCatBtn");

const confirmModal = document.getElementById("confirmModal");
const confirmTextEl = document.getElementById("confirmText");
const confirmYesBtn = document.getElementById("confirmYes");
const confirmNoBtn = document.getElementById("confirmNo");

const noteModal = document.getElementById("noteModal");
const noteSub = document.getElementById("noteSub");
const presetGrid = document.getElementById("presetGrid");
const noteCustomInput = document.getElementById("noteCustomInput");
const noteSkipBtn = document.getElementById("noteSkipBtn");
const noteSaveBtn = document.getElementById("noteSaveBtn");

const catModal = document.getElementById("catModal");
const catModalClose = document.getElementById("catModalClose");
const catList = document.getElementById("catList");
const newCatLabel = document.getElementById("newCatLabel");
const newCatColor = document.getElementById("newCatColor");
const addCatBtn = document.getElementById("addCatBtn");
const catError = document.getElementById("catError");

let token = null;
let state = { kids: [], categories: [], balances: {}, history: [] };
let selectedKidId = null;
let mode = "quick";
let quickType = "earn";
let pendingTap = null; // { kidId, categoryId, type } awaiting a note

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

// --- Dark mode -----------------------------------------------------------

function applyDarkMode(on) {
  document.documentElement.classList.toggle("dark", on);
  darkModeBtn.textContent = on ? "☀️" : "🌙";
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
}

// --- Data loading -----------------------------------------------------

async function loadState() {
  const res = await callApi("get_reward_state", { token });
  if (!res.ok) {
    if (res.error === "session_expired") {
      localStorage.removeItem(TOKEN_KEY);
      location.reload();
      return;
    }
    return;
  }
  state = res.data;
  if (!selectedKidId || !state.kids.some((k) => k.id === selectedKidId)) {
    selectedKidId = state.kids[0]?.id || null;
  }
  renderAll();
}

function kidColour(kidId) {
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
  renderKidPicker();
  renderQuickTiles();
  renderTable();
  renderHistory();
}

function renderKidPicker() {
  kidPickerRow.innerHTML = "";
  state.kids.forEach((kid) => {
    const btn = document.createElement("button");
    btn.className = "kidChip" + (kid.id === selectedKidId ? " selected" : "");
    btn.style.setProperty("--kid-colour", kidColour(kid.id));
    btn.innerHTML = `<span class="kidChipAvatar">${kid.avatar_emoji || "⭐"}</span><span>${escapeHtml(kid.name)}</span><span class="kidChipTotal">${totalFor(kid.id)}</span>`;
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
    tableView.classList.toggle("hidden", mode !== "table");
    historyView.classList.toggle("hidden", mode !== "history");
  });
});

earnSpendSwitch.querySelectorAll(".typeBtn").forEach((btn) => {
  btn.addEventListener("click", () => {
    quickType = btn.dataset.type;
    earnSpendSwitch.querySelectorAll(".typeBtn").forEach((b) => b.classList.toggle("active", b === btn));
  });
});

function renderQuickTiles() {
  tileGrid.innerHTML = "";
  if (!selectedKidId) return;
  state.categories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "tile";
    btn.style.setProperty("--tile-colour", cat.color);
    btn.innerHTML = `<span class="tileLabel">${escapeHtml(cat.label)}</span><span class="tileBalance">${balanceFor(selectedKidId, cat.id)}</span>`;
    btn.addEventListener("click", () => openNoteModal(selectedKidId, cat.id, quickType));
    tileGrid.appendChild(btn);
  });
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
      html += `<td>
        <div class="cellButtons">
          <button type="button" class="cellMinus" data-kid="${kid.id}" data-cat="${cat.id}" data-type="spend">−</button>
          <span class="cellBalance">${cell.balance}</span>
          <button type="button" class="cellPlus" data-kid="${kid.id}" data-cat="${cat.id}" data-type="earn">+</button>
        </div>
        <div class="cellSub">earned ${cell.earned} · spent ${cell.spent}</div>
      </td>`;
    });
    html += "</tr>";
  });
  html += "</tbody>";
  rewardTable.innerHTML = html;
  rewardTable.querySelectorAll("button[data-kid]").forEach((btn) => {
    btn.addEventListener("click", () => openNoteModal(btn.dataset.kid, btn.dataset.cat, btn.dataset.type));
  });
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
        <div class="historyLine1" style="color:${kidColour(entry.kid_id)}">${escapeHtml(kidName(entry.kid_id))}</div>
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
      await callApi("undo_reward_log", { token, log_id: Number(btn.dataset.log) });
      await loadState();
    });
  });
}

// --- Note modal (earn/spend confirmation with a preset or custom reason) --

function openNoteModal(kidId, categoryId, type) {
  pendingTap = { kidId, categoryId, type };
  noteSub.textContent = `${kidName(kidId)} — ${type === "earn" ? "+1" : "−1"} ${categoryLabel(categoryId)}. Pick a reason or write your own (optional).`;
  presetGrid.innerHTML = "";
  const presets = type === "earn" ? PRESET_EARN_NOTES : PRESET_SPEND_NOTES;
  presets.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = p;
    b.addEventListener("click", () => commitTap(p));
    presetGrid.appendChild(b);
  });
  noteCustomInput.value = "";
  noteModal.classList.remove("hidden");
  setTimeout(() => noteCustomInput.focus(), 50);
}

noteSaveBtn.addEventListener("click", () => commitTap(noteCustomInput.value.trim()));
noteSkipBtn.addEventListener("click", () => commitTap(""));

async function commitTap(note) {
  noteModal.classList.add("hidden");
  if (!pendingTap) return;
  const { kidId, categoryId, type } = pendingTap;
  pendingTap = null;
  await callApi("adjust_reward", { token, kid_id: kidId, category_id: categoryId, type, note });
  await loadState();
}

// --- Category management -----------------------------------------------

manageCatBtn.addEventListener("click", () => {
  catError.classList.add("hidden");
  renderCatList();
  catModal.classList.remove("hidden");
});
catModalClose.addEventListener("click", () => catModal.classList.add("hidden"));

function renderCatList() {
  catList.innerHTML = "";
  state.categories.forEach((cat) => {
    const row = document.createElement("div");
    row.className = "catRow";
    row.innerHTML = `
      <input type="color" value="${cat.color}" data-id="${cat.id}" class="catColorInput" />
      <input type="text" value="${escapeAttr(cat.label)}" data-id="${cat.id}" class="catLabelInput" maxlength="60" />
      <button type="button" class="catDeleteBtn" data-id="${cat.id}">🗑</button>
    `;
    catList.appendChild(row);
  });

  catList.querySelectorAll(".catColorInput").forEach((input) => {
    input.addEventListener("change", () => updateCategory(input.dataset.id, { color: input.value }));
  });
  catList.querySelectorAll(".catLabelInput").forEach((input) => {
    input.addEventListener("change", () => {
      const label = input.value.trim();
      if (label) updateCategory(input.dataset.id, { label });
    });
  });
  catList.querySelectorAll(".catDeleteBtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = await askConfirm("Delete this category? Its history will also be removed.");
      if (!ok) return;
      await callApi("manage_reward_categories", { token, itemAction: "delete", item_id: btn.dataset.id });
      await loadState();
      renderCatList();
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
