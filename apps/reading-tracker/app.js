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
const aheadBehindBanner = document.getElementById("aheadBehindBanner");

const settingsCard = document.getElementById("settingsCard");
const goalPagesInput = document.getElementById("goalPagesInput");
const goalStartDateInput = document.getElementById("goalStartDateInput");
const spinThresholdInput = document.getElementById("spinThresholdInput");
const daysOfWeekChecks = document.getElementById("daysOfWeekChecks");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const settingsSaved = document.getElementById("settingsSaved");
const bonusSpinRow = document.getElementById("bonusSpinRow");

const holidaysList = document.getElementById("holidaysList");
const newHolidayStart = document.getElementById("newHolidayStart");
const newHolidayEnd = document.getElementById("newHolidayEnd");
const newHolidayLabel = document.getElementById("newHolidayLabel");
const addHolidayBtn = document.getElementById("addHolidayBtn");
const addHolidayError = document.getElementById("addHolidayError");

const currentlyReadingCard = document.getElementById("currentlyReadingCard");
const currentBooksList = document.getElementById("currentBooksList");
const newBookTitle = document.getElementById("newBookTitle");
const newBookTotalPages = document.getElementById("newBookTotalPages");
const newBookPageValue = document.getElementById("newBookPageValue");
const addBookBtn = document.getElementById("addBookBtn");
const addBookError = document.getElementById("addBookError");

const finishedBooksCard = document.getElementById("finishedBooksCard");
const finishedBooksList = document.getElementById("finishedBooksList");

let token = null;
let state = { kids: [], books: [], log: [], pages_today: {}, holidays: [] };
let selectedKidId = null;

// Which book cards have their page-log history expanded, and which single
// book/log row (if any) is mid-edit - all reset naturally on reload since
// there's nothing meaningful to preserve across a fresh loadState() other
// than which histories were left open.
let expandedBookIds = new Set();
let editingBookId = null;
let editingLogId = null;

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
  editingBookId = null;
  editingLogId = null;
  renderAll();
}

function kidColour(kidId) {
  const kid = state.kids.find((k) => k.id === kidId);
  if (kid?.theme_color) return kid.theme_color;
  const idx = state.kids.findIndex((k) => k.id === kidId);
  return KID_PALETTE[idx % KID_PALETTE.length] || "#888";
}

