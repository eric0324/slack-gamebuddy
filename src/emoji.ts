// Emoji 傳話（傳情畫意的 emoji 版）遊戲引擎：純邏輯，不碰任何 I/O。每人一條鏈，文字用 emoji 演、emoji 用文字猜，傳一圈後投票。
// 介面和其他遊戲一樣：applyEmoji(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import { EMOJI_PROMPTS } from './emojiPrompts.js';

export const MIN_EMOJI_PLAYERS = 4;
export const MAX_EMOJI_PLAYERS = 10;
export const MAX_EMOJI = 20;
const TITLE = 'Emoji 傳話';
const EMOJI_MS = 90_000;
const GUESS_MS = 60_000;

// 一個 emoji：Slack shortcode、RGI emoji（ZWJ 組合、膚色、國旗、keycap），或單一 pictographic 字元（可接 U+FE0F）
const TOKEN = new RegExp(String.raw`:[a-z0-9_+'\-]+:|\p{RGI_Emoji}|\p{Extended_Pictographic}️?`, 'yv');

// 去掉所有空白後全部是 emoji 時回傳個數，否則回傳 null
export function emojiCount(text: string): number | null {
  const t = text.replace(/\s/g, '');
  if (!t) return null;
  let n = 0;
  for (let i = 0; i < t.length; n++) {
    TOKEN.lastIndex = i;
    const m = TOKEN.exec(t);
    if (!m) return null;
    i += m[0].length;
  }
  return n;
}

export function isEmojiOnly(text: string): boolean {
  const n = emojiCount(text);
  return n !== null && n <= MAX_EMOJI;
}

type Kind = 'emoji' | 'guess';
export type Entry = { step: number; by: string; kind: Kind; text?: string }; // text 沒有＝沒交；跳過的不記

export interface EState {
  game: 'emoji';
  channel: string;
  host: string;
  phase: 'lobby' | 'play' | 'vote' | 'ended';
  players: { id: string; score: number }[]; // 順序＝傳遞順序
  deck: number[]; // 還沒發的題目（EMOJI_PROMPTS 的 index），同一頻道跨局接續
  chains: { owner: string; prompt: number; entries: Entry[] }[];
  step: number; // 第幾步（1～steps）
  steps: number;
  pending: Record<string, string>; // 這一步 user → 已交的內容（截止才寫進 entries）
  votes: Record<string, { emoji?: string; guess?: string }>; // user → 作品編號 `鏈-步`
  seq: number; // 步驟／投票訊息的 ref，也用來擋掉舊按鈕
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
}

export type EAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'openSend'; user: string }
  | { type: 'send'; user: string; text: string }
  | { type: 'voteMenu'; user: string; cat: Kind }
  | { type: 'vote'; user: string; seq: number; cat: Kind; tag: string }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<EAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: EState; events: GameEvent[] };
type Ctx = { s: EState; events: GameEvent[]; rng: Rng };

const isPlayer = (s: EState, id: string) => s.players.some((p) => p.id === id);
const kindOf = (step: number): Kind => (step % 2 ? 'emoji' : 'guess');

const EMOJI_HINT = `只能用 emoji 喔！可以直接貼 emoji 或打 \`:shortcode:\`，可以有空白，最多 ${MAX_EMOJI} 個`;
const MAX_GUESS = 30;

// 第 step 步這位玩家手上的鏈：第 i 條鏈由第 (i + step − 1) mod N 位作答
function chainOf(s: EState, user: string) {
  const n = s.players.length;
  const j = s.players.findIndex((p) => p.id === user);
  return s.chains[(((j - (s.step - 1)) % n) + n) % n];
}

// 這一步拿到的內容：emoji 步拿最近的文字（題目或猜測），猜測步拿最近的 emoji；沒有就是跳過（null）
function inputOf(s: EState, user: string): string | null {
  const ch = chainOf(s, user);
  const want = kindOf(s.step) === 'emoji' ? 'guess' : 'emoji';
  const last = ch.entries.filter((e) => e.kind === want && e.text !== undefined).at(-1);
  if (last) return last.text!;
  return want === 'guess' ? EMOJI_PROMPTS[ch.prompt] : null;
}

// 這一步需要作答的玩家（跳過的不算）
const needed = (s: EState) => s.players.filter((p) => inputOf(s, p.id) !== null).map((p) => p.id);

function stepBoard(s: EState, ended = false): GameEvent {
  const need = needed(s);
  const head = `🔗 第 ${s.step}／${s.steps} 步：`;
  return {
    type: 'prompt',
    kind: 'emoji',
    audience: 'channel',
    ref: `emoji:${s.seq}`,
    text: [
      kindOf(s.step) === 'emoji' ? `${head}🎨 用 emoji 描述（${EMOJI_MS / 1000} 秒）` : `${head}🧠 猜猜這是什麼（${GUESS_MS / 1000} 秒）`,
      ended ? '這一步結束' : '按「✍️ 作答」看你拿到的內容，也可以打 `/game emoji send <內容>`；截止前可以重送',
      `已交 ${need.filter((u) => u in s.pending).length}/${need.length}`,
    ].join('\n'),
    options: ended ? [] : [{ value: 'send', label: '✍️ 作答' }],
  };
}

function nextStep(c: Ctx) {
  const s = c.s;
  s.step++;
  s.seq++;
  s.pending = {};
  c.events.push(stepBoard(s));
  startTimer(c, kindOf(s.step) === 'emoji' ? EMOJI_MS : GUESS_MS);
}

