// 默契問答的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applySync, type SyncAction, type SyncState } from '../sync.js';
import type { ThemeKey } from '../syncQuestions.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*默契問答指令*',
  '• `/game sync new`：開房 (任何人)',
  '• `/game sync start`：開始遊戲，需要 2～8 位真人 (房主)',
  '• `/game sync theme <主題>`：選主題，例如 `theme 吃喝美食` (房主，開始後 30 秒內)，和按主題按鈕一樣',
  '• `/game sync pick <編號>`：作答，選第幾個選項 (1 起算)，和按選項按鈕一樣；選了不能改',
  '• `/game sync cancel`：取消遊戲 (房主)',
  '主題：通用隨機、日常偏好、朋友日常、吃喝美食、旅行出遊、電影、音樂、遊戲、足球、原神、心動與戀愛、家人之間、同事同學。一共 10 題，全員選同一個算一題同選，最後回顧誰跟誰最有默契',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const HELP_EN = [
  '*In Sync commands*',
  '• `/game sync new`: open a room (anyone)',
  '• `/game sync start`: start the game, needs 2-8 human players (host)',
  '• `/game sync theme <theme>`: pick the theme, e.g. `theme Food & Drink` (host, within 30 sec of starting), same as pressing a theme button',
  '• `/game sync pick <number>`: answer with option number (starting at 1), same as pressing an option button; no changes once you pick',
  '• `/game sync cancel`: cancel the game (host)',
  'Themes: General Mix, Daily Preferences, Friends, Food & Drink, Travel, Movies, Music, Games, Football, Genshin Impact, Romance, Family, Coworkers & Classmates. 10 questions; when everyone picks the same answer it counts as a match, and at the end you see who is most in sync',
  `📖 Full guide: <${WIKI}|wiki>`,
].join('\n');

// 默契問答的子指令：theme <名稱> (可以有空白)、pick <編號>
export function parseSyncCommand(text: string, user: string, channel: string): SyncAction | null {
  const t = text.trim();
  const th = t.match(/^theme\s+([\s\S]+)$/);
  if (th) return { type: 'theme', user, name: th[1].trim() };
  const pk = t.match(/^pick\s+(\d+)$/);
  if (pk) return { type: 'pick', user, option: Number(pk[1]) - 1 };
  return parseRoomCommand(text, user, channel) as SyncAction | null;
}

function syncButton(kind: string, value: string, user: string, channel: string): SyncAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'sync') return null;
  const [act, seq, arg] = value.split(':');
  if (act === 'theme') return { type: 'theme', user, seq: Number(seq), theme: arg as ThemeKey };
  if (act === 'pick') return { type: 'pick', user, seq: Number(seq), option: Number(arg) };
  return null;
}

export const sync = {
  kind: 'sync' as const,
  emoji: '🎯',
  name: '默契問答',
  players: '2～8 人',
  category: 'coop',
  desc: '每題選一個最像你的答案，一起揭曉，看看大家有幾題選到一起',
  noBots: true,
  locales: { en: { name: 'In Sync', players: '2-8 players', desc: 'Pick the answer most like you, reveal together and see how often everyone picks the same', help: HELP_EN } },
  help: HELP,
  apply: applySync,
  parse: parseSyncCommand,
  button: syncButton,
} satisfies GameDef<SyncState, SyncAction>;
