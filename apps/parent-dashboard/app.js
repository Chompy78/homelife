import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  KIDS,
  CHECKLIST_TOTAL,
  BADGES,
  levelForPoints,
  earnedBadges,
} from "../shared/config.js";

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

const cardsEl = document.getElementById("cards");
const refreshBtn = document.getElementById("refreshBtn");
const lastUpdatedEl = document.getElementById("lastUpdated");

const REFRESH_INTERVAL_MS = 45000;

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

async function loadKid(client, kid) {
  const since = last7Dates()[0].iso;
  const [{ data: items }, { data: streak }, { data: log }, { data: weekLog }] = await Promise.all([
    client.from("kid_checklist_state").select("checked").eq("kid_id", kid.id),
    client.from("kid_streaks").select("*").eq("kid_id", kid.id).maybeSingle(),
    client.from("kid_progress_log").select("*").eq("kid_id", kid.id).order("created_at", { ascending: false }).limit(5),
    client
      .from("kid_progress_log")
      .select("log_date, event_type")
      .eq("kid_id", kid.id)
      .in("event_type", ["mum_pass", "mum_star"])
      .gte("log_date", since),
  ]);
  const done = (items || []).filter((i) => i.checked).length;
  const total = CHECKLIST_TOTAL;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const passedDates = new Set((weekLog || []).map((r) => r.log_date));
  return {
    kid,
    percent,
    done,
    total,
    streak: streak?.current_streak || 0,
    bestStreak: streak?.best_streak || 0,
    totalPoints: streak?.total_points || 0,
    totalPasses: streak?.total_passes || 0,
    mumResult: streak?.mum_result || "No Mum check yet today.",
    history: log || [],
    passedDates,
  };
}

function renderCard(data) {
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

  return `
    <div class="kidCard">
      <div class="kidCardHead">
        <span class="kidCardAvatar">${data.kid.avatar}</span>
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
      <div class="history">
        <div class="historyTitle">Recent activity</div>
        ${historyRows || '<div class="historyRow"><span>No activity yet</span></div>'}
      </div>
    </div>
  `;
}

let refreshTimer = null;

async function render() {
  try {
    const { createClient } = await withTimeout(import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"), 6000);
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const results = await Promise.all(KIDS.map((kid) => loadKid(client, kid)));
    cardsEl.innerHTML = results.map(renderCard).join("");
    lastUpdatedEl.textContent = `Updated ${new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}`;
  } catch (err) {
    cardsEl.innerHTML = `<p class="error">Could not load progress. Check your internet connection and reload.</p>`;
  }
}

function scheduleAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(render, REFRESH_INTERVAL_MS);
}

refreshBtn.addEventListener("click", () => {
  render();
  scheduleAutoRefresh();
});

render();
scheduleAutoRefresh();
