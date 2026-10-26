// art/store/overview.html: the whole submission pack on one page, in the order the portal's form asks for it.
// Self-contained (its styles and scripts inline); every asset is linked by a relative path next to it, so the
// art/store folder can be zipped, shared or opened straight from disk.
import { PORTAL, ART_SLOTS, NO_TEXT_ZONES, KNOWN_TAGS, KNOWN_CATEGORIES } from './spec.mjs';
import * as S from './submission.mjs';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mb = n => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${Math.round(n / 1024)} kB`;

// the rich text as the portal's editor would hold it in plain form (headings on their own line, bullets)
export function plain(html) {
  return html
    .replace(/<h2>(.*?)<\/h2>/g, '\n$1\n\n').replace(/<li>(.*?)<\/li>/g, '• $1\n').replace(/<\/p>/g, '\n\n')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
}

const mark = { ok: '✓', warn: '!', fail: '✗' };
const checksHtml = cs => cs.length ? `<ul class="checks">${cs.map(c => `<li class="lv-${c.level}"><span class="mark">${mark[c.level]}</span> ${c.text}</li>`).join('')}</ul>` : '';

// Every check the page shows, from the facts the pack gathered. Each: { area, level: ok|warn|fail, text }.
export function runChecks(f) {
  const out = [];
  const add = (area, level, text) => out.push({ area, level, text });
  const nameLen = S.NAME.length;
  add('Game name', nameLen <= PORTAL.nameMax ? 'ok' : 'fail', `${nameLen} of ${PORTAL.nameMax} characters.`);
  add('Game name', f.title === S.NAME ? 'ok' : 'fail', `The page title says "${esc(f.title)}".`);
  add('Category', KNOWN_CATEGORIES.includes(S.CATEGORY) ? 'ok' : 'fail', `"${S.CATEGORY}".`);
  const badTags = S.TAGS.filter(t => !KNOWN_TAGS.includes(t));
  add('Tags', S.TAGS.length <= PORTAL.tagsMax && !badTags.length ? 'ok' : 'fail', `${S.TAGS.length} of at most ${PORTAL.tagsMax}${badTags.length ? `; not on the site: ${badTags.join(', ')}` : ', all with a live tag page'}.`);
  const dLen = plain(S.DESCRIPTION).length, dRich = S.DESCRIPTION.length;
  add('Description', dRich <= PORTAL.descriptionMax ? 'ok' : 'fail', `${dLen} characters of text, ${dRich} with formatting, of ${PORTAL.descriptionMax}.`);
  add('Description', S.DESCRIPTION.includes(`all ${f.figures} of them`) && S.DESCRIPTION.includes(`${f.worlds} island worlds`) ? 'ok' : 'fail', `Says ${f.figures} figures in ${f.worlds} worlds, as js/levels.js has.`);
  add('Description', S.DESCRIPTION.includes(`${f.locales} languages`) ? 'ok' : 'fail', `Says ${f.locales} languages; the game has ${f.locales} locales (all complete: tools/check-i18n.mjs).`);
  const cRich = S.CONTROLS.length;
  add('Controls', cRich <= PORTAL.controlsMax ? 'ok' : 'fail', `${plain(S.CONTROLS).length} characters of text, ${cRich} with formatting, of ${PORTAL.controlsMax}.`);
  add('Game files', f.files.count <= PORTAL.fileCountMax ? 'ok' : 'fail', `${f.files.count} files in the upload, of ${PORTAL.fileCountMax}.`);
  add('Game files', f.files.bytes <= PORTAL.totalBytesMax ? 'ok' : 'fail', `${mb(f.files.bytes)} in the upload, of 250 MB.`);
  add('Game files', f.files.relative ? 'ok' : 'fail', f.files.relative ? 'All paths in index.html are relative.' : 'index.html has absolute paths.');
  if (f.initial) add('Game files', f.initial.bytes <= PORTAL.initialBytesMobile ? 'ok' : f.initial.bytes <= PORTAL.initialBytesMax ? 'warn' : 'fail',
    `Initial download ${mb(f.initial.bytes)} over ${f.initial.requests} requests for a first visit, up to the opening cutscene (the platform allows 50 MB, 20 MB for the mobile homepage).`);
  for (const c of f.covers) {
    const area = ART_SLOTS.find(s => s.file === c.file).label;
    add(area, c.size.w === c.w && c.size.h === c.h ? 'ok' : 'fail', `${c.size.w}×${c.size.h}, ${mb(c.bytes)}.`);
    add(area, c.clear ? 'ok' : 'fail', c.clear ? `Lockup clear of the portal's ${c.zone.w}×${c.zone.h} label zone.` : `Lockup overlaps the ${c.zone.w}×${c.zone.h} label zone.`);
  }
  for (const v of f.videos) {
    const slot = ART_SLOTS.find(s => s.file === v.file);
    if (!v.probe) { add(slot.label, 'fail', 'Missing: run node tools/art-pack.mjs without --no-video.'); continue; }
    const p = v.probe;
    add(slot.label, p.w === slot.w && p.h === slot.h ? 'ok' : 'fail', `${p.w}×${p.h}, ${p.codec}.`);
    add(slot.label, p.seconds >= PORTAL.videoMinSeconds && p.seconds <= PORTAL.videoMaxSeconds ? 'ok' : 'fail', `${p.seconds} s (${PORTAL.videoMinSeconds}–${PORTAL.videoMaxSeconds} s).`);
    add(slot.label, p.bytes <= PORTAL.videoBytesMax ? 'ok' : 'fail', `${mb(p.bytes)} of 50 MB.`);
    add(slot.label, !p.audio ? 'ok' : 'fail', p.audio ? 'Has an audio track.' : 'No audio track.');
    add(slot.label, !p.black ? 'ok' : 'fail', p.black ? 'Has black frames.' : 'No black frames (blackdetect).');
    if (v.olderThanCover) add(slot.label, 'warn', 'Older than its cover, so it opens on the old one: re-cut the previews.');
  }
  return out;
}

