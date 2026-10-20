// 矮人礦坑的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applySaboteur, type SAction, type SState } from '../saboteur.js';
import { TOOLS, type Tool } from '../saboteurCards.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*矮人礦坑指令*',
  '• `/game saboteur new`：開房 (任何人)',
  '• `/game saboteur addbot [數量]`：加入 bot 補人數 (房主，開始前)',
  '• `/game saboteur removebot [數量]`：移除 bot (房主，開始前)',
  '• `/game saboteur start`：開始遊戲，需要 3～10 人 (房主)',
  '• `/game saboteur cancel`：取消遊戲 (房主)',
  '• 「⛏️ 行動」：輪到你時按，選一張牌放通道、打行動牌或蓋掉 (60 秒，沒出牌自動蓋掉第一張)',
  '• 「🎒 我的手牌」：隨時私下看自己的身分、手牌、壞掉的工具和偷看結果',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

// 矮人礦坑只有房間指令，遊戲中都用按鈕
export function parseSaboteurCommand(text: string, user: string, channel: string): SAction | null {
  return parseRoomCommand(text, user, channel) as SAction | null;
}

function saboteurButton(kind: string, value: string, user: string, channel: string): SAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'saboteur') return null;
  if (value === 'hand') return { type: 'hand', user };
  const [act, a = '', b = '', c = ''] = value.split(':');
  const seq = Number(a);
  const i = Number(b);
  switch (act) {
    case 'turnMenu':
    case 'discardMenu':
      return { type: act, user, seq };
    case 'card':
    case 'discard':
      return { type: act, user, seq, i };
    case 'place':
      return { type: 'place', user, seq, i, cell: c, rot: value.split(':')[4] === '1' ? 1 : 0 };
    case 'map':
    case 'rock':
      return { type: act, user, seq, i, cell: c };
    case 'tool': {
      const target = value.split(':').slice(4).join(':'); // 玩家 id 可能含有冒號 (bot)
      return TOOLS.includes(c as Tool) && target ? { type: 'tool', user, seq, i, tool: c as Tool, target } : null;
    }
    case 'gold':
      return { type: 'pickGold', user, seq, value: Number(b) };
    default:
      return null;
  }
}

export const saboteur = {
  kind: 'saboteur' as const,
  emoji: '⛏️',
  name: '矮人礦坑',
  players: '3～10 人',
  category: 'deduction',
  desc: '輪流出通道牌往金礦挖，藏在隊友裡的破壞者暗中鋪死路、弄壞工具，3 回合後金塊最多的人贏',
  help: HELP,
  apply: applySaboteur,
  parse: parseSaboteurCommand,
  button: saboteurButton,
} satisfies GameDef<SState, SAction>;
