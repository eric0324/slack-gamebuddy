// 骰子街的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyMachikoro, type MAction, type MState } from '../machikoro.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*骰子街指令*',
  '• `/game machikoro new`：開房 (任何人)',
  '• `/game machikoro addbot [數量]`：加入 bot 補人數 (房主，開始前)',
  '• `/game machikoro removebot [數量]`：移除 bot (房主，開始前)',
  '• `/game machikoro start`：開始遊戲，需要 2～5 人 (房主)',
  '• `/game machikoro cancel`：取消遊戲 (房主)',
  '• 「🏘️ 行動」：輪到你時按，擲骰、重擲、港口 +2、電視台、商業中心、買建築都在這裡 (每回合 60 秒，逾時由系統代為完成、不買建築)',
  '• 「📋 城鎮一覽」：隨時私下看每個人的現金、建築和地標',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

// 骰子街只有房間指令，遊戲中都用按鈕
export function parseMachikoroCommand(text: string, user: string, channel: string): MAction | null {
  return parseRoomCommand(text, user, channel) as MAction | null;
}

const diceCount = (x: string) => (x === '1' || x === '2' ? (Number(x) as 1 | 2) : null);

function machikoroButton(kind: string, value: string, user: string, channel: string): MAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'machikoro') return null;
  if (value === 'town') return { type: 'town', user };
  const parts = value.split(':');
  const [act, a = '', b = '', c = ''] = parts;
  const seq = Number(a);
  // 玩家 id 放在最後，可能含有冒號 (bot)
  const tail = (from: number) => parts.slice(from).join(':');
  switch (act) {
    case 'turnMenu':
    case 'keep':
    case 'bizSkip':
    case 'pass':
      return { type: act, user, seq };
    case 'roll':
    case 'reroll': {
      const n = diceCount(b);
      return n ? { type: act, user, seq, n } : null;
    }
    case 'harbor':
      return b === 'yes' || b === 'no' ? { type: 'harbor', user, seq, yes: b === 'yes' } : null;
    case 'tv':
      return b ? { type: 'tv', user, seq, target: tail(2) } : null;
    case 'bizGive':
      return b ? { type: 'bizGive', user, seq, card: b } : null;
    case 'bizPlayer':
      return b && c ? { type: 'bizPlayer', user, seq, give: b, target: tail(3) } : null;
    case 'bizTake':
      return b && c && parts[4] ? { type: 'bizTake', user, seq, give: b, take: c, target: tail(4) } : null;
    case 'buy':
      return b ? { type: 'buy', user, seq, code: b } : null;
    default:
      return null;
  }
}

export const machikoro = {
  kind: 'machikoro' as const,
  emoji: '🏘️',
  name: '骰子街',
  players: '2～5 人',
  category: 'bluff',
  desc: '輪流擲骰，大家的建築依點數收錢，再買建築擴張城鎮，先蓋好 6 個地標的人贏',
  help: HELP,
  apply: applyMachikoro,
  parse: parseMachikoroCommand,
  button: machikoroButton,
} satisfies GameDef<MState, MAction>;
