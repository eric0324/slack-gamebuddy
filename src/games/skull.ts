// 骷髏與玫瑰的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applySkull, type SkAction, type SkState } from '../skull.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*骷髏與玫瑰指令*',
  '• `/game skull new`：開房 (任何人)',
  '• `/game skull addbot [數量]`：加入 bot 補人數 (房主，開始前)',
  '• `/game skull removebot [數量]`：移除 bot (房主，開始前)',
  '• `/game skull start`：開始遊戲，需要 3～6 人 (房主)',
  '• `/game skull cancel`：取消遊戲 (房主)',
  '蓋牌、開始挑戰、喊數、放棄、翻牌都用按鈕；隨時按「👀 我的牌」看自己的牌',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

// 骷髏與玫瑰：沒有遊戲中的打字指令，全部用按鈕
export function parseSkullCommand(text: string, user: string, channel: string): SkAction | null {
  return parseRoomCommand(text, user, channel) as SkAction | null;
}

function skullButton(kind: string, value: string, user: string, channel: string): SkAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'skull') return null;
  if (value === 'place') return { type: 'placeMenu', user };
  if (value === 'challenge') return { type: 'challengeMenu', user };
  if (value === 'mine') return { type: 'mine', user };
  const [act, step, ...rest] = value.split(':');
  const arg = rest.join(':'); // 翻牌的目標可能是 bot:1:Sam
  if (act === 'disc' && (arg === 'rose' || arg === 'skull')) return { type: 'disc', user, step: Number(step), disc: arg };
  if (act === 'bid') return { type: 'bid', user, step: Number(step), n: Number(arg) };
  if (act === 'pass') return { type: 'pass', user, step: Number(step) };
  if (act === 'flip') return { type: 'flip', user, step: Number(step), target: arg };
  return null;
}

export const skull = {
  kind: 'skull' as const,
  emoji: '💀',
  name: '骷髏與玫瑰',
  players: '3～6 人',
  category: 'bluff',
  desc: '蓋牌喊數，翻開的全是玫瑰才算成功，翻到骷髏就少一張牌',
  help: HELP,
  apply: applySkull,
  parse: parseSkullCommand,
  button: skullButton,
} satisfies GameDef<SkState, SkAction>;
