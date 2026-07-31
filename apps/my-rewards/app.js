import { callApi } from "../shared/api.js";
import { escapeHtml } from "../shared/escape.js";
import { showAppVersion } from "../shared/version.js";

// Same key bedroom-reset uses - a kid already logged into bedroom-reset on
// this device is automatically logged in here too, since both apps share
// an origin (just a different path) and localStorage is scoped per-origin.
const TOKEN_KEY = "homelife_kid_token";
const REFRESH_INTERVAL_MS = 30000;

// Same pool the backend validates against - a kid picks one of these as
// their own secret picture, then picks it again (out of a shuffled grid of
// all of them) to accept an incoming trade. Not a stronger security model
// than a PIN - just a kid-friendlier one, same "friction, not a real
// boundary" posture as the parent app's PIN.
const VERIFY_IMAGE_POOL = ["🐸", "🦄", "🍕", "🚗", "⚽", "🎈", "🐶", "🌈", "🍦", "🎨", "🐱", "🚀", "🦋", "🍩", "🐢", "🎵"];

const gate = document.getElementById("gate");
const codeForm = document.getElementById("codeForm");
const codeInput = document.getElementById("codeInput");
const codeError = document.getElementById("codeError");
const appEl = document.getElementById("app");
const avatarEl = document.getElementById("avatar");
const nameEl = document.getElementById("name");
const totalEl = document.getElementById("total");
const categoryListEl = document.getElementById("categoryList");
const bigRewardsSection = document.getElementById("bigRewardsSection");
const bigRewardsListEl = document.getElementById("bigRewardsList");
const refreshBtn = document.getElementById("refreshBtn");
const switchKidLink = document.getElementById("switchKidLink");
const openTradeBtn = document.getElementById("openTradeBtn");
const tradeBadge = document.getElementById("tradeBadge");

const tradeModal = document.getElementById("tradeModal");
const tradeModalClose = document.getElementById("tradeModalClose");
const tradeListView = document.getElementById("tradeListView");
const incomingTradesEl = document.getElementById("incomingTrades");
const outgoingTradesEl = document.getElementById("outgoingTrades");
const proposeTradeBtn = document.getElementById("proposeTradeBtn");
const changeSecretLink = document.getElementById("changeSecretLink");

const tradeProposeView = document.getElementById("tradeProposeView");
const tradeProposeBack = document.getElementById("tradeProposeBack");
const siblingPicker = document.getElementById("siblingPicker");
const giveCategorySelect = document.getElementById("giveCategorySelect");
const giveQtyInput = document.getElementById("giveQtyInput");
const receiveCategorySelect = document.getElementById("receiveCategorySelect");
const receiveQtyInput = document.getElementById("receiveQtyInput");
const sendTradeBtn = document.getElementById("sendTradeBtn");
const tradeError = document.getElementById("tradeError");

const verifyModal = document.getElementById("verifyModal");
const verifyTitle = document.getElementById("verifyTitle");
const verifySub = document.getElementById("verifySub");
const verifyGrid = document.getElementById("verifyGrid");
const verifyError = document.getElementById("verifyError");
const verifyCancelBtn = document.getElementById("verifyCancelBtn");

let token = null;
let refreshTimer = null;
// loadState() has three independent triggers (manual refresh, the 30s
// interval, and an extra immediate call on visibilitychange) that can
// overlap - without a sequence guard, an older request's response landing
// after a newer one's would silently overwrite fresher state. Mirrors
// reward-tracker's own loadStateSeq fix for the same bug class. A separate
// counter for trade state specifically, since refreshTradeState() is also
// called on its own (accept/decline/propose flows), independent of loadState().
let loadStateSeq = 0;
let tradeStateSeq = 0;
let tradeState = { verify_image_set: false, verify_locked_until: null, siblings: [], categories: [], incoming_trades: [], outgoing_trades: [] };
let selectedSiblingId = null;
let pendingVerify = null; // { mode: "setup" | "accept", tradeId?: string }

codeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = codeInput.value.trim();
  if (!code) return;
  codeError.classList.add("hidden");
  const btn = codeForm.querySelector(".codeSubmit");
  btn.disabled = true;
  const res = await callApi("redeem_kid_code", { code });
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

switchKidLink.addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
});

refreshBtn.addEventListener("click", () => loadState());

function enterApp() {
  gate.classList.add("hidden");
  appEl.classList.remove("hidden");
  loadState();
  startRefreshTimer();
}

function startRefreshTimer() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(loadState, REFRESH_INTERVAL_MS);
}

// A background/locked tab has no reason to keep polling the edge function
// every 30s - pause while hidden, and catch up immediately on return.
document.addEventListener("visibilitychange", () => {
  if (!token) return;
  if (document.hidden) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  } else {
    loadState();
    startRefreshTimer();
  }
});

async function loadState() {
  const seq = ++loadStateSeq;
  const [res, tradeRes, bigRewardsRes] = await Promise.all([
    callApi("get_kid_reward_state", { token }),
    refreshTradeState(),
    callApi("get_kid_big_rewards", { token }),
  ]);
  if (seq !== loadStateSeq) return; // a newer loadState() has since started - drop this stale response
  if (!res.ok) {
    if (res.error === "session_expired") {
      localStorage.removeItem(TOKEN_KEY);
      location.reload();
      return;
    }
    return;
  }
  render(res.data);
  // No siblings means nothing to trade with - don't show the entry point at all.
  openTradeBtn.classList.toggle("hidden", !tradeRes.ok || !tradeState.siblings.length);
  renderBigRewards(bigRewardsRes.ok ? bigRewardsRes.data.big_rewards : []);
}

// Read-only - a parent records these in the Reward Tracker app; a kid just
// sees what's pending (earned, not yet spent) and what's already been spent.
function formatDateStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function renderBigRewards(bigRewards) {
  bigRewardsSection.classList.toggle("hidden", !bigRewards.length);
  if (!bigRewards.length) return;
  bigRewardsListEl.innerHTML = bigRewards
    .map((r) => {
      if (r.status === "pending") {
        return `
          <div class="bigRewardItem">
            <div class="bigRewardReason">${escapeHtml(r.reason)}<span class="bigRewardPendingBadge">Pending</span></div>
            <div class="bigRewardMeta">Earned ${formatDateStr(r.earned_date)}</div>
          </div>`;
      }
      return `
        <div class="bigRewardItem">
          <div class="bigRewardReason">${escapeHtml(r.reason)}</div>
          <div class="bigRewardMeta">Earned ${formatDateStr(r.earned_date)} · Spent on ${escapeHtml(r.spent_on)} (${formatDateStr(r.spent_date)})</div>
        </div>`;
    })
    .join("");
}

function render({ kid, categories, balances }) {
  avatarEl.textContent = kid.avatar_emoji || "⭐";
  nameEl.textContent = kid.name;

  const total = Object.values(balances).reduce((sum, c) => sum + c.balance, 0);
  totalEl.textContent = total;

  const withBalance = categories.map((cat) => ({ cat, balance: balances[cat.id]?.balance || 0 })).filter((c) => c.balance !== 0);
  categoryListEl.innerHTML = withBalance.length
    ? withBalance
        .map(
          (c) =>
            `<div class="categoryRow"><span><span class="catSwatch" style="background:${escapeHtml(c.cat.color)}"></span>${escapeHtml(c.cat.label)}</span><span>${c.balance}</span></div>`
        )
        .join("")
    : `<p class="empty">Nothing yet - go earn some rewards!</p>`;
}

// --- Trading with a sibling -----------------------------------------------

async function refreshTradeState() {
  const seq = ++tradeStateSeq;
  const res = await callApi("get_kid_trade_state", { token });
  if (seq !== tradeStateSeq) return res; // a newer refreshTradeState() has since started - drop this stale response
  if (res.ok) {
    tradeState = res.data;
    const pendingCount = tradeState.incoming_trades.length;
    tradeBadge.textContent = String(pendingCount);
    tradeBadge.classList.toggle("hidden", pendingCount === 0);
  }
  return res;
}

