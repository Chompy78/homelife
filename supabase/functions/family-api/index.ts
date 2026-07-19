// family-api: the only thing allowed to read/write family data.
//
// Every family/kids table has RLS enabled with zero policies, so the anon
// key (embedded in the client JS, same for every visitor) cannot touch them
// directly. This function uses the service role key (server-side only,
// never shipped to the browser) and enforces per-family / per-kid scoping
// itself, based on an opaque session token issued after a parent_code or
// kid_code is redeemed. That's also why verify_jwt is off for this
// function - callers never have a Supabase Auth JWT, auth is entirely our
// own token/code scheme implemented below.
//
// Keep the POINTS values in sync with apps/shared/config.js. The bedroom
// checklist itself is no longer fixed here - each family has its own
// customizable set in family_bedroom_items (seeded with a 17-item default
// when the family is created), same pattern as family_room_items for
// shared rooms.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const POINTS = {
  ITEM_CHECK: 2,
  DAY_COMPLETE_BONUS: 10,
  PARENT_PASS: 20,
  PARENT_GREAT_JOB: 35,
};

// A kid's identity colour (kid picker, Quick Tap theming, history, insights
// bars, etc. across the reward tracker) - randomly assigned from this curated
// set when a kid is added, picking one not already used by a sibling where
// possible, then stored so it's stable regardless of sort order changes.
// A parent can override it afterwards (rename with a `color`).
const KID_THEME_PALETTE = ["#ff5c8a", "#009688", "#7d5fff", "#f2994a", "#2196f3", "#8bc34a"];

// Kid-to-kid trade verification: a lightweight stand-in for a PIN, aimed at
// kids who might not read/type numbers confidently yet. A kid picks one of
// these as their own secret picture (kids.verify_image); accepting an
// incoming trade means picking it again out of a shuffled 4x4 grid of
// decoys from the same pool. Wrong picks lock accepting out for a while -
// same "friction layer, not a real security boundary" posture as the
// parent PIN elsewhere in this app (see reward-tracker's own PIN docs).
const VERIFY_IMAGE_POOL = ["🐸", "🦄", "🍕", "🚗", "⚽", "🎈", "🐶", "🌈", "🍦", "🎨", "🐱", "🚀", "🦋", "🍩", "🐢", "🎵"];
const VERIFY_MAX_ATTEMPTS = 2;
const VERIFY_LOCKOUT_MINUTES = 15;

// Parent verification: a family picks one of two methods (never both at
// once) - the original 4-digit PIN, or picking the same 3 of these 9
// fantasy icons every time (order doesn't matter). Same "friction, not a
// real security boundary" posture as everywhere else PIN-style checks
// happen in this app. The icon set is a fixed public list - there's
// nothing secret about which 9 icons exist, only which 3 a family picked.
const PARENT_ICON_IDS = ["dragon", "castle", "crown", "potion", "treasure", "ship", "owl", "crystal", "sword"];

async function verifyParentSecret(familyId: string, body: Record<string, unknown>) {
  const { data: family } = await db
    .from("families")
    .select("parent_auth_method, parent_pin, parent_icons")
    .eq("id", familyId)
    .single();
  if (!family) return false;

  if (family.parent_auth_method === "icons") {
    const submitted = Array.isArray(body.icons) ? body.icons.map((i: unknown) => String(i)) : [];
    const correct = family.parent_icons || [];
    if (submitted.length !== 3 || correct.length !== 3) return false;
    const submittedSet = new Set(submitted);
    if (submittedSet.size !== 3) return false; // no repeated taps counted as 3 distinct icons
    return correct.every((icon: string) => submittedSet.has(icon));
  }

  return String(body.pin || "") === family.parent_pin;
}

const PHOTO_BUCKET = "reference-photos";
const MAX_PHOTOS_PER_ROOM = 3;
const MAX_PHOTO_BYTES = 6 * 1024 * 1024; // sanity cap; client compresses well below this
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour, regenerated on every fetch
const HISTORY_THUMBNAIL_LIMIT = 15; // avoid generating a signed URL for every row in a long history

// AI photo scoring: how old a submitted photo's own capture timestamp is
// allowed to be before it's rejected as a stale/reused photo. Captured
// client-side before compression, since compression re-encodes the image
// and strips any EXIF timestamp that would otherwise carry this.
const MAX_PHOTO_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// The local AI-scoring worker isn't a parent or a kid, so it doesn't get a
// session token - it authenticates with this separate static secret instead,
// set as a Supabase Edge Function secret (never shipped to any browser).
// If the secret isn't configured, this always fails closed.
const WORKER_TOKEN = Deno.env.get("WORKER_TOKEN") || "";
function checkWorkerToken(body: Record<string, unknown>) {
  const token = String(body.worker_token || "");
  return WORKER_TOKEN.length > 0 && token === WORKER_TOKEN;
}

// Starting checklists for a shared room, seeded when a parent adds one -
// fully editable afterwards via manage_room_items, this is just a head start.
const ROOM_TEMPLATES: Record<string, { label: string; icon: string; items: string[] }> = {
  kitchen: {
    label: "Kitchen",
    icon: "🍽️",
    items: [
      "All dishes are washed, dried and put away.",
      "Benchtops and table are wiped down.",
      "Stovetop is wiped clean.",
      "Rubbish and recycling are taken out if full.",
      "Floor is swept.",
      "Tea towels and dish cloths are hung up, not left in a pile.",
    ],
  },
  living_room: {
    label: "Living Room",
    icon: "🛋️",
    items: [
      "Cushions and blankets are folded or arranged neatly.",
      "Toys, books and remotes are put away, not on the floor.",
      "Surfaces are clear of cups, plates and rubbish.",
      "Floor is clear enough to vacuum.",
    ],
  },
  bathroom: {
    label: "Bathroom",
    icon: "🛁",
    items: [
      "Towels are hung up neatly, not on the floor.",
      "Sink and bench are wiped down.",
      "Toilet is flushed and the lid is closed.",
      "Dirty clothes are in the laundry basket.",
      "Bathmat is straight.",
    ],
  },
  custom: { label: "Custom Room", icon: "🏠", items: [] },
};

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L

