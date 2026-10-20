// 梗圖大亂鬥的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應、視窗
import { applyMeme, type MemeAction, type MemeState } from '../meme.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*梗圖大亂鬥指令*',
  '• `/game meme new`：開房 (任何人)',
  '• `/game meme addbot [數量]`：加入 bot 補人數 (房主，開始前)',
  '• `/game meme removebot [數量]`：移除 bot (房主，開始前)',
  '• `/game meme start`：開始遊戲，需要 3～8 人 (房主)',
  '• `/game meme write <一句話>`：自己寫一句配圖 (1～40 字)，和按「✍️ 自己寫」一樣',
  '• `/game meme cancel`：取消遊戲 (房主)',
  '• `/game meme add <圖片網址> [名稱]`：投稿梗圖到這個頻道的梗圖庫 (任何人、任何時候；要公開的 https 圖片網址)，每局最多 2 輪用投稿的梗圖',
  '• `/game meme list`：看這個頻道的投稿梗圖 (只有自己看得到)',
  '• `/game meme remove <編號>`：刪掉一張投稿 (任何人，頻道會公告)',
  '每輪看到梗圖後，按「🃏 我的手牌」挑一句，或按「✍️ 自己寫」打一句；送出後不能改。接著匿名投票，不能投自己',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const HELP_EN = [
  '*Meme Battle commands*',
  '• `/game meme new`: open a room (anyone)',
  '• `/game meme addbot [count]`: add bots to fill seats (host, before start)',
  '• `/game meme removebot [count]`: remove bots (host, before start)',
  '• `/game meme start`: start the game, needs 3-8 players (host)',
  '• `/game meme write <caption>`: write your own caption (1-40 characters), same as pressing "✍️ Write my own"',
  '• `/game meme cancel`: cancel the game (host)',
  "• `/game meme add <image URL> [name]`: submit a meme to this channel's meme library (anyone, anytime; must be a public https image URL); each game uses submitted memes for at most 2 rounds",
  "• `/game meme list`: see this channel's submitted memes (only you can see it)",
  '• `/game meme remove <number>`: delete a submission (anyone; announced in the channel)',
  'Each round, after the meme appears, press "🃏 My hand" to pick a line or "✍️ Write my own" to type one; you can\'t change it after sending. Then everyone votes anonymously, not for themselves',
  `📖 Full guide: <${WIKI}|wiki>`,
].join('\n');

// 梗圖大亂鬥的子指令：write <一句話> (可以有空白)
export function parseMemeCommand(text: string, user: string, channel: string): MemeAction | null {
  const m = text.trim().match(/^write\s+([\s\S]+)$/);
  if (m) return { type: 'write', user, text: m[1].trim() };
  return parseRoomCommand(text, user, channel) as MemeAction | null;
}

function memeButton(kind: string, value: string, user: string, channel: string): MemeAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'meme') return null;
  if (value === 'hand') return { type: 'hand', user };
  if (value === 'write') return { type: 'openWrite', user };
  const [act, seq, n] = value.split(':').map((x, i) => (i ? Number(x) : x)) as [string, number, number];
  if (act === 'play') return { type: 'play', user, seq, card: n };
  if (act === 'vote') return { type: 'vote', user, seq, n };
  return null;
}

export const meme = {
  kind: 'meme' as const,
  emoji: '😂',
  name: '梗圖大亂鬥',
  players: '3～8 人',
  category: 'party',
  desc: '每輪看一張梗圖，出手牌或自己寫一句最好笑的，匿名投票拿分',
  locales: { en: { name: 'Meme Battle', players: '3-8 players', desc: 'Each round shows a meme: play a card or write the funniest caption, then vote anonymously for points', help: HELP_EN } },
  help: HELP,
  apply: applyMeme,
  parse: parseMemeCommand,
  button: memeButton,
  modals: {
    memeWrite: { action: (user: string, texts: string[]): MemeAction => ({ type: 'write', user, text: texts[0] ?? '' }), fallback: '視窗打不開，請改用 `/game meme write <一句話>` 送出。', fallbackLocales: { en: 'The window didn\'t open. Please use `/game meme write <caption>` instead.' } },
  },
} satisfies GameDef<MemeState, MemeAction>;
