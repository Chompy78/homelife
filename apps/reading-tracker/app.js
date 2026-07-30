import { callApi } from "../shared/api.js";
import { askConfirm } from "../shared/confirm.js";
import { escapeHtml } from "../shared/escape.js";
import { showAppVersion } from "../shared/version.js";

// Same key every parent-facing app shares - a parent already logged in
// elsewhere on this device is automatically logged in here too.
const TOKEN_KEY = "homelife_parent_token";
const TOAST_MS = 4000;

const KID_PALETTE = ["#ff5c8a", "#009688", "#7d5fff", "#f2994a", "#2196f3", "#8bc34a"];

const gate = document.getElementById("gate");
const codeForm = document.getElementById("codeForm");
const codeInput = document.getElementById("codeInput");
const codeError = document.getElementById("codeError");
const appEl = document.getElementById("app");
const switchFamilyLink = document.getElementById("switchFamilyLink");
const toastContainer = document.getElementById("toastContainer");

const kidPickerRow = document.getElementById("kidPickerRow");

const settingsCard = document.getElementById("settingsCard");
const goalPagesInput = document.getElementById("goalPagesInput");
const spinThresholdInput = document.getElementById("spinThresholdInput");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const settingsSaved = document.getElementById("settingsSaved");
const bonusSpinRow = document.getElementById("bonusSpinRow");

const currentlyReadingCard = document.getElementById("currentlyReadingCard");
const currentBooksList = document.getElementById("currentBooksList");
const newBookTitle = document.getElementById("newBookTitle");
const newBookTotalPages = document.getElementById("newBookTotalPages");
const addBookBtn = document.getElementById("addBookBtn");
const addBookError = document.getElementById("addBookError");

const finishedBooksCard = document.getElementById("finishedBooksCard");
const finishedBooksList = document.getElementById("finishedBooksList");

let token = null;
let state = { kids: [], books: [], log: [], pages_today: {} };
let selectedKidId = null;

// --- Toasts ---------------------------------------------------------------

