// Puzzler mode (optional, campaign levels): link loose blocks into chunks on the ground,
// no "Bubbles" list, sums on the child side of each link, slower hints.
// The mechanics live in game.js (game.puzzler); this module owns the toggle, badge and tips.

export function init(ctx) {
  const { $, save, persist, game } = ctx;
  if (save.settings.puzzler === undefined) save.settings.puzzler = false;

  // the game asks on every load whether this level runs in puzzler mode
  game.puzzlerFor = level => !level.kind && !!save.settings.puzzler;

  document.querySelector('body > svg defs').insertAdjacentHTML('beforeend',
    '<symbol id="i-puzzle" viewBox="0 0 24 24"><path d="M5 8h3.2a2.3 2.3 0 1 1 4.6 0H16v3.2a2.3 2.3 0 1 1 0 4.6V19H12.8a2.3 2.3 0 1 0-4.6 0H5v-3.2a2.3 2.3 0 1 0 0-4.6z"/></symbol>');

  // briefing toggle row, styled like the goal rows
  $('brief-stars').insertAdjacentHTML('afterend', `
    <div class="goal pz-row" id="pz-row">
      <svg><use href="#i-puzzle"/></svg>
      <div class="pz-txt"><b>Puzzler mode</b><small>Link blocks anywhere, read the figure, solve the sums</small></div>
      <button class="toggle" id="pz-toggle" aria-label="Puzzler mode"><i></i></button>
    </div>`);
  const row = $('pz-row'), tog = $('pz-toggle');
  const syncToggle = () => { tog.classList.toggle('on', !!save.settings.puzzler); row.classList.toggle('on', !!save.settings.puzzler); };
  syncToggle();
  row.addEventListener('click', e => {
    e.stopPropagation();
    save.settings.puzzler = !save.settings.puzzler;
    syncToggle();
    persist();
    tog.blur();
    if (e.target.closest('.toggle') === null) ctx.audio.click();
  });

  // HUD badge in the progress pill
  $('count').insertAdjacentHTML('beforebegin', '<i id="pz-badge" class="pz-badge" title="Puzzler mode"><svg><use href="#i-puzzle"/></svg><span>Puzzler</span></i>');
  const sync = () => {
    const on = !!game.puzzler;
    document.body.classList.toggle('puzzler', on);
    $('pz-badge').classList.toggle('on', on);
  };
  const load = game.load.bind(game);
  game.load = (...args) => { load(...args); sync(); tipped = false; };

  // a short explanation from Kubo the first couple of puzzler runs
  let tipped = true;
  ctx.hooks.tick.push(g => {
    if (tipped || !g.puzzler || g.elapsed < 1.2) return;
    tipped = true;
    const n = save.seen.puzzlerTips || 0;
    if (n >= 2) return;
    save.seen.puzzlerTips = n + 1;
    persist();
    ctx.kuboSays(n === 0
      ? 'Puzzler! A sum like 3+4 fits bubble 7. Loose blocks can link together on the ground, too.'
      : 'Link loose blocks into chunks, then fly the whole chunk onto the figure!');
  });
}
