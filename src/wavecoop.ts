// 心電感應（合作）遊戲引擎：純邏輯，不碰任何 I/O。全員同一隊，輪流出題、其他人一起猜，拚總分。
// 介面和其他遊戲一樣：applyWavecoop(state, action, rng) → { state, events }。光譜卡和兩隊對抗版共用。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, reply, runGame, shuffle, startTimer } from './common.js';
import { SPECTRUMS } from './wavelengthCards.js';

export const MIN_WAVECOOP_PLAYERS = 2;
export const MAX_WAVECOOP_PLAYERS = 12;
const TITLE = '心電感應（合作）';
const BASE_ROUNDS = 7;
const PHASE_MS = 180_000;
const MAX_CLUE = 30;

// 依總分給評價：從高到低找第一個門檻
const RATINGS: [number, string][] = [
  [22, '🌌 宇宙級腦波同步'],
  [19, '🛸 心電感應大師'],
  [16, '🧠 你們是不是共用一顆腦？'],
  [13, '🔥 心有靈犀'],
  [10, '😎 很有默契！'],
  [7, '🙂 不錯喔，算是好朋友'],
  [4, '🤔 有點默契，還要再磨合'],
  [0, '📻 訊號不良，你們真的認識彼此嗎？'],
];

export type WCPhase = 'lobby' | 'clue' | 'guess' | 'ended';

export interface WCState {
  game: 'wavecoop';
  channel: string;
  host: string;
  phase: WCPhase;
  players: string[];
  order: string[]; // 出題順序，輪完再從頭
  round: number; // 第幾題（0 起算）
  total: number; // 目前總題數：基本 7 題，正中 +1
  used: number[]; // 這局用過的光譜卡
  spectrum?: [string, string];
  target?: number;
  clue?: string;
  guesses: Record<string, number>;
  score: number;
  finished?: boolean; // 正常結束才有，再來一局用
  timerSeq: number;
  timers: { phase?: number };
}

export type WCAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'openClue'; user: string }
  | { type: 'clue'; user: string; text: string }
  | { type: 'guess'; user: string; value: number }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<WCAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: WCState;
  events: GameEvent[];
}

interface Ctx {
  s: WCState;
  events: GameEvent[];
  rng: Rng;
}

const lobbyEvent = (s: WCState): GameEvent => ({ type: 'lobby', title: TITLE, host: s.host, players: [...s.players], open: s.phase === 'lobby' });

const psychic = (s: WCState) => s.order[s.round % s.order.length];
const guessers = (s: WCState) => s.players.filter((id) => id !== psychic(s));
const dial = (s: WCState) => `${s.spectrum![0]} ◀ 0 ─ 10 ▶ ${s.spectrum![1]}`;
const minutes = `${PHASE_MS / 60_000} 分鐘`;

function deal(c: Ctx) {
  const s = c.s;
  s.order = shuffle(s.players, c.rng);
  c.events.push({
    type: 'announce',
    text: `📡 心電感應（合作）開始！大家同一隊，輪流出題、其他人一起猜，共 ${s.total} 題（正中目標會加一題）。\n出題順序：${s.order.map(mention).join(' → ')}`,
    gif: 'start',
  });
  startRound(c);
}

// 每題開始：抽光譜卡和目標，私訊出題者
function startRound(c: Ctx) {
  const s = c.s;
  const unused = SPECTRUMS.map((_, i) => i).filter((i) => !s.used.includes(i));
  const card = unused[Math.floor(c.rng() * unused.length)];
  s.used.push(card);
  s.spectrum = SPECTRUMS[card];
  s.target = Math.floor(c.rng() * 11);
  s.clue = undefined;
  s.guesses = {};
  s.phase = 'clue';
  const p = psychic(s);
  c.events.push(
    {
      type: 'dm',
      to: p,
      text: `🎯 你這題的光譜是「${s.spectrum[0]} ↔ ${s.spectrum[1]}」，目標在 ${s.target}（0 是最左「${s.spectrum[0]}」，10 是最右「${s.spectrum[1]}」）。\n回到頻道按「✍️ 寫提示」，給一個讓大家猜到這個位置的提示詞。`,
    },
    { type: 'announce', text: `🔮 第 ${s.round + 1}／${s.total} 題（總分 ${s.score}）：輪到 ${mention(p)} 出題（${minutes}）\n光譜：${dial(s)}` },
    { type: 'prompt', kind: 'wavecoop', audience: 'channel', text: `${mention(p)} 想好了就按這裡寫提示`, options: [{ value: 'clue', label: '✍️ 寫提示' }] },
  );
  startTimer(c, PHASE_MS);
}

function giveClue(c: Ctx, user: string, text: string): boolean {
  const s = c.s;
  if (s.phase !== 'clue' || user !== psychic(s)) return reply(c, user, '現在不是你出題。');
  const clue = text.trim();
  if (!clue || [...clue].length > MAX_CLUE) return reply(c, user, `提示詞要 1～${MAX_CLUE} 個字。`);
  s.clue = clue;
  s.phase = 'guess';
  c.events.push(
    { type: 'announce', text: `💬 ${mention(user)} 的提示：「${clue}」\n光譜：${dial(s)}\n${guessers(s).map(mention).join('、')} 請按 0～10 猜目標位置，可以改選（${minutes}）` },
    {
      type: 'prompt',
      kind: 'wavecoop',
      audience: 'channel',
      text: `「${clue}」在哪裡？`,
      options: Array.from({ length: 11 }, (_, i) => ({ value: `guess:${i}`, label: String(i) })),
      perRow: 6,
    },
  );
  startTimer(c, PHASE_MS);
  return true;
}

