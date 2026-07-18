import { callApi } from "../shared/api.js";

// Same key bedroom-reset uses - a kid already logged into bedroom-reset on
// this device is automatically logged in here too, since both apps share
// an origin (just a different path) and localStorage is scoped per-origin.
const TOKEN_KEY = "homelife_kid_token";
const REFRESH_INTERVAL_MS = 30000;

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

let token = null;
let refreshTimer = null;

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
  const res = await callApi("get_kid_reward_state", { token });
  if (!res.ok) {
    if (res.error === "session_expired") {
      localStorage.removeItem(TOKEN_KEY);
      location.reload();
      return;
    }
    return;
  }
  render(res.data);
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

token = localStorage.getItem(TOKEN_KEY);
if (token) enterApp();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}
