// 間諜危機的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applySpyfall, type SAction, type SState } from '../spyfall.js';
import { WIKI, type GameDef } from './types.js';
import { parseUndercoverCommand } from './undercover.js';

const HELP = [
  '*間諜危機指令*',
  '• `/game spyfall new`：開房 (任何人)',
  '• `/game spyfall addbot [數量]`：加入 bot 補人數 (房主，開始前)',
  '• `/game spyfall removebot [數量]`：移除 bot (房主，開始前)',
  '• `/game spyfall start`：開始遊戲，需要 4～10 人 (房主)',
  '• `/game spyfall next`：跳過目前卡住的提問或回答 (房主)',
  '• `/game spyfall vote`：結束提問，直接投票 (房主)',
  '• `/game spyfall cancel`：取消遊戲 (房主)',
  '• `/game spyfall guess <地點>`：間諜猜地點 (提問期間一次，或被指控後 60 秒內)',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const HELP_EN = [
  '*Spyfall commands*',
  '• `/game spyfall new`: open a room (anyone)',
  '• `/game spyfall addbot [count]`: add bots to fill seats (host, before starting)',
  '• `/game spyfall removebot [count]`: remove bots (host, before starting)',
  '• `/game spyfall start`: start the game, needs 4-10 players (host)',
  '• `/game spyfall next`: skip a stuck question or answer (host)',
  '• `/game spyfall vote`: end questioning and vote now (host)',
  '• `/game spyfall cancel`: cancel the game (host)',
  '• `/game spyfall guess <location>`: the spy guesses the location (once during questioning, or within 60 sec after being accused)',
  `📖 Full guide: <${WIKI}|wiki>`,
].join('\n');

// 間諜危機的子指令和誰是臥底一樣，只有 guess 猜的是地點
export function parseSpyfallCommand(text: string, user: string, channel: string): SAction | null {
  const action = parseUndercoverCommand(text, user, channel);
  if (action?.type === 'guess') return { type: 'guess', user, location: action.word };
  return action as SAction | null;
}

function spyfallButton(kind: string, value: string, user: string, channel: string): SAction | null {
  switch (kind) {
    case 'join':
    case 'leave':
    case 'start':
    case 'endSpeech':
    case 'endAnswer':
      return { type: kind, user };
    case 'askTarget':
      return { type: 'askTarget', user, target: value };
    case 'dayVote':
    case 'pkVote':
      return { type: 'dayVote', user, target: value };
    case 'rematch':
      return { type: 'rematch', user, channel };
    default:
      return null;
  }
}

export const spyfall = {
  kind: 'spyfall' as const,
  emoji: '📍',
  name: '間諜危機',
  players: '4～10 人',
  category: 'deduction',
  desc: '只有間諜不知道地點，接力提問、投票抓間諜',
  locales: { en: { name: 'Spyfall', players: '4-10 players', desc: "Everyone but the spy knows the location; ask questions and vote to catch the spy", help: HELP_EN } },
  help: HELP,
  apply: applySpyfall,
  parse: parseSpyfallCommand,
  button: spyfallButton,
} satisfies GameDef<SState, SAction>;
