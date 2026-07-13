import { SUPABASE_URL, SUPABASE_ANON_KEY, KIDS, CHECKLIST } from "../shared/config.js";

let supabase = null;
async function getSupabase() {
  if (supabase) return supabase;
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (err) {
    // CDN unreachable (offline, blocked, etc.) - app keeps working from local storage
  }
  return supabase;
}

const DEVICE_KID_KEY = "homelife_kid_id";
const DEVICE_KID_NAME_KEY = "homelife_kid_name";
const CHECKLIST_KEY = "bedroom-reset-checklist-v4";
const META_KEY = "bedroom-reset-meta-v4";

const checklistEl = document.getElementById("checklist");
const kidPicker = document.getElementById("kidPicker");
const kidGrid = document.getElementById("kidGrid");
const kidNameEl = document.getElementById("kidName");
const switchKidLink = document.getElementById("switchKidLink");
const doneCount = document.getElementById("doneCount");
const totalCount = document.getElementById("totalCount");
const percentText = document.getElementById("percentText");
const pie = document.getElementById("pie");
const streakCount = document.getElementById("streakCount");
const resetBtn = document.getElementById("resetBtn");
const modeBtn = document.getElementById("modeBtn");
const focusCard = document.getElementById("focusCard");
const focusTask = document.getElementById("focusTask");
const focusHint = document.getElementById("focusHint");
const focusDoneBtn = document.getElementById("focusDoneBtn");
const passBtn = document.getElementById("passBtn");
const tryBtn = document.getElementById("tryBtn");
const starBtn = document.getElementById("starBtn");
const mumResult = document.getElementById("mumResult");

let boxes = [];
let oneThingMode = false;
let currentKid = null;
let meta = { streak: 0, lastPassDate: null, mumResult: "No Mum check yet today." };

function renderChecklist() {
  checklistEl.innerHTML = "";
  CHECKLIST.forEach((cat) => {
    const section = document.createElement("section");
    section.className = "category";
    const h2 = document.createElement("h2");
    h2.textContent = cat.category;
    section.appendChild(h2);
    cat.items.forEach((item) => {
      const label = document.createElement("label");
      label.className = "item";
      label.innerHTML = `<input type="checkbox" data-id="${item.id}"><span class="itemText">${item.label}</span>`;
      section.appendChild(label);
    });
    checklistEl.appendChild(section);
  });
  boxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
  totalCount.textContent = boxes.length;
  boxes.forEach((box) =>
    box.addEventListener("change", () => {
      updateItem(box);
      updateEverything();
      syncItem(box.dataset.id, box.checked);
    })
  );
}

function dateString(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function findKidById(id) {
  return KIDS.find((k) => k.id === id) || null;
}

function renderKidPicker() {
  kidGrid.innerHTML = "";
  KIDS.forEach((kid) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "kidBtn";
    btn.innerHTML = `<span class="kidAvatar">${kid.avatar}</span><span>${kid.name}</span>`;
    btn.addEventListener("click", () => chooseKid(kid));
    kidGrid.appendChild(btn);
  });
}

function chooseKid(kid) {
  localStorage.setItem(DEVICE_KID_KEY, kid.id);
  localStorage.setItem(DEVICE_KID_NAME_KEY, kid.name);
  currentKid = kid;
  kidPicker.classList.add("hidden");
  boot();
}

switchKidLink.addEventListener("click", (e) => {
  e.preventDefault();
  const ok = confirm("Switch which kid this tablet belongs to?");
  if (!ok) return;
  localStorage.removeItem(DEVICE_KID_KEY);
  localStorage.removeItem(DEVICE_KID_NAME_KEY);
  location.reload();
});

function loadLocalState() {
  const saved = JSON.parse(localStorage.getItem(CHECKLIST_KEY) || "{}");
  meta = Object.assign(meta, JSON.parse(localStorage.getItem(META_KEY) || "{}"));
  boxes.forEach((box) => {
    box.checked = !!saved[box.dataset.id];
    updateItem(box);
  });
}