// Local calendar date, not UTC - toISOString().slice(0,10) would return
// yesterday's date for the first several hours of every local day in any
// UTC+ timezone (this app targets Australia/Sydney), silently mis-dating
// new log entries and corrupting the ahead/behind goal calculation below.
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Parsed as local midnight, not UTC - so date-range comparisons (holidays,
// goal start) can't land a day off depending on the browser's UTC offset.
function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateStr(dateStr) {
  return parseDateStr(dateStr).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

// How much one page of a given book counts against a "normal" page, as a
// fraction (1 = normal, 0.5 = two of its pages count as one, 1.5 = each page
// counts for one and a half). Lives on the book row rather than frozen onto
// each log entry, so changing it re-scores that book's whole history at once
// - which is why the book editor confirms before saving a change (see
// D-2026-08-31-book-page-value-multiplier).
//
// `overrides` lets a caller ask "what would the numbers look like at this
// value instead?" without touching state - that's what powers that confirm.
function pageValueFraction(bookId, overrides) {
  const override = overrides ? overrides[bookId] : undefined;
  if (override !== undefined) return override / 100;
  const book = state.books.find((b) => b.id === bookId);
  return (book?.page_value_percent ?? 100) / 100;
}

// Pages that count toward the goal and the bonus-spin threshold, as opposed
// to entry.pages_read (always real pages of the physical book).
function countedPages(entry, overrides) {
  return entry.pages_read * pageValueFraction(entry.book_id, overrides);
}

// Whether any of this kid's books is weighted at all - purely a wording
// choice, so "pages ahead" only becomes the wordier "counted pages ahead"
// for a family actually using multipliers.
function kidUsesPageValues(kidId) {
  return state.books.some((b) => b.kid_id === kidId && (b.page_value_percent ?? 100) !== 100);
}

// Counted pages can land on a fraction (15 real pages at 50%); show one
// decimal at most, and never a trailing ".0".
function formatCounted(n) {
  return Number(n.toFixed(1)).toString();
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

// How many pages a kid should have read by today (goal_pages x every
// included calendar day from their goal start date to today, skipping
// weekdays not selected and any date inside a reading holiday), compared
// against what they've actually logged since that start date. Positive =
// ahead, negative = behind, null = goal isn't set up yet (no start date/
// goal pages) or starts in the future. Actual pages are counted pages, not
// raw ones - a book set to 50% contributes half of what was logged against
// it (see pageValueFraction above).
function computeAheadBehind(kidId, overrides) {
  const kid = state.kids.find((k) => k.id === kidId);
  if (!kid || !kid.reading_daily_goal_pages || !kid.reading_goal_start_date) return null;
  const start = parseDateStr(kid.reading_goal_start_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start > today) return null;

  const daysSet =
    kid.reading_goal_days_of_week && kid.reading_goal_days_of_week.length
      ? new Set(kid.reading_goal_days_of_week)
      : new Set([0, 1, 2, 3, 4, 5, 6]);
  const holidayRanges = state.holidays
    .filter((h) => h.kid_id === kidId)
    .map((h) => [parseDateStr(h.start_date), parseDateStr(h.end_date)]);
  const isHoliday = (d) => holidayRanges.some(([s, e]) => d >= s && d <= e);

  let expectedDays = 0;
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    if (daysSet.has(d.getDay()) && !isHoliday(d)) expectedDays++;
  }
  const expectedPages = expectedDays * kid.reading_daily_goal_pages;

  const startStr = kid.reading_goal_start_date;
  const actualPages = state.log
    .filter((l) => l.kid_id === kidId && l.log_date >= startStr)
    .reduce((sum, l) => sum + countedPages(l, overrides), 0);

  // Rounded before the comparison so the banner never claims a fractional
  // page - expectedPages is always a whole number, so the diff is too.
  return Math.round(actualPages) - expectedPages;
}

// --- Rendering -----------------------------------------------------

function renderAll() {
  renderKidPicker();
  const hasKid = !!selectedKidId;
  settingsCard.classList.toggle("hidden", !hasKid);
  currentlyReadingCard.classList.toggle("hidden", !hasKid);
  finishedBooksCard.classList.toggle("hidden", !hasKid);
  if (!hasKid) {
    aheadBehindBanner.classList.add("hidden");
    return;
  }
  renderAheadBehindBanner();
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
    btn.innerHTML = `<span class="kidChipAvatar">${escapeHtml(kid.avatar_emoji || "⭐")}</span><span>${escapeHtml(kid.name)}</span>`;
    btn.addEventListener("click", () => {
      selectedKidId = kid.id;
      expandedBookIds = new Set();
      editingBookId = null;
      editingLogId = null;
      renderAll();
    });
    kidPickerRow.appendChild(btn);
  });
}

// "12 pages ahead of schedule", or "12 counted pages ahead of schedule" for
// a kid with at least one weighted book - the qualifier only shows up where
// it means something.
function describeAheadBehind(diff, kidId, countedWording) {
  const noun = (countedWording ?? kidUsesPageValues(kidId)) ? "counted page" : "page";
  if (diff > 0) return `${diff} ${noun}${diff === 1 ? "" : "s"} ahead of schedule`;
  if (diff < 0) {
    const behind = Math.abs(diff);
    return `${behind} ${noun}${behind === 1 ? "" : "s"} behind schedule`;
  }
  return "right on schedule";
}