function showToast(message, isError = false) {
  const toast = document.createElement("div");
  toast.className = "toast" + (isError ? " toastError" : "");
  toast.innerHTML = `<div>${escapeHtml(message)}</div>`;
  setTimeout(() => toast.remove(), TOAST_MS);
  toastContainer.appendChild(toast);
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

async function enterApp() {
  gate.classList.add("hidden");
  appEl.classList.remove("hidden");
  await loadState();
}

// --- Data loading -----------------------------------------------------

let loadStateSeq = 0;

async function loadState() {
  const seq = ++loadStateSeq;
  const res = await callApi("get_reading_state", { token });
  if (seq !== loadStateSeq) return;
  if (!res.ok) {
    if (res.error === "session_expired") {
      localStorage.removeItem(TOKEN_KEY);
      location.reload();
      return;
    }
    showToast("Couldn't refresh - check your connection and try again.", true);
    return;
  }
  state = res.data;
  if (!selectedKidId || !state.kids.some((k) => k.id === selectedKidId)) {
    selectedKidId = state.kids[0]?.id || null;
  }
  renderAll();
}

function kidColour(kidId) {
  const kid = state.kids.find((k) => k.id === kidId);
  if (kid?.theme_color) return kid.theme_color;
  const idx = state.kids.findIndex((k) => k.id === kidId);
  return KID_PALETTE[idx % KID_PALETTE.length] || "#888";
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

// Latest logged page and total pages read so far for a book - derived from
// state.log rather than stored on the book row, same "compute, don't cache"
// approach as the reward tracker's live balances.
function bookProgress(bookId) {
  const entries = state.log.filter((l) => l.book_id === bookId);
  if (!entries.length) return { currentPage: 0, totalRead: 0, lastLogDate: null };
  // state.log is already ordered log_date desc, created_at desc.
  const latest = entries[0];
  const totalRead = entries.reduce((sum, e) => sum + e.pages_read, 0);
  return { currentPage: latest.page_up_to, totalRead, lastLogDate: latest.log_date };
}

// --- Rendering -----------------------------------------------------

function renderAll() {
  renderKidPicker();
  const hasKid = !!selectedKidId;
  settingsCard.classList.toggle("hidden", !hasKid);
  currentlyReadingCard.classList.toggle("hidden", !hasKid);
  finishedBooksCard.classList.toggle("hidden", !hasKid);
  if (!hasKid) return;
  renderSettings();
  renderCurrentBooks();
  renderFinishedBooks();
}

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

function renderSettings() {
  const kid = state.kids.find((k) => k.id === selectedKidId);
  if (!kid) return;
  goalPagesInput.value = kid.reading_daily_goal_pages ?? "";
  spinThresholdInput.value = kid.reading_spin_threshold_pages ?? "";
  settingsSaved.classList.add("hidden");
  const spins = kid.bonus_spins || 0;
  bonusSpinRow.classList.toggle("hidden", spins === 0);
  bonusSpinRow.textContent = spins > 0 ? `🎉 ${spins} bonus spin${spins === 1 ? "" : "s"} waiting - spin it in Reward Tracker!` : "";
}

saveSettingsBtn.addEventListener("click", async () => {
  if (!selectedKidId) return;
  settingsSaved.classList.add("hidden");
  saveSettingsBtn.disabled = true;
  const res = await callApi("set_reading_settings", {
    token,
    kid_id: selectedKidId,
    goal_pages: goalPagesInput.value.trim(),
    spin_threshold_pages: spinThresholdInput.value.trim(),
  });
  saveSettingsBtn.disabled = false;
  if (!res.ok) {
    showToast("Couldn't save that - try again.", true);
    return;
  }
  settingsSaved.classList.remove("hidden");
  await loadState();
});

function renderCurrentBooks() {
  currentBooksList.innerHTML = "";
  const books = state.books.filter((b) => b.kid_id === selectedKidId && b.status === "reading");
  if (!books.length) {
    currentBooksList.innerHTML = `<p class="empty">Not reading anything yet - start a book below.</p>`;
  }
  books.forEach((book) => {
    const { currentPage, lastLogDate } = bookProgress(book.id);
    const pct = book.total_pages ? Math.min(100, Math.round((currentPage / book.total_pages) * 100)) : null;

    const card = document.createElement("div");
    card.className = "bookCard";
    card.innerHTML = `
      <div class="bookHead">
        <div class="bookTitle">${escapeHtml(book.title)}</div>
        <button type="button" class="bookDeleteBtn" data-id="${book.id}" title="Delete book">🗑</button>
      </div>
      <div class="bookMeta">
        ${book.total_pages ? `Page ${currentPage} of ${book.total_pages}` : currentPage ? `Page ${currentPage}` : "No pages logged yet"}
        ${lastLogDate ? ` · last logged ${formatDateStr(lastLogDate)}` : ""}
      </div>
      ${pct !== null ? `<div class="progressTrack"><div class="progressFill" style="width:${pct}%"></div></div>` : ""}
      <div class="logRow">
        <input type="date" class="logDateInput" value="${todayStr()}" />
        <input type="number" class="logPageInput" min="0" placeholder="Page up to" />
        <button type="button" class="logBtn" data-id="${book.id}">Log</button>
      </div>
      <div class="bookFootBtns">
        <button type="button" class="finishBtn" data-id="${book.id}">🏁 Mark finished</button>
      </div>
    `;

    card.querySelector(".logBtn").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const dateVal = card.querySelector(".logDateInput").value || todayStr();
      const pageVal = card.querySelector(".logPageInput").value;
      if (pageVal === "" || Number(pageVal) < 0) {
        showToast("Enter the page they're up to.", true);
        return;
      }
      btn.disabled = true;
      const res = await callApi("log_reading_pages", {
        token,
        kid_id: selectedKidId,
        book_id: book.id,
        log_date: dateVal,
        page_up_to: Number(pageVal),
      });
      btn.disabled = false;
      if (!res.ok) {
        showToast("Couldn't log that - try again.", true);
        return;
      }
      const pagesRead = res.data.entry.pages_read;
      const spinsGranted = res.data.spins_granted || 0;
      showToast(
        spinsGranted > 0
          ? `📖 +${pagesRead} pages - 🎉 ${spinsGranted} bonus spin${spinsGranted === 1 ? "" : "s"} earned!`
          : `📖 +${pagesRead} pages logged.`
      );
      await loadState();
    });

    card.querySelector(".finishBtn").addEventListener("click", async () => {
      const ok = await askConfirm(`Mark "${book.title}" as finished?`);
      if (!ok) return;
      const res = await callApi("finish_book", { token, book_id: book.id, finished_date: todayStr() });
      if (!res.ok) {
        showToast("Couldn't do that - try again.", true);
        return;
      }
      await loadState();
    });

    card.querySelector(".bookDeleteBtn").addEventListener("click", async () => {
      const ok = await askConfirm(`Delete "${book.title}" and all its logged pages? This can't be undone.`);
      if (!ok) return;
      const res = await callApi("delete_book", { token, book_id: book.id });
      if (!res.ok) {
        showToast("Couldn't delete that - try again.", true);
        return;
      }
      await loadState();
    });

    currentBooksList.appendChild(card);
  });
}

