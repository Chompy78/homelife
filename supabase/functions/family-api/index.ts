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
// Keep CHECKLIST_TOTAL and the POINTS values in sync with apps/shared/config.js.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CHECKLIST_TOTAL = 17;
const POINTS = {
  ITEM_CHECK: 2,
  DAY_COMPLETE_BONUS: 10,
  MUM_PASS: 20,
  MUM_GREAT_JOB: 35,
};

const PHOTO_BUCKET = "reference-photos";
const MAX_PHOTOS_PER_KID = 3;
const MAX_PHOTO_BYTES = 6 * 1024 * 1024; // sanity cap; client compresses well below this
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour, regenerated on every fetch

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
        return json({ ok: true, data: { token, kid: { id: kid.id, name: kid.name, avatar: kid.avatar_emoji } } });
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
        const [{ data: items }, streak, { data: kid }, photos] = await Promise.all([
          db.from("kid_checklist_state").select("item_id, checked").eq("kid_id", session.kid_id),
          freshStreak(session.kid_id),
          db.from("kids").select("id, name, avatar_emoji").eq("id", session.kid_id).single(),
          getPhotosWithUrls(session.kid_id),
        ]);
        return json({ ok: true, data: { kid, items: items || [], streak: streak || {}, photos } });
      }

      case "upload_reference_photo": {
        const session = await getSession(body.token);
        if (!session) return json({ ok: false, error: "session_expired" }, 401);
        let kidId: string;
        if (session.role === "kid") {
          kidId = session.kid_id;
        } else if (session.role === "parent") {
          const targetKidId = String(body.kid_id || "");
          const { data: kid } = await db.from("kids").select("id").eq("id", targetKidId).eq("family_id", session.family_id).maybeSingle();
          if (!kid) return json({ ok: false, error: "not_found" }, 404);
          kidId = kid.id;
        } else {
          return json({ ok: false, error: "session_expired" }, 401);
        }

        const { count } = await db.from("kid_reference_photos").select("id", { count: "exact", head: true }).eq("kid_id", kidId);
        if ((count || 0) >= MAX_PHOTOS_PER_KID) {
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

        const photos = await getPhotosWithUrls(kidId);
        return json({ ok: true, data: { photos } });
      }

      case "delete_reference_photo": {
        const session = await getSession(body.token);
        if (!session) return json({ ok: false, error: "session_expired" }, 401);
        const photoId = String(body.photo_id || "");
        const { data: photo } = await db.from("kid_reference_photos").select("id, kid_id, storage_path").eq("id", photoId).maybeSingle();
        if (!photo) return json({ ok: false, error: "not_found" }, 404);

        if (session.role === "kid") {
          if (photo.kid_id !== session.kid_id) return json({ ok: false, error: "not_found" }, 404);
        } else if (session.role === "parent") {
          const { data: kid } = await db.from("kids").select("id").eq("id", photo.kid_id).eq("family_id", session.family_id).maybeSingle();
          if (!kid) return json({ ok: false, error: "not_found" }, 404);
        } else {
          return json({ ok: false, error: "session_expired" }, 401);
        }

        await db.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
        await db.from("kid_reference_photos").delete().eq("id", photo.id);
        const photos = await getPhotosWithUrls(photo.kid_id);
        return json({ ok: true, data: { photos } });
      }

      case "update_checklist_item": {
        const session = await getSession(body.token);
        if (!session || session.role !== "kid") return json({ ok: false, error: "session_expired" }, 401);
        const itemId = String(body.item_id || "");
        const checked = !!body.checked;
        if (!itemId) return json({ ok: false, error: "item_id required" }, 400);

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
          const { data: items } = await db.from("kid_checklist_state").select("checked").eq("kid_id", session.kid_id);
          const doneCount = (items || []).filter((i) => i.checked).length;
          if (doneCount >= CHECKLIST_TOTAL) {
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

      case "mum_check": {
        const session = await getSession(body.token);
        if (!session || session.role !== "kid") return json({ ok: false, error: "session_expired" }, 401);
        const eventType = String(body.event_type || "");
        if (!["mum_pass", "mum_star"].includes(eventType)) return json({ ok: false, error: "bad_event_type" }, 400);

        const { data: family } = await db.from("families").select("mum_pin").eq("id", session.family_id).single();
        if (String(body.pin || "") !== family?.mum_pin) return json({ ok: false, error: "wrong_pin" }, 403);

        const streakRow = await freshStreak(session.kid_id);
        const today = todayStr();
        const yesterday = yesterdayStr();
        const emoji = eventType === "mum_star" ? "⭐" : "✅";
        const label = eventType === "mum_star" ? "Great job from Mum!" : "Passed by Mum!";
        const points = eventType === "mum_star" ? POINTS.MUM_GREAT_JOB : POINTS.MUM_PASS;

        let current = streakRow?.current_streak || 0;
        let best = streakRow?.best_streak || 0;
        let totalPoints = streakRow?.total_points || 0;
        let totalPasses = streakRow?.total_passes || 0;
        let lastPassDate = streakRow?.last_pass_date ?? null;
        let mumResult: string;
        let awarded = 0;

        if (lastPassDate === today) {
          mumResult = `${emoji} ${label} Already counted for today.`;
        } else {
          current = lastPassDate === yesterday ? current + 1 : 1;
          best = Math.max(best, current);
          totalPasses += 1;
          awarded = points;
          totalPoints += points;
          lastPassDate = today;
          mumResult = `${emoji} ${label} ${current > 1 ? "Streak continued!" : "New streak started!"}`;
        }

        await db.from("kid_streaks").upsert({
          kid_id: session.kid_id,
          current_streak: current,
          best_streak: best,
          last_pass_date: lastPassDate,
          mum_result: mumResult,
          total_points: totalPoints,
          total_passes: totalPasses,
          updated_at: new Date().toISOString(),
        });

        const { data: items } = await db.from("kid_checklist_state").select("checked").eq("kid_id", session.kid_id);
        const done = (items || []).filter((i) => i.checked).length;
        await db.from("kid_progress_log").insert({
          kid_id: session.kid_id,
          items_done: done,
          items_total: CHECKLIST_TOTAL,
          percent_complete: Math.round((done / CHECKLIST_TOTAL) * 100),
          event_type: eventType,
          mum_result: mumResult,
          streak_at_time: current,
        });

        const streak = await freshStreak(session.kid_id);
        return json({ ok: true, data: { awarded_points: awarded, streak } });
      }

      case "mum_try_again": {
        const session = await getSession(body.token);
        if (!session || session.role !== "kid") return json({ ok: false, error: "session_expired" }, 401);
        const mumResult = "🔁 Try again. Fix the missed jobs, then ask Mum to check again.";
        await db.from("kid_streaks").upsert({ kid_id: session.kid_id, mum_result: mumResult, updated_at: new Date().toISOString() });
        const { data: items } = await db.from("kid_checklist_state").select("checked").eq("kid_id", session.kid_id);
        const done = (items || []).filter((i) => i.checked).length;
        await db.from("kid_progress_log").insert({
          kid_id: session.kid_id,
          items_done: done,
          items_total: CHECKLIST_TOTAL,
          percent_complete: Math.round((done / CHECKLIST_TOTAL) * 100),
          event_type: "mum_try_again",
          mum_result: mumResult,
          streak_at_time: (await freshStreak(session.kid_id))?.current_streak || 0,
        });
        const streak = await freshStreak(session.kid_id);
        return json({ ok: true, data: { streak } });
      }

      case "reset_day": {
        const session = await getSession(body.token);
        if (!session || session.role !== "kid") return json({ ok: false, error: "session_expired" }, 401);
        const { data: items } = await db.from("kid_checklist_state").select("checked").eq("kid_id", session.kid_id);
        const done = (items || []).filter((i) => i.checked).length;
        const streakRow = await freshStreak(session.kid_id);

        await db.from("kid_progress_log").insert({
          kid_id: session.kid_id,
          items_done: done,
          items_total: CHECKLIST_TOTAL,
          percent_complete: Math.round((done / CHECKLIST_TOTAL) * 100),
          event_type: "reset",
          mum_result: streakRow?.mum_result ?? null,
          streak_at_time: streakRow?.current_streak || 0,
        });

        await db.from("kid_checklist_state").update({ checked: false, updated_at: new Date().toISOString() }).eq("kid_id", session.kid_id);
        await db.from("kid_streaks").upsert({
          kid_id: session.kid_id,
          mum_result: "No Mum check yet today.",
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
        const [{ data: streaks }, { data: states }, { data: logs }, photosByKid] = await Promise.all([
          kidIds.length ? db.from("kid_streaks").select("*").in("kid_id", kidIds) : Promise.resolve({ data: [] }),
          kidIds.length ? db.from("kid_checklist_state").select("kid_id, checked").in("kid_id", kidIds) : Promise.resolve({ data: [] }),
          kidIds.length
            ? db.from("kid_progress_log").select("*").in("kid_id", kidIds).order("created_at", { ascending: false }).limit(60)
            : Promise.resolve({ data: [] }),
          Promise.all(kidIds.map(async (id) => [id, await getPhotosWithUrls(id)] as const)),
        ]);
        const photoMap = Object.fromEntries(photosByKid);
        const kidsWithPhotos = (kids || []).map((k) => ({ ...k, photos: photoMap[k.id] || [] }));
        return json({
          ok: true,
          data: { family, kids: kidsWithPhotos, streaks: streaks || [], states: states || [], logs: logs || [], checklist_total: CHECKLIST_TOTAL },
        });
      }

      case "update_family_settings": {
        const session = await getSession(body.token);
        if (!session || session.role !== "parent") return json({ ok: false, error: "session_expired" }, 401);
        const patch: Record<string, unknown> = {};
        if (typeof body.display_name === "string" && body.display_name.trim()) patch.display_name = body.display_name.trim().slice(0, 60);
        if (typeof body.is_public === "boolean") patch.is_public = body.is_public;
        if (typeof body.mum_pin === "string" && /^\d{4}$/.test(body.mum_pin)) patch.mum_pin = body.mum_pin;
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
          const { data: existingKids } = await db.from("kids").select("id").eq("family_id", session.family_id);
          const kid_code = randomCode(3) + "-" + randomCode(3);
          const { data: newKid, error } = await db
            .from("kids")
            .insert({
              family_id: session.family_id,
              name,
              avatar_emoji: String(body.avatar || "⭐"),
              kid_code,
              sort_order: (existingKids?.length || 0) + 1,
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

      case "get_leaderboard": {
        const { data: families } = await db.from("families").select("id, display_name").eq("is_public", true);
        if (!families || families.length === 0) return json({ ok: true, data: [] });
        const familyIds = families.map((f) => f.id);
        const { data: kids } = await db.from("kids").select("id, family_id").in("family_id", familyIds);
        const kidIds = (kids || []).map((k) => k.id);
        const { data: streaks } = kidIds.length
          ? await db.from("kid_streaks").select("kid_id, best_streak, total_points, total_passes").in("kid_id", kidIds)
          : { data: [] };

        const kidToFamily = Object.fromEntries((kids || []).map((k) => [k.id, k.family_id]));
        const byFamily: Record<string, { family_id: string; display_name: string; total_points: number; best_streak: number; total_passes: number; kid_count: number }> = {};
        for (const f of families) byFamily[f.id] = { family_id: f.id, display_name: f.display_name, total_points: 0, best_streak: 0, total_passes: 0, kid_count: 0 };
        for (const s of streaks || []) {
          const fam = byFamily[kidToFamily[s.kid_id]];
          if (!fam) continue;
          fam.total_points += s.total_points || 0;
          fam.best_streak = Math.max(fam.best_streak, s.best_streak || 0);
          fam.total_passes += s.total_passes || 0;
          fam.kid_count += 1;
        }
        const result = Object.values(byFamily).sort((a, b) => b.total_points - a.total_points);
        return json({ ok: true, data: result });
      }

      default:
        return json({ ok: false, error: "unknown_action" }, 400);
    }
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
