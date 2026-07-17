import { callApi } from "../shared/api.js";

// Same key Parent Dashboard uses - a parent already logged in there on this
// device is automatically logged in here too, since both apps share an
// origin (just a different path) and localStorage is scoped per-origin.
const TOKEN_KEY = "homelife_parent_token";
const DARK_MODE_KEY = "homelife_reward_dark_mode";
const PIN_PROTECTION_KEY = "homelife_reward_pin_protection";
const PIN_UNLOCK_MS = 5 * 60 * 1000;
const UNDO_TOAST_MS = 5000;

// kids has no colour column - assigned client-side by position instead, so
// it's stable across loads without needing a schema change just for this.
const KID_PALETTE = ["#ff5c8a", "#009688", "#7d5fff", "#f2994a", "#2196f3", "#8bc34a"];

const AVATAR_SUGGESTIONS = ["🌸", "🌟", "🦄", "⭐", "🦁", "🐬", "🚀", "🎨", "🐱", "🐶"];

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
const settingsBtn = document.getElementById("settingsBtn");
const kidViewBtn = document.getElementById("kidViewBtn");

const kidPickerRow = document.getElementById("kidPickerRow");
const modeSwitch = document.getElementById("modeSwitch");
const quickView = document.getElementById("quickView");
const tableView = document.getElementById("tableView");
const insightsView = document.getElementById("insightsView");
const historyView = document.getElementById("historyView");
const earnSpendSwitch = document.querySelector(".earnSpendSwitch");
const tileGrid = document.getElementById("tileGrid");
const rewardTable = document.getElementById("rewardTable");
const insightsContent = document.getElementById("insightsContent");
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

const pinModal = document.getElementById("pinModal");
const pinModalTitle = document.getElementById("pinModalTitle");
const pinForm = document.getElementById("pinForm");
const pinInput = document.getElementById("pinInput");
const pinError = document.getElementById("pinError");
const pinCancelBtn = document.getElementById("pinCancelBtn");

const settingsModal = document.getElementById("settingsModal");
const settingsModalClose = document.getElementById("settingsModalClose");
const pinProtectionToggle = document.getElementById("pinProtectionToggle");
const avatarList = document.getElementById("avatarList");
const resetHistoryBtn = document.getElementById("resetHistoryBtn");

const kidView = document.getElementById("kidView");
const kidViewCards = document.getElementById("kidViewCards");
const kidViewExitBtn = document.getElementById("kidViewExitBtn");

const toastContainer = document.getElementById("toastContainer");

let token = null;
let state = { kids: [], categories: [], balances: {}, history: [] };
let insights = [];
let selectedKidId = null;
let mode = "quick";
let quickType = "earn";
let pendingTap = null; // { kidId, categoryId, type } awaiting a note
let kidViewOnlyKidId = null; // set when opened via ?kid=name - Kid View then shows just that one card

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

function requirePin(title, run) {
  if (!pinProtectionOn() || Date.now() < pinUnlockedUntil) {
    run();
    return;
  }
  pinModalTitle.textContent = title;
  pinError.classList.add("hidden");
  pinInput.value = "";
  pinModal.classList.remove("hidden");
  setTimeout(() => pinInput.focus(), 50);
  pinResolve = run;
}

pinForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pin = pinInput.value.trim();
  if (!pin) return;
  const btn = pinForm.querySelector(".pinSubmit");
  btn.disabled = true;
  const res = await callApi("verify_pin", { token, pin });
  btn.disabled = false;
  if (!res.ok) {
    pinError.textContent = "Wrong PIN. Try again.";
    pinError.classList.remove("hidden");
    pinInput.value = "";
    pinInput.focus();
    return;
  }
  pinUnlockedUntil = Date.now() + PIN_UNLOCK_MS;
  pinModal.classList.add("hidden");
  const run = pinResolve;
  pinResolve = null;
  if (run) run();
});

pinCancelBtn.addEventListener("click", () => {
  pinModal.classList.add("hidden");
  pinResolve = null;
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
  maybeOpenKidViewFromUrl();
}

// --- Data loading -----------------------------------------------------

async function loadState() {
  const [stateRes, insightsRes] = await Promise.all([
    callApi("get_reward_state", { token }),
    callApi("get_reward_insights", { token }),
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
  if (!selectedKidId || !state.kids.some((k) => k.id === selectedKidId)) {
    selectedKidId = state.kids[0]?.id || null;
  }
  renderAll();
  if (!kidView.classList.contains("hidden")) renderKidView();
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
  renderInsights();
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
    insightsView.classList.toggle("hidden", mode !== "insights");
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
    btn.addEventListener("click", () => {
      const kidId = selectedKidId;
      const type = quickType;
      if (type === "spend") requirePin("PIN needed to spend", () => openNoteModal(kidId, cat.id, type));
      else openNoteModal(kidId, cat.id, type);
    });
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
    btn.addEventListener("click", () => {
      const { kid, cat, type } = btn.dataset;
      if (type === "spend") requirePin("PIN needed to spend", () => openNoteModal(kid, cat, type));
      else openNoteModal(kid, cat, type);
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
  const res = await callApi("adjust_reward", { token, kid_id: kidId, category_id: categoryId, type, note });
  await loadState();
  if (res.ok && res.data?.entry) showUndoToast(res.data.entry, kidId, categoryId, type);
}

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
    await callApi("undo_reward_log", { token, log_id: entry.id });
    await loadState();
  });
  toastContainer.appendChild(toast);
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

// --- Settings (PIN protection toggle, kid avatars, reset history) ---------

settingsBtn.addEventListener("click", () => {
  pinProtectionToggle.checked = pinProtectionOn();
  renderAvatarList();
  settingsModal.classList.remove("hidden");
});
settingsModalClose.addEventListener("click", () => settingsModal.classList.add("hidden"));

pinProtectionToggle.addEventListener("change", () => {
  localStorage.setItem(PIN_PROTECTION_KEY, pinProtectionToggle.checked ? "1" : "0");
});

function renderAvatarList() {
  avatarList.innerHTML = "";
  state.kids.forEach((kid) => {
    const row = document.createElement("div");
    row.className = "avatarRow";
    row.innerHTML = `
      <div class="avatarCurrentBtn">${kid.avatar_emoji || "⭐"}</div>
      <div class="avatarRowName">${escapeHtml(kid.name)}</div>
      <div class="avatarPicker" data-kid="${kid.id}"></div>
    `;
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
