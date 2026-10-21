// Tiny i18n layer. English strings live in js/i18n/en.js; other locales in js/i18n/<code>.js
// (same keys, missing keys fall back to English). Locales match the ones CrazyGames supports.
import en from './i18n/en.js';

export const LOCALES = [
  ['en-US', 'English'], ['es-ES', 'Español'], ['id-ID', 'Bahasa Indonesia'], ['it-IT', 'Italiano'],
  ['nl-NL', 'Nederlands'], ['fr-FR', 'Français'], ['pt-BR', 'Português (Brasil)'], ['ru-RU', 'Русский'],
  ['pl-PL', 'Polski'], ['ro-RO', 'Română'], ['de-DE', 'Deutsch'], ['nb-NO', 'Norsk bokmål'],
  ['sv-SE', 'Svenska'], ['fi-FI', 'Suomi'], ['uk-UA', 'Українська'], ['el-GR', 'Ελληνικά'],
  ['da-DK', 'Dansk'], ['cs-CZ', 'Čeština'], ['hu-HU', 'Magyar'], ['tr-TR', 'Türkçe'],
  ['ar-SA', 'العربية'], ['vi-VN', 'Tiếng Việt'], ['th-TH', 'ไทย'], ['ko-KR', '한국어'], ['ja-JP', '日本語'],
];
const CODES = LOCALES.map(l => l[0]);
const RTL = new Set(['ar-SA']);

let dict = en;
export let locale = 'en-US';

// t('key', { n: 3 }) → string with {n} replaced. Unknown keys return the fallback (or the key).
export function t(key, vars, fallback) {
  let s = dict[key] ?? en[key] ?? fallback ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return s;
}
export const has = key => key in dict || key in en;

// Map any language tag (e.g. "pt", "pt_PT", "no", "en-GB") to one of our locales.
export function matchLocale(tag) {
  if (!tag) return null;
  const norm = String(tag).replace('_', '-').toLowerCase();
  const exact = CODES.find(c => c.toLowerCase() === norm);
  if (exact) return exact;
  let lang = norm.split('-')[0];
  if (lang === 'no' || lang === 'nn') lang = 'nb';
  return CODES.find(c => c.split('-')[0].toLowerCase() === lang) || null;
}

export async function setLocale(code) {
  code = matchLocale(code) || 'en-US';
  if (code === 'en-US') dict = en;
  else {
    try { dict = (await import(`./i18n/${code}.js`)).default; } catch { dict = en; code = 'en-US'; }
  }
  locale = code;
  document.documentElement.lang = code;
  document.documentElement.dir = RTL.has(code) ? 'rtl' : 'ltr';
  applyDom();
  return code;
}

// Static markup: data-i18n (text), data-i18n-html (rich text), data-i18n-aria (aria-label).
export function applyDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
}

// Locale priority: player's choice > ?lang= > CrazyGames SDK > browser languages > English.
export async function detectLocale(saved) {
  if (saved) return saved;
  const param = new URLSearchParams(location.search).get('lang');
  if (matchLocale(param)) return matchLocale(param);
  const sdk = await crazyGamesLocale();
  if (matchLocale(sdk)) return matchLocale(sdk);
  for (const l of navigator.languages?.length ? navigator.languages : [navigator.language]) if (matchLocale(l)) return matchLocale(l);
  return 'en-US';
}

// When embedded on CrazyGames, load their SDK and read user.systemInfo.locale (e.g. "pt-BR").
function onCrazyGames() {
  const hosts = [document.referrer, ...(location.ancestorOrigins ? [...location.ancestorOrigins] : [])].join(' ');
  return /crazygames\./i.test(hosts) || /crazygames\./i.test(location.hostname);
}
async function crazyGamesLocale() {
  if (!onCrazyGames()) return null;
  try {
    if (!window.CrazyGames?.SDK) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
        setTimeout(rej, 3000);
      });
    }
    const sdk = window.CrazyGames.SDK;
    await Promise.race([sdk.init(), new Promise(r => setTimeout(r, 2500))]);
    return sdk.user?.systemInfo?.locale || null;
  } catch { return null; }
}

// Locale-aware formatting helpers.
export const fmtDate = (d, opts) => d.toLocaleDateString(locale, opts);
export const listJoin = items => {
  try { return new Intl.ListFormat(locale, { type: 'conjunction', style: 'narrow' }).format(items.map(String)); } catch { return items.join(', '); }
};