function categoryLabel(id) {
  return tradeState.categories.find((c) => c.id === id)?.label || "Unknown";
}
function categoryColor(id) {
  return tradeState.categories.find((c) => c.id === id)?.color || "#888";
}

openTradeBtn.addEventListener("click", async () => {
  await refreshTradeState();
  showTradeList();
  tradeModal.classList.remove("hidden");
});
tradeModalClose.addEventListener("click", () => tradeModal.classList.add("hidden"));

function showTradeList() {
  tradeListView.classList.remove("hidden");
  tradeProposeView.classList.add("hidden");
  renderTradeList();
}

function renderTradeList() {
  incomingTradesEl.innerHTML = tradeState.incoming_trades.length
    ? `<p class="tradeSectionTitle">Waiting for you</p>` +
      tradeState.incoming_trades
        .map(
          (t) => `
      <div class="tradeOfferCard">
        <p class="tradeOfferText"><strong>${escapeHtml(t.from_kid_name)}</strong> will give you ${t.give_qty}x ${escapeHtml(categoryLabel(t.give_category_id))} for ${t.receive_qty}x ${escapeHtml(categoryLabel(t.receive_category_id))} of yours.</p>
        <div class="tradeOfferBtns">
          <button type="button" class="tradeAccept" data-id="${t.id}">Accept</button>
          <button type="button" class="tradeDecline" data-id="${t.id}">Decline</button>
        </div>
      </div>`
        )
        .join("")
    : "";

  outgoingTradesEl.innerHTML = tradeState.outgoing_trades.length
    ? `<p class="tradeSectionTitle">You offered</p>` +
      tradeState.outgoing_trades
        .map(
          (t) => `
      <div class="tradeOfferCard">
        <p class="tradeWaiting">Waiting for <strong>${escapeHtml(t.to_kid_name)}</strong> to respond...</p>
        <p class="tradeOfferText">You give ${t.give_qty}x ${escapeHtml(categoryLabel(t.give_category_id))} for ${t.receive_qty}x ${escapeHtml(categoryLabel(t.receive_category_id))} of theirs.</p>
        <button type="button" class="tradeCancel" data-id="${t.id}">Cancel offer</button>
      </div>`
        )
        .join("")
    : "";

  incomingTradesEl.querySelectorAll(".tradeAccept").forEach((btn) => {
    btn.addEventListener("click", () => startAcceptFlow(btn.dataset.id));
  });
  incomingTradesEl.querySelectorAll(".tradeDecline").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await callApi("respond_to_trade", { token, trade_id: btn.dataset.id, response: "decline" });
      await refreshTradeState();
      renderTradeList();
    });
  });
  outgoingTradesEl.querySelectorAll(".tradeCancel").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await callApi("cancel_trade", { token, trade_id: btn.dataset.id });
      await refreshTradeState();
      renderTradeList();
    });
  });
}

proposeTradeBtn.addEventListener("click", () => openProposeView());
changeSecretLink.addEventListener("click", (e) => {
  e.preventDefault();
  // Same lockout check as startAcceptFlow() - the server also blocks
  // set_kid_verify_image while locked (it used to reset the lockout as a
  // side effect of picking a new secret, letting a locked-out kid bypass it
  // entirely), so this is just the matching client-side message instead of
  // sending a request that's now guaranteed to fail.
  if (tradeState.verify_locked_until && new Date(tradeState.verify_locked_until) > new Date()) {
    showLockoutMessage(tradeState.verify_locked_until);
    return;
  }
  openVerifySetup(null);
});
tradeProposeBack.addEventListener("click", () => showTradeList());

function categoryOptionsHtml(cats) {
  return cats.map((c) => `<option value="${c.id}">${escapeHtml(c.label)}</option>`).join("");
}

