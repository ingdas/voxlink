// Debug tools, only active with ?debug in the URL: jump to any figure, quick-solve,
// fly / no-clip, unlock everything, FPS. Toggle the panel with the ` key.
export function init(ctx) {
  if (!new URLSearchParams(location.search).has('debug')) return;
  const { game, LEVELS, save, persist } = ctx;
  document.body.classList.add('debug');

  const el = document.createElement('div');
  el.id = 'debug-panel';
  el.innerHTML = `
    <div class="dbg-head"><b>DEBUG</b><span id="dbg-fps">– fps</span><button data-a="min">–</button></div>
    <div class="dbg-body">
      <select id="dbg-level">${LEVELS.map((l, i) => `<option value="${i}">${i + 1}. ${l.name} (${ctx.expandLevel(l).cells.length})</option>`).join('')}</select>
      <div class="dbg-row"><button data-a="play">Play</button><button data-a="show">Show island</button><button data-a="map">Map</button></div>
      <div class="dbg-row"><button data-a="solve">Quick solve</button><button data-a="part">Solve part</button><button data-a="ten">+10</button><button data-a="win">Win now</button></div>
      <div class="dbg-row"><button data-a="fly">Fly: off</button><button data-a="home">To pedestal</button><button data-a="hint">Beam</button></div>
      <div class="dbg-row"><button data-a="unlock">Unlock all</button><button data-a="all">All done ★★★</button><button data-a="wipe">Wipe save</button></div>
      <div id="dbg-info"></div>
    </div>`;
  document.body.appendChild(el);

  let solving = null, fly = false;
  const playing = () => game.mode === 'play';
  const stopSolve = () => { clearInterval(solving); solving = null; };

  // Link one block whose parent is already on the figure (skips walking and the backpack).
  const linkOne = () => {
    if (!playing()) return false;
    for (const v of game.voxels) {
      if (v.state === 'dropping' && v.anim) { v.anim.delay = 0; v.anim.t = 1; }
    }
    const v = game.voxels.find(v => (v.state === 'loose' || v.state === 'held' || v.state === 'lifting') && game.sockets.has(v.i));
    if (!v) return game.voxels.some(v => v.state !== 'placed');
    const k = game.pack.indexOf(v.i);
    if (k >= 0) game.pack.splice(k, 1);
    game.place(v.i);
    return true;
  };
  const solve = (until) => {
    stopSolve();
    solving = setInterval(() => { if (!linkOne() || until?.()) stopSolve(); }, 35);
  };

  const actions = {
    min: () => el.classList.toggle('min'),
    play: () => { stopSolve(); ctx.startLevel(+ctx.$('dbg-level').value); },
    show: () => { stopSolve(); ctx.enterTitle(); game.load(+ctx.$('dbg-level').value); game.mode = 'showcase'; },
    map: () => ctx.openMap(),
    solve: () => solve(),
    part: () => { const s = game.stage; solve(() => game.stage !== s); },
    ten: () => { let n = 0; solve(() => ++n >= 10); },
    win: () => {
      stopSolve();
      if (!playing()) return;
      // place everything but the last block instantly, then link the last one for the celebration
      let guard = 0;
      while (game.placedCount < game.voxels.length - 1 && guard++ < 2000) {
        const v = game.voxels.find(v => v.state !== 'placed' && game.voxels[v.parent]?.state === 'placed');
        if (!v) break;
        const k = game.pack.indexOf(v.i);
        if (k >= 0) game.pack.splice(k, 1);
        game.place(v.i, true);
        if (game.stage < game.stageCount - 1 && game.stageCleared(game.stage)) { game.stage++; game.syncStage(false); }
      }
      game.refreshColliders();
      game.emitProgress();
      linkOne();
    },
    fly: e => { fly = !fly; e.target.textContent = `Fly: ${fly ? 'on' : 'off'}`; if (!fly) game.refreshColliders(); },
    home: () => { game.player.pos.set(0, 0.6, 4); game.player.vel.set(0, 0, 0); game.player.yaw = 0; },
    hint: () => { game.hintCooldown = 0; game.hint(); },
    unlock: () => { save.unlocked = LEVELS.length; LEVELS.forEach(l => { const c = ctx.CHAPTERS[l.chapter]; save.seen[c.id] = true; }); save.seen.prologue = true; persist(); ctx.toast('All figures unlocked'); },
    all: () => { LEVELS.forEach(l => { save.stars[l.id] = { done: true, fast: true, clean: true }; }); save.unlocked = LEVELS.length; persist(); ctx.toast('Everything completed'); },
    wipe: () => { localStorage.removeItem('voxlink.v2'); location.reload(); },
  };
  el.addEventListener('click', e => { const b = e.target.closest('button[data-a]'); if (b) { e.stopPropagation(); actions[b.dataset.a](e); } });
  el.addEventListener('pointerdown', e => e.stopPropagation());
  addEventListener('keydown', e => { if (e.code === 'Backquote') el.classList.toggle('hidden'); });

  // fly: no gravity, no collisions; Space rises, C / Ctrl sinks
  let frames = 0, acc = 0;
  ctx.hooks.tick.push(g => {
    if (fly) {
      g.colliders = [];
      const p = g.player, k = g.input.keys;
      p.vel.y = 0;
      const up = (k.has('Space') ? 1 : 0) - (k.has('ControlLeft') || k.has('KeyC') ? 1 : 0);
      p.pos.y = Math.max(0, p.pos.y + up * 8 * g.lastDt);
    }
    frames++; acc += g.lastDt;
    if (acc > 0.5) {
      ctx.$('dbg-fps').textContent = `${Math.round(frames / acc)} fps · ${Math.round(ctx.renderer.pixelRatio * 100) / 100}x`;
      frames = 0; acc = 0;
      ctx.$('dbg-info').textContent = `${g.level?.id} · ${g.placedCount}/${g.voxels?.length} · part ${g.stage + 1}/${g.stageCount} · open ${g.sockets?.size} · loose ${g.voxels?.filter(v => v.state === 'loose').length} · ${ctx.fmt(g.elapsed || 0)}`;
    }
  });
}
