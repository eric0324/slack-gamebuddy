// 阿瓦隆的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyAvalon, type AAction, type AState } from '../avalon.js';
import { WIKI, type GameDef } from './types.js';
import { parseUndercoverCommand } from './undercover.js';

const HELP = [
  '*阿瓦隆指令*',
  '• `/game avalon new`：開房（任何人）',
  '• `/game avalon addbot [數量]`：加入 bot 補人數（房主，開始前）',
  '• `/game avalon removebot [數量]`：移除 bot（房主，開始前）',
  '• `/game avalon start`：開始遊戲，需要 5～10 人（房主）',
  '• `/game avalon next`：跳過目前的發言者（房主）',
  '• `/game avalon cancel`：取消遊戲（房主）',
  '選隊員、投票、出任務、刺殺都用按鈕',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

// 阿瓦隆的子指令：沒有 vote（組隊投票用按鈕）和 guess
export function parseAvalonCommand(text: string, user: string, channel: string): AAction | null {
  const action = parseUndercoverCommand(text, user, channel);
  if (!action || action.type === 'guess' || action.type === 'endDiscussion') return null;
  return action as AAction;
}

function avalonButton(kind: string, value: string, user: string, channel: string): AAction | null {
  switch (kind) {
    case 'join':
    case 'leave':
    case 'start':
    case 'endSpeech':
    case 'confirmTeam':
      return { type: kind, user };
    case 'pickMember':
    case 'assassinate':
      return { type: kind, user, target: value };
    case 'teamVote':
      return value === 'approve' || value === 'reject' ? { type: 'teamVote', user, vote: value } : null;
    case 'quest':
      return value === 'success' || value === 'fail' ? { type: 'quest', user, card: value } : null;
    case 'rematch':
      return { type: 'rematch', user, channel };
    default:
      return null;
  }
}

export const avalon = {
  kind: 'avalon' as const,
  emoji: '🏰',
  name: '阿瓦隆',
  players: '5～10 人',
  category: 'deduction',
  desc: '好人對壞人，隊長組隊出任務，沒有人會出局',
  help: HELP,
  apply: applyAvalon,
  parse: parseAvalonCommand,
  button: avalonButton,
} satisfies GameDef<AState, AAction>;
