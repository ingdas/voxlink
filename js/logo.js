// The game logo: "KUBO'S ISLANDS" as two rows of tilted letter blocks, like the game's voxels.
// Built as DOM for the menus and the photo watermark; photo.js also paints it onto snapshots.
export const GAME_NAME = "Kubo's Islands";
export const LOGO_ROWS = ["KUBO'S", 'ISLANDS'];
const COLORS = ['#ffc93c', '#ff6b6b', '#3ddc97', '#4cc9f0', '#b693f5']; // sun, coral, mint, sky, lilac
const ROT = [-6, 4, -3, 5, -4, 3, -5];

// badges: a numbered face on every block (menus); the watermark leaves them out
export function buildLogo(el, { badges = true } = {}) {
  el.innerHTML = '';
  let k = 0;
  for (const word of LOGO_ROWS) {
    const row = document.createElement('div');
    row.className = 'logo-row';
    for (const ch of word) {
      const s = document.createElement('span');
      if (ch === "'") { s.className = 'apos'; s.textContent = '’'; }
      else {
        s.dataset.c = COLORS[k % COLORS.length];
        s.dataset.rot = ROT[k % ROT.length];
        s.style.setProperty('--c', s.dataset.c);
        s.style.setProperty('--rot', `${s.dataset.rot}deg`);
        s.style.setProperty('--d', `${k * 0.12}s`);
        s.innerHTML = badges ? `${ch}<sup>${k + 1}</sup>` : ch;
        k++;
      }
      row.appendChild(s);
    }
    el.appendChild(row);
  }
}