// 這一步結束：交的和沒交的寫進鏈（跳過的不記）；整步沒人交就中止
function endStep(c: Ctx) {
  const s = c.s;
  c.events.push(stepBoard(s, true));
  const need = needed(s);
  if (!need.some((u) => u in s.pending)) {
    s.phase = 'ended';
    s.timers = {};
    c.events.push({ type: 'announce', text: '⌛ 這一步沒有人交，遊戲中止。' });
    return;
  }
  for (const by of need) chainOf(s, by).entries.push({ step: s.step, by, kind: kindOf(s.step), ...(by in s.pending ? { text: s.pending[by] } : {}) });
  if (s.step < s.steps) nextStep(c);
  else s.phase = 'vote';
}

// 作答時間的共同檢查；回傳拿到的內容，不行時回傳 null（已經回覆原因）
function answerer(c: Ctx, user: string): string | null {
  if (!isPlayer(c.s, user)) return (reply(c, user, '你不在這局遊戲裡。'), null);
  if (c.s.phase !== 'play') return (reply(c, user, '現在不是作答的時間。'), null);
  const input = inputOf(c.s, user);
  if (input === null) reply(c, user, '上一位沒交，這一步你休息。');
  return input;
}

function openSend(c: Ctx, user: string): boolean {
  const input = answerer(c, user);
  if (input === null) return false;
  const emoji = kindOf(c.s.step) === 'emoji';
  reply(c, user, `你拿到：${input}，${emoji ? '請只用 emoji 描述' : '請猜這是什麼'}`);
  c.events.push({ type: 'modal', to: user, kind: 'emojiSend', title: '作答', label: emoji ? `只用 emoji 描述「${input}」（最多 ${MAX_EMOJI} 個）` : `猜猜 ${input} 是什麼（1～${MAX_GUESS} 字）` });
  return false;
}

function send(c: Ctx, user: string, raw: string): boolean {
  if (answerer(c, user) === null) return false;
  const s = c.s;
  const text = raw.trim();
  if (kindOf(s.step) === 'emoji' ? !isEmojiOnly(text) : !text || Array.from(text).length > MAX_GUESS) {
    return reply(c, user, kindOf(s.step) === 'emoji' ? EMOJI_HINT : `猜測要 1～${MAX_GUESS} 個字。`);
  }
  const first = !(user in s.pending);
  s.pending[user] = text;
  c.events.push({ type: 'ephemeral', to: user, text: `已收到：${text}` });
  if (needed(s).every((u) => u in s.pending)) endStep(c);
  else if (first) c.events.push(stepBoard(s));
  return true;
}

// 從 deck 依序發 n 題；不夠時先發完剩下的，再重洗全部題目（排除這局已發的）補足
function deal(c: Ctx, n: number): number[] {
  const s = c.s;
  const dealt = s.deck.splice(0, n);
  if (dealt.length < n) {
    s.deck = shuffle(EMOJI_PROMPTS.map((_, i) => i).filter((i) => !dealt.includes(i)), c.rng);
    dealt.push(...s.deck.splice(0, n - dealt.length));
  }
  return dealt;
}

const RULES = (s: EState) =>
  [
    `🔗 Emoji 傳話開始！傳遞順序：${[...s.players, s.players[0]].map((p) => mention(p.id)).join(' → ')}，共 ${s.steps} 步。`,
    `每人私下拿到一個題目當作自己那條鏈的起點，每一步大家同時作答，做完交給下一位：`,
    `🎨 奇數步看文字，只能用 emoji 描述（${EMOJI_MS / 1000} 秒）；🧠 偶數步看 emoji，用文字猜那是什麼（${GUESS_MS / 1000} 秒）。`,
    `傳完一起看每條鏈怎麼走鐘，再投「🎨 最佳 emoji」和「🧠 最神猜測」，每得 1 票 +1 分，總分最高的人獲勝。`,
  ].join('\n');

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, '只有房主可以開始遊戲。');
  if (s.phase !== 'lobby') return false;
  if (s.players.length < MIN_EMOJI_PLAYERS) return reply(c, user, `目前 ${s.players.length} 人，至少需要 ${MIN_EMOJI_PLAYERS} 人才能開始。`);
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'play' }));
  const n = s.players.length;
  const prompts = deal(c, n);
  s.chains = s.players.map((p, i) => ({ owner: p.id, prompt: prompts[i], entries: [] }));
  s.steps = n % 2 ? n - 1 : n;
  s.phase = 'play';
  c.events.push({ type: 'announce', text: RULES(s), gif: 'start' });
  nextStep(c);
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_EMOJI_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, 'Emoji 傳話不支援 bot。');
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user);
    case 'openSend':
      return openSend(c, action.user);
    case 'send':
      return send(c, action.user, action.text);
    case 'timeout':
      if (action.id !== c.s.timers.phase) return false;
      if (c.s.phase === 'play') endStep(c);
      else return false;
      return true;
    default:
      return false;
  }
}

const newPlayer = (id: string) => ({ id, score: 0 });

export function applyEmoji(state: EState | undefined, action: EAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer,
    createLobby,
    handle,
  });
}

function createLobby(prev: EState | undefined, host: string, channel: string): Result {
  const created: EState = {
    game: 'emoji',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    deck: prev?.deck ?? [], // 接著上一局剩下的題目，同一頻道跨局不重複
    chains: [],
    step: 0,
    steps: 0,
    pending: {},
    votes: {},
    seq: prev?.seq ?? 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
