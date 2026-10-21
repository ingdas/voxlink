// Optional feature modules. Each exports init(ctx) — see the ctx object in main.js.
import * as access from './access.js';
import * as photo from './photo.js';
import * as museum from './museum.js';
import * as companion from './companion.js';
import * as workshop from './workshop.js';
import * as lang from './lang.js';
import * as debug from './debug.js';
import * as puzzler from './puzzler.js';
import * as cinema from './cinema.js';

export default [access, companion, photo, museum, workshop, lang, debug, puzzler, cinema];