// Only categories the kid actually has a positive balance in can be offered
// away - otherwise the picker lets them propose trading something they don't
// have. Mirrored server-side in propose_trade, since a client-side restriction
// alone isn't a real boundary (AGENTS.md).
function myGiveableCategories() {
  return tradeState.categories.filter((c) => (tradeState.my_balances[c.id]?.balance || 0) > 0);
}

function updateGiveQtyMax() {
  const balance = tradeState.my_balances[giveCategorySelect.value]?.balance || 0;
  const max = Math.max(1, Math.min(20, balance));
  giveQtyInput.max = String(max);
  if (Number(giveQtyInput.value) > max) giveQtyInput.value = String(max);
}

function openProposeView() {
  tradeListView.classList.add("hidden");
  tradeProposeView.classList.remove("hidden");

  selectedSiblingId = tradeState.siblings[0]?.id || null;
  siblingPicker.innerHTML = tradeState.siblings
    .map((s) => `<button type="button" class="siblingChip${s.id === selectedSiblingId ? " selected" : ""}" data-id="${s.id}">${escapeHtml(s.avatar_emoji || "⭐")} ${escapeHtml(s.name)}</button>`)
    .join("");
  siblingPicker.querySelectorAll(".siblingChip").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedSiblingId = btn.dataset.id;
      siblingPicker.querySelectorAll(".siblingChip").forEach((b) => b.classList.toggle("selected", b === btn));
    });
  });

  const giveable = myGiveableCategories();
  giveCategorySelect.innerHTML = categoryOptionsHtml(giveable);
  receiveCategorySelect.innerHTML = categoryOptionsHtml(tradeState.categories);
  giveQtyInput.value = "1";
  receiveQtyInput.value = "1";

  const canPropose = giveable.length > 0;
  sendTradeBtn.disabled = !canPropose;
  giveCategorySelect.disabled = !canPropose;
  giveQtyInput.disabled = !canPropose;
  if (canPropose) {
    tradeError.classList.add("hidden");
    updateGiveQtyMax();
  } else {
    tradeError.textContent = "You don't have any rewards to trade yet.";
    tradeError.classList.remove("hidden");
  }
}

giveCategorySelect.addEventListener("change", updateGiveQtyMax);

sendTradeBtn.addEventListener("click", async () => {
  tradeError.classList.add("hidden");
  if (!selectedSiblingId) {
    tradeError.textContent = "Pick who to trade with.";
    tradeError.classList.remove("hidden");
    return;
  }
  sendTradeBtn.disabled = true;
  const res = await callApi("propose_trade", {
    token,
    to_kid_id: selectedSiblingId,
    give_category_id: giveCategorySelect.value,
    give_qty: Math.max(1, Math.min(20, Number(giveQtyInput.value) || 1)),
    receive_category_id: receiveCategorySelect.value,
    receive_qty: Math.max(1, Math.min(20, Number(receiveQtyInput.value) || 1)),
  });
  sendTradeBtn.disabled = false;
  if (!res.ok) {
    tradeError.textContent = "Couldn't send that offer. Try again.";
    tradeError.classList.remove("hidden");
    return;
  }
  await refreshTradeState();
  showTradeList();
});

// --- Verification: pick a secret picture instead of typing a PIN ----------

function shuffledImagePool() {
  const arr = [...VERIFY_IMAGE_POOL];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Shared across setup/accept - only one verify modal is ever open at a
// time, and this blocks a second pick from firing a concurrent request
// while an earlier one (from this session or an already-cancelled one) is
// still in flight.
let verifyBusy = false;

function renderVerifyGrid(onPick) {
  verifyGrid.innerHTML = "";
  shuffledImagePool().forEach((img) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = img;
    b.disabled = verifyBusy;
    b.addEventListener("click", () => {
      if (verifyBusy) return;
      onPick(img);
    });
    verifyGrid.appendChild(b);
  });
}

function startAcceptFlow(tradeId) {
  if (tradeState.verify_locked_until && new Date(tradeState.verify_locked_until) > new Date()) {
    showLockoutMessage(tradeState.verify_locked_until);
    return;
  }
  if (!tradeState.verify_image_set) {
    openVerifySetup(tradeId);
  } else {
    openVerifyAccept(tradeId);
  }
}

