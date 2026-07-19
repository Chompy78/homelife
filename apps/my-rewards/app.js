import { callApi } from "../shared/api.js";

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
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(loadState, REFRESH_INTERVAL_MS);
}

async function loadState() {
  const [res, tradeRes] = await Promise.all([callApi("get_kid_reward_state", { token }), refreshTradeState()]);
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
            `<div class="categoryRow"><span><span class="catSwatch" style="background:${c.cat.color}"></span>${escapeHtml(c.cat.label)}</span><span>${c.balance}</span></div>`
        )
        .join("")
    : `<p class="empty">Nothing yet - go earn some rewards!</p>`;
}

// --- Trading with a sibling -----------------------------------------------

async function refreshTradeState() {
  const res = await callApi("get_kid_trade_state", { token });
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
  openVerifySetup(null);
});
tradeProposeBack.addEventListener("click", () => showTradeList());

function categoryOptionsHtml() {
  return tradeState.categories.map((c) => `<option value="${c.id}">${escapeHtml(c.label)}</option>`).join("");
}

function openProposeView() {
  tradeError.classList.add("hidden");
  tradeListView.classList.add("hidden");
  tradeProposeView.classList.remove("hidden");

  selectedSiblingId = tradeState.siblings[0]?.id || null;
  siblingPicker.innerHTML = tradeState.siblings
    .map((s) => `<button type="button" class="siblingChip${s.id === selectedSiblingId ? " selected" : ""}" data-id="${s.id}">${s.avatar_emoji || "⭐"} ${escapeHtml(s.name)}</button>`)
    .join("");
  siblingPicker.querySelectorAll(".siblingChip").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedSiblingId = btn.dataset.id;
      siblingPicker.querySelectorAll(".siblingChip").forEach((b) => b.classList.toggle("selected", b === btn));
    });
  });

  giveCategorySelect.innerHTML = categoryOptionsHtml();
  receiveCategorySelect.innerHTML = categoryOptionsHtml();
  giveQtyInput.value = "1";
  receiveQtyInput.value = "1";
}

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

function renderVerifyGrid(onPick) {
  verifyGrid.innerHTML = "";
  shuffledImagePool().forEach((img) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = img;
    b.addEventListener("click", () => onPick(img));
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
  renderVerifyGrid(async (img) => {
    const res = await callApi("set_kid_verify_image", { token, image: img });
    if (!res.ok) return;
    tradeState.verify_image_set = true;
    if (thenAcceptTradeId) openVerifyAccept(thenAcceptTradeId);
    else verifyModal.classList.add("hidden");
  });
  verifyModal.classList.remove("hidden");
}

function openVerifyAccept(tradeId) {
  pendingVerify = { mode: "accept", tradeId };
  verifyError.classList.add("hidden");
  verifyTitle.textContent = "Pick your secret picture";
  verifySub.textContent = "Pick it to accept this trade.";

  const onPick = async (img) => {
    const res = await callApi("respond_to_trade", { token, trade_id: tradeId, response: "accept", image: img });
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
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

token = localStorage.getItem(TOKEN_KEY);
if (token) enterApp();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}
