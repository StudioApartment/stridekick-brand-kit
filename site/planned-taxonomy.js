// The full shape of the brand kit, as planned — including sections that
// don't have real Drive folders yet. The nav renders every one of these;
// anything not yet matched to a real folder in Drive shows up greyed out
// and unclickable instead of being hidden. As you add the real folders in
// Drive, matching entries here light up automatically (matching is by
// name, case/punctuation-insensitive — e.g. "Photography - Product" and
// "photography product" match).
//
// Safe to edit any time: rename, reorder, add, or remove entries to keep
// this in sync with how the kit actually gets built out. Any folder that
// exists in Drive but ISN'T listed here still shows up too — it's just
// appended at the end — so nothing real ever gets hidden by this file
// being out of date.
window.PLANNED_TAXONOMY = [
  {
    name: 'Logos',
    children: [
      { name: 'Symbol' },
      { name: 'Logotype', children: [{ name: 'Vertical' }, { name: 'Horizontal' }] },
      { name: 'Pro' },
    ],
  },
  {
    name: 'Typography',
    children: [
      { name: 'Web' },
      { name: 'iPhone' },
      { name: 'Custom Lettering' },
      { name: 'In Use' },
      { name: "Typography No's" },
    ],
  },
  {
    name: 'Visual Patterns',
    children: [
      { name: 'Type Outline' },
      { name: 'Type Shadow' },
      { name: 'What Not To Do' },
    ],
  },
  {
    name: 'Stickers',
    children: [
      { name: 'How To Use' },
      { name: 'Not To Do' },
      { name: 'What Not To Do' },
    ],
  },
  {
    name: 'Imagery',
    children: [
      { name: 'Videos' },
      { name: 'Photography - Lifestyle' },
      { name: 'Photography - Product' },
      { name: 'Device Mock-ups' },
      { name: 'Screenshots' },
      { name: 'Collages' },
      { name: 'What Not To Use' },
    ],
  },
  {
    name: 'Icons',
    children: [
      { name: 'Coloring' },
      { name: 'Bubble Icons' },
      { name: '3D Icon / Status' },
      { name: 'What Not To Do' },
    ],
  },
  { name: 'Example Layouts' },
];
