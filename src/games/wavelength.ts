// 心電感應的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyWavelength, type WAction, type WState } from '../wavelength.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*心電感應指令*',
  '• `/game wavelength new`：開房 (任何人)',
  '• `/game wavelength start`：開始遊戲，需要 4～12 位真人 (房主)',
  '• 出題：輪到你時按「✍️ 寫提示」輸入提示詞；也可以打 `/game wavelength clue <提示>`',
  '• `/game wavelength cancel`：取消遊戲 (房主)',
  '猜位置、猜左右都用頻道按鈕',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const HELP_EN = [
  '*Wavelength commands*',
  '• `/game wavelength new`: open a room (anyone)',
  '• `/game wavelength start`: start the game, needs 4-12 human players (host)',
  '• Giving a clue: on your turn press "✍️ Write a clue"; or type `/game wavelength clue <clue>`',
  '• `/game wavelength cancel`: cancel the game (host)',
  'Guessing the spot and left/right both use the channel buttons',
  `📖 Full guide: <${WIKI}|wiki>`,
].join('\n');

// 心電感應的子指令：clue <提示> (提示可以有空白)
export function parseWavelengthCommand(text: string, user: string, channel: string): WAction | null {
  const [sub, ...rest] = text.trim().split(/\s+/);
  if (sub === 'clue') return rest.length ? { type: 'clue', user, text: rest.join(' ') } : null;
  return parseRoomCommand(text, user, channel) as WAction | null;
}

function wavelengthButton(kind: string, value: string, user: string, channel: string): WAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'wavelength') return null;
  if (value === 'clue') return { type: 'openClue', user };
  const [act, arg] = value.split(':');
  if (act === 'guess') return { type: 'guess', user, value: Number(arg) };
  if (act === 'side' && (arg === 'left' || arg === 'right')) return { type: 'side', user, value: arg };
  return null;
}

export const wavelength = {
  kind: 'wavelength' as const,
  emoji: '📡',
  name: '心電感應',
  players: '4～12 人',
  category: 'team',
  desc: '兩隊對抗，出題者用一個詞讓隊友猜光譜上的位置',
  noBots: true,
  locales: { en: { name: 'Wavelength', players: '4-12 players', desc: 'Two teams compete: the psychic gives one clue so teammates can find a spot on the spectrum', help: HELP_EN } },
  help: HELP,
  apply: applyWavelength,
  parse: parseWavelengthCommand,
  button: wavelengthButton,
  modals: {
    wavelengthClue: { action: (user: string, texts: string[]): WAction => ({ type: 'clue', user, text: texts[0] ?? '' }), fallback: '視窗打不開，請改用 `/game wavelength clue <提示>` 送出提示。' },
  },
} satisfies GameDef<WState, WAction>;
