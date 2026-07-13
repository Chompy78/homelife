import { FAMILY_API_URL } from "./config.js";

// Every call to the backend goes through this. A hard timeout means a
// hanging connection (captive portal, dead wifi) fails fast into an error
// instead of leaving a button stuck mid-tap forever.
export async function callApi(action, payload = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(FAMILY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({ ok: false, error: "bad_response" }));
    return body;
  } catch (err) {
    return { ok: false, error: "network_error" };
  } finally {
    clearTimeout(timer);
  }
}
