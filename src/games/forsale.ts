// 地產大亨的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyForSale, type FAction, type FState } from '../forsale.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*地產大亨指令*',
  '• `/game forsale new`：開房 (任何人)',
  '• `/game forsale addbot [數量]`：加入 bot 補人數 (房主，開始前)',
  '• `/game forsale removebot [數量]`：移除 bot (房主，開始前)',
  '• `/game forsale start`：開始遊戲，需要 3～6 人 (房主)',
  '• `/game forsale cancel`：取消遊戲 (房主)',
  '• 第一階段：輪到你時按喊價面板上的「出 $X (+1／+2／+5)」出價、「🔢 其他金額」挑別的金額，或「🙅 放棄」(30 秒，沒動作視為放棄)',
  '• 第二階段：按「🏠 選房產」私下選一間房產出售 (45 秒，揭曉前可以改；沒選自動出最小的)',
  '• 「💰 我的狀態」：隨時私下看自己的金幣、房產和支票',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

// 地產大亨只有房間指令，遊戲中都用按鈕
export function parseForSaleCommand(text: string, user: string, channel: string): FAction | null {
  return parseRoomCommand(text, user, channel) as FAction | null;
}

function forsaleButton(kind: string, value: string, user: string, channel: string): FAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'forsale') return null;
  if (value === 'status') return { type: 'status', user };
  const [act, a = '', b = ''] = value.split(':');
  const seq = Number(a);
  switch (act) {
    case 'bid':
      return { type: 'bid', user, seq, amount: Number(b) };
    case 'sell':
      return { type: 'sell', user, seq, prop: Number(b) };
    case 'bidMenu':
    case 'pass':
    case 'sellMenu':
      return { type: act, user, seq };
    default:
      return null;
  }
}

export const forsale = {
  kind: 'forsale' as const,
  emoji: '🏠',
  name: '地產大亨',
  players: '3～6 人',
  category: 'bluff',
  desc: '先輪流喊價買房產，放棄的人拿最小的那間、只賠一半；再同時私下出房產換支票，支票加剩下金幣最多的人贏',
  help: HELP,
  apply: applyForSale,
  parse: parseForSaleCommand,
  button: forsaleButton,
} satisfies GameDef<FState, FAction>;
