// What the CrazyGames "Submit a game" form asks for, in its order, ready to paste. tools/art/overview.mjs turns
// it into art/store/overview.html with copy buttons and the checks against the portal's limits (spec.mjs).
// Rich fields are written as HTML (the portal's editor takes headings, bold and lists; no links); the plain-text
// version is derived from it.
import { GAME_NAME } from '../../js/logo.js';

export const NAME = GAME_NAME; // must match the in-game title (the page <title>, the logo, every cover)

export const NAME_NOTES = [
  'It is what the page <code>&lt;title&gt;</code>, the title screen and all three covers say. It cannot be changed after submitting.',
  'No descriptor ("…: 3D Block Puzzle"): the covers carry nothing but the logo, and the form wants the name to be the in-game title.',
];

export const CATEGORY = 'Puzzle';
export const CATEGORY_NOTE = 'The form takes exactly one. Rebuilding figures from numbered blocks is the game; walking the islands is how you get to them. Adventure is the other honest choice.';

export const TAGS = ['3d', 'cute', 'block', 'build', 'logic'];
export const TAGS_NOTE = 'At most five, and only from the site\'s own list (each was checked to have a live <code>/t/</code> page). Several obvious ones are not tags at all: <code>voxel</code>, <code>building</code>, <code>blocks</code>, <code>cozy</code>, <code>island</code>, <code>exploration</code>, <code>first-person</code>, <code>kids</code>. If <code>mobile</code> or <code>mouse</code> arrive as admin-managed tags, good spares are <code>relaxing</code>, <code>math</code> (the Puzzler mode\'s sums) and <code>controller</code> (full gamepad support).';

export const DESCRIPTION = `<p>Kubo's Islands is a cozy 3D block puzzle: a great storm smashed the figures of the Archipelago into numbered blocks, and you rebuild all 50 of them, block by block, across 10 island worlds.</p>
<p>Every block face with a number belongs against the face with the same number on another block. Walk the island, find the block that fits, carry it over and link it on. Kubo, the last Keeper of the islands, floats along with you and shows you the ropes.</p>
<h2>How to play</h2>
<ul>
<li><strong>Find the numbers:</strong> floating bubbles on the figure show which numbers are open right now.</li>
<li><strong>Carry and link:</strong> grab a loose block with that number (you can carry four), then click the bubble. Carry several that fit and they chain in one after another.</li>
<li><strong>Earn three stars:</strong> finish a figure, beat its par time, and use no hints.</li>
</ul>
<h2>The worlds</h2>
<p>Ten archipelagos of islands joined by plank bridges, each with its own look, music and twist: the Meadow Isles, Windmill Farm with its bouncy hay, the icy Frost Isles and snowy Frostwood, Sunset Reef, Shipwreck Cove, low-gravity Starfall Peak and Moon Isle, windy Gale Cliffs, and the Eye of the Storm, where the 330-block Keeper Colossus waits to be rebuilt.</p>
<h2>Features</h2>
<ul>
<li>50 hand-made figures, from a sprout to a lighthouse, a star dragon and the Keeper Colossus</li>
<li>The Keeper's Isle: walk to any world through its portal, with your rebuilt figures on show</li>
<li>Kubo's Garden: stroll among every figure you have rebuilt</li>
<li>The Workshop: design your own figures, play them as puzzles and share them with friends</li>
<li>Puzzler mode: a harder way to play, with sums instead of numbers</li>
<li>Tools for the big figures: a magnet that pulls in blocks that fit, and Kubo Express to send them to the figure from anywhere</li>
<li>Plays with mouse and keyboard, touch or a gamepad; keys can be rebound, and there are comfort and accessibility settings</li>
<li>Available in 25 languages, and your progress is saved automatically</li>
</ul>`;