function field(id, title, { count, note, body, copy }) {
  return `<section class="field" id="f-${id}">
    <div class="fieldhead"><h3>${title}</h3>${count ? `<span class="count">${count}</span>` : ''}<span class="grow"></span>${copy || ''}</div>
    ${note ? `<p class="note">${note}</p>` : ''}
    ${body}
  </section>`;
}

export function overviewHtml(f) {
  const checks = runChecks(f);
  const by = area => checks.filter(c => c.area === area);
  const fails = checks.filter(c => c.level === 'fail'), warns = checks.filter(c => c.level === 'warn');
  const banner = fails.length ? `<div class="banner fail"><b>${fails.length} out of spec.</b> ${fails.map(c => `${c.area}: ${c.text}`).join(' · ')}</div>`
    : `<div class="banner ${warns.length ? 'warn' : 'ok'}"><b>Inside every limit the portal checks.</b>${warns.length ? ` ${warns.length} to look at: ${warns.map(c => `${c.area}: ${c.text}`).join(' · ')}` : ''}</div>`;
  const descPlain = plain(S.DESCRIPTION), ctrlPlain = plain(S.CONTROLS);

  const cover = c => {
    const slot = ART_SLOTS.find(s => s.file === c.file), z = NO_TEXT_ZONES[slot.shape];
    return `<figure class="asset cover">
      <div class="frame" style="aspect-ratio:${c.w}/${c.h}">
        <img src="${c.file}" alt="${slot.label} cover">
        <div class="zone" style="width:${z.w * 100}%;height:${z.h * 100}%" title="The portal's label zone"></div>
      </div>
      <div class="thumb"><img src="${c.file}" alt="" style="width:${slot.thumb}px"><span>as a grid card, ${slot.thumb}px</span></div>
      <figcaption><b>${slot.label}</b> <span class="spec">${c.w}×${c.h}</span>
        <a href="${c.file}" download>${c.file}</a> <a href="${c.file.replace('.png', '.html')}">composition (HTML)</a></figcaption>
      ${checksHtml(by(slot.label))}
    </figure>`;
  };
  const video = v => {
    const slot = ART_SLOTS.find(s => s.file === v.file);
    return `<figure class="asset">
      ${v.probe ? `<video src="${v.file}" controls muted playsinline loop preload="metadata" poster="${v.poster}" style="aspect-ratio:${slot.w}/${slot.h}"></video>` : '<p class="note" style="padding:12px">Not cut yet.</p>'}
      <figcaption><b>${slot.label}</b> <span class="spec">${slot.w}×${slot.h} · MP4</span><a href="${v.file}" download>${v.file}</a></figcaption>
      ${checksHtml(by(slot.label))}
    </figure>`;
  };

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(S.NAME)} — CrazyGames submission pack</title>
<!-- Generated by tools/art-pack.mjs (${f.generated}). Every asset is linked relative to this file. -->
<style>
  :root { --paper:#fff4e0; --ink:#2a1f3d; --pencil:#6c6380; --faint:#e4d6bd; --card:#fffdf8; --shade:#f6ead3;
    --accent:#ff6b6b; --ok:#2f9a62; --warn:#c07d12; --error:#d63a3a; --portal:#0c0d14; --sun:#ffc93c; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font:16px/1.55 ui-sans-serif,system-ui,sans-serif; }
  main { max-width:1140px; margin:0 auto; padding:28px 16px 80px; }
  nav.toc { position:sticky; top:0; z-index:5; background:var(--paper); border-bottom:2px solid var(--faint);
    display:flex; gap:14px; flex-wrap:wrap; align-items:center; padding:8px 16px; font-size:.86rem; }
  nav.toc a { color:var(--ink); text-decoration:none; } nav.toc a:hover { text-decoration:underline; }
  header.hero { display:flex; gap:24px; align-items:center; flex-wrap:wrap; margin-bottom:6px; }
  header.hero img { width:min(440px,100%); border-radius:14px; border:3px solid var(--ink); box-shadow:0 5px 0 var(--ink); }
  h1 { font-size:1.9rem; margin:0 0 4px; }
  h2 { font-size:1.3rem; margin:46px 0 4px; padding-bottom:6px; border-bottom:2.5px solid var(--ink); }
  h2 small { font-weight:400; color:var(--pencil); font-size:.8rem; margin-left:8px; }
  h3 { font-size:1.02rem; margin:0; }
  p.lede { color:var(--pencil); margin:0 0 10px; }
  p.note, ul.note { color:var(--pencil); font-size:.88rem; margin:4px 0 8px; }
  pre { background:var(--shade); border:1.5px solid var(--faint); border-radius:8px; padding:12px 14px; white-space:pre-wrap; margin:0; font-size:.95rem; }
  code { background:var(--shade); padding:1px 5px; border-radius:4px; font-size:.87em; }
  button { font:inherit; cursor:pointer; border:2px solid var(--ink); border-radius:8px; background:var(--card); color:var(--ink); padding:3px 11px; font-size:.82rem; }
  button:hover { background:var(--shade); } button.quiet { border-color:var(--faint); } button.done { border-color:var(--ok); color:var(--ok); }
  .field { margin:22px 0; }
  .fieldhead { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:4px; }
  .grow { flex:1; }
  .count { font-size:.8rem; color:var(--pencil); font-variant-numeric:tabular-nums; }
  .rich { background:var(--card); border:1.5px solid var(--faint); border-radius:8px; padding:6px 16px; font-size:.94rem; }
  .rich h2 { font-size:1.06rem; border:0; margin:14px 0 4px; padding:0; }
  .chips { display:flex; gap:8px; flex-wrap:wrap; }
  .chip { border:2px solid var(--ink); border-radius:999px; padding:2px 12px; background:var(--card); font-size:.9rem; }
  ul.checks { list-style:none; padding:0; margin:8px 0 0; font-size:.84rem; }
  ul.checks li { margin:2px 0; }
  ul.checks .mark { display:inline-block; width:1.3em; text-align:center; font-weight:700; }
  ul.checks .lv-ok .mark { color:var(--ok); } ul.checks .lv-warn .mark { color:var(--warn); } ul.checks .lv-fail { color:var(--error); font-weight:600; }
  .banner { border-radius:10px; padding:12px 16px; margin:16px 0; border:2.5px solid; background:var(--card); font-size:.92rem; }
  .banner.ok { border-color:var(--ok); } .banner.warn { border-color:var(--warn); } .banner.fail { border-color:var(--error); }
  .grid { display:grid; gap:18px; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); align-items:start; }
  .grid.wide { grid-template-columns:repeat(auto-fill,minmax(420px,1fr)); }
  figure { margin:0; border:2px solid var(--ink); border-radius:12px; overflow:hidden; background:var(--card); }
  figure img, figure video { width:100%; display:block; background:var(--shade); }
  .frame { position:relative; } .frame img { height:100%; object-fit:cover; }
  .zone { position:absolute; left:0; top:0; background:#e70d5c44; border:2px solid #e70d5c; pointer-events:none; }
  body.nozone .zone { display:none; }
  .thumb { background:var(--portal); padding:12px; display:flex; flex-direction:column; align-items:flex-start; gap:6px; }
  .thumb img { max-width:100%; border-radius:8px; } .thumb span { color:#aaadbe; font-size:.72rem; }
  figcaption { padding:9px 11px 0; display:flex; flex-direction:column; gap:1px; font-size:.84rem; }
  figure > ul.checks { padding:0 11px 10px; } figure > figcaption:last-child { padding-bottom:10px; }
  .spec { color:var(--pencil); } figcaption a { color:#c0392b; word-break:break-all; }
  ul.options { list-style:none; padding:0; }
  ul.options li { display:flex; gap:10px; align-items:flex-start; margin:8px 0; }
  ul.options input { margin-top:5px; width:18px; height:18px; flex:none; }
  ol li { margin:6px 0; }
  table { border-collapse:collapse; font-size:.9rem; margin:8px 0; }
  td, th { border:1px solid var(--faint); padding:5px 11px; text-align:left; }
</style></head>
<body>
<nav class="toc"><b>${esc(S.NAME)} → CrazyGames</b>
  <a href="#step1">1 · Create</a><a href="#step2">2 · Details</a><a href="#step3">3 · Covers &amp; videos</a><a href="#extras">Press kit</a>
  <a href="#before">Before you submit</a><a href="#open">Open points</a>
  <label style="margin-left:auto"><input type="checkbox" id="zones" checked> label zones</label></nav>
<main>
  <header class="hero"><img src="cover-landscape-1920x1080.png" alt="">
    <div><h1>CrazyGames submission pack</h1>
    <p class="lede">Everything the portal's <b>Submit a game</b> form asks for, top to bottom, with the art in the slots it goes in
    and a check against every limit the portal enforces. All of it is rendered from the game itself by
    <code>node tools/art-pack.mjs</code>; the limits live in <code>tools/art/spec.mjs</code>, the copy in <code>tools/art/submission.mjs</code>.</p>
    <p class="note">Generated ${f.generated} at <code>${f.commit}</code>.</p></div></header>
  ${banner}

  <h2 id="step1">Step 1 · Create the game</h2>
  ${field('name', 'Game name', { count: `${S.NAME.length} / ${PORTAL.nameMax}`, note: `<ul class="note">${S.NAME_NOTES.map(n => `<li>${n}</li>`).join('')}</ul>`,
    body: `<pre>${esc(S.NAME)}</pre><textarea hidden id="plain-name">${esc(S.NAME)}</textarea>${checksHtml(by('Game name'))}`, copy: '<button class="copy" data-plain="name">Copy</button>' })}
  ${field('files', 'Game files', { note: 'Engine: <b>HTML5</b>. The portal takes a <b>folder</b>, not an archive: upload the files the site deploys (<code>index.html</code>, <code>manifest.webmanifest</code>, <code>css</code>, <code>fonts</code>, <code>icons</code>, <code>js</code>, <code>lib</code>) — the same list <code>.github/workflows/deploy.yml</code> copies. There is no build step.',
    body: `<table><tr><th></th><th>Files</th><th>Size</th></tr>
      <tr><td>The upload</td><td>${f.files.count}</td><td>${mb(f.files.bytes)}</td></tr>
      ${f.initial ? `<tr><td>Initial download (a first visit, to the opening cutscene)</td><td>${f.initial.requests} requests</td><td>${mb(f.initial.bytes)}</td></tr>` : ''}
      <tr><td>Portal limit</td><td>${PORTAL.fileCountMax}</td><td>250 MB</td></tr></table>${checksHtml(by('Game files'))}` })}
  ${field('options', 'Game options', { note: 'The switches on the same screen. Ticks are remembered in this browser only.',
    body: `<ul class="options">${S.OPTIONS.map(([a, b], k) => `<li><input type="checkbox" data-opt="${k}" id="opt-${k}"><label for="opt-${k}"><b>${a}</b> ${b}</label></li>`).join('')}</ul>`,
    copy: '<button class="quiet" id="reset-options">Untick all</button>' })}

  <h2 id="step2">Step 2 · Details</h2>
  ${field('category', 'Category', { note: S.CATEGORY_NOTE, body: `<pre>${S.CATEGORY}</pre><textarea hidden id="plain-category">${S.CATEGORY}</textarea>${checksHtml(by('Category'))}`, copy: '<button class="copy" data-plain="category">Copy</button>' })}
  ${field('tags', 'Tags', { note: S.TAGS_NOTE, body: `<div class="chips">${S.TAGS.map(t => `<span class="chip">${t}</span>`).join('')}</div><textarea hidden id="plain-tags">${S.TAGS.join(', ')}</textarea>${checksHtml(by('Tags'))}`, copy: '<button class="copy" data-plain="tags">Copy</button>' })}
  ${field('description', 'Description', { count: `${descPlain.length} chars · ${S.DESCRIPTION.length} with formatting / ${PORTAL.descriptionMax}`,
    note: 'Rich text in the portal (headings, bold, lists; no links or HTML). <b>Copy formatted</b> and paste into the editor: headings and lists arrive as headings and lists. The first sentence is what the site shows in search results.',
    body: `<div class="rich" id="rich-description">${S.DESCRIPTION}</div><textarea hidden id="plain-description">${esc(descPlain)}</textarea>${checksHtml(by('Description'))}`,
    copy: '<button class="copy" data-rich="description">Copy formatted</button><button class="copy quiet" data-plain="description">Copy plain</button>' })}
  ${field('controls', 'Controls', { count: `${ctrlPlain.length} chars · ${S.CONTROLS.length} with formatting / ${PORTAL.controlsMax}`, note: 'The same editor.',
    body: `<div class="rich" id="rich-controls">${S.CONTROLS}</div><textarea hidden id="plain-controls">${esc(ctrlPlain)}</textarea>${checksHtml(by('Controls'))}`,
    copy: '<button class="copy" data-rich="controls">Copy formatted</button><button class="copy quiet" data-plain="controls">Copy plain</button>' })}
  <section class="field"><div class="fieldhead"><h3>Marketing creatives URL</h3><span class="count">optional</span></div>
    <p class="note">Not shown to players. Leave it empty, or share this <code>art/store</code> folder (covers, previews, stills, the icon) on a drive and paste the link.</p></section>

  <h2 id="step3">Step 3 · Covers and videos <small>all five mandatory</small></h2>
  <p class="note">Upload &amp; Crop, and submit the full frame: each file is already the exact size. The red box is where the site lays its own
  labels ("New", "Hot"); the title stays out of it. Under each cover, the size it is mostly seen at, on the portal's own background.
  The covers are compositions: a scene the game rendered (the Mushroom on the Meadow Isles, its last blocks flying in, Kubo by it)
  under the game's own logo, the only text on them.</p>
  <div class="grid">${f.covers.map(cover).join('\n')}</div>
  <h3 style="margin-top:22px">Preview videos</h3>
  <p class="note">Each opens on its cover and cuts through the game: the last blocks of the Rubber Duck carried and linked in first person
  (one link, the rest chain in, the figure's celebration), then Frost Isles, Starfall Peak, Moon Isle, Sunset Reef, the Keeper Colossus in
  the Eye of the Storm, and the Keeper's Isle. Every frame is the game running in real time; no audio, no text but the game's own HUD.</p>
  <div class="grid wide">${f.videos.map(video).join('\n')}</div>

  <h2 id="extras">Press kit <small>not asked for by the form</small></h2>
  <p class="note">1920×1080 stills of the same scenes (rendered at twice the size and scaled down), and the game's icon.</p>
  <div class="grid">${f.stills.map(s => `<figure class="asset"><img src="${s}" alt="${s}"><figcaption><a href="${s}" download>${s}</a></figcaption></figure>`).join('')}
    <figure class="asset"><img src="icon.svg" alt="icon.svg" style="background:var(--card);padding:30px"><figcaption><a href="icon.svg" download>icon.svg</a> <span class="spec">also icon-512.png</span></figcaption></figure></div>

  <h2 id="before">Before you submit</h2>
  <ol>
    <li>Run <code>node tools/art-pack.mjs</code> and read its last lines: nothing may be out of spec.</li>
    <li>Upload the game folder's files (not a zip) with the HTML5 engine.</li>
    <li>Tick the game options as above; the orientation can only change with a new build.</li>
    <li>Paste the description and controls with <b>Copy formatted</b> and check the headings arrived as headings.</li>
    <li>Upload the three covers and both videos; accept the cropper's full frame.</li>
    <li>Play one figure to the end in the portal's preview, on desktop and on a phone, before sending it for review.</li>
  </ol>

  <h2 id="open">Open points</h2>
  <p class="note">Things the portal's QA may ask about. None blocks a submission.</p>
  <ol>${S.OPEN_POINTS.map(p => `<li>${p}</li>`).join('')}</ol>
  <h3 style="margin-top:18px">Settled: the CrazyGames integration</h3>
  <ul>${S.SETTLED.map(p => `<li>${p}</li>`).join('')}</ul>
</main>
<script>
  const flash = (b, text) => { const was = b.textContent; b.textContent = text; b.classList.add('done'); setTimeout(() => { b.textContent = was; b.classList.remove('done'); }, 1400); };
  // the async Clipboard API needs a secure context; opened from disk, fall back to execCommand
  const legacyCopy = node => { const r = document.createRange(); r.selectNodeContents(node); const s = getSelection(); s.removeAllRanges(); s.addRange(r); let ok = false; try { ok = document.execCommand('copy'); } catch {} s.removeAllRanges(); return ok; };
  for (const b of document.querySelectorAll('button[data-plain]')) b.addEventListener('click', async () => {
    const text = document.getElementById('plain-' + b.dataset.plain).value;
    try { await navigator.clipboard.writeText(text); flash(b, 'Copied'); }
    catch { const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); flash(b, ok ? 'Copied' : 'Select it by hand'); }
  });
  for (const b of document.querySelectorAll('button[data-rich]')) b.addEventListener('click', async () => {
    const node = document.getElementById('rich-' + b.dataset.rich), text = document.getElementById('plain-' + b.dataset.rich).value;
    try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([node.innerHTML], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]); flash(b, 'Copied — paste into the editor'); }
    catch { flash(b, legacyCopy(node) ? 'Copied' : 'Select it by hand'); }
  });
  const KEY = 'kubo-art-options';
  let ticked = {}; try { ticked = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
  for (const c of document.querySelectorAll('input[data-opt]')) {
    c.checked = !!ticked[c.dataset.opt];
    c.addEventListener('change', () => { ticked[c.dataset.opt] = c.checked; try { localStorage.setItem(KEY, JSON.stringify(ticked)); } catch {} });
  }
  document.getElementById('reset-options').addEventListener('click', () => { ticked = {}; try { localStorage.removeItem(KEY); } catch {} for (const c of document.querySelectorAll('input[data-opt]')) c.checked = false; });
  const zones = document.getElementById('zones');
  zones.addEventListener('change', () => document.body.classList.toggle('nozone', !zones.checked));
</script>
</body></html>
`;
}