function randomCode(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function yesterdayStr() {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10);
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function getSession(token: unknown) {
  if (!token || typeof token !== "string") return null;
  const { data } = await db.from("sessions").select("*").eq("token", token).maybeSingle();
  if (data) {
    db.from("sessions").update({ last_seen_at: new Date().toISOString() }).eq("token", token).then(() => {});
  }
  return data;
}

async function freshStreak(kidId: string) {
  const { data } = await db.from("kid_streaks").select("*").eq("kid_id", kidId).maybeSingle();
  return data;
}

async function getLatestPhotoScore(column: "kid_id" | "room_id", id: string) {
  const { data } = await db
    .from("photo_score_requests")
    .select("id, status, score, comment, rejection_reason, created_at, scored_at, storage_path")
    .eq(column, id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const { storage_path, ...rest } = data;
  const { data: signed } = await db.storage.from(PHOTO_BUCKET).createSignedUrl(storage_path, SIGNED_URL_TTL_SECONDS);
  return { ...rest, photo_url: signed?.signedUrl || null };
}

// The worker's own reused-photo check: the hash of the target's most recently
// *scored* submission (not a rejected one - comparing a new photo against a
// photo that was itself already rejected isn't useful).
async function getLatestPhotoHash(column: "kid_id" | "room_id", id: string) {
  const { data } = await db
    .from("photo_score_requests")
    .select("photo_hash")
    .eq(column, id)
    .eq("status", "scored")
    .not("photo_hash", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.photo_hash || null;
}

// Average turnaround for the last 10 fully-scored requests (not rejections -
// those can bail out early on a cheap no-AI check, which would make the
// average misleadingly fast for what a normal submission actually takes).
// Lets the kid app show a "usually takes about..." estimate so a kid doesn't
// keep re-tapping the button while one is still processing.
async function getAvgProcessingSeconds(column: "kid_id" | "room_id", id: string) {
  const { data } = await db
    .from("photo_score_requests")
    .select("created_at, scored_at")
    .eq(column, id)
    .eq("status", "scored")
    .order("created_at", { ascending: false })
    .limit(10);
  const rows = data || [];
  if (!rows.length) return null;
  const seconds = rows.map((r) => (new Date(r.scored_at).getTime() - new Date(r.created_at).getTime()) / 1000);
  return Math.round(seconds.reduce((a, b) => a + b, 0) / seconds.length);
}

// Shared by a PIN-confirmed Parent Check and an AI auto-approval (when a
// family's ai_score_mode is "auto_approve") - same points/streak/history
// logic either way, just a different event_type so parents can always tell
// the two apart in their activity history.
async function awardBedroomPass(
  kidId: string,
  familyId: string,
  opts: { eventType: string; emoji: string; label: string; points: number }
) {
  const streakRow = await freshStreak(kidId);
  const today = todayStr();
  const yesterday = yesterdayStr();

  let current = streakRow?.current_streak || 0;
  let best = streakRow?.best_streak || 0;
  let totalPoints = streakRow?.total_points || 0;
  let totalPasses = streakRow?.total_passes || 0;
  let lastPassDate = streakRow?.last_pass_date ?? null;
  let parentResult: string;
  let awarded = 0;

  if (lastPassDate === today) {
    parentResult = `${opts.emoji} ${opts.label} Already counted for today.`;
  } else {
    current = lastPassDate === yesterday ? current + 1 : 1;
    best = Math.max(best, current);
    totalPasses += 1;
    awarded = opts.points;
    totalPoints += opts.points;
    lastPassDate = today;
    parentResult = `${opts.emoji} ${opts.label} ${current > 1 ? "Streak continued!" : "New streak started!"}`;
  }

  await db.from("kid_streaks").upsert({
    kid_id: kidId,
    current_streak: current,
    best_streak: best,
    last_pass_date: lastPassDate,
    parent_result: parentResult,
    total_points: totalPoints,
    total_passes: totalPasses,
    updated_at: new Date().toISOString(),
  });

  const { done, total } = await bedroomProgressCounts(familyId, kidId);
  await db.from("kid_progress_log").insert({
    kid_id: kidId,
    items_done: done,
    items_total: total,
    percent_complete: total ? Math.round((done / total) * 100) : 0,
    event_type: opts.eventType,
    parent_result: parentResult,
    streak_at_time: current,
  });

  const streak = await freshStreak(kidId);
  return { awarded, streak };
}

// Same as awardBedroomPass but for a shared room. triggeredByKidId is null
// for an AI auto-approval (nobody in particular tapped Pass).
async function awardRoomPass(
  roomId: string,
  triggeredByKidId: string | null,
  opts: { eventType: string; emoji: string; label: string; points: number }
) {
  const progressRow = await freshRoomProgress(roomId);
  const today = todayStr();
  const yesterday = yesterdayStr();

  let current = progressRow?.current_streak || 0;
  let best = progressRow?.best_streak || 0;
  let totalPoints = progressRow?.total_points || 0;
  let totalPasses = progressRow?.total_passes || 0;
  let lastPassDate = progressRow?.last_pass_date ?? null;
  let parentResult: string;
  let awarded = 0;

  if (lastPassDate === today) {
    parentResult = `${opts.emoji} ${opts.label} Already counted for today.`;
  } else {
    current = lastPassDate === yesterday ? current + 1 : 1;
    best = Math.max(best, current);
    totalPasses += 1;
    awarded = opts.points;
    totalPoints += opts.points;
    lastPassDate = today;
    parentResult = `${opts.emoji} ${opts.label} ${current > 1 ? "Streak continued!" : "New streak started!"}`;
  }

  await db.from("family_room_progress").upsert({
    room_id: roomId,
    current_streak: current,
    best_streak: best,
    last_pass_date: lastPassDate,
    parent_result: parentResult,
    total_points: totalPoints,
    total_passes: totalPasses,
    updated_at: new Date().toISOString(),
  });

  const { data: allItems } = await db.from("family_room_items").select("id").eq("room_id", roomId);
  const roomTotal = allItems?.length || 0;
  const { data: allState } = await db
    .from("family_room_state")
    .select("checked")
    .in("item_id", (allItems || []).map((i) => i.id));
  const done = (allState || []).filter((s) => s.checked).length;
  await db.from("family_room_log").insert({
    room_id: roomId,
    kid_id: triggeredByKidId,
    items_done: done,
    items_total: roomTotal,
    percent_complete: roomTotal ? Math.round((done / roomTotal) * 100) : 0,
    event_type: opts.eventType,
    parent_result: parentResult,
    streak_at_time: current,
  });

  const progress = await freshRoomProgress(roomId);
  return { awarded, progress };
}

async function getBedroomItems(familyId: string) {
  const { data } = await db
    .from("family_bedroom_items")
    .select("id, category, label")
    .eq("family_id", familyId)
    .order("sort_order");
  return data || [];
}

// Only counts state for items that still exist, so a deleted item can't
// keep contributing to "day complete" or history after a parent removes it.
async function bedroomProgressCounts(familyId: string, kidId: string) {
  const items = await getBedroomItems(familyId);
  const itemIds = items.map((i) => i.id);
  const { data: stateRows } = itemIds.length
    ? await db.from("kid_checklist_state").select("checked").eq("kid_id", kidId).in("item_id", itemIds)
    : { data: [] };
  const done = (stateRows || []).filter((s) => s.checked).length;
  return { done, total: itemIds.length };
}

async function getRewardCategories(familyId: string) {
  const { data } = await db
    .from("family_reward_categories")
    .select("id, label, color, spin_weight")
    .eq("family_id", familyId)
    .order("sort_order");
  return data || [];
}

// Preset reasons shown in the note modal - a family's own customizable list
// (defaults seeded per family, same trigger pattern as family_reward_categories),
// not a fixed set baked into the client.
async function getRewardNotes(familyId: string) {
  const { data } = await db
    .from("family_reward_notes")
    .select("id, type, label")
    .eq("family_id", familyId)
    .order("sort_order");
  return data || [];
}

// Balances are a live sum over the ledger, not a stored running total - an
// Undo is then just "delete the log row", with no separate balance to keep
// in sync or drift out of step with the history. earned/spent are tracked
// separately (not just the net) so Table mode can show both, same as the
// original app.
async function getRewardBalances(familyId: string) {
  const { data } = await db.from("kid_reward_log").select("kid_id, category_id, delta").eq("family_id", familyId);
  const balances: Record<string, Record<string, { earned: number; spent: number; balance: number }>> = {};
  for (const row of data || []) {
    balances[row.kid_id] ??= {};
    const cell = (balances[row.kid_id][row.category_id] ??= { earned: 0, spent: 0, balance: 0 });
    if (row.delta > 0) cell.earned += row.delta;
    else cell.spent += -row.delta;
    cell.balance += row.delta;
  }
  return balances;
}

async function getPhotosWithUrls(kidId: string) {
  const { data: rows } = await db
    .from("kid_reference_photos")
    .select("id, storage_path, uploaded_by, created_at")
    .eq("kid_id", kidId)
    .order("created_at", { ascending: true });
  if (!rows || rows.length === 0) return [];
  const withUrls = await Promise.all(
    rows.map(async (row) => {
      const { data: signed } = await db.storage.from(PHOTO_BUCKET).createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
      return { id: row.id, url: signed?.signedUrl || null, uploaded_by: row.uploaded_by };
    })
  );
  return withUrls.filter((p) => p.url);
}

async function freshRoomProgress(roomId: string) {
  const { data } = await db.from("family_room_progress").select("*").eq("room_id", roomId).maybeSingle();
  return data;
}

async function getRoomPhotosWithUrls(roomId: string) {
  const { data: rows } = await db
    .from("family_room_photos")
    .select("id, storage_path, uploaded_by_kid_id, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });
  if (!rows || rows.length === 0) return [];
  const withUrls = await Promise.all(
    rows.map(async (row) => {
      const { data: signed } = await db.storage.from(PHOTO_BUCKET).createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
      return { id: row.id, url: signed?.signedUrl || null, uploaded_by_kid_id: row.uploaded_by_kid_id };
    })
  );
  return withUrls.filter((p) => p.url);
}

// A session belongs to the room's family - kid or parent, either can use a shared room.
async function assertFamilyRoomAccess(session: { family_id: string }, roomId: string) {
  const { data: room } = await db.from("family_rooms").select("*").eq("id", roomId).eq("family_id", session.family_id).maybeSingle();
  return room || null;
}

async function buildRoomPayload(room: Record<string, unknown>) {
  const { data: items } = await db.from("family_room_items").select("id, label").eq("room_id", room.id as string).order("sort_order");
  const itemIds = (items || []).map((i) => i.id);
  const [{ data: state }, progress, photos, { data: logs }, aiScore] = await Promise.all([
    itemIds.length ? db.from("family_room_state").select("item_id, checked, checked_by_kid_id").in("item_id", itemIds) : Promise.resolve({ data: [] }),
    freshRoomProgress(room.id as string),
    getRoomPhotosWithUrls(room.id as string),
    db.from("family_room_log").select("*").eq("room_id", room.id as string).order("created_at", { ascending: false }).limit(10),
    getLatestPhotoScore("room_id", room.id as string),
  ]);
  return { ...room, items: items || [], state: state || [], progress: progress || {}, photos, logs: logs || [], ai_score: aiScore };
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({}, 200);
  if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Bad JSON" }, 400);
  }

  const action = String(body.action || "");

  try {
    switch (action) {
      case "redeem_kid_code": {
        const code = String(body.code || "").trim().toUpperCase();
        const { data: kid } = await db
          .from("kids")
          .select("id, name, avatar_emoji, family_id")
          .eq("kid_code", code)
          .maybeSingle();
        if (!kid) return json({ ok: false, error: "That code wasn't found. Check with a parent." }, 404);
        const token = randomToken();
        await db.from("sessions").insert({ token, family_id: kid.family_id, kid_id: kid.id, role: "kid" });
        const { data: sharedRooms } = await db
          .from("family_rooms")
          .select("id, name, icon")
          .eq("family_id", kid.family_id)
          .order("sort_order");
        return json({
          ok: true,
          data: { token, kid: { id: kid.id, name: kid.name, avatar: kid.avatar_emoji }, shared_rooms: sharedRooms || [] },
        });
      }

      case "redeem_parent_code": {
        const code = String(body.code || "").trim().toUpperCase();
        const { data: family } = await db.from("families").select("*").eq("parent_code", code).maybeSingle();
        if (!family) return json({ ok: false, error: "That code wasn't found." }, 404);
        const token = randomToken();
        await db.from("sessions").insert({ token, family_id: family.id, kid_id: null, role: "parent" });
        return json({
          ok: true,
          data: { token, family: { id: family.id, name: family.name, display_name: family.display_name, is_public: family.is_public } },
        });
      }

      case "get_kid_state": {
        const session = await getSession(body.token);
        if (!session || session.role !== "kid") return json({ ok: false, error: "session_expired" }, 401);
        const [{ data: items }, streak, { data: kid }, photos, { data: sharedRooms }, bedroomItems, aiScore, avgSeconds, { data: family }] = await Promise.all([
          db.from("kid_checklist_state").select("item_id, checked").eq("kid_id", session.kid_id),
          freshStreak(session.kid_id),
          db.from("kids").select("id, name, avatar_emoji").eq("id", session.kid_id).single(),
          getPhotosWithUrls(session.kid_id),
          db.from("family_rooms").select("id, name, icon").eq("family_id", session.family_id).order("sort_order"),
          getBedroomItems(session.family_id),
          getLatestPhotoScore("kid_id", session.kid_id),
          getAvgProcessingSeconds("kid_id", session.kid_id),
          db.from("families").select("ai_score_mode, ai_score_auto_threshold").eq("id", session.family_id).maybeSingle(),
        ]);
        return json({
          ok: true,
          data: {
            kid,
            items: items || [],
            streak: streak || {},
            photos,
            shared_rooms: sharedRooms || [],
            bedroom_items: bedroomItems,
            ai_score: aiScore,
            ai_score_mode: family?.ai_score_mode || "off",
            ai_score_auto_threshold: family?.ai_score_auto_threshold || 8,
            ai_score_avg_seconds: avgSeconds,
          },
        });
      }

      case "upload_reference_photo": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);
        const targetKidId = String(body.kid_id || "");
        const { data: kid } = await db.from("kids").select("id").eq("id", targetKidId).eq("family_id", session.family_id).maybeSingle();
        if (!kid) return json({ ok: false, error: "not_found" }, 404);
        const kidId = kid.id;

        const { count } = await db.from("kid_reference_photos").select("id", { count: "exact", head: true }).eq("kid_id", kidId);
        if ((count || 0) >= MAX_PHOTOS_PER_ROOM) {
          return json({ ok: false, error: `max_photos_reached` }, 400);
        }

        const base64 = String(body.image_base64 || "");
        if (!base64) return json({ ok: false, error: "image_required" }, 400);
        let bytes: Uint8Array;
        try {
          bytes = base64ToBytes(base64);
        } catch {
          return json({ ok: false, error: "bad_image_data" }, 400);
        }
        if (bytes.byteLength > MAX_PHOTO_BYTES) return json({ ok: false, error: "image_too_large" }, 400);

        const contentType = String(body.content_type || "image/jpeg");
        const ext = contentType.includes("png") ? "png" : "jpg";
        const path = `${kidId}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await db.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType, upsert: false });
        if (uploadError) return json({ ok: false, error: "upload_failed" }, 500);

        await db.from("kid_reference_photos").insert({
          kid_id: kidId,
          storage_path: path,
          uploaded_by: session.role,
        });
        // The stored fingerprint (if any) was generated from the old photo
        // set - invalidate it so the worker regenerates on next use.
        await db.from("kids").update({ room_fingerprint: null }).eq("id", kidId).eq("room_fingerprint_locked", false);

        const photos = await getPhotosWithUrls(kidId);
        return json({ ok: true, data: { photos } });
      }

      case "delete_reference_photo": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);
        const photoId = String(body.photo_id || "");
        const { data: photo } = await db.from("kid_reference_photos").select("id, kid_id, storage_path").eq("id", photoId).maybeSingle();
        if (!photo) return json({ ok: false, error: "not_found" }, 404);

        const { data: kid } = await db.from("kids").select("id").eq("id", photo.kid_id).eq("family_id", session.family_id).maybeSingle();
        if (!kid) return json({ ok: false, error: "not_found" }, 404);

        await db.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
        await db.from("kid_reference_photos").delete().eq("id", photo.id);
        await db.from("kids").update({ room_fingerprint: null }).eq("id", photo.kid_id).eq("room_fingerprint_locked", false);
        const photos = await getPhotosWithUrls(photo.kid_id);
        return json({ ok: true, data: { photos } });
      }

      case "update_checklist_item": {
        const session = await getSession(body.token);
        if (!session || session.role !== "kid") return json({ ok: false, error: "session_expired" }, 401);
        const itemId = String(body.item_id || "");
        const checked = !!body.checked;
        if (!itemId) return json({ ok: false, error: "item_id required" }, 400);

        const bedroomItems = await getBedroomItems(session.family_id);
        if (!bedroomItems.some((i) => i.id === itemId)) return json({ ok: false, error: "not_found" }, 404);

        const { data: existing } = await db
          .from("kid_checklist_state")
          .select("checked")
          .eq("kid_id", session.kid_id)
          .eq("item_id", itemId)
          .maybeSingle();
        const wasChecked = existing?.checked || false;

        await db
          .from("kid_checklist_state")
          .upsert({ kid_id: session.kid_id, item_id: itemId, checked, updated_at: new Date().toISOString() });

        let pointsAwarded = 0;
        let completionBonus = 0;
        if (checked && !wasChecked) pointsAwarded += POINTS.ITEM_CHECK;

        if (checked) {
          const { done, total } = await bedroomProgressCounts(session.family_id, session.kid_id);
          if (total > 0 && done >= total) {
            const streakRow = await freshStreak(session.kid_id);
            if (streakRow?.last_bonus_date !== todayStr()) completionBonus = POINTS.DAY_COMPLETE_BONUS;
          }
        }

        const delta = pointsAwarded + completionBonus;
        if (delta > 0) {
          const streakRow = await freshStreak(session.kid_id);
          const patch: Record<string, unknown> = {
            kid_id: session.kid_id,
            total_points: (streakRow?.total_points || 0) + delta,
            updated_at: new Date().toISOString(),
          };
          if (completionBonus > 0) patch.last_bonus_date = todayStr();
          await db.from("kid_streaks").upsert(patch);
        }

        const streak = await freshStreak(session.kid_id);
        return json({ ok: true, data: { points_awarded: pointsAwarded, completion_bonus: completionBonus, streak } });
      }

      case "parent_check": {
        const session = await getSession(body.token);
        if (!session || session.role !== "kid") return json({ ok: false, error: "session_expired" }, 401);
        const eventType = String(body.event_type || "");
        if (!["parent_pass", "parent_star"].includes(eventType)) return json({ ok: false, error: "bad_event_type" }, 400);

        if (!(await verifyParentSecret(session.family_id, body))) return json({ ok: false, error: "wrong_pin" }, 403);

        const emoji = eventType === "parent_star" ? "⭐" : "✅";
        const label = eventType === "parent_star" ? "Great job from a parent!" : "Passed by a parent!";
        const points = eventType === "parent_star" ? POINTS.PARENT_GREAT_JOB : POINTS.PARENT_PASS;

        const { awarded, streak } = await awardBedroomPass(session.kid_id, session.family_id, { eventType, emoji, label, points });
        return json({ ok: true, data: { awarded_points: awarded, streak } });
      }

      case "parent_try_again": {
        const session = await getSession(body.token);
        if (!session || session.role !== "kid") return json({ ok: false, error: "session_expired" }, 401);
        const parentResult = "🔁 Try again. Fix the missed jobs, then ask a parent to check again.";
        await db.from("kid_streaks").upsert({ kid_id: session.kid_id, parent_result: parentResult, updated_at: new Date().toISOString() });
        const { done, total } = await bedroomProgressCounts(session.family_id, session.kid_id);
        await db.from("kid_progress_log").insert({
          kid_id: session.kid_id,
          items_done: done,
          items_total: total,
          percent_complete: total ? Math.round((done / total) * 100) : 0,
          event_type: "parent_try_again",
          parent_result: parentResult,
          streak_at_time: (await freshStreak(session.kid_id))?.current_streak || 0,
        });
        const streak = await freshStreak(session.kid_id);
        return json({ ok: true, data: { streak } });
      }

      case "reset_day": {
        const session = await getSession(body.token);
        if (!session || session.role !== "kid") return json({ ok: false, error: "session_expired" }, 401);
        const { done, total } = await bedroomProgressCounts(session.family_id, session.kid_id);
        const streakRow = await freshStreak(session.kid_id);

        await db.from("kid_progress_log").insert({
          kid_id: session.kid_id,
          items_done: done,
          items_total: total,
          percent_complete: total ? Math.round((done / total) * 100) : 0,
          event_type: "reset",
          parent_result: streakRow?.parent_result ?? null,
          streak_at_time: streakRow?.current_streak || 0,
        });

        await db.from("kid_checklist_state").update({ checked: false, updated_at: new Date().toISOString() }).eq("kid_id", session.kid_id);
        await db.from("kid_streaks").upsert({
          kid_id: session.kid_id,
          parent_result: "No parent check yet today.",
          last_bonus_date: null,
          updated_at: new Date().toISOString(),
        });

        const streak = await freshStreak(session.kid_id);
        return json({ ok: true, data: { streak } });
      }

      case "get_family_dashboard": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);
        const { data: family } = await db.from("families").select("*").eq("id", session.family_id).single();
        const { data: kids } = await db.from("kids").select("*").eq("family_id", session.family_id).order("sort_order");
        const kidIds = (kids || []).map((k) => k.id);
        const bedroomItems = await getBedroomItems(session.family_id);
        const bedroomItemIds = bedroomItems.map((i) => i.id);
        const [{ data: streaks }, { data: states }, { data: logs }, photosByKid, aiScoresByKid] = await Promise.all([
          kidIds.length ? db.from("kid_streaks").select("*").in("kid_id", kidIds) : Promise.resolve({ data: [] }),
          kidIds.length && bedroomItemIds.length
            ? db.from("kid_checklist_state").select("kid_id, checked").in("kid_id", kidIds).in("item_id", bedroomItemIds)
            : Promise.resolve({ data: [] }),
          kidIds.length
            ? db.from("kid_progress_log").select("*").in("kid_id", kidIds).order("created_at", { ascending: false }).limit(60)
            : Promise.resolve({ data: [] }),
          Promise.all(kidIds.map(async (id) => [id, await getPhotosWithUrls(id)] as const)),
          Promise.all(kidIds.map(async (id) => [id, await getLatestPhotoScore("kid_id", id)] as const)),
        ]);
        const photoMap = Object.fromEntries(photosByKid);
        const aiScoreMap = Object.fromEntries(aiScoresByKid);
        const kidsWithPhotos = (kids || []).map((k) => ({ ...k, photos: photoMap[k.id] || [], ai_score: aiScoreMap[k.id] || null }));

        const { data: sharedRooms } = await db.from("family_rooms").select("*").eq("family_id", session.family_id).order("sort_order");
        const roomsWithData = await Promise.all((sharedRooms || []).map((r) => buildRoomPayload(r)));

        return json({
          ok: true,
          data: {
            family,
            kids: kidsWithPhotos,
            streaks: streaks || [],
            states: states || [],
            logs: logs || [],
            checklist_total: bedroomItemIds.length,
            bedroom_items: bedroomItems,
            rooms: roomsWithData,
            room_templates: ROOM_TEMPLATES,
          },
        });
      }

      case "update_family_settings": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);
        const patch: Record<string, unknown> = {};
        if (typeof body.display_name === "string" && body.display_name.trim()) patch.display_name = body.display_name.trim().slice(0, 60);
        if (typeof body.is_public === "boolean") patch.is_public = body.is_public;
        if (typeof body.parent_pin === "string" && /^\d{4}$/.test(body.parent_pin)) patch.parent_pin = body.parent_pin;
        if (typeof body.icon === "string" && body.icon.trim()) patch.icon = body.icon.trim().slice(0, 8);

        const validIconSet = (arr: unknown): arr is string[] =>
          Array.isArray(arr) && arr.length === 3 && new Set(arr).size === 3 && arr.every((i) => typeof i === "string" && PARENT_ICON_IDS.includes(i));
        if (validIconSet(body.parent_icons)) patch.parent_icons = body.parent_icons;

        if (typeof body.parent_auth_method === "string" && ["pin", "icons"].includes(body.parent_auth_method)) {
          if (body.parent_auth_method === "icons" && !("parent_icons" in patch)) {
            // Switching to icons without providing 3 in this same call - only
            // allow it if the family already has 3 saved from before.
            const { data: existing } = await db.from("families").select("parent_icons").eq("id", session.family_id).maybeSingle();
            if (!validIconSet(existing?.parent_icons)) return json({ ok: false, error: "icons_not_set" }, 400);
          }
          patch.parent_auth_method = body.parent_auth_method;
        }
        if (typeof body.ai_score_mode === "string" && ["off", "informational", "nudge", "auto_approve"].includes(body.ai_score_mode)) {
          patch.ai_score_mode = body.ai_score_mode;
        }
        if (body.ai_score_auto_threshold !== undefined) {
          const threshold = Number(body.ai_score_auto_threshold);
          if (Number.isInteger(threshold) && threshold >= 1 && threshold <= 10) patch.ai_score_auto_threshold = threshold;
        }
        if (Object.keys(patch).length === 0) return json({ ok: false, error: "nothing_to_update" }, 400);
        await db.from("families").update(patch).eq("id", session.family_id);
        return json({ ok: true });
      }

      case "manage_kid": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);
        const kidAction = String(body.kidAction || "");

        if (kidAction === "add") {
          const name = String(body.name || "").trim().slice(0, 40);
          if (!name) return json({ ok: false, error: "name_required" }, 400);
          const { data: existingKids } = await db.from("kids").select("id, theme_color").eq("family_id", session.family_id);
          const kid_code = randomCode(3) + "-" + randomCode(3);
          const usedColours = new Set((existingKids || []).map((k) => k.theme_color));
          const freeColours = KID_THEME_PALETTE.filter((c) => !usedColours.has(c));
          const pool = freeColours.length ? freeColours : KID_THEME_PALETTE;
          const theme_color = pool[Math.floor(Math.random() * pool.length)];
          const { data: newKid, error } = await db
            .from("kids")
            .insert({
              family_id: session.family_id,
              name,
              avatar_emoji: String(body.avatar || "⭐"),
              kid_code,
              sort_order: (existingKids?.length || 0) + 1,
              theme_color,
            })
            .select()
            .single();
          if (error || !newKid) return json({ ok: false, error: "could_not_add" }, 500);
          await db.from("kid_streaks").insert({ kid_id: newKid.id });
          return json({ ok: true, data: { kid: newKid } });
        }

        if (kidAction === "rename") {
          const { data: kid } = await db.from("kids").select("id").eq("id", body.kid_id).eq("family_id", session.family_id).maybeSingle();
          if (!kid) return json({ ok: false, error: "not_found" }, 404);
          const patch: Record<string, unknown> = {};
          if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 40);
          if (typeof body.avatar === "string" && body.avatar) patch.avatar_emoji = body.avatar;
          if (typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color)) patch.theme_color = body.color;
          if (Object.keys(patch).length === 0) return json({ ok: false, error: "nothing_to_update" }, 400);
          await db.from("kids").update(patch).eq("id", kid.id);
          return json({ ok: true });
        }

        if (kidAction === "remove") {
          const { data: kid } = await db.from("kids").select("id").eq("id", body.kid_id).eq("family_id", session.family_id).maybeSingle();
          if (!kid) return json({ ok: false, error: "not_found" }, 404);
          await db.from("kids").delete().eq("id", kid.id);
          return json({ ok: true });
        }

        if (kidAction === "regenerate_code") {
          const { data: kid } = await db.from("kids").select("id").eq("id", body.kid_id).eq("family_id", session.family_id).maybeSingle();
          if (!kid) return json({ ok: false, error: "not_found" }, 404);
          const kid_code = randomCode(3) + "-" + randomCode(3);
          await db.from("kids").update({ kid_code }).eq("id", kid.id);
          return json({ ok: true, data: { kid_code } });
        }

        return json({ ok: false, error: "unknown_kid_action" }, 400);
      }

      case "manage_bedroom_items": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);
        const itemAction = String(body.itemAction || "");

        if (itemAction === "add") {
          const label = String(body.label || "").trim().slice(0, 140);
          if (!label) return json({ ok: false, error: "label_required" }, 400);
          const category = String(body.category || "").trim().slice(0, 60) || "Extra Jobs";
          const { data: existing } = await db.from("family_bedroom_items").select("id").eq("family_id", session.family_id);
          const { data: item, error } = await db
            .from("family_bedroom_items")
            .insert({ family_id: session.family_id, category, label, sort_order: (existing?.length || 0) + 1 })
            .select()
            .single();
          if (error || !item) return json({ ok: false, error: "could_not_add" }, 500);
          return json({ ok: true, data: { item } });
        }

        if (itemAction === "rename") {
          const { data: item } = await db
            .from("family_bedroom_items")
            .select("id")
            .eq("id", body.item_id)
            .eq("family_id", session.family_id)
            .maybeSingle();
          if (!item) return json({ ok: false, error: "not_found" }, 404);
          const label = String(body.label || "").trim().slice(0, 140);
          if (!label) return json({ ok: false, error: "label_required" }, 400);
          await db.from("family_bedroom_items").update({ label }).eq("id", item.id);
          return json({ ok: true });
        }

        if (itemAction === "delete") {
          const { data: item } = await db
            .from("family_bedroom_items")
            .select("id")
            .eq("id", body.item_id)
            .eq("family_id", session.family_id)
            .maybeSingle();
          if (!item) return json({ ok: false, error: "not_found" }, 404);
          await db.from("family_bedroom_items").delete().eq("id", item.id);
          await db.from("kid_checklist_state").delete().eq("item_id", item.id);
          return json({ ok: true });
        }

        return json({ ok: false, error: "unknown_item_action" }, 400);
      }

      // --- Reward Tracker (earn/spend tally per kid per reward category) ---

      case "get_reward_state": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);
        const [{ data: kids }, categories, balances, { data: historyRows }, notes] = await Promise.all([
          db.from("kids").select("id, name, avatar_emoji, theme_color").eq("family_id", session.family_id).order("sort_order"),
          getRewardCategories(session.family_id),
          getRewardBalances(session.family_id),
          db
            .from("kid_reward_log")
            .select("id, kid_id, category_id, delta, note, created_at")
            .eq("family_id", session.family_id)
            .order("created_at", { ascending: false })
            .limit(100),
          getRewardNotes(session.family_id),
        ]);
        return json({
          ok: true,
          data: { kids: kids || [], categories, balances, history: historyRows || [], notes },
        });
      }

      // Read-only, for the kid-facing "My Rewards" PWA - a kid session
      // (their own kid_code, the same one bedroom-reset uses) can see their
      // own balance, but this action has no write path at all, so there's
      // nothing here for a kid to game even without a PIN.
      case "get_kid_reward_state": {
        const session = await getSession(body.token);
        if (!session || session.role !== "kid") return json({ ok: false, error: "session_expired" }, 401);
        const [{ data: kid }, categories, balances] = await Promise.all([
          db.from("kids").select("id, name, avatar_emoji, theme_color").eq("id", session.kid_id).single(),
          getRewardCategories(session.family_id),
          getRewardBalances(session.family_id),
        ]);
        return json({
          ok: true,
          data: { kid, categories, balances: balances[session.kid_id] || {} },
        });
      }

      case "adjust_reward": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);
        const { data: kid } = await db.from("kids").select("id").eq("id", body.kid_id).eq("family_id", session.family_id).maybeSingle();
        if (!kid) return json({ ok: false, error: "not_found" }, 404);
        const { data: category } = await db
          .from("family_reward_categories")
          .select("id")
          .eq("id", body.category_id)
          .eq("family_id", session.family_id)
          .maybeSingle();
        if (!category) return json({ ok: false, error: "not_found" }, 404);

        const type = String(body.type || "earn");
        if (!["earn", "spend"].includes(type)) return json({ ok: false, error: "bad_type" }, 400);
        const note = typeof body.note === "string" ? body.note.trim().slice(0, 140) : null;

        const { data: entry, error } = await db
          .from("kid_reward_log")
          .insert({
            family_id: session.family_id,
            kid_id: kid.id,
            category_id: category.id,
            delta: type === "spend" ? -1 : 1,
            note: note || null,
          })
          .select()
          .single();
        if (error || !entry) return json({ ok: false, error: "could_not_add" }, 500);
        return json({ ok: true, data: { entry } });
      }

      case "undo_reward_log": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);
        const { data: entry } = await db
          .from("kid_reward_log")
          .select("id")
          .eq("id", body.log_id)
          .eq("family_id", session.family_id)
          .maybeSingle();
        if (!entry) return json({ ok: false, error: "not_found" }, 404);
        await db.from("kid_reward_log").delete().eq("id", entry.id);
        return json({ ok: true });
      }

      case "manage_reward_categories": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);
        const itemAction = String(body.itemAction || "");
        const validColor = (c: unknown) => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
        const validWeight = (w: unknown) => Number.isInteger(w) && (w as number) >= 1 && (w as number) <= 5;

        if (itemAction === "add") {
          const label = String(body.label || "").trim().slice(0, 60);
          if (!label) return json({ ok: false, error: "label_required" }, 400);
          const color = validColor(body.color) ? (body.color as string) : "#888888";
          const spinWeight = validWeight(Number(body.spin_weight)) ? Number(body.spin_weight) : 1;
          const { data: existing } = await db.from("family_reward_categories").select("id").eq("family_id", session.family_id);
          const { data: item, error } = await db
            .from("family_reward_categories")
            .insert({ family_id: session.family_id, label, color, spin_weight: spinWeight, sort_order: (existing?.length || 0) + 1 })
            .select()
            .single();
          if (error || !item) return json({ ok: false, error: "could_not_add" }, 500);
          return json({ ok: true, data: { item } });
        }

        if (itemAction === "update") {
          const { data: item } = await db
            .from("family_reward_categories")
            .select("id")
            .eq("id", body.item_id)
            .eq("family_id", session.family_id)
            .maybeSingle();
          if (!item) return json({ ok: false, error: "not_found" }, 404);
          const patch: Record<string, unknown> = {};
          if (typeof body.label === "string" && body.label.trim()) patch.label = body.label.trim().slice(0, 60);
          if (validColor(body.color)) patch.color = body.color;
          if (body.spin_weight !== undefined && validWeight(Number(body.spin_weight))) patch.spin_weight = Number(body.spin_weight);
          if (Object.keys(patch).length === 0) return json({ ok: false, error: "nothing_to_update" }, 400);
          await db.from("family_reward_categories").update(patch).eq("id", item.id);
          return json({ ok: true });
        }

        if (itemAction === "delete") {
          const { data: item } = await db
            .from("family_reward_categories")
            .select("id")
            .eq("id", body.item_id)
            .eq("family_id", session.family_id)
            .maybeSingle();
          if (!item) return json({ ok: false, error: "not_found" }, 404);
          await db.from("family_reward_categories").delete().eq("id", item.id);
          return json({ ok: true });
        }

        return json({ ok: false, error: "unknown_item_action" }, 400);
      }

      // A family's own customizable list of preset reasons shown in the note
      // modal (per earn/spend type) - add or delete freely; defaults are
      // just the starting rows, not protected from deletion.
      case "manage_reward_notes": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);
        const itemAction = String(body.itemAction || "");

        if (itemAction === "add") {
          const type = String(body.type || "");
          if (!["earn", "spend"].includes(type)) return json({ ok: false, error: "bad_type" }, 400);
          const label = String(body.label || "").trim().slice(0, 60);
          if (!label) return json({ ok: false, error: "label_required" }, 400);
          const { data: existing } = await db
            .from("family_reward_notes")
            .select("id")
            .eq("family_id", session.family_id)
            .eq("type", type);
          const { data: item, error } = await db
            .from("family_reward_notes")
            .insert({ family_id: session.family_id, type, label, sort_order: (existing?.length || 0) + 1 })
            .select()
            .single();
          if (error || !item) return json({ ok: false, error: "could_not_add" }, 500);
          return json({ ok: true, data: { item } });
        }

        if (itemAction === "delete") {
          const { data: item } = await db
            .from("family_reward_notes")
            .select("id")
            .eq("id", body.item_id)
            .eq("family_id", session.family_id)
            .maybeSingle();
          if (!item) return json({ ok: false, error: "not_found" }, 404);
          await db.from("family_reward_notes").delete().eq("id", item.id);
          return json({ ok: true });
        }

        return json({ ok: false, error: "unknown_item_action" }, 400);
      }

      // Wipes the family's whole reward ledger (categories are kept) - the
      // client gates this behind its PIN-lock UI first, same as every other
      // reward-tracker action here that only checks for a parent session:
      // the security boundary is the parent token itself, the PIN is a
      // friction layer against a kid using an already-unlocked device.
      case "reset_reward_history": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);
        await db.from("kid_reward_log").delete().eq("family_id", session.family_id);
        return json({ ok: true });
      }

      case "verify_pin": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);
        if (!(await verifyParentSecret(session.family_id, body))) return json({ ok: false, error: "wrong_pin" }, 403);
        return json({ ok: true });
      }

      // Lets a kid or parent session find out which method to render
      // (numeric keypad vs. the 9-icon grid) before attempting a check -
      // reveals only the method, never the PIN or which 3 icons are correct.
      case "get_family_auth_method": {
        const session = await getSession(body.token);
        if (!session) return json({ ok: false, error: "session_expired" }, 401);
        const { data: family } = await db.from("families").select("parent_auth_method").eq("id", session.family_id).single();
        return json({ ok: true, data: { method: family?.parent_auth_method || "pin" } });
      }

      // Weekly/monthly earned-per-kid, all-time balance and top category -
      // aggregated server-side over the full ledger rather than shipping
      // every row to the client, since a family's history can grow well
      // past the 100-row window get_reward_state caps history at.
      case "get_reward_insights": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);

        const [{ data: kids }, categories, { data: rows }] = await Promise.all([
          db.from("kids").select("id, name, avatar_emoji").eq("family_id", session.family_id).order("sort_order"),
          getRewardCategories(session.family_id),
          db.from("kid_reward_log").select("kid_id, category_id, delta, created_at").eq("family_id", session.family_id),
        ]);
        const catLabel: Record<string, string> = Object.fromEntries(categories.map((c) => [c.id, c.label]));

        const now = Date.now();
        const weekAgo = now - 7 * 86400000;
        const monthAgo = now - 30 * 86400000;

        const perKid: Record<string, { weekly_earned: number; monthly_earned: number; all_time_balance: number; by_category_earned: Record<string, number> }> = {};
        for (const kid of kids || []) perKid[kid.id] = { weekly_earned: 0, monthly_earned: 0, all_time_balance: 0, by_category_earned: {} };
        for (const row of rows || []) {
          const bucket = perKid[row.kid_id];
          if (!bucket) continue;
          bucket.all_time_balance += row.delta;
          if (row.delta > 0) {
            const createdMs = new Date(row.created_at).getTime();
            if (createdMs >= weekAgo) bucket.weekly_earned += row.delta;
            if (createdMs >= monthAgo) bucket.monthly_earned += row.delta;
            bucket.by_category_earned[row.category_id] = (bucket.by_category_earned[row.category_id] || 0) + row.delta;
          }
        }

        const insights = (kids || []).map((kid) => {
          const b = perKid[kid.id];
          let topCategoryId: string | null = null;
          let topAmount = 0;
          for (const [catId, amt] of Object.entries(b.by_category_earned)) {
            if (amt > topAmount) {
              topAmount = amt;
              topCategoryId = catId;
            }
          }
          return {
            kid_id: kid.id,
            name: kid.name,
            avatar_emoji: kid.avatar_emoji,
            weekly_earned: b.weekly_earned,
            monthly_earned: b.monthly_earned,
            all_time_balance: b.all_time_balance,
            top_category: topCategoryId ? { id: topCategoryId, label: catLabel[topCategoryId] || "Unknown", amount: topAmount } : null,
          };
        });

        return json({ ok: true, data: { insights } });
      }

      // --- Kid-to-kid trading (My Rewards) ---------------------------------
      // A kid proposes giving up some of one reward for some of a sibling's -
      // the sibling can accept (after picking their own secret picture out
      // of a shuffled decoy grid) or decline. No parent step, no balance
      // floor check - both match how every other reward-tracker action here
      // already works (a parent can already tap Spend into negative freely).

      case "get_kid_trade_state": {
        const session = await getSession(body.token);
        if (!session || session.role !== "kid") return json({ ok: false, error: "session_expired" }, 401);

        const [{ data: me }, { data: siblings }, categories, balances, { data: incoming }, { data: outgoing }] = await Promise.all([
          db.from("kids").select("id, name, avatar_emoji, verify_image, verify_locked_until").eq("id", session.kid_id).single(),
          db.from("kids").select("id, name, avatar_emoji, theme_color").eq("family_id", session.family_id).neq("id", session.kid_id).order("sort_order"),
          getRewardCategories(session.family_id),
          getRewardBalances(session.family_id),
          db.from("kid_reward_trades").select("*").eq("to_kid_id", session.kid_id).eq("status", "pending").order("created_at", { ascending: false }),
          db.from("kid_reward_trades").select("*").eq("from_kid_id", session.kid_id).eq("status", "pending").order("created_at", { ascending: false }),
        ]);

        const nameFor = (id: string) => (id === session.kid_id ? me?.name : (siblings || []).find((s) => s.id === id)?.name) || "Unknown";
        const decorate = (t: Record<string, unknown>) => ({ ...t, from_kid_name: nameFor(t.from_kid_id as string), to_kid_name: nameFor(t.to_kid_id as string) });
        const stillLocked = me?.verify_locked_until && new Date(me.verify_locked_until as string) > new Date();

        return json({
          ok: true,
          data: {
            verify_image_set: !!me?.verify_image,
            verify_locked_until: stillLocked ? me?.verify_locked_until ?? null : null,
            siblings: (siblings || []).map((s) => ({ ...s, balances: balances[s.id] || {} })),
            categories,
            my_balances: balances[session.kid_id] || {},
            incoming_trades: (incoming || []).map(decorate),
            outgoing_trades: (outgoing || []).map(decorate),
          },
        });
      }

      case "set_kid_verify_image": {
        const session = await getSession(body.token);
        if (!session || session.role !== "kid") return json({ ok: false, error: "session_expired" }, 401);
        const image = String(body.image || "");
        if (!VERIFY_IMAGE_POOL.includes(image)) return json({ ok: false, error: "bad_image" }, 400);
        await db.from("kids").update({ verify_image: image, verify_fail_count: 0, verify_locked_until: null }).eq("id", session.kid_id);
        return json({ ok: true });
      }

      case "propose_trade": {
        const session = await getSession(body.token);
        if (!session || session.role !== "kid") return json({ ok: false, error: "session_expired" }, 401);

        const toKidId = String(body.to_kid_id || "");
        if (toKidId === session.kid_id) return json({ ok: false, error: "cant_trade_with_self" }, 400);
        const { data: toKid } = await db.from("kids").select("id").eq("id", toKidId).eq("family_id", session.family_id).maybeSingle();
        if (!toKid) return json({ ok: false, error: "not_found" }, 404);

        const giveCategoryId = String(body.give_category_id || "");
        const receiveCategoryId = String(body.receive_category_id || "");
        const wantedIds = [...new Set([giveCategoryId, receiveCategoryId])];
        const { data: cats } = await db.from("family_reward_categories").select("id").eq("family_id", session.family_id).in("id", wantedIds);
        if (!cats || cats.length < wantedIds.length) return json({ ok: false, error: "not_found" }, 404);

        const giveQty = Math.max(1, Math.min(20, Math.round(Number(body.give_qty)) || 1));
        const receiveQty = Math.max(1, Math.min(20, Math.round(Number(body.receive_qty)) || 1));

        const { data: trade, error } = await db
          .from("kid_reward_trades")
          .insert({
            family_id: session.family_id,
            from_kid_id: session.kid_id,
            to_kid_id: toKidId,
            give_category_id: giveCategoryId,
            give_qty: giveQty,
            receive_category_id: receiveCategoryId,
            receive_qty: receiveQty,
          })
          .select()
          .single();
        if (error || !trade) return json({ ok: false, error: "could_not_add" }, 500);
        return json({ ok: true, data: { trade } });
      }

      case "cancel_trade": {
        const session = await getSession(body.token);
        if (!session || session.role !== "kid") return json({ ok: false, error: "session_expired" }, 401);
        const { data: trade } = await db
          .from("kid_reward_trades")
          .select("id, from_kid_id, status")
          .eq("id", String(body.trade_id || ""))
          .eq("family_id", session.family_id)
          .maybeSingle();
        if (!trade || trade.status !== "pending" || trade.from_kid_id !== session.kid_id) return json({ ok: false, error: "not_found" }, 404);
        await db.from("kid_reward_trades").update({ status: "cancelled", resolved_at: new Date().toISOString() }).eq("id", trade.id);
        return json({ ok: true });
      }

      case "respond_to_trade": {
        const session = await getSession(body.token);
        if (!session || session.role !== "kid") return json({ ok: false, error: "session_expired" }, 401);

        const { data: trade } = await db
          .from("kid_reward_trades")
          .select("*")
          .eq("id", String(body.trade_id || ""))
          .eq("family_id", session.family_id)
          .maybeSingle();
        if (!trade || trade.status !== "pending") return json({ ok: false, error: "not_found" }, 404);
        if (trade.to_kid_id !== session.kid_id) return json({ ok: false, error: "not_your_trade" }, 403);

        // Named "response", not "action" - the request body's top-level
        // "action" field is the dispatch key ("respond_to_trade" itself);
        // reusing that name here would collide with it client-side.
        const tradeResponse = String(body.response || "");
        if (tradeResponse === "decline") {
          await db.from("kid_reward_trades").update({ status: "declined", resolved_at: new Date().toISOString() }).eq("id", trade.id);
          return json({ ok: true, data: { status: "declined" } });
        }
        if (tradeResponse !== "accept") return json({ ok: false, error: "unknown_action" }, 400);

        const { data: me } = await db
          .from("kids")
          .select("verify_image, verify_fail_count, verify_locked_until")
          .eq("id", session.kid_id)
          .single();
        if (me?.verify_locked_until && new Date(me.verify_locked_until) > new Date()) {
          return json({ ok: false, error: "locked", locked_until: me.verify_locked_until }, 403);
        }
        if (!me?.verify_image) return json({ ok: false, error: "verify_image_not_set" }, 400);

        const image = String(body.image || "");
        if (!VERIFY_IMAGE_POOL.includes(image)) return json({ ok: false, error: "bad_image" }, 400);

        if (image !== me.verify_image) {
          const failCount = (me.verify_fail_count || 0) + 1;
          if (failCount >= VERIFY_MAX_ATTEMPTS) {
            const lockedUntil = new Date(Date.now() + VERIFY_LOCKOUT_MINUTES * 60000).toISOString();
            await db.from("kids").update({ verify_fail_count: 0, verify_locked_until: lockedUntil }).eq("id", session.kid_id);
            return json({ ok: false, error: "locked", locked_until: lockedUntil }, 403);
          }
          await db.from("kids").update({ verify_fail_count: failCount }).eq("id", session.kid_id);
          return json({ ok: false, error: "wrong_image", attempts_remaining: VERIFY_MAX_ATTEMPTS - failCount }, 403);
        }

        await db.from("kids").update({ verify_fail_count: 0, verify_locked_until: null }).eq("id", session.kid_id);

        const [{ data: fromKid }, { data: toKid }] = await Promise.all([
          db.from("kids").select("name").eq("id", trade.from_kid_id).single(),
          db.from("kids").select("name").eq("id", trade.to_kid_id).single(),
        ]);

        await db.from("kid_reward_log").insert([
          { family_id: session.family_id, kid_id: trade.from_kid_id, category_id: trade.give_category_id, delta: -trade.give_qty, note: `🔁 Traded to ${toKid?.name || "sibling"}` },
          { family_id: session.family_id, kid_id: trade.to_kid_id, category_id: trade.give_category_id, delta: trade.give_qty, note: `🔁 Traded from ${fromKid?.name || "sibling"}` },
          { family_id: session.family_id, kid_id: trade.to_kid_id, category_id: trade.receive_category_id, delta: -trade.receive_qty, note: `🔁 Traded to ${fromKid?.name || "sibling"}` },
          { family_id: session.family_id, kid_id: trade.from_kid_id, category_id: trade.receive_category_id, delta: trade.receive_qty, note: `🔁 Traded from ${toKid?.name || "sibling"}` },
        ]);

        await db.from("kid_reward_trades").update({ status: "accepted", resolved_at: new Date().toISOString() }).eq("id", trade.id);
        return json({ ok: true, data: { status: "accepted" } });
      }

      case "get_leaderboard": {
        const { data: families } = await db.from("families").select("id, display_name, icon").eq("is_public", true);
        if (!families || families.length === 0) return json({ ok: true, data: [] });
        const familyIds = families.map((f) => f.id);
        const [{ data: kids }, { data: rooms }] = await Promise.all([
          db.from("kids").select("id, family_id").in("family_id", familyIds),
          db.from("family_rooms").select("id, family_id").in("family_id", familyIds),
        ]);
        const kidIds = (kids || []).map((k) => k.id);
        const roomIds = (rooms || []).map((r) => r.id);
        const [{ data: streaks }, { data: roomProgress }] = await Promise.all([
          kidIds.length
            ? db.from("kid_streaks").select("kid_id, best_streak, total_points, total_passes").in("kid_id", kidIds)
            : Promise.resolve({ data: [] }),
          roomIds.length
            ? db.from("family_room_progress").select("room_id, best_streak, total_points, total_passes").in("room_id", roomIds)
            : Promise.resolve({ data: [] }),
        ]);

        const kidToFamily = Object.fromEntries((kids || []).map((k) => [k.id, k.family_id]));
        const roomToFamily = Object.fromEntries((rooms || []).map((r) => [r.id, r.family_id]));
        const byFamily: Record<string, { family_id: string; display_name: string; icon: string; total_points: number; best_streak: number; total_passes: number; kid_count: number }> = {};
        for (const f of families) byFamily[f.id] = { family_id: f.id, display_name: f.display_name, icon: f.icon || "🏠", total_points: 0, best_streak: 0, total_passes: 0, kid_count: 0 };
        for (const s of streaks || []) {
          const fam = byFamily[kidToFamily[s.kid_id]];
          if (!fam) continue;
          fam.total_points += s.total_points || 0;
          fam.best_streak = Math.max(fam.best_streak, s.best_streak || 0);
          fam.total_passes += s.total_passes || 0;
          fam.kid_count += 1;
        }
        for (const r of roomProgress || []) {
          const fam = byFamily[roomToFamily[r.room_id]];
          if (!fam) continue;
          fam.total_points += r.total_points || 0;
          fam.best_streak = Math.max(fam.best_streak, r.best_streak || 0);
          fam.total_passes += r.total_passes || 0;
        }
        const result = Object.values(byFamily).sort((a, b) => b.total_points - a.total_points);
        return json({ ok: true, data: result });
      }

      // --- Shared family rooms (kitchen, living room, etc.) -----------------

      case "get_room_templates": {
        const session = await getSession(body.token);
        if (!session) return json({ ok: false, error: "session_expired" }, 401);
        return json({ ok: true, data: ROOM_TEMPLATES });
      }

      case "add_family_room": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);
        const roomType = String(body.room_type || "custom");
        const template = ROOM_TEMPLATES[roomType] || ROOM_TEMPLATES.custom;
        const name = String(body.name || template.label).trim().slice(0, 40) || template.label;
        const { data: existing } = await db.from("family_rooms").select("id").eq("family_id", session.family_id);
        const { data: room, error } = await db
          .from("family_rooms")
          .insert({
            family_id: session.family_id,
            name,
            icon: template.icon,
            room_type: roomType,
            sort_order: (existing?.length || 0) + 1,
          })
          .select()
          .single();
        if (error || !room) return json({ ok: false, error: "could_not_add" }, 500);
        if (template.items.length) {
          await db.from("family_room_items").insert(
            template.items.map((label, i) => ({ room_id: room.id, label, sort_order: i + 1 }))
          );
        }
        await db.from("family_room_progress").insert({ room_id: room.id });
        return json({ ok: true, data: { room } });
      }

      case "remove_family_room": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);
        const room = await assertFamilyRoomAccess(session, String(body.room_id || ""));
        if (!room) return json({ ok: false, error: "not_found" }, 404);
        await db.from("family_rooms").delete().eq("id", room.id);
        return json({ ok: true });
      }

      case "get_family_room_state": {
        const session = await getSession(body.token);
        if (!session) return json({ ok: false, error: "session_expired" }, 401);
        const room = await assertFamilyRoomAccess(session, String(body.room_id || ""));
        if (!room) return json({ ok: false, error: "not_found" }, 404);
        const [data, avgSeconds, { data: family }] = await Promise.all([
          buildRoomPayload(room),
          getAvgProcessingSeconds("room_id", room.id),
          db.from("families").select("ai_score_mode, ai_score_auto_threshold").eq("id", session.family_id).maybeSingle(),
        ]);
        return json({
          ok: true,
          data: {
            ...data,
            ai_score_mode: family?.ai_score_mode || "off",
            ai_score_auto_threshold: family?.ai_score_auto_threshold || 8,
            ai_score_avg_seconds: avgSeconds,
          },
        });
      }

      case "update_family_room_item": {
        const session = await getSession(body.token);
        if (!session) return json({ ok: false, error: "session_expired" }, 401);
        const room = await assertFamilyRoomAccess(session, String(body.room_id || ""));
        if (!room) return json({ ok: false, error: "not_found" }, 404);
        const itemId = String(body.item_id || "");
        const checked = !!body.checked;
        const { data: item } = await db.from("family_room_items").select("id").eq("id", itemId).eq("room_id", room.id).maybeSingle();
        if (!item) return json({ ok: false, error: "not_found" }, 404);

        const { data: existingState } = await db.from("family_room_state").select("checked, checked_by_kid_id").eq("item_id", itemId).maybeSingle();
        const wasChecked = existingState?.checked || false;
        // A kid checking an item claims credit; a parent checking one leaves existing credit as-is.
        const checkedBy = session.role === "kid" ? session.kid_id : existingState?.checked_by_kid_id ?? null;

        await db.from("family_room_state").upsert({
          item_id: itemId,
          checked,
          checked_by_kid_id: checkedBy,
          updated_at: new Date().toISOString(),
        });

        const { data: allItems } = await db.from("family_room_items").select("id").eq("room_id", room.id);
        const roomTotal = allItems?.length || 0;
        const { data: allState } = await db
          .from("family_room_state")
          .select("checked")
          .in("item_id", (allItems || []).map((i) => i.id));
        const doneCount = (allState || []).filter((s) => s.checked).length;

        let pointsAwarded = 0;
        let completionBonus = 0;
        if (checked && !wasChecked) pointsAwarded += POINTS.ITEM_CHECK;
        if (checked && roomTotal > 0 && doneCount >= roomTotal) {
          const progressRow = await freshRoomProgress(room.id);
          if (progressRow?.last_bonus_date !== todayStr()) completionBonus = POINTS.DAY_COMPLETE_BONUS;
        }

        const delta = pointsAwarded + completionBonus;
        if (delta > 0) {
          const progressRow = await freshRoomProgress(room.id);
          const patch: Record<string, unknown> = {
            room_id: room.id,
            total_points: (progressRow?.total_points || 0) + delta,
            updated_at: new Date().toISOString(),
          };
          if (completionBonus > 0) patch.last_bonus_date = todayStr();
          await db.from("family_room_progress").upsert(patch);
        }

        const progress = await freshRoomProgress(room.id);
        return json({ ok: true, data: { points_awarded: pointsAwarded, completion_bonus: completionBonus, progress, room_total: roomTotal, done_count: doneCount } });
      }

      case "family_room_parent_check": {
        const session = await getSession(body.token);
        if (!session || session.role !== "kid") return json({ ok: false, error: "session_expired" }, 401);
        const room = await assertFamilyRoomAccess(session, String(body.room_id || ""));
        if (!room) return json({ ok: false, error: "not_found" }, 404);
        const eventType = String(body.event_type || "");
        if (!["parent_pass", "parent_star"].includes(eventType)) return json({ ok: false, error: "bad_event_type" }, 400);

        if (!(await verifyParentSecret(session.family_id, body))) return json({ ok: false, error: "wrong_pin" }, 403);

        const emoji = eventType === "parent_star" ? "⭐" : "✅";
        const label = eventType === "parent_star" ? "Great job from a parent!" : "Passed by a parent!";
        const points = eventType === "parent_star" ? POINTS.PARENT_GREAT_JOB : POINTS.PARENT_PASS;

        const { awarded, progress } = await awardRoomPass(room.id, session.kid_id, { eventType, emoji, label, points });
        return json({ ok: true, data: { awarded_points: awarded, progress } });
      }

      case "family_room_try_again": {
        const session = await getSession(body.token);
        if (!session || session.role !== "kid") return json({ ok: false, error: "session_expired" }, 401);
        const room = await assertFamilyRoomAccess(session, String(body.room_id || ""));
        if (!room) return json({ ok: false, error: "not_found" }, 404);
        const parentResult = "🔁 Try again. Fix the missed jobs, then ask a parent to check again.";
        await db.from("family_room_progress").upsert({ room_id: room.id, parent_result: parentResult, updated_at: new Date().toISOString() });
        const progress = await freshRoomProgress(room.id);
        return json({ ok: true, data: { progress } });
      }

      case "family_room_reset_day": {
        const session = await getSession(body.token);
        if (!session) return json({ ok: false, error: "session_expired" }, 401);
        const room = await assertFamilyRoomAccess(session, String(body.room_id || ""));
        if (!room) return json({ ok: false, error: "not_found" }, 404);

        const { data: allItems } = await db.from("family_room_items").select("id").eq("room_id", room.id);
        const itemIds = (allItems || []).map((i) => i.id);
        const roomTotal = itemIds.length;
        const { data: allState } = await db.from("family_room_state").select("checked").in("item_id", itemIds);
        const done = (allState || []).filter((s) => s.checked).length;
        const progressRow = await freshRoomProgress(room.id);

        await db.from("family_room_log").insert({
          room_id: room.id,
          kid_id: session.role === "kid" ? session.kid_id : null,
          items_done: done,
          items_total: roomTotal,
          percent_complete: roomTotal ? Math.round((done / roomTotal) * 100) : 0,
          event_type: "reset",
          parent_result: progressRow?.parent_result ?? null,
          streak_at_time: progressRow?.current_streak || 0,
        });

        if (itemIds.length) {
          await db.from("family_room_state").update({ checked: false, updated_at: new Date().toISOString() }).in("item_id", itemIds);
        }
        await db.from("family_room_progress").upsert({
          room_id: room.id,
          parent_result: "No parent check yet today.",
          last_bonus_date: null,
          updated_at: new Date().toISOString(),
        });

        const progress = await freshRoomProgress(room.id);
        return json({ ok: true, data: { progress } });
      }

      case "manage_room_items": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);
        const room = await assertFamilyRoomAccess(session, String(body.room_id || ""));
        if (!room) return json({ ok: false, error: "not_found" }, 404);
        const itemAction = String(body.itemAction || "");

        if (itemAction === "add") {
          const label = String(body.label || "").trim().slice(0, 140);
          if (!label) return json({ ok: false, error: "label_required" }, 400);
          const { data: existing } = await db.from("family_room_items").select("id").eq("room_id", room.id);
          const { data: item, error } = await db
            .from("family_room_items")
            .insert({ room_id: room.id, label, sort_order: (existing?.length || 0) + 1 })
            .select()
            .single();
          if (error || !item) return json({ ok: false, error: "could_not_add" }, 500);
          return json({ ok: true, data: { item } });
        }

        if (itemAction === "rename") {
          const { data: item } = await db.from("family_room_items").select("id").eq("id", body.item_id).eq("room_id", room.id).maybeSingle();
          if (!item) return json({ ok: false, error: "not_found" }, 404);
          const label = String(body.label || "").trim().slice(0, 140);
          if (!label) return json({ ok: false, error: "label_required" }, 400);
          await db.from("family_room_items").update({ label }).eq("id", item.id);
          return json({ ok: true });
        }

        if (itemAction === "delete") {
          const { data: item } = await db.from("family_room_items").select("id").eq("id", body.item_id).eq("room_id", room.id).maybeSingle();
          if (!item) return json({ ok: false, error: "not_found" }, 404);
          await db.from("family_room_items").delete().eq("id", item.id);
          return json({ ok: true });
        }

        return json({ ok: false, error: "unknown_item_action" }, 400);
      }

      case "upload_family_room_photo": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);
        const room = await assertFamilyRoomAccess(session, String(body.room_id || ""));
        if (!room) return json({ ok: false, error: "not_found" }, 404);

        const { count } = await db.from("family_room_photos").select("id", { count: "exact", head: true }).eq("room_id", room.id);
        if ((count || 0) >= MAX_PHOTOS_PER_ROOM) return json({ ok: false, error: "max_photos_reached" }, 400);

        const base64 = String(body.image_base64 || "");
        if (!base64) return json({ ok: false, error: "image_required" }, 400);
        let bytes: Uint8Array;
        try {
          bytes = base64ToBytes(base64);
        } catch {
          return json({ ok: false, error: "bad_image_data" }, 400);
        }
        if (bytes.byteLength > MAX_PHOTO_BYTES) return json({ ok: false, error: "image_too_large" }, 400);

        const contentType = String(body.content_type || "image/jpeg");
        const ext = contentType.includes("png") ? "png" : "jpg";
        const path = `room-${room.id}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await db.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType, upsert: false });
        if (uploadError) return json({ ok: false, error: "upload_failed" }, 500);

        await db.from("family_room_photos").insert({
          room_id: room.id,
          storage_path: path,
        });
        // The stored fingerprint (if any) was generated from the old photo
        // set - invalidate it so the worker regenerates on next use.
        await db.from("family_rooms").update({ room_fingerprint: null }).eq("id", room.id).eq("room_fingerprint_locked", false);

        const photos = await getRoomPhotosWithUrls(room.id);
        return json({ ok: true, data: { photos } });
      }

      case "delete_family_room_photo": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);
        const photoId = String(body.photo_id || "");
        const { data: photo } = await db.from("family_room_photos").select("id, room_id, storage_path").eq("id", photoId).maybeSingle();
        if (!photo) return json({ ok: false, error: "not_found" }, 404);
        const room = await assertFamilyRoomAccess(session, photo.room_id);
        if (!room) return json({ ok: false, error: "not_found" }, 404);

        await db.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
        await db.from("family_room_photos").delete().eq("id", photo.id);
        await db.from("family_rooms").update({ room_fingerprint: null }).eq("id", photo.room_id).eq("room_fingerprint_locked", false);
        const photos = await getRoomPhotosWithUrls(photo.room_id);
        return json({ ok: true, data: { photos } });
      }

      case "update_room_fingerprint": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);

        const kidId = body.kid_id ? String(body.kid_id) : null;
        const roomId = body.room_id ? String(body.room_id) : null;
        if ((!kidId && !roomId) || (kidId && roomId)) return json({ ok: false, error: "exactly_one_target_required" }, 400);

        // An empty string clears back to null and unlocks it, so the worker
        // resumes auto-generating one from reference photos next use.
        const fingerprint = String(body.fingerprint || "").trim().slice(0, 2000);
        const patch = { room_fingerprint: fingerprint || null, room_fingerprint_locked: !!fingerprint };

        if (kidId) {
          const { data: kid } = await db.from("kids").select("id").eq("id", kidId).eq("family_id", session.family_id).maybeSingle();
          if (!kid) return json({ ok: false, error: "not_found" }, 404);
          await db.from("kids").update(patch).eq("id", kidId);
        } else {
          const room = await assertFamilyRoomAccess(session, roomId as string);
          if (!room) return json({ ok: false, error: "not_found" }, 404);
          await db.from("family_rooms").update(patch).eq("id", roomId as string);
        }
        return json({ ok: true, data: patch });
      }

      case "request_fingerprint_regeneration": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);

        const kidId = body.kid_id ? String(body.kid_id) : null;
        const roomId = body.room_id ? String(body.room_id) : null;
        if ((!kidId && !roomId) || (kidId && roomId)) return json({ ok: false, error: "exactly_one_target_required" }, 400);

        // Same reset as an empty-string update_room_fingerprint (clears and
        // unlocks), plus a timestamp the worker's separate poll watches for -
        // this is what makes it happen without waiting for a kid to submit a
        // photo, unlike the passive "next scoring job" path.
        const patch = {
          room_fingerprint: null,
          room_fingerprint_locked: false,
          room_fingerprint_regen_requested_at: new Date().toISOString(),
        };

        if (kidId) {
          const { data: kid } = await db.from("kids").select("id").eq("id", kidId).eq("family_id", session.family_id).maybeSingle();
          if (!kid) return json({ ok: false, error: "not_found" }, 404);
          const photos = await getPhotosWithUrls(kidId);
          if (!photos.length) return json({ ok: false, error: "no_reference_photos" }, 400);
          await db.from("kids").update(patch).eq("id", kidId);
        } else {
          const room = await assertFamilyRoomAccess(session, roomId as string);
          if (!room) return json({ ok: false, error: "not_found" }, 404);
          const photos = await getRoomPhotosWithUrls(roomId as string);
          if (!photos.length) return json({ ok: false, error: "no_reference_photos" }, 400);
          await db.from("family_rooms").update(patch).eq("id", roomId as string);
        }
        return json({ ok: true, data: patch });
      }

      case "get_photo_score_history": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);

        const kidId = body.kid_id ? String(body.kid_id) : null;
        const roomId = body.room_id ? String(body.room_id) : null;
        if ((!kidId && !roomId) || (kidId && roomId)) return json({ ok: false, error: "exactly_one_target_required" }, 400);

        if (kidId) {
          const { data: kid } = await db.from("kids").select("id").eq("id", kidId).eq("family_id", session.family_id).maybeSingle();
          if (!kid) return json({ ok: false, error: "not_found" }, 404);
        } else {
          const room = await assertFamilyRoomAccess(session, roomId as string);
          if (!room) return json({ ok: false, error: "not_found" }, 404);
        }

        const { data: history } = await db
          .from("photo_score_requests")
          .select("id, status, score, comment, rejection_reason, created_at, scored_at, storage_path")
          .eq(kidId ? "kid_id" : "room_id", kidId || roomId)
          .neq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(50);

        const rows = history || [];
        // Thumbnails only for the most recent rows - a signed URL per row,
        // capped so a long history doesn't mean 50 storage calls on every load.
        const thumbPaths = rows.slice(0, HISTORY_THUMBNAIL_LIMIT).map((r) => r.storage_path);
        const { data: signedList } = thumbPaths.length
          ? await db.storage.from(PHOTO_BUCKET).createSignedUrls(thumbPaths, SIGNED_URL_TTL_SECONDS)
          : { data: [] as { path: string | null; signedUrl: string }[] };
        const urlByPath = Object.fromEntries((signedList || []).map((s) => [s.path, s.signedUrl]));
        const withUrls = rows.map(({ storage_path, ...rest }) => ({ ...rest, photo_url: urlByPath[storage_path] || null }));

        return json({ ok: true, data: { history: withUrls } });
      }

      // --- AI photo scoring (self-hosted vision model, polled by a local worker) ---

      case "submit_photo_for_scoring": {
        const session = await getSession(body.token);
        if (!session || session.role !== "kid") return json({ ok: false, error: "session_expired" }, 401);

        const { data: family } = await db.from("families").select("ai_score_mode").eq("id", session.family_id).maybeSingle();
        if (!family || family.ai_score_mode === "off") return json({ ok: false, error: "ai_scoring_disabled" }, 400);

        const roomId = body.room_id ? String(body.room_id) : null;
        if (roomId) {
          const room = await assertFamilyRoomAccess(session, roomId);
          if (!room) return json({ ok: false, error: "not_found" }, 404);
        }

        const base64 = String(body.image_base64 || "");
        if (!base64) return json({ ok: false, error: "image_required" }, 400);
        let bytes: Uint8Array;
        try {
          bytes = base64ToBytes(base64);
        } catch {
          return json({ ok: false, error: "bad_image_data" }, 400);
        }
        if (bytes.byteLength > MAX_PHOTO_BYTES) return json({ ok: false, error: "image_too_large" }, 400);

        // photo_taken_at is captured by the client from the source file/camera
        // before compression - required, so a kid can't resubmit an old "tidy"
        // photo from their gallery instead of taking a fresh one.
        const takenAtMs = Date.parse(String(body.photo_taken_at || ""));
        if (!Number.isFinite(takenAtMs)) return json({ ok: false, error: "photo_timestamp_required" }, 400);
        const ageMs = Date.now() - takenAtMs;
        if (ageMs > MAX_PHOTO_AGE_MS) return json({ ok: false, error: "photo_too_old" }, 400);
        if (ageMs < -5 * 60 * 1000) return json({ ok: false, error: "photo_timestamp_invalid" }, 400); // >5 min in the future - clock skew tolerance

        const contentType = String(body.content_type || "image/jpeg");
        const ext = contentType.includes("png") ? "png" : "jpg";
        const target = roomId ? `room-${roomId}` : session.kid_id;
        const path = `score-submissions/${target}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await db.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType, upsert: false });
        if (uploadError) return json({ ok: false, error: "upload_failed" }, 500);

        const { data: request, error } = await db
          .from("photo_score_requests")
          .insert({
            family_id: session.family_id,
            kid_id: roomId ? null : session.kid_id,
            room_id: roomId,
            storage_path: path,
            photo_taken_at: new Date(takenAtMs).toISOString(),
          })
          .select()
          .single();

        if (error || !request) {
          await db.storage.from(PHOTO_BUCKET).remove([path]);
          // 23505 = unique_violation - the one-pending-per-target index caught a duplicate.
          if (error?.code === "23505") return json({ ok: false, error: "already_pending" }, 400);
          return json({ ok: false, error: "could_not_submit" }, 500);
        }

        return json({ ok: true, data: { request } });
      }

      case "get_pending_photo_scores": {
        if (!checkWorkerToken(body)) return json({ ok: false, error: "unauthorized" }, 401);

        const { data: pending } = await db
          .from("photo_score_requests")
          .select("*")
          .eq("status", "pending")
          .order("created_at")
          .limit(10);

        const jobs = await Promise.all(
          (pending || []).map(async (req) => {
            const { data: signed } = await db.storage.from(PHOTO_BUCKET).createSignedUrl(req.storage_path, SIGNED_URL_TTL_SECONDS);
            const referencePhotos = req.kid_id ? await getPhotosWithUrls(req.kid_id) : await getRoomPhotosWithUrls(req.room_id as string);
            const previousPhotoHash = req.kid_id
              ? await getLatestPhotoHash("kid_id", req.kid_id)
              : await getLatestPhotoHash("room_id", req.room_id as string);
            const { data: target } = req.kid_id
              ? await db.from("kids").select("room_fingerprint").eq("id", req.kid_id).maybeSingle()
              : await db.from("family_rooms").select("room_fingerprint").eq("id", req.room_id as string).maybeSingle();
            return {
              id: req.id,
              kid_id: req.kid_id,
              room_id: req.room_id,
              submitted_photo_url: signed?.signedUrl || null,
              reference_photos: referencePhotos,
              previous_photo_hash: previousPhotoHash,
              room_fingerprint: target?.room_fingerprint || null,
              created_at: req.created_at,
            };
          })
        );
        return json({ ok: true, data: jobs });
      }

      case "get_pending_fingerprint_regenerations": {
        if (!checkWorkerToken(body)) return json({ ok: false, error: "unauthorized" }, 401);

        const [{ data: kidsPending }, { data: roomsPending }] = await Promise.all([
          db.from("kids").select("id").not("room_fingerprint_regen_requested_at", "is", null),
          db.from("family_rooms").select("id").not("room_fingerprint_regen_requested_at", "is", null),
        ]);

        // A request can outlive its reference photos (parent deletes them
        // after asking for a regeneration but before the worker gets to it) -
        // clear those immediately rather than handing the worker a job with
        // nothing to look at, which would otherwise re-appear on every poll.
        const kidJobs = await Promise.all(
          (kidsPending || []).map(async (k) => {
            const photos = await getPhotosWithUrls(k.id);
            if (!photos.length) {
              await db.from("kids").update({ room_fingerprint_regen_requested_at: null }).eq("id", k.id);
              return null;
            }
            return { kid_id: k.id, room_id: null, reference_photos: photos };
          })
        );
        const roomJobs = await Promise.all(
          (roomsPending || []).map(async (r) => {
            const photos = await getRoomPhotosWithUrls(r.id);
            if (!photos.length) {
              await db.from("family_rooms").update({ room_fingerprint_regen_requested_at: null }).eq("id", r.id);
              return null;
            }
            return { kid_id: null, room_id: r.id, reference_photos: photos };
          })
        );

        return json({ ok: true, data: [...kidJobs, ...roomJobs].filter(Boolean) });
      }

      case "submit_room_fingerprint": {
        if (!checkWorkerToken(body)) return json({ ok: false, error: "unauthorized" }, 401);

        const fingerprint = String(body.fingerprint || "").trim().slice(0, 2000);
        if (!fingerprint) return json({ ok: false, error: "fingerprint_required" }, 400);

        const kidId = body.kid_id ? String(body.kid_id) : null;
        const roomId = body.room_id ? String(body.room_id) : null;
        if ((!kidId && !roomId) || (kidId && roomId)) return json({ ok: false, error: "exactly_one_target_required" }, 400);

        // Clears any pending regeneration request too - a fresh fingerprint
        // just landed either way, whether this came from the lazy per-job
        // path or an explicit "regenerate now" request.
        const patch = { room_fingerprint: fingerprint, room_fingerprint_regen_requested_at: null };
        if (kidId) {
          await db.from("kids").update(patch).eq("id", kidId);
        } else {
          await db.from("family_rooms").update(patch).eq("id", roomId as string);
        }
        return json({ ok: true });
      }

      case "submit_photo_score": {
        if (!checkWorkerToken(body)) return json({ ok: false, error: "unauthorized" }, 401);

        const requestId = String(body.request_id || "");
        // Opaque to Postgres - whatever the worker computed (e.g. a perceptual
        // hash). Stored either way so a future submission can be compared
        // against it via getLatestPhotoHash, even if this one was rejected.
        const photoHash = body.photo_hash != null ? String(body.photo_hash).slice(0, 120) : null;

        // The worker's anti-cheat checks (wrong room, not a room, unusable
        // photo, reused photo) failed - no score, just a reason. Uses the
        // 'failed' status already allowed by the schema rather than a fake
        // numeric score. Guarding on status = 'pending' makes a retried/
        // duplicate submit a harmless no-op either way.
        if (body.rejected === true) {
          const reason = String(body.reason || "").slice(0, 280);
          const { data: rejectedRow } = await db
            .from("photo_score_requests")
            .update({ status: "failed", rejection_reason: reason, photo_hash: photoHash, scored_at: new Date().toISOString() })
            .eq("id", requestId)
            .eq("status", "pending")
            .select()
            .maybeSingle();

          return json({ ok: true, data: { applied: !!rejectedRow, auto_approved: false } });
        }

        const score = Number(body.score);
        const comment = String(body.comment || "").slice(0, 280);
        if (!Number.isInteger(score) || score < 1 || score > 10) return json({ ok: false, error: "bad_score" }, 400);

        const { data: updated } = await db
          .from("photo_score_requests")
          .update({ status: "scored", score, comment, photo_hash: photoHash, scored_at: new Date().toISOString() })
          .eq("id", requestId)
          .eq("status", "pending")
          .select()
          .maybeSingle();

        if (!updated) return json({ ok: true, data: { applied: false } });

        const { data: family } = await db
          .from("families")
          .select("ai_score_mode, ai_score_auto_threshold")
          .eq("id", updated.family_id)
          .maybeSingle();

        let autoApproved = false;
        if (family?.ai_score_mode === "auto_approve" && score >= family.ai_score_auto_threshold) {
          const opts = { eventType: "ai_auto_pass", emoji: "🤖", label: "Auto-approved by AI!", points: POINTS.PARENT_PASS };
          if (updated.kid_id) {
            await awardBedroomPass(updated.kid_id, updated.family_id, opts);
          } else if (updated.room_id) {
            await awardRoomPass(updated.room_id, null, opts);
          }
          autoApproved = true;
        }

        return json({ ok: true, data: { applied: true, auto_approved: autoApproved } });
      }

      default:
        return json({ ok: false, error: "unknown_action" }, 400);
    }
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
