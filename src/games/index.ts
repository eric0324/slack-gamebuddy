// 狼人殺以外的所有遊戲，順序就是大廳和遊戲清單的順序。新增遊戲：新增 src/games/<遊戲>.ts，在這裡加一行
import { avalon } from './avalon.js';
import { chameleon } from './chameleon.js';
import { cockroach } from './cockroach.js';
import { codenames } from './codenames.js';
import { coup } from './coup.js';
import { decrypto } from './decrypto.js';
import { hanabi } from './hanabi.js';
import { insider } from './insider.js';
import { justOne } from './justone.js';
import { liarsDice } from './liarsdice.js';
import { loveLetter } from './loveletter.js';
import { nimmt } from './nimmt.js';
import { skull } from './skull.js';
import { spyfall } from './spyfall.js';
import { undercover } from './undercover.js';
import { wavecoop } from './wavecoop.js';
import { wavelength } from './wavelength.js';
import { taboo } from './taboo.js';

export const GAMES = [
  undercover,
  spyfall,
  avalon,
  codenames,
  liarsDice,
  justOne,
  coup,
  hanabi,
  wavelength,
  decrypto,
  wavecoop,
  insider,
  skull,
  nimmt,
  loveLetter,
  cockroach,
  chameleon,
  taboo,
] as const;

export type GameKind = (typeof GAMES)[number]['kind'];

// 某款遊戲的 state 型別，例如 StateOf<'skull'>
export type StateOf<K extends GameKind> = ReturnType<Extract<(typeof GAMES)[number], { kind: K }>['apply']>['state'];
