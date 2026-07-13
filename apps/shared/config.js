export const SUPABASE_URL = "https://wumlrhswsyazbvmajhxg.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_A4sb6VuyZeHvlYtlfzFpJw_COEX2h9P";

// Shared family PIN Mum enters to confirm a room Pass / Great Job.
// Not real security - just enough friction that a kid can't tap it solo. Change any time.
export const MUM_PIN = "2468";

export const KIDS = [
  { id: "a0000000-0000-4000-8000-000000000001", name: "Eira", avatar: "🦄" },
  { id: "a0000000-0000-4000-8000-000000000002", name: "Iya", avatar: "🌸" },
  { id: "a0000000-0000-4000-8000-000000000003", name: "Indie", avatar: "🐨" },
];

export const CHECKLIST = [
  {
    category: "1. Clothes",
    items: [
      { id: "dirty-clothes", label: "Dirty clothes are in the laundry basket." },
      { id: "clean-clothes", label: "Clean clothes are put away in drawers or tubs." },
      { id: "hangers", label: "Clothes that need hangers are hanging in the cupboard." },
      { id: "no-clothes-floor", label: "No clothes are left on the floor, bed or chairs." },
    ],
  },
  {
    category: "2. Floor",
    items: [
      { id: "floor-clear", label: "The floor is clear of toys, books, clothes and craft stuff." },
      { id: "safe-walk", label: "Mum can walk across the room without stepping over anything." },
      { id: "nothing-hidden", label: "Nothing is hidden under the bed or behind furniture." },
    ],
  },
  {
    category: "3. Storage",
    items: [
      { id: "toys-tubs", label: "Toys are in the correct tubs or buckets." },
      { id: "books-shelf", label: "Books are on the shelf or in their correct place." },
      { id: "cupboards-sorted", label: "Cupboards, drawers, tubs and buckets are sorted, not stuffed." },
      { id: "doors-close", label: "Cupboards and drawers close properly." },
    ],
  },
  {
    category: "4. Food & Rubbish",
    items: [
      { id: "no-dishes", label: "No cups, plates, bowls or cutlery are in the room." },
      { id: "no-food", label: "No food, wrappers or scraps are in the room." },
      { id: "rubbish-bin", label: "All rubbish is in the bin." },
    ],
  },
  {
    category: "5. Final Check",
    items: [
      { id: "bed-made", label: "The bed is made." },
      { id: "surfaces-clear", label: "Desk, dresser and surfaces are tidy enough to use." },
      { id: "ready-inspection", label: "The room is ready to show off." },
    ],
  },
];

export const CHECKLIST_TOTAL = CHECKLIST.reduce((sum, cat) => sum + cat.items.length, 0);

// --- Gamification -----------------------------------------------------

export const POINTS = {
  ITEM_CHECK: 2,
  DAY_COMPLETE_BONUS: 10,
  MUM_PASS: 20,
  MUM_GREAT_JOB: 35,
};

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
