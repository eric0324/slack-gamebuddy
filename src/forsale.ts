// 地產大亨（For Sale）遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyForSale(state, action, rng) → { state, events }。
// 金額一律用 $1,000 為單位的整數（1 = $1,000），顯示時經過 money()
import { mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle } from './common.js';

export const MIN_FORSALE_PLAYERS = 3;
export const MAX_FORSALE_PLAYERS = 6;
const TITLE = '地產大亨';
export const BID_MS = 30_000;

// 房產 1～30；支票 $0 兩張、$2,000～$15,000 各兩張（沒有 $1,000）
export const PROPERTIES = Array.from({ length: 30 }, (_, i) => i + 1);
export const CHECKS = [0, 0, ...Array.from({ length: 14 }, (_, i) => [i + 2, i + 2]).flat()];

export const money = (n: number) => (n === 0 ? '$0' : `$${n.toLocaleString('en-US')},000`);
const propName = (n: number) => `🏠 ${n}`;

export interface FPlayer {
  id: string;
  money: number; // 剩下的金幣
  props: number[]; // 手上的房產
  checks: number[]; // 拿到的支票
  bid: number; // 這一輪出價（第一階段）
  passed: boolean; // 這一輪已放棄（第一階段）
}

export interface FState {
  game: 'forsale';
  channel: string;
  host: string;
  phase: 'lobby' | 'bid' | 'sell' | 'ended';
  players: FPlayer[];
  rounds: number; // 每階段輪數
  round: number; // 目前這一階段第幾輪
  seq: number; // 擋舊按鈕：第一階段每換一位出價者 +1，第二階段每輪 +1
  propDeck: number[];
  checkDeck: number[];
  table: number[]; // 第一階段桌上的房產（由小到大）
  high: number; // 目前最高出價
  highBy?: string;
  turn: number; // 輪到誰（players 的 index）
  starter: number; // 這一輪的起始玩家
  log: string[]; // 這一輪的動作
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
}

export type FAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'status'; user: string }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<FAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: FState; events: GameEvent[] };
type Ctx = { s: FState; events: GameEvent[]; rng: Rng };

const NOT_PLAYER = '你不在這局遊戲中';

const find = (s: FState, id: string) => s.players.find((p) => p.id === id);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// 喊價面板：不顯示任何人剩下的金幣和手上的房產
function bidBoard(s: FState): GameEvent {
  const lines = [
    `*🏠 第一階段第 ${s.round}/${s.rounds} 輪*｜房產牌庫剩 ${s.propDeck.length} 張`,
    `桌上：${s.table.map(propName).join('、')}`,
  ];
  return { type: 'prompt', kind: 'forsale', audience: 'channel', ref: `forsale:bid:${s.round}`, text: lines.join('\n'), options: [] };
}

function startBidRound(c: Ctx) {
  const s = c.s;
  s.round++;
  s.seq++;
  s.table = s.propDeck.splice(0, s.players.length).sort((a, b) => a - b);
  Object.assign(s, { high: 0, highBy: undefined, turn: s.starter, log: [] });
  for (const p of s.players) Object.assign(p, { bid: 0, passed: false });
  c.events.push(bidBoard(s));
}

function statusText(s: FState, me: FPlayer): string {
  return [
    `💰 金幣 ${money(me.money)}${s.phase === 'bid' && me.bid ? `｜這輪出價 ${money(me.bid)}` : ''}`,
    `🏠 房產：${[...me.props].sort((a, b) => a - b).map(propName).join('、') || '（沒有）'}`,
    `💵 支票：${me.checks.map(money).join('、') || '（沒有）'}，總額 ${money(sum(me.checks))}`,
  ].join('\n');
}

function status(c: Ctx, user: string): boolean {
  const me = find(c.s, user);
  return reply(c, user, me && c.s.phase !== 'lobby' ? statusText(c.s, me) : NOT_PLAYER);
}

// 依人數：移除幾張房產和支票、起始金幣
const removedFor = (n: number) => (n === 3 ? 6 : n === 4 ? 2 : 0);
const coinsFor = (n: number) => (n <= 4 ? 18 : 14);

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, '只有房主可以開始遊戲。');
  if (s.phase !== 'lobby') return false;
  const n = s.players.length;
  if (n < MIN_FORSALE_PLAYERS) return reply(c, user, `目前 ${n} 人，至少需要 ${MIN_FORSALE_PLAYERS} 人才能開始。`);
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'bid' }));
  const starter = Math.floor(c.rng() * n);
  const removed = removedFor(n);
  for (const p of s.players) Object.assign(p, newPlayer(p.id), { money: coinsFor(n) });
  Object.assign(s, {
    phase: 'bid',
    rounds: (30 - removed) / n,
    round: 0,
    starter,
    propDeck: shuffle(PROPERTIES, c.rng).slice(removed),
    checkDeck: shuffle(CHECKS, c.rng).slice(removed),
  });
  const rules = [
    `第一階段：每輪翻開 ${n} 間房產，輪流出價（要比目前最高價高）或放棄；放棄的人拿桌上最小的房產並拿回一半出價（無條件捨去），最後剩下的人拿最大的房產並付全額。`,
    '第二階段：每輪翻開支票，大家同時私下出一張房產，大的換到大的支票。',
    '支票加剩下金幣最多的人贏（同分比剩下金幣）。',
  ].join('\n');
  c.events.push({
    type: 'announce',
    text: `🏠 地產大亨開始！玩家：${s.players.map((p) => mention(p.id)).join('、')}，每人 ${money(coinsFor(n))}，每階段 ${s.rounds} 輪。\n${rules}`,
  });
  startBidRound(c);
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_FORSALE_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_FORSALE_PLAYERS, newPlayer);
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user);
    case 'status':
      return status(c, action.user);
    default:
      return false;
  }
}

const newPlayer = (id: string): FPlayer => ({ id, money: 0, props: [], checks: [], bid: 0, passed: false });

export function applyForSale(state: FState | undefined, action: FAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
  });
}

function createLobby(prev: FState | undefined, host: string, channel: string): Result {
  const created: FState = {
    game: 'forsale',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    rounds: 0,
    round: 0,
    seq: prev?.seq ?? 0,
    propDeck: [],
    checkDeck: [],
    table: [],
    high: 0,
    turn: 0,
    starter: 0,
    log: [],
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