function renderAheadBehindBanner() {
  const diff = computeAheadBehind(selectedKidId);
  aheadBehindBanner.classList.remove("aheadBanner", "behindBanner", "evenBanner");
  if (diff === null) {
    aheadBehindBanner.classList.add("hidden");
    return;
  }
  aheadBehindBanner.classList.remove("hidden");
  if (diff > 0) {
    aheadBehindBanner.classList.add("aheadBanner");
    aheadBehindBanner.textContent = `🟢 ${describeAheadBehind(diff, selectedKidId)}`;
  } else if (diff < 0) {
    aheadBehindBanner.classList.add("behindBanner");
    aheadBehindBanner.textContent = `🔴 ${describeAheadBehind(diff, selectedKidId)}`;
  } else {
    aheadBehindBanner.classList.add("evenBanner");
    aheadBehindBanner.textContent = `✅ Right on schedule`;
  }
}

function renderSettings() {
  const kid = state.kids.find((k) => k.id === selectedKidId);
  if (!kid) return;
  goalPagesInput.value = kid.reading_daily_goal_pages ?? "";
  // Defaults to today rather than blank (same convention as the log-date
  // input) - a goal pages value with no start date can never activate the
  // ahead/behind banner, and that's an easy field to skip since it isn't
  // required to save the goal at all. Showing today ready-to-confirm means
  // just hitting Save (without touching this field) still turns tracking on.
  goalStartDateInput.value = kid.reading_goal_start_date || todayStr();
  spinThresholdInput.value = kid.reading_spin_threshold_pages ?? "";
  settingsSaved.classList.add("hidden");

  const checkedDays =
    kid.reading_goal_days_of_week && kid.reading_goal_days_of_week.length
      ? new Set(kid.reading_goal_days_of_week)
      : new Set([0, 1, 2, 3, 4, 5, 6]);
  daysOfWeekChecks.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.checked = checkedDays.has(Number(cb.value));
  });

  const spins = kid.bonus_spins || 0;
  bonusSpinRow.classList.toggle("hidden", spins === 0);
  bonusSpinRow.textContent = spins > 0 ? `🎉 ${spins} bonus spin${spins === 1 ? "" : "s"} waiting - spin it in Reward Tracker!` : "";

  renderHolidays();
}

saveSettingsBtn.addEventListener("click", async () => {
  if (!selectedKidId) return;
  settingsSaved.classList.add("hidden");
  const checkedDays = [...daysOfWeekChecks.querySelectorAll("input[type=checkbox]:checked")].map((cb) => Number(cb.value));
  // An empty selection is indistinguishable from "never configured" (see
  // renderSettings()/computeAheadBehind(), both treat a stored [] the same
  // as null - "all 7 days") - saving it would silently revert to all 7 days
  // on the next load instead of the "no days count" the parent just chose.
  if (!checkedDays.length) {
    showToast("Pick at least one day for the reading goal.", true);
    return;
  }
  saveSettingsBtn.disabled = true;
  const res = await callApi("set_reading_settings", {
    token,
    kid_id: selectedKidId,
    goal_pages: goalPagesInput.value.trim(),
    spin_threshold_pages: spinThresholdInput.value.trim(),
    goal_start_date: goalStartDateInput.value,
    goal_days_of_week: checkedDays,
  });
  saveSettingsBtn.disabled = false;
  if (!res.ok) {
    showToast("Couldn't save that - try again.", true);
    return;
  }
  settingsSaved.classList.remove("hidden");
  await loadState();
});

