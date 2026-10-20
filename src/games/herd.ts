// 從眾心理的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應、視窗
import { applyHerd, type HerdAction, type HerdState } from '../herd.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*從眾心理指令*',
  '• `/game herd new`：開房 (任何人)',
  '• `/game herd start`：開始遊戲，需要 4～12 位真人 (房主)',
  '• `/game herd answer <答案>`：作答 (1～20 字，分組前可以改)，和按「✍️ 作答」一樣',
  '• `/game herd merge <編號> <編號>…`：把意思一樣的組合併 (房主，例如 `merge 1 3`)',
  '• `/game herd done`：合併完成，開始計分 (房主)',
  '• `/game herd cancel`：取消遊戲 (房主)',
  '跟最多人一樣的那組每人 +1；唯一一個單獨答案的人拿到 🐮 粉紅牛。先到 8 分且沒有粉紅牛的人獲勝，最多 15 題',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const HELP_EN = [
  '*Herd Mentality commands*',
  '• `/game herd new`: open a room (anyone)',
  '• `/game herd start`: start the game, needs 4-12 human players (host)',
  '• `/game herd answer <answer>`: answer (1-20 characters, you can change it until answers are grouped), same as pressing "✍️ Answer"',
  '• `/game herd merge <number> <number>…`: merge groups that mean the same thing (host, e.g. `merge 1 3`)',
  '• `/game herd done`: finish merging and score the question (host)',
  '• `/game herd cancel`: cancel the game (host)',
  'Everyone in the biggest group gets +1; the only player with a unique answer gets the 🐮 Pink Cow. First to 8 points without the Pink Cow wins, at most 15 questions',
  `📖 Full guide: <${WIKI}|wiki>`,
].join('\n');

// 從眾心理的子指令：answer <答案> (可以有空白)、merge <編號>…、done
export function parseHerdCommand(text: string, user: string, channel: string): HerdAction | null {
  const t = text.trim();
  const ans = t.match(/^answer\s+([\s\S]+)$/);
  if (ans) return { type: 'answer', user, text: ans[1].trim() };
  const [sub, ...args] = t.split(/\s+/);
  if (sub === 'merge') return { type: 'merge', user, groups: args.map(Number).filter((n) => Number.isInteger(n)) };
  if (sub === 'done') return { type: 'done', user };
  return parseRoomCommand(text, user, channel) as HerdAction | null;
}

function herdButton(kind: string, value: string, user: string, channel: string): HerdAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'herd') return null;
  if (value === 'write') return { type: 'openWrite', user };
  const [act, seq, n] = value.split(':');
  if (act === 'pick') return { type: 'pick', user, seq: Number(seq), group: Number(n) };
  if (act === 'merge') return { type: 'merge', user, seq: Number(seq) };
  if (act === 'done') return { type: 'done', user, seq: Number(seq) };
  return null;
}

export const herd = {
  kind: 'herd' as const,
  emoji: '🐑',
  name: '從眾心理',
  players: '4～12 人',
  category: 'party',
  desc: '猜猜多數人會怎麼答，跟大家一樣就得分；唯一的怪答案會拿到粉紅牛',
  noBots: true,
  locales: { en: { name: 'Herd Mentality', players: '4-12 players', desc: 'Guess what most people will answer and score by matching the herd; the one odd answer gets the Pink Cow', help: HELP_EN } },
  help: HELP,
  apply: applyHerd,
  parse: parseHerdCommand,
  button: herdButton,
  modals: {
    herdAnswer: { action: (user: string, texts: string[]): HerdAction => ({ type: 'answer', user, text: texts[0] ?? '' }), fallback: '視窗打不開，請改用 `/game herd answer <答案>` 送出。', fallbackLocales: { en: 'The window didn\'t open. Please use `/game herd answer <answer>` instead.' } },
  },
} satisfies GameDef<HerdState, HerdAction>;
