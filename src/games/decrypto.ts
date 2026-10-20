// 截碼戰的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyDecrypto, type DAction, type DState } from '../decrypto.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*截碼戰指令*',
  '• `/game decrypto new`：開房 (任何人)',
  '• `/game decrypto start`：開始遊戲，需要 4～12 位真人 (房主)',
  '• 加密：輪到你時按「✍️ 寫提示」依序寫 3 個提示；也可以打 `/game decrypto clue 海 / 火 / 鐘` (用 / 分開)',
  '• `/game decrypto cancel`：取消遊戲 (房主)',
  '解碼、攔截、提示紀錄都用頻道按鈕',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const HELP_EN = [
  '*Decrypto commands*',
  '• `/game decrypto new`: open a room (anyone)',
  '• `/game decrypto start`: start the game, needs 4-12 human players (host)',
  '• Encrypting: on your turn press "✍️ Write clues" and write 3 clues in order; or type `/game decrypto clue sea / fire / bell` (separated by /)',
  '• `/game decrypto cancel`: cancel the game (host)',
  'Decoding, intercepting, and clue history all use the channel buttons',
  `📖 Full guide: <${WIKI}|wiki>`,
].join('\n');

// 截碼戰的子指令：clue <提示1> / <提示2> / <提示3> (提示可以有空白)
export function parseDecryptoCommand(text: string, user: string, channel: string): DAction | null {
  const [sub, ...rest] = text.trim().split(/\s+/);
  if (sub === 'clue') {
    const texts = rest.join(' ').split('/').map((x) => x.trim());
    return texts.length === 3 && texts.every(Boolean) ? { type: 'clue', user, texts } : null;
  }
  return parseRoomCommand(text, user, channel) as DAction | null;
}

function decryptoButton(kind: string, value: string, user: string, channel: string): DAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'decrypto') return null;
  if (value === 'clue') return { type: 'openClue', user };
  if (value === 'history') return { type: 'history', user };
  if (value === 'decode' || value === 'intercept') return { type: 'voteMenu', user, mode: value };
  const [act, mode, round, code] = value.split(':');
  if (act === 'vote' && (mode === 'decode' || mode === 'intercept')) return { type: 'vote', user, mode, round: Number(round), code };
  return null;
}

export const decrypto = {
  kind: 'decrypto' as const,
  emoji: '🔐',
  name: '截碼戰',
  players: '4～12 人',
  category: 'team',
  desc: '兩隊對抗，用提示傳 3 碼密碼給隊友，也試著攔截對方',
  noBots: true,
  locales: { en: { name: 'Decrypto', players: '4-12 players', desc: 'Team vs. team: pass a 3-digit code to your team with clues, and try to intercept theirs', help: HELP_EN } },
  help: HELP,
  apply: applyDecrypto,
  parse: parseDecryptoCommand,
  button: decryptoButton,
  modals: {
    decryptoClue: { action: (user: string, texts: string[]): DAction => ({ type: 'clue', user, texts }), fallback: '視窗打不開，請改用 `/game decrypto clue <提示1> / <提示2> / <提示3>` 送出提示。', fallbackLocales: { en: 'The window didn\'t open. Please use `/game decrypto clue <clue 1> / <clue 2> / <clue 3>` to send your clues.' } },
  },
} satisfies GameDef<DState, DAction>;