function renderHolidays() {
  holidaysList.innerHTML = "";
  const holidays = state.holidays
    .filter((h) => h.kid_id === selectedKidId)
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  if (!holidays.length) {
    holidaysList.innerHTML = `<p class="empty">No reading holidays set.</p>`;
    return;
  }
  holidays.forEach((h) => {
    const row = document.createElement("div");
    row.className = "holidayRow";
    row.innerHTML = `
      <div class="holidayMain">${formatDateStr(h.start_date)} – ${formatDateStr(h.end_date)}${h.label ? ` · ${escapeHtml(h.label)}` : ""}</div>
      <button type="button" class="holidayDeleteBtn" data-id="${h.id}">🗑</button>
    `;
    row.querySelector(".holidayDeleteBtn").addEventListener("click", async () => {
      const ok = await askConfirm("Delete this reading holiday?");
      if (!ok) return;
      const res = await callApi("delete_reading_holiday", { token, holiday_id: h.id });
      if (!res.ok) {
        showToast("Couldn't delete that - try again.", true);
        return;
      }
      await loadState();
    });
    holidaysList.appendChild(row);
  });
}

addHolidayBtn.addEventListener("click", async () => {
  addHolidayError.classList.add("hidden");
  const start = newHolidayStart.value;
  const end = newHolidayEnd.value;
  if (!start || !end) {
    addHolidayError.textContent = "Pick a start and end date.";
    addHolidayError.classList.remove("hidden");
    return;
  }
  if (end < start) {
    addHolidayError.textContent = "End date must be on or after the start date.";
    addHolidayError.classList.remove("hidden");
    return;
  }
  addHolidayBtn.disabled = true;
  const res = await callApi("add_reading_holiday", {
    token,
    kid_id: selectedKidId,
    start_date: start,
    end_date: end,
    label: newHolidayLabel.value.trim(),
  });
  addHolidayBtn.disabled = false;
  if (!res.ok) {
    addHolidayError.textContent = "Couldn't add that - try again.";
    addHolidayError.classList.remove("hidden");
    return;
  }
  newHolidayStart.value = "";
  newHolidayEnd.value = "";
  newHolidayLabel.value = "";
  await loadState();
});

// --- Log history (per book) -------------------------------------------

function renderLogHistory(book) {
  const entries = state.log.filter((l) => l.book_id === book.id);
  if (!entries.length) return `<p class="empty">No pages logged yet.</p>`;
  return entries
    .map((entry) => {
      // entry.id is a bigint from Postgres (a JS number here); editingLogId
      // is always set from a DOM dataset value (a string) - compare as
      // strings so this actually matches instead of silently never firing.
      if (String(editingLogId) === String(entry.id)) {
        return `
          <div class="logHistoryRow" data-log="${entry.id}">
            <div class="logHistoryEditFields">
              <input type="date" class="logEditDate" value="${entry.log_date}" />
              <input type="number" class="logEditPage" min="0" value="${entry.page_up_to}" />
              <input type="text" class="logEditNote" maxlength="140" placeholder="Note (optional)" value="${escapeHtml(entry.note || "")}" />
            </div>
            <div class="logHistoryBtns">
              <button type="button" class="logEditSaveBtn" data-id="${entry.id}">Save</button>
              <button type="button" class="logEditCancelBtn" data-id="${entry.id}">Cancel</button>
            </div>
          </div>`;
      }
      const counted = countedPages(entry);
      const readLabel = counted === entry.pages_read ? `+${entry.pages_read}` : `+${entry.pages_read} → ${formatCounted(counted)} counted`;
      return `
        <div class="logHistoryRow" data-log="${entry.id}">
          <div class="logHistoryMain">
            ${formatDateStr(entry.log_date)} · page ${entry.page_up_to} (${readLabel})${entry.note ? ` · ${escapeHtml(entry.note)}` : ""}
          </div>
          <div class="logHistoryBtns">
            <button type="button" class="logEditBtn" data-id="${entry.id}" title="Edit">✏️</button>
            <button type="button" class="logDeleteBtn" data-id="${entry.id}" title="Delete">🗑</button>
          </div>
        </div>`;
    })
    .join("");
}