export const CONTROLS = `<h2>Mouse and keyboard</h2>
<ul>
<li><strong>WASD</strong> or the <strong>arrow keys</strong> to walk, <strong>Shift</strong> to run, <strong>mouse</strong> to look around.</li>
<li><strong>Left-click</strong> or <strong>E</strong> to grab a block, and to link it onto the figure.</li>
<li><strong>Space</strong> to jump (hold it inside a glowing ring to float up tall figures).</li>
<li><strong>1–4</strong>, the <strong>mouse wheel</strong> or <strong>Tab</strong> to pick a block in your backpack; <strong>right-click</strong> or <strong>Q</strong> drops it.</li>
<li><strong>H</strong> for a hint, <strong>R</strong> to rebuild a finished figure for more stars, <strong>Esc</strong> to pause. Keys can be rebound in Settings.</li>
</ul>
<h2>Touch</h2>
<ul>
<li>Drag with your <strong>left thumb</strong> to walk (push all the way to run) and with your <strong>right thumb</strong> to look around.</li>
<li><strong>Tap</strong> a block to grab it and a bubble to link it; the buttons jump, drop and give a hint.</li>
</ul>
<h2>Gamepad</h2>
<ul>
<li><strong>Left stick</strong> to walk, <strong>right stick</strong> to look, <strong>A</strong> to jump.</li>
<li><strong>X</strong> or <strong>RT</strong> to grab and link, <strong>B</strong> or <strong>LT</strong> to drop, <strong>LB</strong> / <strong>RB</strong> to pick a block, <strong>Y</strong> for a hint, <strong>Start</strong> to pause.</li>
</ul>`;

// the form's switches, with the answer for each and why
export const OPTIONS = [
  ['The game supports mobile devices: ON.', 'Touch controls throughout (a floating stick, look by dragging, buttons for the rest), lighter graphics on phones, tested on Android.'],
  ['Mobile orientation: Landscape.', 'Phones and tablets play sideways only: held upright, the game pauses behind a "turn your device" screen. It can only be changed later with a new build.'],
  ['Progress save: browser storage (localStorage).', 'Not the SDK\'s Data module yet; see the open points. Saves survive reloads, not a browser that partitions or clears third-party site data.'],
  ['The game is an online multiplayer game: OFF.', 'Workshop figures are shared as links; nothing else is online.'],
  ['The game has in-game purchases: OFF.', ''],
  ['The game supports CrazyGames muting audio through SDK: OFF.', 'It does not listen to the SDK\'s mute setting yet; see the open points.'],
  ['The game works well in fullscreen: ON.', 'The view fills any frame. Note: Settings has a Fullscreen switch (on by default on phones); see the open points.'],
  ['Allow non-CrazyGames websites to embed your game: OFF.', ''],
];

export const OPEN_POINTS = [
  '<b>SDK gameplay events.</b> The game loads the CrazyGames SDK only for the player\'s language and for Workshop invite links. It does not call <code>loadingStop</code>, <code>gameplayStart</code> / <code>gameplayStop</code> (paused, menus, cutscenes) or <code>happytime</code> (a figure finished). The platform measures the initial download up to the first <code>gameplayStart</code>, and QA checks for these.',
  '<b>Progress in the SDK\'s Data module.</b> Saves live in <code>localStorage</code> (<code>voxlink.v2</code>), which Safari and other browsers that partition third-party data can drop inside the portal\'s iframe. Moving the save to <code>SDK.data</code> (with <code>localStorage</code> as the fallback off the portal) keeps players\' stars.',
  '<b>The portal\'s mute.</b> The game should follow <code>SDK.game.settings.muteAudio</code> and its change listener (and grey out its own sound sliders while muted), then tick "supports muting audio through SDK".',
  '<b>The in-game Fullscreen switch.</b> CrazyGames provides its own fullscreen button and its rules ask games not to add one. The switch could be hidden on the portal (<code>onCrazyGames()</code>), keeping it for the stand-alone site, where it also locks phones in landscape.',
  '<b>Ads.</b> There are no ad breaks. A midgame ad between figures (when the results card goes away) or when travelling through a portal would be the natural spots, if wanted.',
];
