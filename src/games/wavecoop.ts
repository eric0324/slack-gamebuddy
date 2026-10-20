// 心電感應 (合作) 的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyWavecoop, type WCAction, type WCState } from '../wavecoop.js';
import { WIKI, type GameDef } from './types.js';
import { parseWavelengthCommand } from './wavelength.js';

const HELP = [
  '*心電感應 (合作) 指令*',
  '• `/game wavecoop new`：開房 (任何人)',
  '• `/game wavecoop start`：開始遊戲，需要 2～12 位真人 (房主)',
  '• 出題：輪到你時按「✍️ 寫提示」輸入提示詞；也可以打 `/game wavecoop clue <提示>`',
  '• `/game wavecoop cancel`：取消遊戲 (房主)',
  '猜位置用頻道按鈕；共 7 題，正中目標加一題',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const HELP_EN = [
  '*Wavelength co-op commands*',
  '• `/game wavecoop new`: open a room (anyone)',
  '• `/game wavecoop start`: start the game, needs 2-12 human players (host)',
  '• Giving a clue: on your turn press "✍️ Write a clue"; or type `/game wavecoop clue <clue>`',
  '• `/game wavecoop cancel`: cancel the game (host)',
  'Guess the spot with the channel buttons; 7 clues in total, a bullseye adds one more',
  `📖 Full guide: <${WIKI}|wiki>`,
].join('\n');

// 心電感應 (合作) 的子指令和按鈕：和兩隊對抗版相同，只是沒有猜左右
export function parseWavecoopCommand(text: string, user: string, channel: string): WCAction | null {
  return parseWavelengthCommand(text, user, channel) as WCAction | null;
}

function wavecoopButton(kind: string, value: string, user: string, channel: string): WCAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'wavecoop') return null;
  if (value === 'clue') return { type: 'openClue', user };
  const [act, arg] = value.split(':');
  return act === 'guess' ? { type: 'guess', user, value: Number(arg) } : null;
}

export const wavecoop = {
  kind: 'wavecoop' as const,
  emoji: '🧠',
  name: '心電感應 (合作)',
  players: '2～12 人',
  category: 'coop',
  desc: '全員合作，輪流出題、大家一起猜光譜上的位置拚總分',
  noBots: true,
  locales: { en: { name: 'Wavelength co-op', players: '2-12 players', desc: 'Everyone on one team: take turns giving clues and guess spots on the spectrum together for a high score', help: HELP_EN } },
  help: HELP,
  apply: applyWavecoop,
  parse: parseWavecoopCommand,
  button: wavecoopButton,
  modals: {
    wavecoopClue: { action: (user: string, texts: string[]): WCAction => ({ type: 'clue', user, text: texts[0] ?? '' }), fallback: '視窗打不開，請改用 `/game wavecoop clue <提示>` 送出提示。', fallbackLocales: { en: 'The window didn\'t open. Please use `/game wavecoop clue <clue>` to send your clue.' } },
  },
} satisfies GameDef<WCState, WCAction>;
