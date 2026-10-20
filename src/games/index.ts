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
import { noThanks } from './nothanks.js';
import { skull } from './skull.js';
import { spyfall } from './spyfall.js';
import { undercover } from './undercover.js';
import { wavecoop } from './wavecoop.js';
import { wavelength } from './wavelength.js';
import { taboo } from './taboo.js';
import { sushiGo } from './sushigo.js';
import { meme } from './meme.js';
import { herd } from './herd.js';
import { kittens } from './kittens.js';
import { criminal } from './criminal.js';
import { wager } from './wager.js';
import { incan } from './incan.js';
import { dixit } from './dixit.js';
import { citadels } from './citadels.js';
import { emoji } from './emoji.js';
import { crew } from './crew.js';
import { saboteur } from './saboteur.js';
import { forsale } from './forsale.js';
import { machikoro } from './machikoro.js';
import { splendor } from './splendor.js';

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
  noThanks,
  taboo,
  sushiGo,
  meme,
  herd,
  kittens,
  criminal,
  wager,
  incan,
  dixit,
  citadels,
  emoji,
  crew,
  saboteur,
  forsale,
  machikoro,
  splendor,
] as const;

export type GameKind = (typeof GAMES)[number]['kind'];

// 某款遊戲的 state 型別，例如 StateOf<'skull'>
export type StateOf<K extends GameKind> = ReturnType<Extract<(typeof GAMES)[number], { kind: K }>['apply']>['state'];
