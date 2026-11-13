// 同詞相遇的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應、視窗
import { applySameword, type SamewordAction, type SamewordState } from '../sameword.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*同詞相遇指令*',
  '• `/game sameword new`：開房 (任何人)',
  '• `/game sameword start`：開始遊戲，需要 3～10 位真人 (房主)',
  '• `/game sameword word <詞>`：寫詞 (1～20 字，揭曉前可以改)，和按「✍️ 寫詞」一樣',
  '• `/game sameword same`：判定這輪意思一樣，算相遇 (房主)',
  '• `/game sameword next`：這輪不算，進入下一輪 (房主)',
  '• `/game sameword cancel`：取消遊戲 (房主)',
  '每輪各自寫一個詞一起揭曉，沿著上一輪的詞繼續聯想，出現過的詞不能再寫。所有人寫出同一個詞就相遇成功，最多 10 輪，越早相遇分數越高',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const HELP_EN = [
  '*Same Word commands*',
  '• `/game sameword new`: open a room (anyone)',
  '• `/game sameword start`: start the game, needs 3-10 human players (host)',
  '• `/game sameword word <word>`: write your word (1-20 characters, you can change it until the reveal), same as pressing "✍️ Write"',
  '• `/game sameword same`: count this round as the same word (host)',
  '• `/game sameword next`: this round doesn\'t count, go to the next round (host)',
  '• `/game sameword cancel`: cancel the game (host)',
  'Each round everyone writes a word and reveals together, then keeps associating from last round\'s words; words that already came up can\'t be reused. When everyone writes the same word, your minds meet. At most 10 rounds; the sooner you meet, the higher the score',
  `📖 Full guide: <${WIKI}|wiki>`,
].join('\n');

// 同詞相遇的子指令：word <詞> (可以有空白)、same、next
export function parseSamewordCommand(text: string, user: string, channel: string): SamewordAction | null {
  const t = text.trim();
  const w = t.match(/^word\s+([\s\S]+)$/);
  if (w) return { type: 'word', user, text: w[1].trim() };
  if (t === 'same' || t === 'next') return { type: t, user };
  return parseRoomCommand(text, user, channel) as SamewordAction | null;
}

function samewordButton(kind: string, value: string, user: string, channel: string): SamewordAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'sameword') return null;
  if (value === 'write') return { type: 'openWrite', user };
  const [act, seq] = value.split(':');
  if (act === 'same' || act === 'next') return { type: act, user, seq: Number(seq) };
  return null;
}

export const sameword = {
  kind: 'sameword' as const,
  emoji: '💞',
  name: '同詞相遇',
  players: '3～10 人',
  category: 'coop',
  desc: '大家各自寫一個詞，沿著上一輪的詞一起聯想，直到所有人寫出同一個詞',
  noBots: true,
  locales: { en: { name: 'Same Word', players: '3-10 players', desc: 'Everyone writes a word, then keeps associating from last round\'s words until all of you write the same one', help: HELP_EN } },
  help: HELP,
  apply: applySameword,
  parse: parseSamewordCommand,
  button: samewordButton,
  modals: {
    samewordWord: { action: (user: string, texts: string[]): SamewordAction => ({ type: 'word', user, text: texts[0] ?? '' }), fallback: '視窗打不開，請改用 `/game sameword word <詞>` 送出。', fallbackLocales: { en: 'The window didn\'t open. Please use `/game sameword word <word>` instead.' } },
  },
} satisfies GameDef<SamewordState, SamewordAction>;
