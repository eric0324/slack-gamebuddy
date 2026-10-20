// 星際探險隊的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyCrew, type CAction, type Card, type CState } from '../crew.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*星際探險隊指令*',
  '• `/game crew new`：開房 (任何人)，預設打這個頻道已解鎖的最高關',
  '• `/game crew start`：開始遊戲，需要 3～5 人 (房主)，不支援 bot',
  '• `/game crew level`：查看這個頻道已解鎖的關卡 (任何人)',
  '• `/game crew level <n>`：改打第 n 關，只能選已解鎖的 (房主，開始前)',
  '• `/game crew reset`：重設這個頻道的進度，要再按一次確認 (房主，開始前)',
  '• `/game crew cancel`：取消遊戲 (房主)',
  '• 出牌：按牌桌訊息的「🃏 手牌」，輪到你時選一張合法的牌；每墩開始前 10 秒是通訊時間，不能出牌',
  '• 通訊：每人每關一次，在這墩第一張牌打出前按「📡 通訊」公開一張某色最大、最小或唯一的牌 (火箭不行)',
  '🤫 請不要在頻道討論手牌，只靠出牌和通訊溝通',
  `📖 完整說明：<${WIKI}/${encodeURI('星際探險隊-指令')}|指令>、<${WIKI}/${encodeURI('星際探險隊-遊戲規則')}|遊戲規則>`,
].join('\n');

// 星際探險隊的子指令：level [n]、reset，其他是房間指令
export function parseCrewCommand(text: string, user: string, channel: string): CAction | null {
  const [sub, arg, ...extra] = text.trim().split(/\s+/);
  if (sub === 'level') {
    if (arg === undefined) return { type: 'level', user };
    return /^\d+$/.test(arg) && !extra.length ? { type: 'level', user, n: Number(arg) } : null;
  }
  if (sub === 'reset') return { type: 'reset', user };
  return parseRoomCommand(text, user, channel) as CAction | null;
}

function crewButton(kind: string, value: string, user: string, channel: string): CAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'crew') return null;
  if (value === 'hand' || value === 'comm' || value === 'transfer' || value === 'resetConfirm') return { type: value, user };
  const [act, seqText, ...rest] = value.split(':');
  const seq = Number(seqText);
  const arg = rest.join(':');
  switch (act) {
    case 'play':
    case 'commCard':
      return { type: act, user, seq, card: arg as Card };
    case 'pick':
      return { type: 'pick', user, seq, task: Number(arg) };
    case 'assign':
    case 'solo':
    case 'sick':
      return { type: act, user, seq, target: arg };
    case 'answer':
      return { type: 'answer', user, seq, yes: arg === 'yes' };
    case 'transferTo':
      return { type: 'transferTo', user, seq, task: Number(rest[0]), target: rest.slice(1).join(':') };
    default:
      return null;
  }
}

export const crew = {
  kind: 'crew' as const,
  emoji: '🚀',
  name: '星際探險隊',
  players: '3～5 人',
  category: 'coop',
  desc: '合作吃墩：不能討論手牌，靠出牌和一次通訊讓指定的人吃下任務牌，一關一關往第九行星前進',
  noBots: true,
  help: HELP,
  apply: (state: CState | undefined, action: CAction, rng: () => number) => applyCrew(state, action, rng, Date.now()), // 帶入現在的時間，顯示通訊時間還剩幾秒
  parse: parseCrewCommand,
  button: crewButton,
} satisfies GameDef<CState, CAction>;
