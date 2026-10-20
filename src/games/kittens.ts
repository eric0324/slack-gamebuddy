// 炸彈貓的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyKittens, CARDS, CATS, type Card, type KAction, type KState, type Pos } from '../kittens.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*炸彈貓指令*',
  '• `/game kittens new`：開房 (任何人)',
  '• `/game kittens addbot [數量]`：加入 bot 補人數 (房主，開始前)',
  '• `/game kittens removebot [數量]`：移除 bot (房主，開始前)',
  '• `/game kittens start`：開始遊戲，需要 2～5 人 (房主)',
  '• `/game kittens cancel`：取消遊戲 (房主)',
  '輪到你時按牌桌訊息的「🃏 我的手牌」出功能牌，最後按「🂠 抽牌」結束回合；別人出牌後 5 秒內可以按「🚫 反對」讓它失效',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

// 炸彈貓：沒有遊戲中的打字指令，全部用按鈕
export function parseKittensCommand(text: string, user: string, channel: string): KAction | null {
  return parseRoomCommand(text, user, channel) as KAction | null;
}

const isCard = (x: string): x is Card => (CARDS as readonly string[]).includes(x);
const POS = ['top', '2', '3', 'bottom', 'random'];

function kittensButton(kind: string, value: string, user: string, channel: string): KAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'kittens') return null;
  if (value === 'hand' || value === 'nope') return { type: value, user };
  const [act, a, b, d] = value.split(':');
  const seq = Number(a);
  if (act === 'draw') return { type: 'draw', user, seq };
  if (act === 'play' && b === 'pair' && (CATS as readonly string[]).includes(d)) return { type: 'play', user, seq, card: d as Card, pair: true };
  if (act === 'play' && isCard(b)) return { type: 'play', user, seq, card: b };
  if (act === 'target' && b) return { type: 'target', user, seq, target: value.split(':').slice(2).join(':') };
  if (act === 'give' && isCard(a)) return { type: 'give', user, card: a };
  if (act === 'place' && POS.includes(a)) return { type: 'place', user, pos: a as Pos };
  return null;
}

export const kittens = {
  kind: 'kittens' as const,
  emoji: '💣',
  name: '炸彈貓',
  players: '2～5 人',
  category: 'strategy',
  desc: '輪流出牌、抽牌，抽到炸彈貓又沒有拆解就出局，最後活下來的人贏',
  help: HELP,
  apply: applyKittens,
  parse: parseKittensCommand,
  button: kittensButton,
} satisfies GameDef<KState, KAction>;