function saveLocalState() {
  const state = {};
  boxes.forEach((box) => (state[box.dataset.id] = box.checked));
  localStorage.setItem(CHECKLIST_KEY, JSON.stringify(state));
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

async function fetchRemoteState() {
  if (!currentKid) return;
  try {
    const client = await getSupabase();
    if (!client) return;
    const [{ data: items }, { data: streak }] = await Promise.all([
      client.from("kid_checklist_state").select("item_id, checked").eq("kid_id", currentKid.id),
      client.from("kid_streaks").select("*").eq("kid_id", currentKid.id).maybeSingle(),
    ]);
    if (items) {
      const map = Object.fromEntries(items.map((i) => [i.item_id, i.checked]));
      boxes.forEach((box) => {
        if (box.dataset.id in map) {
          box.checked = map[box.dataset.id];
          updateItem(box);
        }
      });
    }
    if (streak) {
      meta.streak = streak.current_streak || 0;
      meta.lastPassDate = streak.last_pass_date;
      meta.mumResult = streak.mum_result || meta.mumResult;
    }
  } catch (err) {
    // offline or unreachable - keep whatever is in local storage
  }
}

async function syncItem(itemId, checked) {
  if (!currentKid) return;
  const client = await getSupabase();
  if (!client) return;
  client
    .from("kid_checklist_state")
    .upsert({ kid_id: currentKid.id, item_id: itemId, checked, updated_at: new Date().toISOString() })
    .then(() => {})
    .catch(() => {});
}

async function syncStreak() {
  if (!currentKid) return;
  const client = await getSupabase();
  if (!client) return;
  client
    .from("kid_streaks")
    .upsert({
      kid_id: currentKid.id,
      current_streak: meta.streak || 0,
      last_pass_date: meta.lastPassDate,
      mum_result: meta.mumResult,
      updated_at: new Date().toISOString(),
    })
    .then(() => {})
    .catch(() => {});
}

async function logProgress(eventType) {
  if (!currentKid) return;
  const client = await getSupabase();
  if (!client) return;
  const done = boxes.filter((b) => b.checked).length;
  const total = boxes.length;
  client
    .from("kid_progress_log")
    .insert({
      kid_id: currentKid.id,
      items_done: done,
      items_total: total,
      percent_complete: Math.round((done / total) * 100),
      event_type: eventType,
      mum_result: meta.mumResult,
      streak_at_time: meta.streak || 0,
    })
    .then(() => {})
    .catch(() => {});
}

function updateItem(box) {
  const label = box.closest(".item");
  const text = label.querySelector(".itemText");
  label.classList.toggle("checked", box.checked);
  text.classList.toggle("done", box.checked);
}

function updateProgress() {
  const done = boxes.filter((b) => b.checked).length;
  const total = boxes.length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const degrees = total ? Math.round((done / total) * 360) : 0;
  doneCount.textContent = done;
  percentText.textContent = `${percent}%`;
  pie.style.background = `conic-gradient(var(--green) ${degrees}deg, #efeadf ${degrees}deg)`;
  streakCount.textContent = meta.streak || 0;
  mumResult.textContent = meta.mumResult || "No Mum check yet today.";
}

function updateFocus() {
  if (!oneThingMode) {
    focusCard.classList.add("hidden");
    checklistEl.classList.remove("hidden");
    modeBtn.textContent = "One Thing At A Time: OFF";
    return;
  }
  focusCard.classList.remove("hidden");
  checklistEl.classList.add("hidden");
  modeBtn.textContent = "One Thing At A Time: ON";
  const next = boxes.find((b) => !b.checked);
  if (!next) {
    focusTask.textContent = "All jobs are done.";
    focusHint.textContent = "Ask Mum for the final room check.";
    focusDoneBtn.classList.add("hidden");
    return;
  }
  focusTask.textContent = next.closest(".item").querySelector(".itemText").textContent;
  focusHint.textContent = "Do this one thing properly. Then tap Done.";
  focusDoneBtn.classList.remove("hidden");
}

function updateEverything() {
  updateProgress();
  updateFocus();
  saveLocalState();
}

modeBtn.addEventListener("click", () => {
  oneThingMode = !oneThingMode;
  updateEverything();
});

focusDoneBtn.addEventListener("click", () => {
  const next = boxes.find((b) => !b.checked);
  if (!next) return;
  next.checked = true;
  updateItem(next);
  updateEverything();
  syncItem(next.dataset.id, true);
});

resetBtn.addEventListener("click", () => {
  const ok = confirm("Reset the checklist for a new day?");
  if (!ok) return;
  logProgress("reset");
  boxes.forEach((box) => {
    box.checked = false;
    updateItem(box);
    syncItem(box.dataset.id, false);
  });
  meta.mumResult = "No Mum check yet today.";
  updateEverything();
  syncStreak();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

function mumPass(label, eventType) {
  const today = dateString(0);
  const yesterday = dateString(-1);
  if (meta.lastPassDate === today) {
    meta.mumResult = `${label} already counted for today.`;
  } else if (meta.lastPassDate === yesterday) {
    meta.streak = (meta.streak || 0) + 1;
    meta.lastPassDate = today;
    meta.mumResult = `${label}. Streak continued.`;
  } else {
    meta.streak = 1;
    meta.lastPassDate = today;
    meta.mumResult = `${label}. New streak started.`;
  }
  updateEverything();
  syncStreak();
  logProgress(eventType);
}

passBtn.addEventListener("click", () => mumPass("✅ Passed by Mum", "mum_pass"));
starBtn.addEventListener("click", () => mumPass("⭐ Great job from Mum", "mum_star"));
tryBtn.addEventListener("click", () => {
  meta.mumResult = "🔁 Try again. Fix the missed jobs, then ask Mum to check again.";
  updateEverything();
  syncStreak();
  logProgress("mum_try_again");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

function boot() {
  kidNameEl.textContent = currentKid.name;
  document.title = `${currentKid.name}'s Bedroom Reset`;
  renderChecklist();
  loadLocalState();
  updateEverything();
  fetchRemoteState().then(() => updateEverything());
}

const storedId = localStorage.getItem(DEVICE_KID_KEY);
const storedKid = storedId && findKidById(storedId);
if (storedKid) {
  currentKid = storedKid;
  kidPicker.classList.add("hidden");
  boot();
} else {
  renderKidPicker();
  kidPicker.classList.remove("hidden");
}
