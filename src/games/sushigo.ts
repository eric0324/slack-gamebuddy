// 壽司派對的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applySushiGo, CARDS, type Card, type SGAction, type SGState } from '../sushigo.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*壽司派對指令*',
  '• `/game sushigo new`：開房（任何人）',
  '• `/game sushigo addbot [數量]`：加入 bot 補人數（房主，開始前）',
  '• `/game sushigo removebot [數量]`：移除 bot（房主，開始前）',
  '• `/game sushigo start`：開始遊戲，需要 2～5 人（房主）',
  '• `/game sushigo cancel`：取消遊戲（房主）',
  '每回合按牌桌訊息上的「🍣 我的手牌」選一張牌（揭曉前可以改）；桌上有筷子時，選完會問你要不要「🥢 用筷子再出一張」',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

// 壽司派對：沒有遊戲中的打字指令，全部用按鈕
export function parseSushiGoCommand(text: string, user: string, channel: string): SGAction | null {
  return parseRoomCommand(text, user, channel) as SGAction | null;
}

const isCard = (x: string): x is Card => (CARDS as readonly string[]).includes(x);

function sushiGoButton(kind: string, value: string, user: string, channel: string): SGAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'sushigo') return null;
  if (value === 'hand') return { type: 'hand', user };
  const [act, seq, card] = value.split(':');
  if (act === 'pick' && isCard(card)) return { type: 'pick', user, seq: Number(seq), card };
  if (act === 'extra' && (card === 'none' || isCard(card))) return { type: 'extra', user, seq: Number(seq), card };
  return null;
}

export const sushiGo = {
  kind: 'sushigo' as const,
  emoji: '🍣',
  name: '壽司派對',
  players: '2～5 人',
  category: 'bluff',
  desc: '同時選一張壽司再把手牌傳下去，湊組合拿分，3 輪後總分最高的人贏',
  help: HELP,
  apply: applySushiGo,
  parse: parseSushiGoCommand,
  button: sushiGoButton,
} satisfies GameDef<SGState, SGAction>;