function openVerifySetup(thenAcceptTradeId) {
  pendingVerify = { mode: "setup", tradeId: thenAcceptTradeId };
  verifyError.classList.add("hidden");
  verifyTitle.textContent = "Pick your secret picture";
  verifySub.textContent = "Remember it! You'll need to pick it again to accept a trade.";
  async function trySetImage(img) {
    verifyBusy = true;
    const session = pendingVerify;
    const res = await callApi("set_kid_verify_image", { token, image: img });
    verifyBusy = false;
    if (pendingVerify !== session) return; // cancelled, or a different verify flow has since opened
    if (!res.ok) {
      verifyError.textContent = "Couldn't save that - try again.";
      verifyError.classList.remove("hidden");
      renderVerifyGrid(trySetImage); // reshuffle and re-enable so the kid isn't stuck
      return;
    }
    tradeState.verify_image_set = true;
    if (thenAcceptTradeId) openVerifyAccept(thenAcceptTradeId);
    else verifyModal.classList.add("hidden");
  }
  renderVerifyGrid(trySetImage);
  verifyModal.classList.remove("hidden");
}

function openVerifyAccept(tradeId) {
  pendingVerify = { mode: "accept", tradeId };
  verifyError.classList.add("hidden");
  verifyTitle.textContent = "Pick your secret picture";
  verifySub.textContent = "Pick it to accept this trade.";

  const onPick = async (img) => {
    verifyBusy = true;
    const session = pendingVerify;
    const res = await callApi("respond_to_trade", { token, trade_id: tradeId, response: "accept", image: img });
    verifyBusy = false;
    if (pendingVerify !== session) return; // cancelled, or a different trade's verify flow has since opened
    if (res.ok) {
      verifyModal.classList.add("hidden");
      await loadState(); // a trade just moved real balance - refresh the main card too, not just the trade list
      renderTradeList();
      return;
    }
    if (res.error === "locked") {
      tradeState.verify_locked_until = res.locked_until; // so the next accept attempt (even before the next refresh) sees the lockout
      showLockoutMessage(res.locked_until);
      return;
    }
    if (res.error === "insufficient_balance" || res.error === "already_resolved") {
      // Either balances shifted since this trade was proposed (server
      // already cancelled it), or a duplicate accept lost the race to
      // claim it (e.g. a double-tap) and it's already accepted - either
      // way just refresh so it drops off the pending list.
      verifyModal.classList.add("hidden");
      await refreshTradeState();
      renderTradeList();
      return;
    }
    verifyError.textContent =
      res.error === "wrong_image"
        ? `Not quite - try again (${res.attempts_remaining} attempt${res.attempts_remaining === 1 ? "" : "s"} left).`
        : "Something went wrong. Try again.";
    verifyError.classList.remove("hidden");
    renderVerifyGrid(onPick); // reshuffle and let them try again
  };
  renderVerifyGrid(onPick);
  verifyModal.classList.remove("hidden");
}

function showLockoutMessage(lockedUntil) {
  const mins = Math.max(1, Math.ceil((new Date(lockedUntil) - new Date()) / 60000));
  verifyTitle.textContent = "Locked for now";
  verifySub.textContent = `Too many wrong picks - try again in about ${mins} minute${mins === 1 ? "" : "s"}.`;
  verifyGrid.innerHTML = "";
  verifyError.classList.add("hidden");
  verifyModal.classList.remove("hidden");
}

verifyCancelBtn.addEventListener("click", () => {
  verifyModal.classList.add("hidden");
  pendingVerify = null;
  // An in-flight request from the cancelled flow (if any) is still safely a
  // no-op once it resolves (the pendingVerify check above), so there's no
  // need to keep the *next* flow's grid blocked on it too.
  verifyBusy = false;
});

showAppVersion("appVersion");

token = localStorage.getItem(TOKEN_KEY);
if (token) enterApp();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}
