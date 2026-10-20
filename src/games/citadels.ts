// 富饒之城的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyCitadels, type CAction, type CState, type Sub } from '../citadels.js';
import { DISTRICTS, type Rank } from '../citadelsCards.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*富饒之城指令*',
  '• `/game citadels new`：開房 (任何人)',
  '• `/game citadels addbot [數量]`：加入 bot 補人數 (房主，開始前)',
  '• `/game citadels removebot [數量]`：移除 bot (房主，開始前)',
  '• `/game citadels start`：開始遊戲，需要 4～7 人 (房主)',
  '• `/game citadels cancel`：取消遊戲 (房主)',
  '• 「🎭 選角色」：輪到你選角時按，私下選這輪的角色 (45 秒)',
  '• 「🏰 行動」：叫到你的角色時按，收集資源、用能力、建造、結束回合 (90 秒)',
  '• 「📜 我的狀態」：隨時私下看自己的手牌、金幣、角色和城市',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const HELP_EN = [
  '*Citadels commands*',
  '• `/game citadels new`: open a room (anyone)',
  '• `/game citadels addbot [count]`: add bots to fill seats (host, before start)',
  '• `/game citadels removebot [count]`: remove bots (host, before start)',
  '• `/game citadels start`: start the game, needs 4-7 players (host)',
  '• `/game citadels cancel`: cancel the game (host)',
  '• "🎭 Pick character": press when it is your turn to pick, and secretly choose your character for the round (45 seconds)',
  '• "🏰 Action": press when your character is called to gather resources, use abilities, build and end your turn (90 seconds)',
  '• "📜 My status": privately check your hand, gold, character and city anytime',
  `📖 Full guide: <${WIKI}|wiki>`,
].join('\n');

// 富饒之城只有房間指令，遊戲中都用按鈕
export function parseCitadelsCommand(text: string, user: string, channel: string): CAction | null {
  return parseRoomCommand(text, user, channel) as CAction | null;
}

const SUBS: Sub[] = ['build', 'kill', 'rob', 'swap', 'redraw', 'destroy', 'lab'];
const rankOf = (x: string) => (/^[1-8]$/.test(x) ? (Number(x) as Rank) : null);
const isCard = (x: string) => Object.hasOwn(DISTRICTS, x);
const listOf = (x: string) => (x === '' ? [] : x.split(',').map(Number));

function citadelsButton(kind: string, value: string, user: string, channel: string): CAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'citadels') return null;
  if (value === 'status' || value === 'pickMenu') return { type: value, user };
  const [act, a = '', b = ''] = value.split(':');
  const rest = value.split(':').slice(2).join(':'); // 玩家 id 可能含有冒號 (bot)
  const seq = Number(a);
  const rank = rankOf(b);
  switch (act) {
    case 'pick':
      return rankOf(a) ? { type: 'pick', user, rank: rankOf(a)! } : null;
    case 'grave':
      return a === 'yes' || a === 'no' ? { type: 'grave', user, yes: a === 'yes' } : null;
    case 'turnMenu':
      if (!b) return { type: 'turnMenu', user, seq };
      return SUBS.includes(b as Sub) ? { type: 'turnMenu', user, seq, sub: b as Sub } : null;
    case 'gather':
      return b === 'gold' || b === 'draw' ? { type: 'gather', user, seq, kind: b } : null;
    case 'keep':
    case 'build':
    case 'lab':
      return isCard(b) ? { type: act, user, seq, card: b } : null;
    case 'tax':
    case 'smithy':
    case 'end':
      return { type: act, user, seq };
    case 'kill':
    case 'rob':
      return rank ? { type: act, user, seq, rank } : null;
    case 'swap':
      return rest ? { type: 'swap', user, seq, target: rest } : null;
    case 'redrawToggle':
    case 'redraw':
      return { type: act, user, seq, picked: listOf(rest) };
    case 'destroy': {
      const target = value.split(':').slice(3).join(':');
      return isCard(b) && target ? { type: 'destroy', user, seq, target, card: b } : null;
    }
    default:
      return null;
  }
}

export const citadels = {
  kind: 'citadels' as const,
  emoji: '🏛️',
  name: '富饒之城',
  players: '4～7 人',
  category: 'strategy',
  desc: '每輪祕密選角色，刺殺、偷竊、破壞，拚先蓋好 8 棟建築的城市',
  help: HELP,
  locales: {
    en: {
      name: 'Citadels',
      players: '4-7 players',
      desc: 'Secretly pick a character each round, then assassinate, steal and destroy in a race to build a city of 8 districts',
      help: HELP_EN,
    },
  },
  apply: applyCitadels,
  parse: parseCitadelsCommand,
  button: citadelsButton,
} satisfies GameDef<CState, CAction>;
