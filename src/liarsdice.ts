// 吹牛骰遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyLiarsDice(state, action, rng) → { state, events }。
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, startTimer } from './common.js';

export const MIN_DICE_PLAYERS = 2;
export const MAX_DICE_PLAYERS = 8;
const TITLE = '吹牛骰';
const START_DICE = 5;
const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const TURN_MS = 60_000;

export type LPhase = 'lobby' | 'bid' | 'ended';

export interface LPlayer {
  id: string;
  dice: number[];
}

export interface LState {
  game: 'liarsdice';
  channel: string;
  host: string;
  phase: LPhase;
  players: LPlayer[];
  round: number;
  turn: number; // 輪到 players 裡的第幾位
  bid?: { quantity: number; face: number; by: string };
  onesCalled: boolean; // 這輪有人喊過 1 點，1 點就不再萬用
  winner?: string;
  timerSeq: number;
  timers: { phase?: number };
}

export type LAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'bid'; user: string; quantity: number; face: number }
  | { type: 'challenge'; user: string }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<LAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: LState;
  events: GameEvent[];
}

interface Ctx {
  s: LState;
  events: GameEvent[];
  rng: Rng;
}

const totalDice = (s: LState) => s.players.reduce((n, p) => n + p.dice.length, 0);

// 新的一輪：還有骰子的人重新擲骰並私訊點數，頻道只公告每人剩幾顆
function startRound(c: Ctx, starter: number) {
  const s = c.s;
  s.round++;
  s.turn = starter;
  for (const p of s.players) p.dice = p.dice.map(() => Math.floor(c.rng() * 6) + 1);
  const alive = s.players.filter((p) => p.dice.length);
  c.events.push({
    type: 'announce',
    text: `🎲 第 ${s.round} 輪：${alive.map((p) => `${mention(p.id)} ${p.dice.length} 顆`).join('、')} (全場 ${totalDice(s)} 顆)`,
  });
  for (const p of alive) {
    c.events.push({ type: 'dm', to: p.id, text: `🎲 第 ${s.round} 輪，你的骰子：${p.dice.map((d) => FACES[d - 1]).join(' ')}` });
  }
  s.bid = undefined;
  s.onesCalled = false;
  promptTurn(c);
}

const current = (s: LState) => s.players[s.turn].id;

function promptTurn(c: Ctx) {
  const s = c.s;
  const id = current(s);
  c.events.push({
    type: 'announce',
    text: `👉 輪到 ${mention(id)} 喊數：\`/game liarsdice bid <數量> <點數>\` (${TURN_MS / 1000} 秒)`,
  });
  if (s.bid) {
    c.events.push({
      type: 'prompt',
      kind: 'challenge',
      audience: 'channel',
      text: `${mention(id)} 覺得「${s.bid.quantity} 個 ${s.bid.face}」是吹牛的話可以開`,
      options: [{ value: id, label: '開！' }],
    });
  }
  startTimer(c, TURN_MS);
}

// 下一位還有骰子的玩家
function nextAlive(s: LState, from: number) {
  for (let i = 1; i <= s.players.length; i++) {
    const k = (from + i) % s.players.length;
    if (s.players[k].dice.length) return k;
  }
  return from;
}

// 點數大小：2 < 3 < 4 < 5 < 6 < 1
const rank = (face: number) => (face === 1 ? 7 : face);

function placeBid(c: Ctx, user: string, quantity: number, face: number): boolean {
  const s = c.s;
  if (s.phase !== 'bid' || user !== current(s)) return reply(c, user, '還沒輪到你喊數。');
  if (!Number.isInteger(face) || face < 1 || face > 6) return reply(c, user, '點數要是 1～6。');
  if (!Number.isInteger(quantity) || quantity < 1) return reply(c, user, '數量至少要 1。');
  const prev = s.bid;
  if (prev && !(quantity > prev.quantity || (quantity === prev.quantity && rank(face) > rank(prev.face)))) {
    return reply(c, user, `要喊得比「${prev.quantity} 個 ${prev.face}」更大：數量更多，或數量相同、點數更大 (1 最大)。`);
  }
  s.bid = { quantity, face, by: user };
  if (face === 1) s.onesCalled = true;
  c.events.push({ type: 'announce', text: `📢 ${mention(user)} 喊：「${quantity} 個 ${face}」` });
  s.turn = nextAlive(s, s.turn);
  promptTurn(c);
  return true;
}

