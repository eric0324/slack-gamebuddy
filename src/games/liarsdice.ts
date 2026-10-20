// 吹牛骰的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyLiarsDice, type LAction, type LState } from '../liarsdice.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*吹牛骰指令*',
  '• `/game liarsdice new`：開房 (任何人)',
  '• `/game liarsdice addbot [數量]`：加入 bot 補人數 (房主，開始前)',
  '• `/game liarsdice removebot [數量]`：移除 bot (房主，開始前)',
  '• `/game liarsdice start`：開始遊戲，需要 2～8 人 (房主)',
  '• `/game liarsdice bid <數量> <點數>`：喊「全場至少有 N 個 X 點」(輪到你時)',
  '• `/game liarsdice cancel`：取消遊戲 (房主)',
  '覺得上一個喊數是吹牛就按「開！」；1 點是萬用，這一輪有人喊過 1 點就不再萬用',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

// 吹牛骰的子指令：bid <數量> <點數>
export function parseLiarsDiceCommand(text: string, user: string, channel: string): LAction | null {
  const [sub, ...rest] = text.trim().split(/\s+/);
  if (sub === 'bid') return rest.length === 2 ? { type: 'bid', user, quantity: Number(rest[0]), face: Number(rest[1]) } : null;
  return parseRoomCommand(text, user, channel) as LAction | null;
}

function liarsDiceButton(kind: string, _value: string, user: string, channel: string): LAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start' || kind === 'challenge') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  return null;
}

export const liarsDice = {
  kind: 'liarsdice' as const,
  emoji: '🎲',
  name: '吹牛骰',
  players: '2～8 人',
  category: 'bluff',
  desc: '偷偷擲骰子，輪流喊數或開，輸的人少一顆骰子',
  help: HELP,
  apply: applyLiarsDice,
  parse: parseLiarsDiceCommand,
  button: liarsDiceButton,
} satisfies GameDef<LState, LAction>;
