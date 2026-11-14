import { initShell } from './shell.js';
import * as khoja from './games/khoja.js';
import * as merge from './games/merge.js';
import * as stack from './games/stack.js';
import * as typerush from './games/typerush.js';
import * as daily from './games/daily.js';
import * as ludo from './games/ludo.js';
import * as snake from './games/snake.js';
import * as breakout from './games/breakout.js';
import * as danphe from './games/danphe.js';
import * as memory from './games/memory.js';

initShell({
  'khoja-nepal': khoja,
  'merge-himalaya': merge,
  'himalaya-stack': stack,
  'typerush-nepal': typerush,
  'nepal-daily': daily,
  'ludo-himalaya': ludo,
  'snake-himalaya': snake,
  'himalaya-breakout': breakout,
  'danphe-flight': danphe,
  'memory-nepal': memory,
});