// 開：公開所有骰子，數喊的點數 (1 點萬用，除非這輪喊過 1 點)，輸的人少一顆
function challengeBid(c: Ctx, user: string): boolean {
  const s = c.s;
  if (s.phase !== 'bid' || user !== current(s) || !s.bid) return reply(c, user, '現在不能開。');
  const { quantity, face, by } = s.bid;
  const wild = !s.onesCalled && face !== 1;
  const count = s.players.reduce((n, p) => n + p.dice.filter((d) => d === face || (wild && d === 1)).length, 0);
  const loserId = count >= quantity ? user : by;
  const reveal = s.players
    .filter((p) => p.dice.length)
    .map((p) => `${mention(p.id)}：${p.dice.map((d) => FACES[d - 1]).join(' ')}`)
    .join('\n');
  const loserIndex = s.players.findIndex((p) => p.id === loserId);
  const loser = s.players[loserIndex];
  loser.dice.pop();
  c.events.push({
    type: 'announce',
    text: `🔍 ${mention(user)} 開「${quantity} 個 ${face}」！\n${reveal}\n${face} 點${wild ? ' (含萬用 1 點)' : ''}實際有 ${count} 顆 → ${mention(loserId)} 輸了，少一顆骰子。`,
  });
  if (!loser.dice.length) c.events.push({ type: 'announce', text: `💀 ${mention(loserId)} 出局 (沒有骰子了)！` });
  const alive = s.players.filter((p) => p.dice.length);
  if (alive.length === 1) {
    endGame(c, alive[0].id);
    return true;
  }
  startRound(c, loser.dice.length ? loserIndex : nextAlive(s, loserIndex));
  return true;
}

function endGame(c: Ctx, winner: string) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  s.winner = winner;
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: [winner] });
  c.events.push(
    { type: 'announce', text: `🏆 遊戲結束，${mention(winner)} 獲勝！`, gif: 'goodWin' },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

// bot：估計全場某點數的期望數量，喊數超過期望值 1 以上就開，否則從自己最多的點數喊剛好更大的數
function nextBotAction(s: LState): GameAction | null {
  if (s.phase !== 'bid') return null;
  const me = s.players[s.turn];
  if (!isBot(me.id)) return null;
  const others = totalDice(s) - me.dice.length;
  const wildFor = (face: number) => !s.onesCalled && face !== 1;
  const own = (face: number) => me.dice.filter((d) => d === face || (wildFor(face) && d === 1)).length;
  const expected = (face: number) => own(face) + others * (wildFor(face) ? 1 / 3 : 1 / 6);
  if (s.bid && s.bid.quantity > expected(s.bid.face) + 1) return { type: 'challenge', user: me.id };
  const face = [2, 3, 4, 5, 6].reduce((best, f) => (own(f) > own(best) ? f : best), 6);
  if (!s.bid) return { type: 'bid', user: me.id, quantity: Math.max(1, own(face)), face };
  const quantity = rank(face) > rank(s.bid.face) ? s.bid.quantity : s.bid.quantity + 1;
  if (quantity > expected(face) + 1) return { type: 'challenge', user: me.id };
  return { type: 'bid', user: me.id, quantity, face };
}

function runBots(c: Ctx) {
  for (let i = 0; i < 1000; i++) {
    const action = nextBotAction(c.s);
    if (!action || !handle(c, action)) return;
  }
}

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_DICE_PLAYERS, (id) => ({ id, dice: [] }));
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_DICE_PLAYERS, (id) => ({ id, dice: [] }));
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, '只有房主可以開始遊戲。');
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_DICE_PLAYERS) return reply(c, action.user, `目前 ${n} 人，至少需要 ${MIN_DICE_PLAYERS} 人才能開始。`);
      c.events.push(lobbyEvent(TITLE, { ...s, phase: 'bid' }));
      s.phase = 'bid';
      for (const p of s.players) p.dice = Array(START_DICE).fill(0);
      startRound(c, Math.floor(c.rng() * n));
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user);
    case 'bid':
      return placeBid(c, action.user, action.quantity, action.face);
    case 'challenge':
      return challengeBid(c, action.user);
    case 'timeout': {
      if (action.id !== s.timers.phase || s.phase !== 'bid') return false;
      return s.bid ? challengeBid(c, current(s)) : placeBid(c, current(s), 1, 2);
    }
  }
}

export function applyLiarsDice(state: LState | undefined, action: LAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winner,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
    afterChange: runBots,
  });
}

function createLobby(prev: LState | undefined, host: string, channel: string): Result {
  const created: LState = {
    game: 'liarsdice',
    channel,
    host,
    phase: 'lobby',
    players: [{ id: host, dice: [] }],
    round: 0,
    turn: 0,
    onesCalled: false,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
