// 猜猜看的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應、視窗
import { applyWager, type WAction, type WState } from '../wager.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*猜猜看指令*',
  '• `/game wager new`：開房 (任何人)',
  '• `/game wager start`：開始遊戲，需要 3～10 位真人 (房主)',
  '• `/game wager answer <數字>`：寫答案，和按「✍️ 寫答案」一樣；只收阿拉伯數字 (可以有逗號、小數點)，截止前可以改',
  '• 押注時按「🎯 押注」，每人 2 個標記，押最接近但不超過正解的答案；都太大就押「🔺 全部太大」',
  '• `/game wager cancel`：取消遊戲 (房主)',
  '押中每個標記 +1，寫出贏的答案再 +1；7 題後總分最高的人獲勝',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

// 猜猜看的子指令：answer <數字>
export function parseWagerCommand(text: string, user: string, channel: string): WAction | null {
  const m = text.trim().match(/^answer\s+([\s\S]+)$/);
  if (m) return { type: 'answer', user, text: m[1].trim() };
  return parseRoomCommand(text, user, channel) as WAction | null;
}

function wagerButton(kind: string, value: string, user: string, channel: string): WAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'wager') return null;
  if (value === 'answer') return { type: 'openAnswer', user };
  if (value === 'betMenu') return { type: 'betMenu', user };
  const [act, seq, slot] = value.split(':');
  if (act === 'bet') return { type: 'bet', user, seq: Number(seq), slot: Number(slot) };
  if (act === 'rebet') return { type: 'rebet', user, seq: Number(seq) };
  return null;
}

export const wager = {
  kind: 'wager' as const,
  emoji: '💰',
  name: '猜猜看',
  players: '3～10 人',
  category: 'party',
  desc: '每題寫一個數字答案，再押注誰最接近正解，不會答也能靠押注贏',
  noBots: true,
  help: HELP,
  apply: applyWager,
  parse: parseWagerCommand,
  button: wagerButton,
  modals: {
    wagerAnswer: { action: (user: string, texts: string[]): WAction => ({ type: 'answer', user, text: texts[0] ?? '' }), fallback: '視窗打不開，請改用 `/game wager answer <數字>` 送出。' },
  },
} satisfies GameDef<WState, WAction>;
