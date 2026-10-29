import { initShell } from './shell.js';
import * as khoja from './games/khoja.js';
import * as merge from './games/merge.js';
import * as stack from './games/stack.js';
import * as typerush from './games/typerush.js';
import * as daily from './games/daily.js';

initShell({
  'khoja-nepal': khoja,
  'merge-himalaya': merge,
  'himalaya-stack': stack,
  'typerush-nepal': typerush,
  'nepal-daily': daily,
});
