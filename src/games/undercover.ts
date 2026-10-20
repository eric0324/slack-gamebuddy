// 誰是臥底的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyUndercover, type UAction, type UState } from '../undercover.js';
import { WIKI, type GameDef } from './types.js';

const HELP = [
  '*誰是臥底指令*',
  '• `/game undercover new`：開房 (任何人)',
  '• `/game undercover addbot [數量]`：加入 bot 補人數 (房主，開始前)',
  '• `/game undercover removebot [數量]`：移除 bot (房主，開始前)',
  '• `/game undercover start`：開始遊戲，需要 4～12 人 (房主)',
  '• `/game undercover next`：跳過目前的描述者 (房主)',
  '• `/game undercover vote`：結束描述，直接投票 (房主)',
  '• `/game undercover cancel`：取消遊戲 (房主)',
  '• `/game undercover guess <詞>`：被投出去的白板猜平民詞 (60 秒內)',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

export function parseUndercoverCommand(text: string, user: string, channel: string): UAction | null {
  const [sub, ...rest] = text.trim().split(/\s+/);
  switch (sub) {
    case 'new':
      return { type: 'new', user, channel };
    case 'start':
      return { type: 'start', user };
    case 'cancel':
      return { type: 'cancel', user };
    case 'next':
      return { type: 'skipSpeaker', user };
    case 'vote':
      return { type: 'endDiscussion', user };
    case 'guess':
      return rest.length ? { type: 'guess', user, word: rest.join(' ') } : null;
    case 'addbot':
    case 'removebot': {
      const count = rest[0] === undefined ? 1 : Number(rest[0]);
      if (rest.length > 1 || !Number.isInteger(count) || count < 1) return null;
      return { type: sub === 'addbot' ? 'addBot' : 'removeBot', user, count };
    }
    default:
      return null;
  }
}

// 只接受房間指令 (new、start、cancel、addbot、removebot)，給遊戲中不用打字指令的遊戲共用
export function parseRoomCommand(text: string, user: string, channel: string): UAction | null {
  const action = parseUndercoverCommand(text, user, channel);
  if (!action || !['new', 'start', 'cancel', 'addBot', 'removeBot'].includes(action.type)) return null;
  return action;
}

// 誰是臥底的按鈕和狼人殺共用 action_id 的種類
function undercoverButton(kind: string, value: string, user: string, channel: string): UAction | null {
  switch (kind) {
    case 'join':
    case 'leave':
    case 'start':
    case 'endSpeech':
      return { type: kind, user };
    case 'dayVote':
    case 'pkVote':
      return { type: 'dayVote', user, target: value };
    case 'rematch':
      return { type: 'rematch', user, channel };
    default:
      return null;
  }
}

export const undercover = {
  kind: 'undercover' as const,
  emoji: '🕵️',
  name: '誰是臥底',
  players: '4～12 人',
  category: 'deduction',
  desc: '每人一個詞，輪流描述、投票找出拿到不同詞的臥底',
  help: HELP,
  apply: applyUndercover,
  parse: parseUndercoverCommand,
  button: undercoverButton,
} satisfies GameDef<UState, UAction>;