function guess(c: Ctx, user: string, value: number): boolean {
  const s = c.s;
  if (s.phase !== 'guess' || !guessers(s).includes(user)) return reply(c, user, '現在不是你猜位置。');
  if (!Number.isInteger(value) || value < 0 || value > 10) return false;
  s.guesses[user] = value;
  c.events.push({ type: 'ephemeral', to: user, text: `你選了 ${value}` });
  if (guessers(s).every((id) => id in s.guesses)) reveal(c);
  return true;
}

// 公布這題：平均四捨五入當全隊答案，依距離得 4／3／2／0 分，正中加一題
function reveal(c: Ctx) {
  const s = c.s;
  const picked = Object.values(s.guesses);
  const answer = picked.length ? Math.round(picked.reduce((a, b) => a + b, 0) / picked.length) : undefined;
  const dist = answer === undefined ? Infinity : Math.abs(answer - s.target!);
  const gained = dist === 0 ? 4 : dist === 1 ? 3 : dist === 2 ? 2 : 0;
  s.score += gained;
  if (dist === 0) s.total++;
  const cells = Array.from({ length: 11 }, (_, i) => (i === s.target && i === answer ? '💥' : i === s.target ? '🎯' : i === answer ? '📌' : '▫️'));
  c.events.push({
    type: 'announce',
    text: [
      answer === undefined ? '⌛ 沒有人猜，這題 0 分。' : '',
      `📍 答案揭曉：提示「${s.clue}」`,
      `${s.spectrum![0]} ${cells.join('')} ${s.spectrum![1]}`,
      `目標 ${s.target}${answer === undefined ? '' : `，全隊答案 ${answer}`}`,
      `這題 +${gained}，總分 ${s.score}`,
      dist === 0 ? '🎯 正中！加一題' : '',
    ]
      .filter(Boolean)
      .join('\n'),
  });
  nextRound(c);
}

function nextRound(c: Ctx) {
  const s = c.s;
  s.round++;
  if (s.round >= s.total) endGame(c);
  else startRound(c);
}

function endGame(c: Ctx) {
  const s = c.s;
  s.phase = 'ended';
  s.finished = true;
  s.timers = {};
  const rating = RATINGS.find(([min]) => s.score >= min)![1];
  c.events.push(
    { type: 'announce', text: `🏁 遊戲結束！共 ${s.total} 題，全隊總分 ${s.score}\n${rating}`, gif: 'goodWin' },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join': {
      if (s.phase !== 'lobby') return reply(c, action.user, '遊戲已經開始了。');
      if (s.players.includes(action.user)) return reply(c, action.user, '你已經在房間裡了。');
      if (s.players.length >= MAX_WAVECOOP_PLAYERS) return reply(c, action.user, '房間已滿。');
      s.players.push(action.user);
      c.events.push(lobbyEvent(s));
      return true;
    }
    case 'leave': {
      if (!s.players.includes(action.user)) return false;
      if (s.phase !== 'lobby') return reply(c, action.user, '遊戲已經開始了，不能離開。');
      if (action.user === s.host) {
        s.phase = 'ended';
        c.events.push(lobbyEvent(s), { type: 'announce', text: '🛑 房主離開，遊戲已取消。' });
        return true;
      }
      s.players = s.players.filter((id) => id !== action.user);
      c.events.push(lobbyEvent(s));
      return true;
    }
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, '心電感應（合作）不支援 bot。');
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, '只有房主可以開始遊戲。');
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_WAVECOOP_PLAYERS) return reply(c, action.user, `目前 ${n} 人，至少需要 ${MIN_WAVECOOP_PLAYERS} 人才能開始。`);
      c.events.push(lobbyEvent({ ...s, phase: 'clue' }));
      deal(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user);
    case 'openClue':
      if (s.phase !== 'clue' || action.user !== psychic(s)) return reply(c, action.user, '現在不是你出題。');
      c.events.push({ type: 'modal', to: action.user, kind: 'wavecoopClue', title: '寫提示', label: `提示詞（1～${MAX_CLUE} 字）` });
      return false;
    case 'clue':
      return giveClue(c, action.user, action.text);
    case 'guess':
      return guess(c, action.user, action.value);
    case 'timeout': {
      if (action.id !== s.timers.phase) return false;
      if (s.phase === 'clue') {
        c.events.push({ type: 'announce', text: `⌛ ${mention(psychic(s))} 沒有寫提示，這題跳過、0 分。` });
        nextRound(c);
      } else if (s.phase === 'guess') reveal(c);
      return true;
    }
  }
}

export function applyWavecoop(state: WCState | undefined, action: WCAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.finished,
    isPlayer: (s, user) => s.players.includes(user),
    createLobby,
    handle,
  });
}

function createLobby(prev: WCState | undefined, host: string, channel: string): Result {
  const created: WCState = {
    game: 'wavecoop',
    channel,
    host,
    phase: 'lobby',
    players: [host],
    order: [],
    round: 0,
    total: BASE_ROUNDS,
    used: [],
    guesses: {},
    score: 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(created)] };
}
