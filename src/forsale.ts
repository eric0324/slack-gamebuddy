// 地產大亨（For Sale）遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyForSale(state, action, rng) → { state, events }。
// 金額一律用 $1,000 為單位的整數（1 = $1,000），顯示時經過 money()
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';

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
  took?: number; // 這一輪拿到的房產（第一階段）
  paid?: number; // 這一輪付給銀行的錢（第一階段）
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
  | { type: 'bid'; user: string; seq: number; amount: number }
  | { type: 'bidMenu'; user: string; seq: number }
  | { type: 'pass'; user: string; seq: number }
  | { type: 'status'; user: string }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<FAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: FState; events: GameEvent[] };
type Ctx = { s: FState; events: GameEvent[]; rng: Rng };

const NOT_PLAYER = '你不在這局遊戲中';
const NOT_YET = '還沒輪到你。';
const STALE = '按鈕已過期。';

const find = (s: FState, id: string) => s.players.find((p) => p.id === id);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const current = (s: FState) => s.players[s.turn];

function bidLine(s: FState, p: FPlayer): string {
  const state = p.passed ? `已放棄（拿走 ${propName(p.took!)}）` : p.bid ? `出價 ${money(p.bid)}` : '還沒出價';
  return `${p === current(s) ? '👉 ' : ''}${mention(p.id)} ${state}`;
}

// 喊價面板：不顯示任何人剩下的金幣和手上的房產；ended 時改成這一輪的結果並拿掉按鈕
function bidBoard(s: FState, ended = false): GameEvent {
  const head = `第一階段第 ${s.round}/${s.rounds} 輪`;
  const lines = ended
    ? [`*✅ ${head}結束*`, ...s.players.map((p) => `${mention(p.id)} 拿走 ${propName(p.took!)}，付 ${money(p.paid!)}`)]
    : [
        `*🏠 ${head}*｜房產牌庫剩 ${s.propDeck.length} 張（每次 ${BID_MS / 1000} 秒）`,
        `桌上：${s.table.map(propName).join('、')}`,
        s.high ? `目前最高 ${money(s.high)}（${mention(s.highBy!)}）` : '目前最高：還沒有人出價',
        ...s.players.map((p) => bidLine(s, p)),
        ...(s.log.length ? [`上一步：${s.log[s.log.length - 1]}`] : []),
      ];
  const raise = (n: number) => ({ value: `bid:${s.seq}:${s.high + n}`, label: `出 ${money(s.high + n)}（+${n}）` });
  return {
    type: 'prompt',
    kind: 'forsale',
    audience: 'channel',
    ref: `forsale:bid:${s.round}`,
    text: lines.join('\n'),
    options: ended
      ? []
      : [
          raise(1),
          raise(2),
          raise(5),
          { value: `bidMenu:${s.seq}`, label: '🔢 其他金額' },
          { value: `pass:${s.seq}`, label: '🙅 放棄' },
          { value: 'status', label: '💰 我的狀態' },
        ],
    perRow: 5,
  };
}

function startBidRound(c: Ctx) {
  const s = c.s;
  s.round++;
  s.seq++;
  s.table = s.propDeck.splice(0, s.players.length).sort((a, b) => a - b);
  Object.assign(s, { high: 0, highBy: undefined, turn: s.starter, log: [] });
  for (const p of s.players) Object.assign(p, { bid: 0, passed: false, took: undefined, paid: undefined });
  c.events.push(bidBoard(s));
  startTimer(c, BID_MS);
}

// 換到下一位還沒放棄的人
function nextBidder(c: Ctx) {
  const s = c.s;
  do s.turn = (s.turn + 1) % s.players.length;
  while (current(s).passed);
  s.seq++;
  c.events.push(bidBoard(s));
  startTimer(c, BID_MS);
}

// 輪到的人操作前的共同檢查；回傳錯誤訊息或 null
function turnCheck(s: FState, user: string, seq: number): string | null {
  if (!find(s, user)) return NOT_PLAYER;
  if (s.phase !== 'bid' || current(s).id !== user) return NOT_YET;
  if (seq !== s.seq) return STALE;
  return null;
}

