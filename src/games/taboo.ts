// 禁語的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應、頻道訊息
import { applyTaboo, type TAction, type TState } from '../taboo.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*禁語指令*',
  '• `/game taboo new`：開房 (任何人)',
  '• `/game taboo start`：開始遊戲，需要 4～12 位真人 (房主)',
  '• 輪到你描述時按「▶️ 開始」，只有你看得到題目詞和禁語；直接在頻道打字描述，隊友在頻道打字猜',
  '• `/game taboo skip`：跳過目前的卡，對手隊 +1 (描述者；也可以按「⏭️ 跳過」)',
  '• `/game taboo card`：再看一次目前的卡 (描述者)',
  '• `/game taboo cancel`：取消遊戲 (房主)',
  '說到題目詞或禁語算犯規，對手隊 +1；用 x、○、* 之類的字代替文字 (例如「老x」) 也算犯規',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const HELP_EN = [
  '*Taboo commands*',
  '• `/game taboo new`: open a room (anyone)',
  '• `/game taboo start`: start the game, needs 4-12 human players (host)',
  '• When it\'s your turn to describe, press "▶️ Start". Only you see the word and its taboo words; describe it by typing in the channel, and teammates type their guesses in the channel',
  '• `/game taboo skip`: skip the current card, the other team gets +1 (describer; or press "⏭️ Skip")',
  '• `/game taboo card`: see the current card again (describer)',
  '• `/game taboo cancel`: cancel the game (host)',
  'Saying the word or a taboo word is a foul and gives the other team +1; using symbols like ○ or * to stand in for letters (e.g. "w*ter") is also a foul',
  `📖 Full guide: <${WIKI}|wiki>`,
].join('\n');

// 禁語的子指令：skip (跳過目前的卡)、card (再看一次)
export function parseTabooCommand(text: string, user: string, channel: string): TAction | null {
  const sub = text.trim().split(/\s+/)[0];
  if (sub === 'skip' || sub === 'card') return { type: sub, user };
  return parseRoomCommand(text, user, channel) as TAction | null;
}

function tabooButton(kind: string, value: string, user: string, channel: string): TAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'taboo') return null;
  if (value === 'go') return { type: 'go', user };
  const [act, seq] = value.split(':');
  if (act === 'skip' && seq) return { type: 'skip', user, seq: Number(seq) };
  return null;
}

export const taboo = {
  kind: 'taboo' as const,
  emoji: '🤐',
  name: '禁語',
  players: '4～12 人',
  category: 'team',
  desc: '兩隊對抗，在頻道打字描述題目詞讓隊友猜，但不能說出禁語',
  noBots: true,
  locales: { en: { name: 'Taboo', players: '4-12 players', desc: 'Team vs. team: describe the word in chat for your team without saying the taboo words', help: HELP_EN } },
  help: HELP,
  apply: applyTaboo,
  parse: parseTabooCommand,
  button: tabooButton,
  chat: (user: string, text: string): TAction => ({ type: 'chat', user, text }),
} satisfies GameDef<TState, TAction>;
