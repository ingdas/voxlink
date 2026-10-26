// Injected into a game page by the art scripts (page.addScriptTag): window.__art stages a shot.
// Everything here works on the live game: the real figure, the real island, the real Kubo.
(() => {
  const V = window.__voxlink, ctx = V.ctx, game = V.game, THREE = ctx.THREE;
  let cam = null, kuboPose = null, camT0 = 0, camDur = 1;

  // Kubo the companion is a group in the scene: a 0.56 m yellow cube with a soft shadow ring
  const kuboGroup = () => game.scene.children.find(o => o.isGroup && o.children[0]?.isMesh && o.children[0].geometry?.type === 'BoxGeometry'
    && Math.abs(o.children[0].geometry.parameters.width - 0.56) < 1e-3);

  // our camera and our Kubo win over whatever the game set this frame: applied right before each render, which
  // every mode goes through (islands, the Keeper's Isle, cutscenes)
  const pose = () => {
    if (cam) {
      const p = typeof cam === 'function' ? cam(Math.min(1, Math.max(0, (performance.now() / 1000 - camT0) / camDur))) : cam;
      game.camera.position.set(...p.pos);
      game.camera.up.set(0, 1, 0);
      game.camera.lookAt(...p.look);
      if (p.fov && game.camera.fov !== p.fov) { game.camera.fov = p.fov; game.camera.updateProjectionMatrix(); }
      game.camera.updateMatrixWorld();
    }
    const k = kuboGroup();
    if (k && kuboPose) {
      const pose = typeof kuboPose === 'function' ? kuboPose(game.t) : kuboPose;
      k.visible = true;
      k.position.set(...pose.pos);
      const body = k.children[0];
      const face = pose.face ?? game.camera.position.toArray();
      body.rotation.set(pose.tilt ?? 0, Math.atan2(face[0] - pose.pos[0], face[2] - pose.pos[2]) + (pose.turn ?? 0), pose.roll ?? 0);
      k.children[1].position.y = (pose.ground ?? 0) - pose.pos[1] + 0.03; // its shadow stays on the ground
      k.children[1].visible = pose.ground !== undefined;
    }
  };
  const render = ctx.renderer.render.bind(ctx.renderer);
  ctx.renderer.render = (scene, camera, target, size) => { if (!target) pose(); return render(scene, camera, target, size); };
  // the game applies the player's eyes to the camera each frame: not while a shot owns it
  const apply = game.player.applyCamera.bind(game.player);
  game.player.applyCamera = c => { if (!cam) apply(c); };

  // switching the HUD on or off for a shot is instant (the game fades it)
  const style = document.createElement('style');
  style.textContent = 'body.art #hud, body.art #hud * { transition: none !important; }';
  document.head.appendChild(style);
  document.body.classList.add('art');

  window.__art = {
    // camera: { pos:[x,y,z], look:[x,y,z], fov? }, or the source of a function of u (0..1 over `dur` seconds of
    // time from now; the page's clock is the script's, so this is video time) returning one; null gives the camera back to the game
    camera(c, dur = 1) { cam = c ? (typeof c === 'string' ? (0, eval)(c) : c) : null; camT0 = performance.now() / 1000; camDur = dur; },
    // Kubo: { pos, face?, ground?, tilt? } (or a function source); null lets him follow the player again
    kubo(k) { kuboPose = k ? (typeof k === 'string' ? (0, eval)(k) : k) : null; },
    hud(on) {
      document.getElementById('hud').classList.toggle('off', !on);
      document.body.classList.toggle('art-clean', !on);
    },
    // instantly place every block but the last `leave` of the figure's own link order (the figure stands
    // almost whole; the rest lie on the island with their bubbles showing where they go)
    buildAllBut(leave) {
      let guard = 0;
      const left = () => game.voxels.filter(v => v.state !== 'placed').length;
      while (left() > leave && guard++ < 3000) {
        const v = game.voxels.find(v => v.state !== 'placed' && game.voxels[v.parent]?.state === 'placed');
        if (!v) break;
        const k = game.pack.indexOf(v.i);
        if (k >= 0) game.pack.splice(k, 1);
        game.place(v.i, true);
      }
      if (game.stageCount > 1) for (let d = 0; d < game.stageCount; d++) if (game.districtCleared(d)) game.districtDone.add(d);
      game.refreshColliders();
      game.emitProgress();
      return left();
    },
    // blocks that fit right now (their parent is on the figure)
    fits() { return game.voxels.filter(v => v.state === 'loose' && game.sockets.has(v.i)).map(v => v.i); },
    // send block i flying from `from` (or where it lies) onto the figure over `dur` seconds
    fly(i, from, dur = 1.2) {
      const v = game.voxels[i];
      if (from) v.mesh.position.set(...from);
      game.startAnim(v, 'flying', v.target, new THREE.Quaternion(), dur);
    },
    // grab block i into the backpack (it lifts into view like a player's grab)
    grab(i) { game.grab(i); },
    link(i) { const k = game.pack.indexOf(i); if (k >= 0) game.launch(i); },
    player(pos, yaw = 0, pitch = 0) { game.player.pos.set(...pos); game.player.vel.set(0, 0, 0); game.player.yaw = yaw; game.player.pitch = pitch; },
    // where other islands are, relative to the active one (the figure on its pedestal is the origin)
    island(id) { const l = V.LEVELS.find(l => l.id === id); return game.arch?.offsetOf(l)?.toArray() ?? null; },
    portal() { return game.arch?.portalPos().toArray() ?? null; },
    info() {
      return { app: ctx.app, mode: game.mode, level: game.level?.id, placed: game.placedCount, total: game.voxels.length, height: game.figureHeight, footR: game.footR, player: game.player.pos.toArray() };
    },
  };
})();