function bindLogHistoryHandlers(cardEl, book) {
  cardEl.querySelectorAll(".logEditBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingLogId = btn.dataset.id;
      renderAll();
    });
  });
  cardEl.querySelectorAll(".logEditCancelBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingLogId = null;
      renderAll();
    });
  });
  cardEl.querySelectorAll(".logEditSaveBtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".logHistoryRow");
      const logDate = row.querySelector(".logEditDate").value;
      const pageVal = row.querySelector(".logEditPage").value;
      const note = row.querySelector(".logEditNote").value.trim();
      if (pageVal === "" || Number(pageVal) < 0) {
        showToast("Enter a valid page number.", true);
        return;
      }
      btn.disabled = true;
      const res = await callApi("edit_reading_log", { token, log_id: btn.dataset.id, log_date: logDate, page_up_to: Number(pageVal), note });
      btn.disabled = false;
      if (!res.ok) {
        showToast("Couldn't save that - try again.", true);
        return;
      }
      editingLogId = null;
      await loadState();
    });
  });
  cardEl.querySelectorAll(".logDeleteBtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = await askConfirm("Delete this log entry? This can't be undone.");
      if (!ok) return;
      const res = await callApi("undo_reading_log", { token, log_id: btn.dataset.id });
      if (!res.ok) {
        showToast("Couldn't delete that - try again.", true);
        return;
      }
      await loadState();
    });
  });
}

// --- Nightly goal readout ----------------------------------------------

// The kid's pages-per-night goal, shown on every currently-reading book card
// so it doesn't have to be remembered from the Setup section further down the
// page. Deliberately just the number, not a computed "read to page N" target
// (D-2026-08-31-nightly-goal-readout) - but it does check whether tonight
// counts at all, because printing "15 pages a night" on a rest day or a
// reading holiday would be confidently wrong rather than merely terse.
// Returns null when there's no goal to show.
function nightlyGoalLabel(kidId) {
  const kid = state.kids.find((k) => k.id === kidId);
  if (!kid || !kid.reading_daily_goal_pages) return null;

  const noun = kidUsesPageValues(kidId) ? "counted pages" : "pages";
  const goalText = `${kid.reading_daily_goal_pages} ${noun} a night`;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // A goal that hasn't started yet isn't tonight's goal - say when it kicks in
  // rather than implying it's already running (matches computeAheadBehind,
  // which returns null and hides the banner for exactly this case).
  if (kid.reading_goal_start_date && parseDateStr(kid.reading_goal_start_date) > today) {
    return `🎯 Goal starts ${formatDateStr(kid.reading_goal_start_date)}: ${goalText}`;
  }

  const onHoliday = state.holidays.some(
    (h) => h.kid_id === kidId && today >= parseDateStr(h.start_date) && today <= parseDateStr(h.end_date)
  );
  if (onHoliday) return `🎯 Reading holiday today - no goal tonight`;

  const daysSet =
    kid.reading_goal_days_of_week && kid.reading_goal_days_of_week.length
      ? new Set(kid.reading_goal_days_of_week)
      : new Set([0, 1, 2, 3, 4, 5, 6]);
  if (!daysSet.has(today.getDay())) return `🎯 Tonight isn't a goal night - ${goalText} otherwise`;

  return `🎯 Goal: ${goalText}`;
}

// --- Page value (per-book multiplier) ----------------------------------

// Blank means "a normal book" (100%), not "unset" - the column is NOT NULL.
// Returns null for anything that isn't a whole 1-1000, matching the edge
// function's parsePageValuePercent and the column's own CHECK constraint.
function parsePageValueInput(raw) {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") return 100;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) return null;
  return parsed;
}

