// Daily figure: the same figure, island and numbering for everyone on a given day,
// with local best times, splits and a streak.
import { figureOf } from '../levels.js';
import { hashId } from '../game.js';

const THEME_IDS = ['meadow', 'frost', 'reef', 'starfall'];
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const prevDay = key => { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() - 1); return dayKey(d); };

function dailyLevel(ctx, key) {
  const seed = hashId(`voxlink-daily-${key}`);
  const pool = ctx.LEVELS.filter(l => ctx.expandLevel(l).cells.length >= 24);
  const base = pool[seed % pool.length];
  const known = !!ctx.save.stars[base.id]?.done;
  return {
    level: {
      id: `daily-${key}`, kind: 'daily', name: known ? `Daily · ${base.name}` : 'Daily figure', realName: `Daily · ${base.name}`, baseId: base.id, tag: base.tag,
      figure: figureOf(base.id), theme: THEME_IDS[Math.floor(seed / 7) % THEME_IDS.length],
      chapter: base.chapter, indexInChapter: 2, intro: '', outro: '',
    },
    seed,
  };
}

export function init(ctx) {
  const { $, save, persist, fmt } = ctx;
  save.daily = save.daily || {};
  save.dailyStreak = save.dailyStreak || { last: '', count: 0 };

  document.querySelector('body > svg defs').insertAdjacentHTML('beforeend',
    '<symbol id="i-cal" viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></symbol>');

  const btn = document.createElement('button');
  btn.className = 'btn sky';
  btn.id = 'btn-daily';
  $('title-extra').appendChild(btn);

  document.body.insertAdjacentHTML('beforeend', `
  <div id="screen-daily" class="screen dim">
    <div class="panel narrow daily">
      <div class="brief-chapter">Daily figure</div>
      <h2 class="center" id="daily-date"></h2>
      <div class="brief-thumb"><img id="daily-img" alt=""></div>
      <p class="brief-tag" id="daily-sub"></p>
      <div class="daily-stats">
        <div class="stat"><svg><use href="#i-clock"/></svg><b id="daily-best">–</b><small>today's best</small></div>
        <div class="stat"><svg><use href="#i-star"/></svg><b id="daily-streak">0</b><small>day streak</small></div>
      </div>
      <div class="daily-hist" id="daily-hist"></div>
      <div class="row">
        <button class="btn icon" data-back aria-label="Back"><svg><use href="#i-back"/></svg></button>
        <button class="btn mint grow huge-ish" id="btn-daily-go"><svg><use href="#i-play"/></svg>Play today's</button>
      </div>
    </div>
  </div>`);
  document.querySelector('#screen-daily [data-back]').onclick = () => ctx.popOverlay('screen-daily');

  const streak = () => {
    const s = save.dailyStreak, today = dayKey();
    return s.last === today || s.last === prevDay(today) ? s.count : 0;
  };
  const refreshButton = () => {
    const done = !!save.daily[dayKey()];
    const n = streak();
    btn.innerHTML = `<svg><use href="#i-cal"/></svg>Daily${n ? ` <span class="streak">${n}</span>` : ''}${done ? '' : '<i class="dot"></i>'}`;
  };
  refreshButton();

  const open = () => {
    const key = dayKey();
    const { level } = dailyLevel(ctx, key);
    const done = !!save.stars[level.baseId]?.done;
    $('daily-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    $('daily-img').src = ctx.thumbs[ctx.LEVELS.findIndex(l => l.id === level.baseId)] || '';
    $('daily-img').parentElement.classList.toggle('mystery', !done);
    $('daily-sub').textContent = `${done ? level.realName.replace('Daily · ', '') : 'A mystery figure'} on a ${level.theme === 'starfall' ? 'twilight' : level.theme} island. Same blocks and numbers for everyone today.`;
    const rec = save.daily[key];
    $('daily-best').textContent = rec ? fmt(rec.best) : '–';
    $('daily-streak').textContent = streak();
    const days = Object.keys(save.daily).sort().slice(-7);
    const max = Math.max(1, ...days.map(k => save.daily[k].best));
    $('daily-hist').innerHTML = days.length
      ? days.map(k => `<div title="${k}"><i style="height:${Math.max(8, (save.daily[k].best / max) * 100)}%"></i><small>${k.slice(8)}</small></div>`).join('')
      : '<p>Your last 7 dailies show up here.</p>';
    $('btn-daily-go').innerHTML = `<svg><use href="#i-play"/></svg>${rec ? 'Beat your time' : "Play today's"}`;
    ctx.pushOverlay('screen-daily');
  };
  btn.onclick = open;

  const play = () => {
    const key = dayKey();
    const { level, seed } = dailyLevel(ctx, key);
    ctx.startLevel(level, { seed, placed: [], elapsed: 0, hints: 0 });
  };
  $('btn-daily-go').onclick = play;

  ctx.completeHandlers.daily = (stats, lvl) => {
    const key = lvl.id.slice(6);
    const rec = save.daily[key];
    const isBest = !rec || stats.time < rec.best;
    const prevSplits = rec?.splits;
    if (isBest) save.daily[key] = { best: stats.time, splits: stats.splits, hints: stats.hints };
    const s = save.dailyStreak;
    if (s.last !== key) { s.count = s.last === prevDay(key) ? s.count + 1 : 1; s.last = key; }
    persist();
    refreshButton();
    const idx = ctx.LEVELS.findIndex(l => l.id === lvl.baseId);
    ctx.showComplete({
      name: lvl.realName, img: ctx.thumbs[idx], reveal: lvl.name !== lvl.realName, time: stats.time, parText: 'daily', hints: stats.hints,
      best: isBest && rec ? 'New daily best!' : '', splits: stats.splits, prevSplits,
      say: `${s.count > 1 ? `${s.count} days in a row! ` : ''}Come back tomorrow for a new figure.`,
      nextLabel: 'Done', onNext: ctx.enterTitle, onMap: ctx.openMap, onRetry: play,
    });
  };
}