addBookBtn.addEventListener("click", async () => {
  addBookError.classList.add("hidden");
  const title = newBookTitle.value.trim();
  if (!title) {
    addBookError.textContent = "Enter a book title first.";
    addBookError.classList.remove("hidden");
    return;
  }
  const totalPagesVal = newBookTotalPages.value.trim();
  addBookBtn.disabled = true;
  const res = await callApi("start_book", {
    token,
    kid_id: selectedKidId,
    title,
    total_pages: totalPagesVal,
  });
  addBookBtn.disabled = false;
  if (!res.ok) {
    addBookError.textContent = "Couldn't add that - try again.";
    addBookError.classList.remove("hidden");
    return;
  }
  newBookTitle.value = "";
  newBookTotalPages.value = "";
  await loadState();
});

function renderFinishedBooks() {
  finishedBooksList.innerHTML = "";
  const books = state.books
    .filter((b) => b.kid_id === selectedKidId && b.status === "finished")
    .sort((a, b) => (b.finished_date || "").localeCompare(a.finished_date || ""));
  if (!books.length) {
    finishedBooksList.innerHTML = `<p class="empty">No finished books yet.</p>`;
    return;
  }
  books.forEach((book) => {
    const row = document.createElement("div");
    row.className = "finishedRow";
    row.innerHTML = `
      <div class="finishedMain">
        <div class="finishedTitle">${escapeHtml(book.title)}</div>
        <div class="finishedMeta">Finished ${formatDateStr(book.finished_date)}${book.total_pages ? ` · ${book.total_pages} pages` : ""}</div>
      </div>
      <div class="bookFootBtns">
        <button type="button" class="reopenBtn" data-id="${book.id}" title="Reopen">↩</button>
        <button type="button" class="finishedDeleteBtn" data-id="${book.id}" title="Delete">🗑</button>
      </div>
    `;
    row.querySelector(".reopenBtn").addEventListener("click", async () => {
      const res = await callApi("reopen_book", { token, book_id: book.id });
      if (!res.ok) {
        showToast("Couldn't do that - try again.", true);
        return;
      }
      await loadState();
    });
    row.querySelector(".finishedDeleteBtn").addEventListener("click", async () => {
      const ok = await askConfirm(`Delete "${book.title}" and all its logged pages? This can't be undone.`);
      if (!ok) return;
      const res = await callApi("delete_book", { token, book_id: book.id });
      if (!res.ok) {
        showToast("Couldn't delete that - try again.", true);
        return;
      }
      await loadState();
    });
    finishedBooksList.appendChild(row);
  });
}

// --- Boot -----------------------------------------------------------------

showAppVersion("appVersion");

token = localStorage.getItem(TOKEN_KEY);
if (token) {
  enterApp();
} else {
  gate.classList.remove("hidden");
}