// The confirm shown before a page-value change lands. Because the value is
// stored on the book (not frozen per log entry), the change re-scores every
// page already logged against it - so the prompt states the actual before/
// after schedule numbers rather than just asking "are you sure?".
function describePageValueChange(book, fromPct, toPct) {
  const before = computeAheadBehind(book.kid_id);
  const after = computeAheadBehind(book.kid_id, { [book.id]: toPct });
  const lead =
    `Change "${book.title}" from ${fromPct}% to ${toPct}% page value?\n\n` +
    `Every page already logged for this book is recounted at the new value.`;
  const spins = `Progress toward the next bonus spin recounts too - spins already earned are never taken back.`;
  if (before === null || after === null || before === after) return `${lead} ${spins}`;
  // "after" may be the kid's first weighted book, so its wording can't be
  // inferred from the current state the way the "before" half can.
  const afterWeighted =
    toPct !== 100 ||
    state.books.some((b) => b.kid_id === book.kid_id && b.id !== book.id && (b.page_value_percent ?? 100) !== 100);
  return `${lead} This kid goes from ${describeAheadBehind(before, book.kid_id)} to ${describeAheadBehind(after, book.kid_id, afterWeighted)}. ${spins}`;
}

// --- Book cards (currently reading + finished) --------------------------

