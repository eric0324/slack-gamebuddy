// 誰是牛頭王的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyNimmt, type NAction, type NState } from '../nimmt.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*誰是牛頭王指令*',
  '• `/game nimmt new`：開房 (任何人)',
  '• `/game nimmt addbot [數量]`：加入 bot 補人數 (房主，開始前)',
  '• `/game nimmt removebot [數量]`：移除 bot (房主，開始前)',
  '• `/game nimmt start`：開始遊戲，需要 2～10 人 (房主)',
  '• 選牌：每回合按「🃏 選牌」從手牌選一張 (只有你看得到，揭曉前可以改)；也可以打 `/game nimmt play <牌號>`',
  '• `/game nimmt cancel`：取消遊戲 (房主)',
  '出的牌比四列都小時，用頻道按鈕選一列收走；有人累積 66 個牛頭時，打完這一輪就結束，最少的人獲勝',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const HELP_EN = [
  '*6 nimmt! commands*',
  '• `/game nimmt new`: open a room (anyone)',
  '• `/game nimmt addbot [count]`: add bots to fill seats (host, before start)',
  '• `/game nimmt removebot [count]`: remove bots (host, before start)',
  '• `/game nimmt start`: start the game, needs 2-10 players (host)',
  '• Picking: each turn press "🃏 Pick a card" and choose one from your hand (only you can see it; you can change it until the reveal); or type `/game nimmt play <card>`',
  '• `/game nimmt cancel`: cancel the game (host)',
  'If your card is lower than every row, choose a row to take with the channel buttons. When someone reaches 66 bullheads, the game ends after that round and the fewest bullheads wins',
  `📖 Full guide: <${WIKI}|wiki>`,
].join('\n');

// 誰是牛頭王的子指令：play <牌號>
export function parseNimmtCommand(text: string, user: string, channel: string): NAction | null {
  const [sub, arg] = text.trim().split(/\s+/);
  if (sub === 'play') return /^\d+$/.test(arg ?? '') ? { type: 'pick', user, card: Number(arg) } : null;
  return parseRoomCommand(text, user, channel) as NAction | null;
}

function nimmtButton(kind: string, value: string, user: string, channel: string): NAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'nimmt') return null;
  if (value === 'hand') return { type: 'hand', user };
  const [act, seq, arg] = value.split(':');
  if (act === 'pick') return { type: 'pick', user, seq: Number(seq), card: Number(arg) };
  if (act === 'row') return { type: 'row', user, seq: Number(seq), row: Number(arg) };
  return null;
}

export const nimmt = {
  kind: 'nimmt' as const,
  emoji: '🐮',
  name: '誰是牛頭王',
  players: '2～10 人',
  category: 'strategy',
  desc: '大家同時出牌，第 6 張和最小的牌要收走整列牛頭',
  help: HELP,
  locales: {
    en: { name: '6 nimmt!', players: '2-10 players', desc: 'Everyone plays a card at once. The 6th card in a row, or a card too low, takes the whole row of bullheads', help: HELP_EN },
  },
  apply: applyNimmt,
  parse: parseNimmtCommand,
  button: nimmtButton,
} satisfies GameDef<NState, NAction>;
