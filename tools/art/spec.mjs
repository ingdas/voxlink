// What the CrazyGames developer portal will and will not accept, in one place (the same numbers puzzlebox's
// scripts/art-spec.mjs checks against). Two kinds of source:
//   docs    https://docs.crazygames.com/requirements/ (intro, technical, game-covers)
//   portal  the Submit a game form itself (developer.crazygames.com, September 2026): its input constraints and
//           validation messages, read out of the portal's shipped code. Re-check them when the form changes.

export const PORTAL = {
  nameMax: 35, // portal: "Max length is 35 chars", and it can't be changed after submitting
  descriptionMax: 10000, // portal: rich text (headings, bold, lists; no links, no HTML)
  controlsMax: 5000, // portal: the same editor
  tagsMax: 5, // portal: "MAX. 5 (admin managed non included)"
  fileCountMax: 1500, // docs + portal
  totalBytesMax: 250 * 1024 * 1024, // docs + portal
  initialBytesMax: 50 * 1024 * 1024, // docs: initial download
  initialBytesMobile: 20 * 1024 * 1024, // docs: to be eligible for the mobile homepage
  videoMinSeconds: 15, // docs: "15-20 seconds"
  videoMaxSeconds: 20, // portal: "Max length 20 seconds"
  videoBytesMax: 50 * 1024 * 1024, // docs
};

// The files the form's art step asks for, in its order. All five are mandatory on a first submission.
export const ART_SLOTS = [
  { file: 'cover-landscape-1920x1080.png', label: 'Landscape 16:9', kind: 'cover', shape: 'landscape', w: 1920, h: 1080, thumb: 300 },
  { file: 'cover-portrait-800x1200.png', label: 'Portrait 2:3', kind: 'cover', shape: 'portrait', w: 800, h: 1200, thumb: 180 },
  { file: 'cover-square-800x800.png', label: 'Square 1:1', kind: 'cover', shape: 'square', w: 800, h: 800, thumb: 180 },
  { file: 'preview-landscape-1920x1080.mp4', label: 'Landscape video', kind: 'video', shape: 'landscape', w: 1920, h: 1080 },
  { file: 'preview-portrait-1080x1620.mp4', label: 'Portrait video', kind: 'video', shape: 'portrait', w: 1080, h: 1620 },
];

// portal: where the site lays its own labels ("New", "Hot", "Updated") over a cover, as fractions of its width and
// height from the top-left corner. Nothing that matters may sit there.
export const NO_TEXT_ZONES = {
  landscape: { w: 0.4, h: 0.2 },
  portrait: { w: 0.4, h: 0.1 },
  square: { w: 0.35, h: 0.3 },
};

// Tags with a live page on crazygames.com (/t/<slug> answered 200; checked 2026-10-26) that could describe this game.
// The picker only offers the site's own list, so anything else can't be chosen.
export const KNOWN_TAGS = ['3d', 'cute', 'block', 'build', 'logic', 'relaxing', 'brain', 'math', 'cartoon', 'controller', 'mouse', 'mobile', '1-player', 'casual', 'collect', 'jumping'];
// ...and some that look obvious but have no page (404): voxel, building, blocks, cozy, island, exploration,
// first-person, kids, family, construction, creative, wholesome, 3d-puzzle

// Categories (/c/<slug>): the form takes exactly one
export const KNOWN_CATEGORIES = ['Puzzle', 'Casual', 'Adventure'];
