import { callApi } from "../shared/api.js";

const boardEl = document.getElementById("board");

const MEDALS = ["🥇", "🥈", "🥉"];

async function render() {
  const res = await callApi("get_leaderboard");
  if (!res.ok) {
    boardEl.innerHTML = `<p class="error">Could not load the leaderboard. Check your internet connection and reload.</p>`;
    return;
  }
  const families = res.data || [];
  if (families.length === 0) {
    boardEl.innerHTML = `<p class="loading">No families are sharing their stats yet.</p>`;
    return;
  }
  boardEl.innerHTML = families
    .map(
      (f, i) => `
      <div class="row">
        <span class="rank">${MEDALS[i] || `#${i + 1}`}</span>
        <span class="rowIcon">${f.icon || "🏠"}</span>
        <div class="rowMain">
          <div class="rowName">${f.display_name}</div>
          <div class="rowSub">${f.kid_count} kid${f.kid_count === 1 ? "" : "s"} · best streak 🔥 ${f.best_streak} · ${f.total_passes} room${f.total_passes === 1 ? "" : "s"} passed</div>
        </div>
        <div class="rowPoints">${f.total_points}<span>pts</span></div>
      </div>
    `
    )
    .join("");
}

render();
