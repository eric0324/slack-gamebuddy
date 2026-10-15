// 不要謝謝（No Thanks!）遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyNoThanks(state, action, rng) → { state, events }。
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';

export const MIN_NOTHANKS_PLAYERS = 3;
export const MAX_NOTHANKS_PLAYERS = 7;
const TITLE = '不要謝謝';
const REMOVED = 9;
const TURN_MS = 60_000;

export interface NTPlayer {
  id: string;
  chips: number;
  cards: number[];
}

export interface NTState {
  game: 'nothanks';
  channel: string;
  host: string;
  phase: 'lobby' | 'turn' | 'ended';
  players: NTPlayer[];
  deck: number[]; // deck[0] 是下一張要翻的
  removed: number[]; // 一開始拿掉的 9 張，結束才公布
  card?: number; // 目前翻開的牌
  pot: number; // 牌上的籌碼
  turn: number;
  step: number; // 每次不要謝謝／收下就 +1，擋掉過期按鈕
  cardNo: number; // 第幾張牌，當作牌桌訊息的 ref
  last?: string; // 牌桌訊息上「上一步」的說明
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
}

export type NTAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'pass'; user: string; step: number }
  | { type: 'take'; user: string; step: number }
  | { type: 'mine'; user: string }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<NTAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: NTState; events: GameEvent[] };
type Ctx = { s: NTState; events: GameEvent[]; rng: Rng };

const sorted = (cards: number[]) => [...cards].sort((a, b) => a - b);

// 分數：連號只算最小那張，再減籌碼
export function score(cards: number[], chips: number): number {
  const set = new Set(cards);
  return cards.filter((c) => !set.has(c - 1)).reduce((a, b) => a + b, 0) - chips;
}

// 連號顯示成一組：5-7 · 19
export function runsText(cards: number[]): string {
  const groups: number[][] = [];
  for (const c of sorted(cards)) {
    const g = groups.at(-1);
    if (g && g.at(-1) === c - 1) g.push(c);
    else groups.push([c]);
  }
  return groups.length ? groups.map((g) => (g.length > 1 ? `${g[0]}-${g.at(-1)}` : `${g[0]}`)).join(' · ') : '（還沒有）';
}

// bot：沒籌碼、收下不會變多分、或牌上籌碼 × 3 ≥ 增加的分數就收下
export function botTakes(p: NTPlayer, card: number, pot: number): boolean {
  const cost = score([...p.cards, card], 0) - score(p.cards, 0);
  return p.chips === 0 || cost <= 0 || pot * 3 >= cost;
}

const startChips = (n: number) => (n <= 5 ? 11 : n === 6 ? 9 : 7);
const current = (s: NTState) => s.players[s.turn];

function board(s: NTState, options = true): GameEvent {
  const lines = [
    `🃏 第 ${s.cardNo} 張：*${s.card}*，牌上 🪙 ${s.pot} 個（牌堆剩 ${s.deck.length} 張）`,
    ...(s.last ? [s.last] : []),
    options ? `輪到 ${mention(current(s).id)}（${TURN_MS / 1000} 秒）：「🙅 不要謝謝」付 1 個籌碼，或「✋ 收下」` : '',
    '收下的牌：',
    ...s.players.map((p) => `• ${mention(p.id)}：${runsText(p.cards)}`),
  ].filter(Boolean);
  return {
    type: 'prompt',
    kind: 'nothanks',
    audience: 'channel',
    ref: `nothanks:${s.cardNo}`,
    text: lines.join('\n'),
    options: options
      ? [
          { value: `pass:${s.step}`, label: '🙅 不要謝謝' },
          { value: `take:${s.step}`, label: '✋ 收下' },
          { value: 'mine', label: '👀 我的籌碼' },
        ]
      : [],
  };
}

function flip(c: Ctx) {
  const s = c.s;
  s.card = s.deck.shift();
  s.pot = 0;
  s.cardNo++;
  s.last = undefined;
  c.events.push(board(s));
  startTimer(c, TURN_MS);
}

function pass(c: Ctx, auto: boolean) {
  const s = c.s;
  const me = current(s);
  me.chips--;
  s.pot++;
  s.step++;
  s.last = `🙅 ${mention(me.id)} 不要謝謝${auto ? '（超時）' : ''}`;
  s.turn = (s.turn + 1) % s.players.length;
  c.events.push(board(s));
  startTimer(c, TURN_MS);
}

function take(c: Ctx, auto: boolean) {
  const s = c.s;
  const me = current(s);
  me.cards = sorted([...me.cards, s.card!]);
  me.chips += s.pot;
  s.step++;
  s.last = `✋ ${mention(me.id)} 收下了`;
  c.events.push(board(s, false));
  c.events.push({ type: 'announce', text: `✋ ${mention(me.id)} 收下 ${s.card} 和 ${s.pot} 個籌碼${auto ? '（超時）' : ''}` });
  if (s.deck.length) flip(c);
  else endGame(c);
}

