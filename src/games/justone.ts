// 一字千金的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyJustOne, type JAction, type JState } from '../justone.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*一字千金指令*',
  '• `/game justone new`：開房 (任何人)',
  '• `/game justone start`：開始遊戲，需要 3～7 位真人 (房主)',
  '• `/game justone clue <詞>`：給一個提示 (猜詞以外的人，其他人看不到你打的字)',
  '• `/game justone guess <詞>`：猜詞 (猜詞的人)，沒把握可以按「跳過」',
  '• `/game justone next`：跳過卡住的步驟 (房主)',
  '• `/game justone cancel`：取消遊戲 (房主)',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const HELP_EN = [
  '*Just One commands*',
  '• `/game justone new`: open a room (anyone)',
  '• `/game justone start`: start the game, needs 3-7 human players (host)',
  "• `/game justone clue <word>`: give one clue (everyone except the guesser; others can't see what you type)",
  '• `/game justone guess <word>`: guess the word (guesser); press "Skip" if unsure',
  '• `/game justone next`: skip a stuck step (host)',
  '• `/game justone cancel`: cancel the game (host)',
  `📖 Full guide: <${WIKI}|wiki>`,
].join('\n');

// 一字千金的子指令：clue <詞>、guess <詞>，next 是跳過卡住的步驟
export function parseJustOneCommand(text: string, user: string, channel: string): JAction | null {
  const [sub, ...rest] = text.trim().split(/\s+/);
  if (sub === 'clue' || sub === 'guess') return rest.length ? { type: sub, user, word: rest.join(' ') } : null;
  if (sub === 'next') return { type: 'skipStep', user };
  return parseRoomCommand(text, user, channel) as JAction | null;
}

function justOneButton(kind: string, _value: string, user: string, channel: string): JAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start' || kind === 'skipGuess') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  return null;
}

export const justOne = {
  kind: 'justone' as const,
  emoji: '💡',
  name: '一字千金',
  players: '3～7 人',
  category: 'coop',
  desc: '合作猜詞，大家各給一個提示，重複的會被刪掉',
  noBots: true,
  locales: { en: { name: 'Just One', players: '3-7 players', desc: 'Co-op word guessing: everyone gives one clue, duplicates get removed', help: HELP_EN } },
  help: HELP,
  apply: applyJustOne,
  parse: parseJustOneCommand,
  button: justOneButton,
} satisfies GameDef<JState, JAction>;