function bid(c: Ctx, user: string, seq: number, amount: number): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return reply(c, user, err);
  const me = current(s);
  if (amount <= s.high) return reply(c, user, `出價要比目前最高 ${money(s.high)} 高。`);
  if (amount > me.money) return reply(c, user, `你的錢不夠，最多能出 ${money(me.money)}。`);
  me.bid = amount;
  Object.assign(s, { high: amount, highBy: user });
  s.log.push(`${mention(user)} 出價 ${money(amount)}`);
  nextBidder(c);
  return true;
}

// 「🔢 其他金額」：私下列出所有出得起的金額；不改 state、不重設計時器
function bidMenu(c: Ctx, user: string, seq: number): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return reply(c, user, err);
  const me = current(s);
  const amounts = Array.from({ length: Math.max(0, me.money - s.high) }, (_, i) => s.high + 1 + i);
  const text = amounts.length ? `🔢 選擇你的出價（目前最高 ${money(s.high)}）` : '你的錢不夠出價，只能放棄。';
  const options = [...amounts.map((n) => ({ value: `bid:${seq}:${n}`, label: money(n) })), { value: `pass:${seq}`, label: '🙅 放棄' }];
  c.events.push({ type: 'prompt', kind: 'forsale', audience: 'ephemeral', user, text, options, perRow: 6 });
  return false;
}

function pass(c: Ctx, user: string, seq: number): boolean {
  const err = turnCheck(c.s, user, seq);
  if (err) return reply(c, user, err);
  doPass(c, false);
  return true;
}

// 放棄：拿桌上最小的、拿回一半出價（無條件捨去）；只剩一人時他拿最大的並付全額
function doPass(c: Ctx, auto: boolean) {
  const s = c.s;
  const me = current(s);
  const back = Math.floor(me.bid / 2);
  take(me, s.table.shift()!, me.bid - back);
  me.passed = true;
  const refund = me.bid ? `拿回 ${money(back)}（出價 ${money(me.bid)}）` : '沒出價，免費';
  s.log.push(`${mention(me.id)} 放棄，拿走 ${propName(me.took!)}，${refund}${auto ? '（逾時，自動放棄）' : ''}`);
  const left = s.players.filter((p) => !p.passed);
  if (left.length > 1) return nextBidder(c);
  take(left[0], s.table.pop()!, left[0].bid);
  s.starter = s.players.indexOf(left[0]);
  c.events.push(bidBoard(s, true));
  if (s.propDeck.length) startBidRound(c);
  else endBidPhase(c);
}

function take(p: FPlayer, prop: number, paid: number) {
  Object.assign(p, { took: prop, paid, money: p.money - paid });
  p.props.push(prop);
}

const sortedProps = (p: FPlayer) => [...p.props].sort((a, b) => a - b).map(propName).join('、') || '（沒有）';

function endBidPhase(c: Ctx) {
  const s = c.s;
  c.events.push({ type: 'announce', text: '🏠 第一階段結束，房產全部賣完！進入第二階段：賣房產。' });
  for (const p of s.players) {
    if (!isBot(p.id)) c.events.push({ type: 'ephemeral', to: p.id, text: `你的房產：${sortedProps(p)}｜💰 金幣 ${money(p.money)}` });
  }
  Object.assign(s, { phase: 'sell', round: 0 });
}

function statusText(s: FState, me: FPlayer): string {
  return [
    `💰 金幣 ${money(me.money)}${s.phase === 'bid' && me.bid ? `｜這輪出價 ${money(me.bid)}` : ''}`,
    `🏠 房產：${sortedProps(me)}`,
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
    case 'bid':
      return bid(c, action.user, action.seq, action.amount);
    case 'bidMenu':
      return bidMenu(c, action.user, action.seq);
    case 'pass':
      return pass(c, action.user, action.seq);
    case 'timeout':
      if (action.id !== c.s.timers.phase) return false;
      if (c.s.phase === 'bid') doPass(c, true);
      return true;
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
