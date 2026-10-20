// 機密代號的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyCodenames, type CAction, type CState } from '../codenames.js';
import { WIKI, type GameDef } from './types.js';
import { parseUndercoverCommand } from './undercover.js';

const HELP = [
  '*機密代號指令*',
  '• `/game codenames new`：開房 (任何人)',
  '• `/game codenames start`：開始遊戲，需要 4～12 位真人 (房主)',
  '• `/game codenames clue <詞> <數字>`：隊長給提示，數字 1～9',
  '• `/game codenames next`：直接結束目前隊伍的回合 (房主)',
  '• `/game codenames cancel`：取消遊戲 (房主)',
  '翻牌、結束猜牌都用按鈕',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const HELP_EN = [
  '*Codenames commands*',
  '• `/game codenames new`: open a room (anyone)',
  '• `/game codenames start`: start the game, needs 4-12 human players (host)',
  '• `/game codenames clue <word> <number>`: spymaster gives a clue, number 1-9',
  "• `/game codenames next`: end the current team's turn (host)",
  '• `/game codenames cancel`: cancel the game (host)',
  'Reveal cards and end guessing with the buttons',
  `📖 Full guide: <${WIKI}|wiki>`,
].join('\n');

// 機密代號的子指令：clue <詞> <數字>，next 是跳過目前隊伍的回合
export function parseCodenamesCommand(text: string, user: string, channel: string): CAction | null {
  const [sub, ...rest] = text.trim().split(/\s+/);
  if (sub === 'clue') {
    if (rest.length < 2) return null;
    return { type: 'clue', user, word: rest.slice(0, -1).join(' '), count: Number(rest.at(-1)) };
  }
  if (sub === 'next') return { type: 'skipTurn', user };
  const action = parseUndercoverCommand(text, user, channel);
  if (!action || action.type === 'guess' || action.type === 'endDiscussion' || action.type === 'skipSpeaker') return null;
  return action as CAction;
}

function codenamesButton(kind: string, value: string, user: string, channel: string): CAction | null {
  switch (kind) {
    case 'join':
    case 'leave':
    case 'start':
    case 'endGuess':
      return { type: kind, user };
    case 'guess':
      return { type: 'guess', user, index: Number(value) };
    case 'rematch':
      return { type: 'rematch', user, channel };
    default:
      return null;
  }
}

export const codenames = {
  kind: 'codenames' as const,
  emoji: '🟥',
  name: '機密代號',
  players: '4～12 人',
  category: 'team',
  desc: '紅藍兩隊比賽，隊長用一個詞當提示翻字卡',
  noBots: true,
  locales: { en: { name: 'Codenames', players: '4-12 players', desc: 'Red vs. blue: spymasters give one-word clues to find their agents', help: HELP_EN } },
  help: HELP,
  apply: applyCodenames,
  parse: parseCodenamesCommand,
  button: codenamesButton,
} satisfies GameDef<CState, CAction>;
