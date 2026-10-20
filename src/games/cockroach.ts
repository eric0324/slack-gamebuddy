// 蟑螂撲克的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyCockroach, isBug, type CrAction, type CrState } from '../cockroach.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*蟑螂撲克指令*',
  '• `/game cockroach new`：開房 (任何人)',
  '• `/game cockroach addbot [數量]`：加入 bot 補人數 (房主，開始前)',
  '• `/game cockroach removebot [數量]`：移除 bot (房主，開始前)',
  '• `/game cockroach start`：開始遊戲，需要 2～6 人 (房主)',
  '• `/game cockroach cancel`：取消遊戲 (房主)',
  '輪到你時按「🪳 出牌」選牌、要傳給誰、要說它是什麼；收到牌時按「✅ 是」「❌ 不是」或「👀 偷看再傳」；隨時按「🃏 我的手牌」(只有你看得到)',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

// 蟑螂撲克只有房間指令，遊戲中都用按鈕
export function parseCockroachCommand(text: string, user: string, channel: string): CrAction | null {
  return parseRoomCommand(text, user, channel) as CrAction | null;
}

// value：play、hand、passmenu、yes／no／peek:<step>、card:<step>:<牌>、tgt:<step>:<牌>:<目標>、claim:<step>:<牌>:<宣稱>:<目標>、to:<step>:<目標>、say:<step>:<宣稱>:<目標> (bot 的 id 有冒號，目標放最後)
function cockroachButton(kind: string, value: string, user: string, channel: string): CrAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'cockroach') return null;
  if (value === 'play' || value === 'hand') return { type: value, user };
  if (value === 'passmenu') return { type: 'passMenu', user };
  const [act, stepText, ...rest] = value.split(':');
  const step = Number(stepText);
  if (act === 'yes' || act === 'no') return { type: 'answer', user, step, yes: act === 'yes' };
  if (act === 'peek') return { type: 'peek', user, step };
  if (act === 'to') return { type: 'to', user, step, target: rest.join(':') };
  const [a, b, ...more] = rest;
  if (act === 'card' && isBug(a)) return { type: 'card', user, step, bug: a };
  if (act === 'tgt' && isBug(a)) return { type: 'target', user, step, bug: a, target: [b, ...more].join(':') };
  if (act === 'say' && isBug(a)) return { type: 'pass', user, step, claim: a, target: [b, ...more].join(':') };
  if (act === 'claim' && isBug(a) && isBug(b)) return { type: 'give', user, step, bug: a, claim: b, target: more.join(':') };
  return null;
}

export const cockroach = {
  kind: 'cockroach' as const,
  emoji: '🪳',
  name: '蟑螂撲克',
  players: '2～6 人',
  category: 'bluff',
  desc: '蓋著傳一張害蟲牌說「這是蟑螂」，猜錯的人收下，同種 4 張就輸',
  help: HELP,
  apply: applyCockroach,
  parse: parseCockroachCommand,
  button: cockroachButton,
} satisfies GameDef<CrState, CrAction>;
