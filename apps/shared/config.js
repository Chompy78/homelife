export const SUPABASE_URL = "https://wumlrhswsyazbvmajhxg.supabase.co";
export const FAMILY_API_URL = "https://wumlrhswsyazbvmajhxg.supabase.co/functions/v1/family-api";

// Kid identity and the family's confirmation PIN are no longer known to the
// client at all - they live behind a parent_code / kid_code redeemed through
// the family-api edge function, which is the only thing with access to the
// database (see supabase/functions/family-api). This is what makes it safe
// for multiple unrelated families to share this app: nobody's browser ever
// holds a key that can read or write another family's data.
//
// The bedroom checklist itself is also no longer defined here - each family
// has its own customizable copy in family_bedroom_items, fetched from the
// backend at runtime.

export const LEVELS = [
  { level: 1, title: "Tidy Rookie", minPoints: 0 },
  { level: 2, title: "Room Ranger", minPoints: 80 },
  { level: 3, title: "Clean Crew Captain", minPoints: 200 },
  { level: 4, title: "Neatness Ninja", minPoints: 400 },
  { level: 5, title: "Tidy Titan", minPoints: 700 },
  { level: 6, title: "Bedroom Boss", minPoints: 1100 },
  { level: 7, title: "Clean Machine", minPoints: 1600 },
  { level: 8, title: "Legend of the Laundry", minPoints: 2200 },
];

export function levelForPoints(points) {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (points >= lvl.minPoints) current = lvl;
  }
  return current;
}

export function nextLevel(points) {
  return LEVELS.find((lvl) => lvl.minPoints > points) || null;
}

export const BADGES = [
  { id: "first-pass", emoji: "⭐", label: "First Perfect Room", test: (s) => s.totalPasses >= 1 },
  { id: "streak-3", emoji: "🔥", label: "3-Day Streak", test: (s) => s.bestStreak >= 3 },
  { id: "streak-7", emoji: "🔥", label: "7-Day Streak", test: (s) => s.bestStreak >= 7 },
  { id: "streak-14", emoji: "🚀", label: "14-Day Streak", test: (s) => s.bestStreak >= 14 },
  { id: "streak-30", emoji: "👑", label: "30-Day Streak", test: (s) => s.bestStreak >= 30 },
  { id: "rooms-10", emoji: "🏆", label: "10 Rooms Cleaned", test: (s) => s.totalPasses >= 10 },
  { id: "rooms-50", emoji: "🏅", label: "50 Rooms Cleaned", test: (s) => s.totalPasses >= 50 },
  { id: "level-5", emoji: "💎", label: "Level 5 Reached", test: (s) => s.level >= 5 },
];

export function earnedBadges(stats) {
  return BADGES.filter((b) => b.test(stats));
}
