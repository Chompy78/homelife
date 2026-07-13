import { SUPABASE_URL, SUPABASE_ANON_KEY, KIDS, CHECKLIST_TOTAL } from "../shared/config.js";

const cardsEl = document.getElementById("cards");

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

async function loadKid(client, kid) {
  const [{ data: items }, { data: streak }, { data: log }] = await Promise.all([
    client.from("kid_checklist_state").select("checked").eq("kid_id", kid.id),
    client.from("kid_streaks").select("*").eq("kid_id", kid.id).maybeSingle(),
    client.from("kid_progress_log").select("*").eq("kid_id", kid.id).order("created_at", { ascending: false }).limit(5),
  ]);
  const done = (items || []).filter((i) => i.checked).length;
  const total = CHECKLIST_TOTAL;
  const percent = total ? Math.round((done / total) * 100) : 0;
  return {
    kid,
    percent,
    done,
    total,
    streak: streak?.current_streak || 0,
    mumResult: streak?.mum_result || "No Mum check yet today.",
    history: log || [],
  };
}

function renderCard(data) {
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
        <span class="kidCardName">${data.kid.name}</span>
      </div>
      <div class="statRow"><span>Today</span><span class="value pct ${pctClass(data.percent)}">${data.done}/${data.total} (${data.percent}%)</span></div>
      <div class="statRow"><span>Streak</span><span class="value">🔥 ${data.streak} day${data.streak === 1 ? "" : "s"}</span></div>
      <div class="mumResult">${data.mumResult}</div>
      <div class="history">
        <div class="historyTitle">Recent activity</div>
        ${historyRows || '<div class="historyRow"><span>No activity yet</span></div>'}
      </div>
    </div>
  `;
}

async function render() {
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const results = await Promise.all(KIDS.map((kid) => loadKid(client, kid)));
    cardsEl.innerHTML = results.map(renderCard).join("");
  } catch (err) {
    cardsEl.innerHTML = `<p class="error">Could not load progress. Check your internet connection and reload.</p>`;
  }
}

render();
