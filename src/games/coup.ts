// 政變的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyCoup, type KAction, type KState } from '../coup.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*政變指令*',
  '• `/game coup new`：開房 (任何人)',
  '• `/game coup addbot [數量]`：加入 bot 補人數 (房主，開始前)',
  '• `/game coup removebot [數量]`：移除 bot (房主，開始前)',
  '• `/game coup start`：開始遊戲，需要 3～6 人 (房主)',
  '• `/game coup cancel`：取消遊戲 (房主)',
  '行動、選目標、質疑、阻擋都用頻道按鈕；翻牌和大使交換用私訊按鈕',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const HELP_EN = [
  '*Coup commands*',
  '• `/game coup new`: open a room (anyone)',
  '• `/game coup addbot [count]`: add bots to fill seats (host, before start)',
  '• `/game coup removebot [count]`: remove bots (host, before start)',
  '• `/game coup start`: start the game, needs 3-6 players (host)',
  '• `/game coup cancel`: cancel the game (host)',
  'Actions, targets, challenges and blocks use channel buttons; revealing cards and the Ambassador exchange use private buttons',
  `📖 Full guide: <${WIKI}|wiki>`,
].join('\n');

// 政變只有房間指令，遊戲中都用按鈕
export function parseCoupCommand(text: string, user: string, channel: string): KAction | null {
  return parseRoomCommand(text, user, channel) as KAction | null;
}

function coupButton(kind: string, value: string, user: string, channel: string): KAction | null {
  switch (kind) {
    case 'join':
    case 'leave':
    case 'start':
    case 'challenge':
      return { type: kind, user };
    case 'coupAction':
      return { type: 'act', user, kind: value as Extract<KAction, { type: 'act' }>['kind'] };
    case 'coupTarget':
      return { type: 'target', user, target: value };
    case 'block':
      return { type: 'block', user, role: value as Extract<KAction, { type: 'block' }>['role'] };
    case 'loseCard':
      return { type: 'reveal', user, index: Number(value) };
    case 'keepCard':
      return { type: 'keep', user, index: Number(value) };
    case 'rematch':
      return { type: 'rematch', user, channel };
    default:
      return null;
  }
}

export const coup = {
  kind: 'coup' as const,
  emoji: '👑',
  name: '政變',
  players: '3～6 人',
  category: 'bluff',
  desc: '虛張聲勢，宣稱任何角色的能力，質疑或阻擋',
  help: HELP,
  locales: {
    en: { name: 'Coup', players: '3-6 players', desc: 'Bluff your way to power: claim any role, challenge or block', help: HELP_EN },
  },
  apply: applyCoup,
  parse: parseCoupCommand,
  button: coupButton,
} satisfies GameDef<KState, KAction>;
