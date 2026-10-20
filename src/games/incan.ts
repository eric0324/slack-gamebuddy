// 印加寶藏的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyIncan, type IAction, type IState } from '../incan.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*印加寶藏指令*',
  '• `/game incan new`：開房 (任何人)',
  '• `/game incan addbot [數量]`：加入 bot 補人數 (房主，開始前)',
  '• `/game incan removebot [數量]`：移除 bot (房主，開始前)',
  '• `/game incan start`：開始遊戲，需要 3～8 人 (房主)',
  '• `/game incan cancel`：取消遊戲 (房主)',
  '每一步按步驟訊息上的「🔦 繼續探險」或「⛺ 回營地」(30 秒，揭曉前可以改；沒選視為回營地)',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

// 印加寶藏：沒有遊戲中的打字指令，全部用按鈕
export function parseIncanCommand(text: string, user: string, channel: string): IAction | null {
  return parseRoomCommand(text, user, channel) as IAction | null;
}

function incanButton(kind: string, value: string, user: string, channel: string): IAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'incan') return null;
  const [choice, seq] = value.split(':');
  if (choice === 'go' || choice === 'camp') return { type: 'choose', user, seq: Number(seq), choice };
  return null;
}

export const incan = {
  kind: 'incan' as const,
  emoji: '💎',
  name: '印加寶藏',
  players: '3～8 人',
  category: 'bluff',
  desc: '一張張翻探險卡，大家同時決定繼續挖寶還是帶寶石回營地，同種危險出現兩次就泡湯，5 座神殿後寶石最多的人贏',
  help: HELP,
  apply: applyIncan,
  parse: parseIncanCommand,
  button: incanButton,
} satisfies GameDef<IState, IAction>;
