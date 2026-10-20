// Swap the English story / level text in levels.js for the active locale (called once at boot).
import { CHAPTERS, ENDING } from './levels.js';
import { t } from './i18n.js';

export function localizeContent() {
  for (const ch of CHAPTERS) {
    ch.name = t(`ch.${ch.id}.name`, null, ch.name);
    ch.blurb = t(`ch.${ch.id}.blurb`, null, ch.blurb);
    ch.intro = ch.intro.map((line, i) => t(`ch.${ch.id}.intro.${i}`, null, line));
    for (const l of ch.levels) for (const k of ['name', 'tag', 'intro', 'outro']) l[k] = t(`lvl.${l.id}.${k}`, null, l[k]);
  }
  ENDING.forEach((line, i) => { ENDING[i] = t(`ending.${i}`, null, line); });
}
