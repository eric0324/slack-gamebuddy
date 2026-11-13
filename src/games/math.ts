// 口算擂台的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyMath, type Level, type MathAction, type MathState, type Mode } from '../math.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*口算擂台指令*',
  '• `/game math new`：開房 (任何人)',
  '• `/game math start`：開始遊戲，需要 2～8 位真人 (房主)',
  '• `/game math set <設定>…`：調整設定，例如 `set 分數 地獄 20` (房主)；可用：分數、四則、簡單、普通、困難、地獄、10、15、20',
  '• `/game math go`：用目前設定開始出題 (房主)，和按「▶️ 開始出題」一樣',
  '• `/game math answer <選項>`：作答，例如 `answer 42`、`answer <`，和按選項按鈕一樣；每題只能答一次',
  '• `/game math cancel`：取消遊戲 (房主)',
  '每題 10 秒 (地獄 20 秒)。答對 10 分，越早答對加分越多 (第 1 個 +5…第 5 個 +1)，總分最高的人獲勝',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const HELP_EN = [
  '*Math Duel commands*',
  '• `/game math new`: open a room (anyone)',
  '• `/game math start`: start the game, needs 2-8 human players (host)',
  '• `/game math set <setting>…`: change settings, e.g. `set fractions hell 20` (host); options: fractions, arithmetic, easy, normal, hard, hell, 10, 15, 20',
  '• `/game math go`: start the questions with the current settings (host), same as pressing "▶️ Start"',
  '• `/game math answer <option>`: answer, e.g. `answer 42` or `answer <`, same as pressing an option button; one answer per question',
  '• `/game math cancel`: cancel the game (host)',
  '10 sec per question (20 sec on Hell). A correct answer is worth 10 points plus a speed bonus (1st +5 … 5th +1); highest total wins',
  `📖 Full guide: <${WIKI}|wiki>`,
].join('\n');

// 口算擂台的子指令：set <字>…、go、answer <選項>
export function parseMathCommand(text: string, user: string, channel: string): MathAction | null {
  const [sub, ...args] = text.trim().split(/\s+/);
  if (sub === 'set' && args.length) return { type: 'set', user, words: args };
  if (sub === 'go' && !args.length) return { type: 'go', user };
  if (sub === 'answer' && args.length === 1) return { type: 'answer', user, value: args[0] };
  return parseRoomCommand(text, user, channel) as MathAction | null;
}

function mathButton(kind: string, value: string, user: string, channel: string): MathAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'math') return null;
  const [act, seqText, arg] = value.split(':');
  const seq = Number(seqText);
  if (act === 'mode') return { type: 'set', user, seq, mode: arg as Mode };
  if (act === 'level') return { type: 'set', user, seq, level: arg as Level };
  if (act === 'total') return { type: 'set', user, seq, total: Number(arg) as 10 };
  if (act === 'go') return { type: 'go', user, seq };
  if (act === 'ans') return { type: 'answer', user, seq, index: Number(arg) };
  return null;
}

export const math = {
  kind: 'math' as const,
  emoji: '🧮',
  name: '口算擂台',
  players: '2～8 人',
  category: 'party',
  desc: '比誰心算又快又準：分數比大小或四則運算，最難有微積分的地獄模式',
  noBots: true,
  locales: { en: { name: 'Math Duel', players: '2-8 players', desc: 'Race to do mental math fast and right: compare fractions or arithmetic, with a Hell mode that has calculus', help: HELP_EN } },
  help: HELP,
  apply: applyMath,
  parse: parseMathCommand,
  button: mathButton,
} satisfies GameDef<MathState, MathAction>;
