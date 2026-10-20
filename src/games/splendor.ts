// 璀璨寶石的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applySplendor, SUBS, type SAction, type SState, type Sub } from '../splendor.js';
import { COLORS, type Color } from '../splendorCards.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*璀璨寶石指令*',
  '• `/game splendor new`：開房 (任何人)',
  '• `/game splendor addbot [數量]`：加入 bot 補人數 (房主，開始前)',
  '• `/game splendor removebot [數量]`：移除 bot (房主，開始前)',
  '• `/game splendor start`：開始遊戲，需要 2～4 人 (房主)',
  '• `/game splendor cancel`：取消遊戲 (房主)',
  '• 「💍 行動」：輪到你時按，拿寶石、保留卡或買卡；籌碼超過 10 個時改成退回籌碼 (90 秒，沒動作就跳過)',
  '• 「📜 我的狀態」：隨時私下看自己的籌碼、折扣、已買的卡和保留的卡',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const HELP_EN = [
  '*Splendor commands*',
  '• `/game splendor new`: open a room (anyone)',
  '• `/game splendor addbot [count]`: add bots to fill seats (host, before start)',
  '• `/game splendor removebot [count]`: remove bots (host, before start)',
  '• `/game splendor start`: start the game, needs 2-4 players (host)',
  '• `/game splendor cancel`: cancel the game (host)',
  '• "💍 Action": press on your turn to take gems, reserve a card or buy a card; with more than 10 tokens you return tokens instead (90 seconds, skipped if you do nothing)',
  '• "📜 My status": privately check your tokens, bonuses, purchased cards and reserved cards anytime',
  `📖 Full guide: <${WIKI}|wiki>`,
].join('\n');

// 璀璨寶石只有房間指令，遊戲中都用按鈕
export function parseSplendorCommand(text: string, user: string, channel: string): SAction | null {
  return parseRoomCommand(text, user, channel) as SAction | null;
}

// 顏色代號：每個字一種顏色、不重複；不合法回傳 null
function colorsOf(x: string): Color[] | null {
  const list = [...x] as Color[];
  return list.every((c) => COLORS.includes(c)) && new Set(list).size === list.length && list.length <= 3 ? list : null;
}

function splendorButton(kind: string, value: string, user: string, channel: string): SAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'splendor') return null;
  if (value === 'status') return { type: 'status', user };
  const [act, a = '', b = ''] = value.split(':');
  if (!/^\d+$/.test(a)) return null;
  const seq = Number(a);
  switch (act) {
    case 'turnMenu':
      if (!b) return { type: 'turnMenu', user, seq };
      return SUBS.includes(b as Sub) ? { type: 'turnMenu', user, seq, sub: b as Sub } : null;
    case 'pick3':
    case 'take3': {
      const colors = colorsOf(b);
      return colors ? { type: act, user, seq, colors } : null;
    }
    case 'take2':
      return COLORS.includes(b as Color) ? { type: 'take2', user, seq, color: b as Color } : null;
    case 'reserve':
      return /^([123]-[1-4]|deck[123])$/.test(b) ? { type: 'reserve', user, seq, slot: b } : null;
    case 'buy':
      return /^([123]-[1-4]|r[123])$/.test(b) ? { type: 'buy', user, seq, slot: b } : null;
    case 'retPick':
    case 'return':
      return /^\d{6}$/.test(b) ? { type: act, user, seq, counts: [...b].map(Number) } : null;
    default:
      return null;
  }
}

export const splendor = {
  kind: 'splendor' as const,
  emoji: '💍',
  name: '璀璨寶石',
  players: '2～4 人',
  category: 'strategy',
  desc: '拿寶石、買發展卡累積折扣，吸引貴族來訪，搶先拿到 15 分',
  help: HELP,
  locales: {
    en: { name: 'Splendor', players: '2-4 players', desc: 'Collect gems, buy development cards for bonuses, attract nobles and race to 15 points', help: HELP_EN },
  },
  apply: applySplendor,
  parse: parseSplendorCommand,
  button: splendorButton,
} satisfies GameDef<SState, SAction>;