function endGame(c: Ctx) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  const scoreOf = (p: NTPlayer) => score(p.cards, p.chips);
  const min = Math.min(...s.players.map(scoreOf));
  s.winners = s.players.filter((p) => scoreOf(p) === min).map((p) => p.id);
  const ranking = [...s.players].sort((a, b) => scoreOf(a) - scoreOf(b));
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.winners });
  c.events.push(
    {
      type: 'announce',
      text: [
        `🏆 遊戲結束，${s.winners.map(mention).join('、')} 分數最低獲勝！`,
        ...ranking.map((p, i) => `${i + 1}. ${mention(p.id)} 分數 ${scoreOf(p)}（牌 ${runsText(p.cards)}，🪙 ${p.chips}）${scoreOf(p) === min ? ' 🏆' : ''}`),
        `一開始被拿掉的牌：${sorted(s.removed).join(' ')}`,
      ].join('\n'),
      gif: 'goodWin',
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, '只有房主可以開始遊戲。');
  if (s.phase !== 'lobby') return false;
  const n = s.players.length;
  if (n < MIN_NOTHANKS_PLAYERS) return reply(c, user, `目前 ${n} 人，至少需要 ${MIN_NOTHANKS_PLAYERS} 人才能開始。`);
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'turn' }));
  const chips = startChips(n);
  for (const p of s.players) Object.assign(p, { chips, cards: [] });
  const deck = shuffle(Array.from({ length: 33 }, (_, i) => i + 3), c.rng);
  s.removed = deck.slice(0, REMOVED);
  s.deck = deck.slice(REMOVED);
  s.turn = Math.floor(c.rng() * n);
  s.phase = 'turn';
  c.events.push({
    type: 'announce',
    text: `🙅 不要謝謝開始！座位：${s.players.map((p) => mention(p.id)).join(' → ')}\n每人 ${chips} 個籌碼（不公開），由 ${mention(current(s).id)} 先開始。\n分數＝收下的牌點數加總（連號只算最小那張）減去籌碼，分數最低的人贏。`,
  });
  const rules = `🙅 不要謝謝規則：牌 3～35，拿掉 9 張不公開。輪到你時「🙅 不要謝謝」付 1 個籌碼放在牌上換下一位，或「✋ 收下」這張牌和牌上所有籌碼，再翻下一張還是輪到你；沒有籌碼只能收下。每次 60 秒，超時有籌碼就自動不要謝謝。分數最低的人贏。你有 ${chips} 個籌碼，隨時按「👀 我的籌碼」查看。`;
  for (const p of s.players) if (!isBot(p.id)) c.events.push({ type: 'dm', to: p.id, text: rules });
  flip(c);
  return true;
}

function act(c: Ctx, action: Extract<GameAction, { type: 'pass' | 'take' }>): boolean {
  const s = c.s;
  const me = s.players.find((p) => p.id === action.user);
  if (!me) return reply(c, action.user, '你不在這局遊戲裡。');
  if (s.phase !== 'turn') return false;
  if (action.step !== s.step) return reply(c, action.user, '這個按鈕已經過期。');
  if (me !== current(s)) return reply(c, action.user, '還沒輪到你。');
  if (action.type === 'pass') {
    if (me.chips === 0) return reply(c, action.user, '你沒有籌碼了，只能收下。');
    pass(c, false);
  } else take(c, false);
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_NOTHANKS_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_NOTHANKS_PLAYERS, newPlayer);
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user);
    case 'pass':
    case 'take':
      return act(c, action);
    case 'mine': {
      const me = s.players.find((p) => p.id === action.user);
      if (!me) return reply(c, action.user, '你不在這局遊戲裡。');
      if (s.phase !== 'turn') return reply(c, action.user, '遊戲還沒開始。');
      return reply(c, action.user, `👀 你有 🪙 ${me.chips} 個籌碼，收下的牌：${runsText(me.cards)}，目前分數 ${score(me.cards, me.chips)}`);
    }
    case 'timeout': {
      if (action.id !== s.timers.phase || s.phase !== 'turn') return false;
      if (current(s).chips > 0) pass(c, true);
      else take(c, true);
      return true;
    }
  }
}

function nextBotAction(s: NTState): GameAction | null {
  if (s.phase !== 'turn') return null;
  const me = current(s);
  if (!isBot(me.id)) return null;
  return { type: botTakes(me, s.card!, s.pot) ? 'take' : 'pass', user: me.id, step: s.step };
}

function runBots(c: Ctx) {
  for (let i = 0; i < 1000; i++) {
    const action = nextBotAction(c.s);
    if (!action || !handle(c, action)) return;
  }
}

const newPlayer = (id: string): NTPlayer => ({ id, chips: 0, cards: [] });

export function applyNoThanks(state: NTState | undefined, action: NTAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
    afterChange: runBots,
  });
}

function createLobby(prev: NTState | undefined, host: string, channel: string): Result {
  const created: NTState = {
    game: 'nothanks',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    deck: [],
    removed: [],
    pot: 0,
    turn: 0,
    step: prev?.step ?? 0,
    cardNo: 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
