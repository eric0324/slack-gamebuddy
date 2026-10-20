// 不要謝謝的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyNoThanks, type NTAction, type NTState } from '../nothanks.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*不要謝謝指令*',
  '• `/game nothanks new`：開房 (任何人)',
  '• `/game nothanks addbot [數量]`：加入 bot 補人數 (房主，開始前)',
  '• `/game nothanks removebot [數量]`：移除 bot (房主，開始前)',
  '• `/game nothanks start`：開始遊戲，需要 3～7 人 (房主)',
  '• `/game nothanks cancel`：取消遊戲 (房主)',
  '輪到你時按「🙅 不要謝謝」付 1 個籌碼跳過，或「✋ 收下」這張牌和牌上的籌碼；隨時按「👀 我的籌碼」看自己的籌碼和分數',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

// 不要謝謝：沒有遊戲中的打字指令，全部用按鈕
export function parseNoThanksCommand(text: string, user: string, channel: string): NTAction | null {
  return parseRoomCommand(text, user, channel) as NTAction | null;
}

function noThanksButton(kind: string, value: string, user: string, channel: string): NTAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'nothanks') return null;
  if (value === 'mine') return { type: 'mine', user };
  const [act, step] = value.split(':');
  if (act === 'pass' || act === 'take') return { type: act, user, step: Number(step) };
  return null;
}

export const noThanks = {
  kind: 'nothanks' as const,
  emoji: '🙅',
  name: '不要謝謝',
  players: '3～7 人',
  category: 'strategy',
  desc: '付籌碼說不要，或收下牌和籌碼；連號只算最小的，分數最低的人贏',
  help: HELP,
  apply: applyNoThanks,
  parse: parseNoThanksCommand,
  button: noThanksButton,
} satisfies GameDef<NTState, NTAction>;
