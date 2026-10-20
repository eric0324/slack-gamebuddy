// Emoji 傳話的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應、視窗
import { applyEmoji, type EAction, type EState } from '../emoji.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*Emoji 傳話指令*',
  '• `/game emoji new`：開房 (任何人)',
  '• `/game emoji start`：開始遊戲，需要 4～10 位真人 (房主)',
  '• `/game emoji send <內容>`：作答，和按「✍️ 作答」一樣；🎨 emoji 步只能用 emoji (可以貼 emoji 或打 `:shortcode:`，可以有空白，最多 20 個)，🧠 猜測步寫 1～30 字；截止前可以重送',
  '• `/game emoji cancel`：取消遊戲 (房主)',
  '• `/game emoji help`：看這份說明',
  '每人拿一個題目當鏈的起點，文字用 emoji 演、emoji 用文字猜，傳一圈後公布每條鏈；接著投「🎨 最佳 emoji」和「🧠 最神猜測」，每得 1 票 +1 分，總分最高的人獲勝',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const HELP_EN = [
  '*Emoji Telephone commands*',
  '• `/game emoji new`: open a room (anyone)',
  '• `/game emoji start`: start the game, needs 4-10 human players (host)',
  '• `/game emoji send <answer>`: submit an answer, same as pressing "✍️ Answer"; 🎨 emoji steps take emoji only (paste emoji or type `:shortcode:`, spaces are fine, up to 20), 🧠 guess steps take 1-30 characters; you can resubmit before time runs out',
  '• `/game emoji cancel`: cancel the game (host)',
  '• `/game emoji help`: show this help',
  'Everyone gets a prompt to start a chain: text is acted out in emoji, emoji is guessed in words, and after one lap every chain is revealed. Then vote for "🎨 Best emoji" and "🧠 Best guess"; each vote is +1 point and the highest score wins',
  `📖 Full guide: <${WIKI}|wiki>`,
].join('\n');

// Emoji 傳話的子指令：send <內容> (可以有空白)
export function parseEmojiCommand(text: string, user: string, channel: string): EAction | null {
  const m = text.trim().match(/^send\s+([\s\S]+)$/);
  if (m) return { type: 'send', user, text: m[1].trim() };
  return parseRoomCommand(text, user, channel) as EAction | null;
}

const isCat = (x: string): x is 'emoji' | 'guess' => x === 'emoji' || x === 'guess';

function emojiButton(kind: string, value: string, user: string, channel: string): EAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'emoji') return null;
  if (value === 'send') return { type: 'openSend', user };
  const [act, a, b, tag] = value.split(':');
  if (act === 'voteMenu' && isCat(a)) return { type: 'voteMenu', user, cat: a };
  if (act === 'vote' && isCat(b) && tag) return { type: 'vote', user, seq: Number(a), cat: b, tag };
  return null;
}

export const emoji = {
  kind: 'emoji' as const,
  emoji: '🔗',
  name: 'Emoji 傳話',
  players: '4～10 人',
  category: 'party',
  desc: '文字用 emoji 演、emoji 用文字猜，傳一圈看題目怎麼走鐘，再投票選最佳作品',
  noBots: true,
  locales: { en: { name: 'Emoji Telephone', players: '4-10 players', desc: 'Act out text in emoji, guess emoji in words, pass it around to see how the prompt drifts, then vote for the best entries', help: HELP_EN } },
  help: HELP,
  apply: applyEmoji,
  parse: parseEmojiCommand,
  button: emojiButton,
  modals: {
    emojiSend: { action: (user: string, texts: string[]): EAction => ({ type: 'send', user, text: texts[0] ?? '' }), fallback: '視窗打不開，請改用 `/game emoji send <內容>` 送出。' },
  },
} satisfies GameDef<EState, EAction>;
