// 妙語說書人的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應、視窗
import { applyDixit, type DixitAction, type DixitState } from '../dixit.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*妙語說書人指令*',
  '• `/game dixit new`：開房 (任何人)',
  '• `/game dixit start`：開始遊戲，需要 3～8 位真人 (房主)',
  '• `/game dixit clue <編號> <提示>`：說書人用手牌第幾張給提示 (1～50 字)，和在「🃏 我的手牌」選牌再輸入提示一樣',
  '• `/game dixit cancel`：取消遊戲 (房主)',
  '按「🃏 我的手牌」看自己的牌 (只有自己看得到)：說書人在這裡選牌給提示，其他人在這裡出牌',
  '說書人給一句提示，其他人出一張最符合的牌混進去，大家匿名猜哪張是說書人的；全部猜對或全部沒猜對時說書人 0 分，有人到 20 分或牌庫不夠補牌時結束',
  '牌來自梗圖大亂鬥的梗圖庫，可以用 `/game meme add <圖片網址>` 投稿到這個頻道',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const HELP_EN = [
  '*Dixit commands*',
  '• `/game dixit new`: open a room (anyone)',
  '• `/game dixit start`: start the game, needs 3-8 human players (host)',
  '• `/game dixit clue <number> <clue>`: as storyteller, give a clue (1-50 characters) for that card in your hand; same as picking a card in "🃏 My hand" and typing the clue',
  '• `/game dixit cancel`: cancel the game (host)',
  'Press "🃏 My hand" to see your cards (only you can see them): the storyteller picks a card there, everyone else plays cards there',
  "The storyteller gives a one-line clue, everyone else slips in the card that best fits, then everyone anonymously guesses which card is the storyteller's; if everyone or nobody finds it the storyteller scores 0. The game ends when someone reaches 20 points or the deck can't refill hands",
  'Cards come from the Meme Battle meme library; add your own to this channel with `/game meme add <image URL>`',
  `📖 Full guide: <${WIKI}|wiki>`,
].join('\n');

// 妙語說書人的子指令：clue <編號> <提示> (提示可以有空白)
export function parseDixitCommand(text: string, user: string, channel: string): DixitAction | null {
  const m = text.trim().match(/^clue\s+(\S+)(?:\s+([\s\S]*))?$/);
  if (m) return { type: 'clue', user, card: Number(m[1]) - 1, text: (m[2] ?? '').trim() };
  return parseRoomCommand(text, user, channel) as DixitAction | null;
}

function dixitButton(kind: string, value: string, user: string, channel: string): DixitAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'dixit') return null;
  if (value === 'hand') return { type: 'hand', user };
  const [act, seq, n] = value.split(':');
  if (act === 'pick' || act === 'play') return { type: act, user, seq: Number(seq), card: Number(n) };
  if (act === 'vote') return { type: 'vote', user, seq: Number(seq), n: Number(n) };
  return null;
}

export const dixit = {
  kind: 'dixit' as const,
  emoji: '🎨',
  name: '妙語說書人',
  players: '3～8 人',
  category: 'party',
  desc: '說書人看自己的梗圖給一句提示，大家出牌混淆，再猜哪張是說書人的',
  noBots: true,
  locales: { en: { name: 'Dixit', players: '3-8 players', desc: "The storyteller gives a one-line clue for one of their memes, everyone slips in a decoy, then guesses which card is the storyteller's", help: HELP_EN } },
  help: HELP,
  apply: applyDixit,
  parse: parseDixitCommand,
  button: dixitButton,
  modals: {
    dixitClue: { action: (user: string, texts: string[]): DixitAction => ({ type: 'clue', user, text: texts[0] ?? '' }), fallback: '視窗打不開，請改用 `/game dixit clue <編號> <提示>` 送出。' },
  },
} satisfies GameDef<DixitState, DixitAction>;
