// Optional feature modules. Each exports init(ctx) — see the ctx object in main.js.
import * as access from './access.js';
import * as daily from './daily.js';
import * as photo from './photo.js';
import * as museum from './museum.js';

export default [access, daily, photo, museum];
