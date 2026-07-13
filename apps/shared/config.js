export const SUPABASE_URL = "https://wumlrhswsyazbvmajhxg.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_A4sb6VuyZeHvlYtlfzFpJw_COEX2h9P";

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
      { id: "ready-inspection", label: "The room is ready for inspection." },
    ],
  },
];

export const CHECKLIST_TOTAL = CHECKLIST.reduce((sum, cat) => sum + cat.items.length, 0);
