// 璀璨寶石（Splendor）遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applySplendor(state, action, rng) → { state, events }。
import { isBot, mention, quiet, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';
import {
  CARDS,
  cardOf,
  cardText,
  COLORS,
  emptyGems,
  GEM_WORD,
  gemsText,
  NOBLES,
  nobleOf,
  nobleText,
  payment,
  total,
  type Color,
  type Gems,
} from './splendorCards.js';

export const MIN_SPLENDOR_PLAYERS = 2;
export const MAX_SPLENDOR_PLAYERS = 4;
const TITLE = '璀璨寶石';
export const TURN_MS = 90_000;
export const RETURN_MS = 30_000;
export const MAX_ROUNDS = 50;
const WIN_POINTS = 15;
const LEVEL_WORD = ['一級', '二級', '三級'];

export interface SPlayer {
  id: string;
  tokens: Gems;
  cards: number[]; // 已買的卡 id
  reserved: number[]; // 保留的卡 id（最多 3）
  nobles: number[]; // 來訪的貴族 id
}

export interface SState {
  game: 'splendor';
  channel: string;
  host: string;
  phase: 'lobby' | 'play' | 'ended';
  players: SPlayer[];
  bank: Gems;
  decks: [number[], number[], number[]]; // 各級牌堆，[0] 是頂
  table: [(number | null)[], (number | null)[], (number | null)[]]; // 各級 4 個位置
  nobles: (number | null)[]; // 場上的貴族 id，顯示編號是 index + 1（固定不變），來訪後改成 null
  first: number; // 第一位玩家 index
  turn: number; // 輪到的玩家 index
  round: number; // 第幾輪（1 起）
  step: 'act' | 'return';
  seq: number; // 每次輪到新玩家 +1：回合面板的 ref，也用來擋掉舊按鈕
  passStreak: number; // 連續跳過的次數，有人做動作歸零
  lastRound?: boolean; // 有人達到 15 分
  last?: string; // 上一步做了什麼（面板用）
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
}

export type SAction =
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

type GameAction = Exclude<SAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: SState; events: GameEvent[] };
type Ctx = { s: SState; events: GameEvent[]; rng: Rng };

const NOT_PLAYER = '你不在這局遊戲中';

const find = (s: SState, id: string) => s.players.find((p) => p.id === id);
const current = (s: SState) => s.players[s.turn];

// 折扣：已買卡的顏色張數
export function discountOf(p: SPlayer): Record<Color, number> {
  const d = { w: 0, b: 0, g: 0, r: 0, k: 0 };
  for (const id of p.cards) d[cardOf(id).color]++;
  return d;
}
export const scoreOf = (p: SPlayer) => p.cards.reduce((sum, id) => sum + cardOf(id).points, 0) + p.nobles.length * 3;
const tokensText = (g: Gems) => `${gemsText(g)}（${total(g)}）`;
const payOf = (p: SPlayer, id: number) => payment(cardOf(id).cost, discountOf(p), p.tokens);

const playerLine = (p: SPlayer) =>
  `${quiet(p.id)} ${scoreOf(p)} 分｜籌碼 ${tokensText(p.tokens)}｜折扣 ${gemsText(discountOf(p))}（${p.cards.length} 張）｜保留 ${p.reserved.length}｜貴族 ${p.nobles.length}`;

// 回合面板：回合內用同一個 ref 更新；ended 時收成一行、拿掉按鈕
function board(s: SState, ended = false): GameEvent {
  const me = current(s);
  const base = { type: 'prompt' as const, kind: 'splendor', audience: 'channel' as const, ref: `splendor:${s.seq}` };
  if (ended) return { ...base, text: `✅ ${quiet(me.id)} 的回合結束：${s.last}`, options: [] };
  const bank = [...COLORS, 'o' as const].map((x) => `${GEM_WORD[x]} ${s.bank[x]}`).join(' ');
  const nobles = s.nobles.flatMap((id, i) => (id === null ? [] : [`貴族 ${i + 1}：${nobleText(nobleOf(id))}`]));
  const rows = [2, 1, 0].flatMap((lv) => [
    `${LEVEL_WORD[lv]}（牌堆 ${s.decks[lv].length}）`,
    ...s.table[lv].map((id, i) => (id === null ? `${lv + 1}-${i + 1} （空）` : cardText(cardOf(id), `${lv + 1}-${i + 1}`))),
  ]);
  const lines = [
    `*💍 璀璨寶石｜第 ${s.round} 輪${s.lastRound ? '｜最後一輪' : ''}｜👉 輪到 ${mention(me.id)}（${TURN_MS / 1000} 秒）*`,
    ...(s.last ? [`上一步：${s.last}`] : []),
    `庫存：${bank}`,
    ...(nobles.length ? nobles : ['貴族：（沒有了）']),
    ...rows,
    ...s.players.map((p) => (p === me ? `👉 ${playerLine(p)}` : playerLine(p))),
  ];
  return { ...base, text: lines.join('\n'), options: [{ value: `turnMenu:${s.seq}`, label: '💍 行動' }, { value: 'status', label: '📜 我的狀態' }] };
}

