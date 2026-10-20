// Language picker in the settings panel. Changing it reloads the page so every screen,
// HUD string and story line is rebuilt in the new language.
import { LOCALES, locale, t } from '../i18n.js';

export function init(ctx) {
  const list = document.querySelector('#screen-settings .settings');
  if (!list) return;
  const row = document.createElement('label');
  row.className = 'setting lang-row';
  row.innerHTML = `<span>${t('settings.language')}</span><select id="set-lang" class="select">${
    LOCALES.map(([code, name]) => `<option value="${code}" ${code === locale ? 'selected' : ''}>${name}</option>`).join('')
  }</select>`;
  list.prepend(row);
  row.querySelector('select').onchange = e => {
    ctx.save.settings.lang = e.target.value;
    ctx.persist();
    location.reload();
  };
}