function renderBookCard(book, isFinished) {
  const { currentPage, lastLogDate } = bookProgress(book.id);
  const pct = book.total_pages ? Math.min(100, Math.round((currentPage / book.total_pages) * 100)) : null;
  const isEditingBook = editingBookId === book.id;
  const isExpanded = expandedBookIds.has(book.id);
  const entryCount = state.log.filter((l) => l.book_id === book.id).length;

  const card = document.createElement("div");
  card.className = "bookCard";

  const pageValuePercent = book.page_value_percent ?? 100;
  const goalLabel = nightlyGoalLabel(book.kid_id);

  const headHtml = isEditingBook
    ? `
      <div class="bookEditFields">
        <input type="text" class="bookEditTitle" maxlength="140" value="${escapeHtml(book.title)}" />
        <input type="number" class="bookEditPages" min="1" placeholder="Total pages (optional)" value="${book.total_pages ?? ""}" />
        <input type="number" class="bookEditPageValue" min="1" max="1000" placeholder="Page value % (100)" value="${pageValuePercent}" />
      </div>
      <div class="bookHeadBtns">
        <button type="button" class="bookEditSaveBtn" data-id="${book.id}">Save</button>
        <button type="button" class="bookEditCancelBtn">Cancel</button>
      </div>`
    : `
      <div class="bookTitle">${escapeHtml(book.title)}</div>
      <div class="bookHeadBtns">
        <button type="button" class="bookEditBtn" data-id="${book.id}" title="Edit book">✏️</button>
        <button type="button" class="bookDeleteBtn" data-id="${book.id}" title="Delete book">🗑</button>
      </div>`;

  card.innerHTML = `
    <div class="bookHead">${headHtml}</div>
    <div class="bookMeta">
      ${book.total_pages ? `Page ${currentPage} of ${book.total_pages}` : currentPage ? `Page ${currentPage}` : "No pages logged yet"}
      ${lastLogDate ? ` · last logged ${formatDateStr(lastLogDate)}` : ""}
      ${isFinished && book.finished_date ? ` · finished ${formatDateStr(book.finished_date)}` : ""}
      ${pageValuePercent !== 100 ? ` · <span class="pageValueTag">${pageValuePercent}% page value</span>` : ""}
    </div>
    ${pct !== null ? `<div class="progressTrack"><div class="progressFill" style="width:${pct}%"></div></div>` : ""}
    ${!isFinished && goalLabel ? `<div class="goalHint">${escapeHtml(goalLabel)}</div>` : ""}
    ${
      isFinished
        ? ""
        : `<div class="logRow">
            <input type="date" class="logDateInput" value="${todayStr()}" />
            <input type="number" class="logPageInput" min="0" placeholder="Page up to" />
            <button type="button" class="logBtn" data-id="${book.id}">Log</button>
          </div>`
    }
    <div class="bookFootBtns">
      <button type="button" class="historyToggleBtn" data-id="${book.id}">📜 ${isExpanded ? "Hide" : "Show"} history (${entryCount})</button>
      ${isFinished ? `<button type="button" class="reopenBtn" data-id="${book.id}">↩ Reopen</button>` : `<button type="button" class="finishBtn" data-id="${book.id}">🏁 Mark finished</button>`}
    </div>
    ${isExpanded ? `<div class="logHistoryList">${renderLogHistory(book)}</div>` : ""}
  `;

  if (isEditingBook) {
    card.querySelector(".bookEditSaveBtn").addEventListener("click", async () => {
      const title = card.querySelector(".bookEditTitle").value.trim();
      if (!title) {
        showToast("A book needs a title.", true);
        return;
      }
      const totalPages = card.querySelector(".bookEditPages").value.trim();
      const pageValue = parsePageValueInput(card.querySelector(".bookEditPageValue").value);
      if (pageValue === null) {
        showToast("Page value must be a whole percentage between 1 and 1000 (100 = a normal page).", true);
        return;
      }
      // Changing this re-scores every page already logged against this book,
      // so spell out what it does to the kid's schedule before doing it.
      if (pageValue !== pageValuePercent) {
        const ok = await askConfirm(describePageValueChange(book, pageValuePercent, pageValue));
        if (!ok) return;
      }
      const res = await callApi("edit_book", { token, book_id: book.id, title, total_pages: totalPages, page_value_percent: pageValue });
      if (!res.ok) {
        showToast("Couldn't save that - try again.", true);
        return;
      }
      editingBookId = null;
      await loadState();
    });
    card.querySelector(".bookEditCancelBtn").addEventListener("click", () => {
      editingBookId = null;
      renderAll();
    });
  } else {
    card.querySelector(".bookEditBtn").addEventListener("click", () => {
      editingBookId = book.id;
      renderAll();
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
  }

  card.querySelector(".historyToggleBtn").addEventListener("click", () => {
    if (expandedBookIds.has(book.id)) expandedBookIds.delete(book.id);
    else expandedBookIds.add(book.id);
    renderAll();
  });
  bindLogHistoryHandlers(card, book);

  if (!isFinished) {
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
  } else {
    card.querySelector(".reopenBtn").addEventListener("click", async () => {
      const res = await callApi("reopen_book", { token, book_id: book.id });
      if (!res.ok) {
        showToast("Couldn't do that - try again.", true);
        return;
      }
      await loadState();
    });
  }

  return card;
}

function renderCurrentBooks() {
  currentBooksList.innerHTML = "";
  const books = state.books.filter((b) => b.kid_id === selectedKidId && b.status === "reading");
  if (!books.length) {
    currentBooksList.innerHTML = `<p class="empty">Not reading anything yet - start a book below.</p>`;
  }
  books.forEach((book) => currentBooksList.appendChild(renderBookCard(book, false)));
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
  const pageValue = parsePageValueInput(newBookPageValue.value);
  if (pageValue === null) {
    addBookError.textContent = "Page value must be a whole percentage between 1 and 1000 (100 = a normal page).";
    addBookError.classList.remove("hidden");
    return;
  }
  addBookBtn.disabled = true;
  const res = await callApi("start_book", {
    token,
    kid_id: selectedKidId,
    title,
    total_pages: totalPagesVal,
    page_value_percent: pageValue,
  });
  addBookBtn.disabled = false;
  if (!res.ok) {
    addBookError.textContent = "Couldn't add that - try again.";
    addBookError.classList.remove("hidden");
    return;
  }
  newBookTitle.value = "";
  newBookTotalPages.value = "";
  newBookPageValue.value = "";
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
  books.forEach((book) => finishedBooksList.appendChild(renderBookCard(book, true)));
}

// --- Boot -----------------------------------------------------------------

showAppVersion("appVersion");

token = localStorage.getItem(TOKEN_KEY);
if (token) {
  enterApp();
} else {
  gate.classList.remove("hidden");
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}