function status(c: Ctx, user: string): boolean {
  const me = find(c.s, user);
  if (!me) return reply(c, user, NOT_PLAYER);
  const reserved = me.reserved.map((id, i) => {
    const pay = payOf(me, id);
    return `${cardText(cardOf(id), `保留 ${i + 1}`)}（${pay ? `買得起，付 ${gemsText(pay)}` : '買不起'}）`;
  });
  const lines = [
    `📜 你的狀態｜${scoreOf(me)} 分`,
    `籌碼 ${tokensText(me.tokens)}｜折扣 ${gemsText(discountOf(me))}`,
    `已買的卡（${me.cards.length} 張）：${me.cards.map((id) => cardText(cardOf(id))).join('、') || '無'}`,
    `保留的卡（${me.reserved.length} 張）：`,
    ...(reserved.length ? reserved : ['無']),
    `貴族：${me.nobles.map((id) => nobleText(nobleOf(id))).join('、') || '無'}`,
  ];
  return reply(c, user, lines.join('\n'));
}

// 回合結束：收起這次的面板，輪到下一位
function endTurn(c: Ctx, last: string) {
  const s = c.s;
  s.last = last;
  c.events.push(board(s, true));
  const n = s.players.length;
  if ((s.turn + 1) % n === s.first) s.round++;
  s.turn = (s.turn + 1) % n;
  beginTurn(c);
}

function beginTurn(c: Ctx) {
  const s = c.s;
  s.seq++;
  s.step = 'act';
  c.events.push(board(s));
  startTimer(c, TURN_MS);
}

function timeout(c: Ctx) {
  const me = current(c.s);
  endTurn(c, `${quiet(me.id)} 逾時，跳過`);
}

const RULES = [
  '輪到時做一件事：拿 3 個不同顏色的寶石各 1 個／拿 2 個同色寶石（該色庫存至少 4 個）／保留 1 張卡並拿 1 個黃金（最多保留 3 張）／買 1 張翻開的或保留的卡。',
  '買卡時成本先扣掉已買卡的折扣（每張卡給該色 1 個永久折扣），不夠的自動用黃金補。',
  '回合結束時手上籌碼超過 10 個要退回到 10 個；折扣達到貴族條件時貴族自動來訪（+3 分，一回合最多 1 位）。',
  '有人達到 15 分時這一輪打完就結束，分數最高者勝，同分比買的發展卡張數少的勝。',
].join('\n');

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, '只有房主可以開始遊戲。');
  if (s.phase !== 'lobby') return false;
  const n = s.players.length;
  if (n < MIN_SPLENDOR_PLAYERS) return reply(c, user, `目前 ${n} 人，至少需要 ${MIN_SPLENDOR_PLAYERS} 人才能開始。`);
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'play' }));
  const each = n === 2 ? 4 : n === 3 ? 5 : 7;
  const decks = [1, 2, 3].map((lv) => shuffle(CARDS.filter((x) => x.level === lv).map((x) => x.id), c.rng)) as SState['decks'];
  const first = Math.floor(c.rng() * n);
  Object.assign(s, {
    phase: 'play',
    players: s.players.map((p) => newPlayer(p.id)),
    bank: { w: each, b: each, g: each, r: each, k: each, o: 5 },
    decks,
    table: decks.map((d) => d.splice(0, 4)),
    nobles: shuffle(NOBLES.map((x) => x.id), c.rng).slice(0, n + 1),
    first,
    turn: first,
    round: 1,
    passStreak: 0,
    lastRound: false,
    last: undefined,
  });
  const order = Array.from({ length: n }, (_, k) => mention(s.players[(first + k) % n].id)).join(' → ');
  c.events.push({ type: 'announce', text: `💍 璀璨寶石開始！玩家順序：${order}\n${RULES}` });
  beginTurn(c);
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_SPLENDOR_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_SPLENDOR_PLAYERS, newPlayer);
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user);
    case 'status':
      return status(c, action.user);
    case 'timeout':
      if (action.id !== c.s.timers.phase) return false;
      timeout(c);
      return true;
    default:
      return false;
  }
}

const newPlayer = (id: string): SPlayer => ({ id, tokens: emptyGems(), cards: [], reserved: [], nobles: [] });

export function applySplendor(state: SState | undefined, action: SAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
  });
}

function createLobby(prev: SState | undefined, host: string, channel: string): Result {
  const created: SState = {
    game: 'splendor',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    bank: emptyGems(),
    decks: [[], [], []],
    table: [[], [], []],
    nobles: [],
    first: 0,
    turn: 0,
    round: 0,
    step: 'act',
    seq: prev?.seq ?? 0,
    passStreak: 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
