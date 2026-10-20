// 地產大亨 (For Sale) 遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyForSale(state, action, rng) → { state, events }。
// 金額一律用 $1,000 為單位的整數 (1 = $1,000)，顯示時經過 money()
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';
import { t, type Lang } from './i18n/index.js';
import { tx } from './i18n/games/forsale.js';

export const MIN_FORSALE_PLAYERS = 3;
export const MAX_FORSALE_PLAYERS = 6;
const TITLE = '地產大亨';
export const BID_MS = 30_000;
export const SELL_MS = 45_000;

// 房產 1～30；支票 $0 兩張、$2,000～$15,000 各兩張 (沒有 $1,000)
export const PROPERTIES = Array.from({ length: 30 }, (_, i) => i + 1);
export const CHECKS = [0, 0, ...Array.from({ length: 14 }, (_, i) => [i + 2, i + 2]).flat()];

export const money = (n: number) => (n === 0 ? '$0' : `$${n.toLocaleString('en-US')},000`);

export interface FPlayer {
  id: string;
  money: number; // 剩下的金幣
  props: number[]; // 手上的房產
  checks: number[]; // 拿到的支票
  bid: number; // 這一輪出價 (第一階段)
  passed: boolean; // 這一輪已放棄 (第一階段)
  took?: number; // 這一輪拿到的房產 (第一階段)
  paid?: number; // 這一輪付給銀行的錢 (第一階段)
  choice?: number; // 這一輪選的房產 (第二階段)
  auto?: boolean; // 這一步是逾時自動出最小
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
  table: number[]; // 第一階段桌上的房產 (由小到大)
  checks: number[]; // 第二階段這一輪的支票 (由大到小)
  high: number; // 目前最高出價
  highBy?: string;
  turn: number; // 輪到誰 (players 的 index)
  starter: number; // 這一輪的起始玩家
  log: string[]; // 這一輪的動作
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang;
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
  | { type: 'sellMenu'; user: string; seq: number }
  | { type: 'sell'; user: string; seq: number; prop: number }
  | { type: 'status'; user: string }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<FAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: FState; events: GameEvent[] };
type Ctx = { s: FState; events: GameEvent[]; rng: Rng };


const find = (s: FState, id: string) => s.players.find((p) => p.id === id);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const current = (s: FState) => s.players[s.turn];

function bidLine(s: FState, p: FPlayer): string {
  const state = p.passed ? tx(s.lang, 'linePassed', { prop: p.took! }) : p.bid ? tx(s.lang, 'lineBid', { money: money(p.bid) }) : tx(s.lang, 'lineNoBid');
  return `${p === current(s) ? '👉 ' : ''}${mention(p.id)} ${state}`;
}

// 喊價面板：不顯示任何人剩下的金幣和手上的房產；ended 時改成這一輪的結果並拿掉按鈕
function bidBoard(s: FState, ended = false): GameEvent {
  const L = s.lang;
  const head = tx(L, 'bidHead', { round: s.round, rounds: s.rounds });
  const lines = ended
    ? [tx(L, 'bidEnded', { head }), ...s.players.map((p) => tx(L, 'bidTook', { who: mention(p.id), prop: p.took!, money: money(p.paid!) }))]
    : [
        tx(L, 'bidTitle', { head, deck: s.propDeck.length, sec: BID_MS / 1000 }),
        tx(L, 'table', { props: s.table.join(tx(L, 'sep')) }),
        s.high ? tx(L, 'high', { money: money(s.high), who: mention(s.highBy!) }) : tx(L, 'noHigh'),
        ...s.players.map((p) => bidLine(s, p)),
        ...(s.log.length ? [tx(L, 'lastMove', { move: s.log[s.log.length - 1] })] : []),
      ];
  const raise = (n: number) => ({ value: `bid:${s.seq}:${s.high + n}`, label: tx(L, 'raise', { money: money(s.high + n), n }) });
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
          { value: `bidMenu:${s.seq}`, label: tx(L, 'otherAmount') },
          { value: `pass:${s.seq}`, label: tx(L, 'passBtn') },
          { value: 'status', label: tx(L, 'statusBtn') },
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
  if (!find(s, user)) return tx(s.lang, 'notPlayer');
  if (s.phase !== 'bid' || current(s).id !== user) return tx(s.lang, 'notYet');
  if (seq !== s.seq) return tx(s.lang, 'stale');
  return null;
}

function bid(c: Ctx, user: string, seq: number, amount: number): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return reply(c, user, err);
  const me = current(s);
  if (amount <= s.high) return reply(c, user, tx(s.lang, 'bidTooLow', { money: money(s.high) }));
  if (amount > me.money) return reply(c, user, tx(s.lang, 'bidTooHigh', { money: money(me.money) }));
  me.bid = amount;
  Object.assign(s, { high: amount, highBy: user });
  s.log.push(tx(s.lang, 'logBid', { who: mention(user), money: money(amount) }));
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
  const text = amounts.length ? tx(s.lang, 'bidMenu', { money: money(s.high) }) : tx(s.lang, 'bidMenuBroke');
  const options = [...amounts.map((n) => ({ value: `bid:${seq}:${n}`, label: money(n) })), { value: `pass:${seq}`, label: tx(s.lang, 'passBtn') }];
  c.events.push({ type: 'prompt', kind: 'forsale', audience: 'ephemeral', user, text, options, perRow: 6 });
  return false;
}

function pass(c: Ctx, user: string, seq: number): boolean {
  const err = turnCheck(c.s, user, seq);
  if (err) return reply(c, user, err);
  doPass(c, false);
  return true;
}

// 放棄：拿桌上最小的、拿回一半出價 (無條件捨去)；只剩一人時他拿最大的並付全額
function doPass(c: Ctx, auto: boolean) {
  const s = c.s;
  const me = current(s);
  const back = Math.floor(me.bid / 2);
  take(me, s.table.shift()!, me.bid - back);
  me.passed = true;
  const refund = me.bid ? tx(s.lang, 'refund', { back: money(back), bid: money(me.bid) }) : tx(s.lang, 'free');
  s.log.push(tx(s.lang, 'logPass', { who: mention(me.id), prop: me.took!, refund }) + (auto ? tx(s.lang, 'autoPass') : ''));
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

const sortedProps = (s: FState, p: FPlayer) => [...p.props].sort((a, b) => a - b).join(tx(s.lang, 'sep')) || tx(s.lang, 'none');

function endBidPhase(c: Ctx) {
  const s = c.s;
  c.events.push({ type: 'announce', text: tx(s.lang, 'bidPhaseOver') });
  for (const p of s.players) {
    if (!isBot(p.id)) c.events.push({ type: 'ephemeral', to: p.id, text: tx(s.lang, 'yourProps', { props: sortedProps(s, p), money: money(p.money) }) });
  }
  Object.assign(s, { phase: 'sell', round: 0 });
  startSellRound(c);
}

// 揭曉時的名次：出的房產由大到小，第 i 名拿 checks[i]
const ranked = (s: FState) => [...s.players].sort((a, b) => b.choice! - a.choice!);

// 賣房產面板：揭曉前只顯示誰選好了；revealed 時改成每個人出的房產和拿到的支票並拿掉按鈕
function sellBoard(s: FState, revealed = false): GameEvent {
  const L = s.lang;
  const sep = tx(L, 'sep');
  const head = tx(L, 'sellHead', { round: s.round, rounds: s.rounds });
  const checks = tx(L, 'checks', { checks: s.checks.map(money).join(sep) });
  const waiting = s.players.filter((p) => p.choice === undefined);
  const lines = revealed
    ? [
        tx(L, 'revealed', { head }),
        checks,
        ...ranked(s).map((p, i) => tx(L, 'revealLine', { who: mention(p.id), prop: p.choice!, money: money(s.checks[i]) }) + (p.auto ? tx(L, 'autoSell') : '')),
      ]
    : [
        tx(L, 'sellTitle', { head, sec: SELL_MS / 1000 }),
        checks,
        tx(L, 'remaining', { list: s.players.map((p) => tx(L, 'remainingOne', { who: mention(p.id), n: p.props.length })).join(sep) }),
        tx(L, 'picked', { done: s.players.length - waiting.length, total: s.players.length }) +
          (waiting.length ? tx(L, 'waiting', { who: waiting.map((p) => mention(p.id)).join(' ') }) : ''),
      ];
  return {
    type: 'prompt',
    kind: 'forsale',
    audience: 'channel',
    ref: `forsale:sell:${s.round}`,
    text: lines.join('\n'),
    options: revealed ? [] : [{ value: `sellMenu:${s.seq}`, label: tx(L, 'sellBtn') }, { value: 'status', label: tx(L, 'statusBtn') }],
  };
}

function startSellRound(c: Ctx) {
  const s = c.s;
  s.round++;
  s.seq++;
  s.checks = s.checkDeck.splice(0, s.players.length).sort((a, b) => b - a);
  for (const p of s.players) Object.assign(p, { choice: undefined, auto: false });
  for (const p of s.players) if (isBot(p.id)) p.choice = botSell(s, p);
  // 最後一輪每人只剩一間：不用選，直接揭曉
  if (s.players.every((p) => p.props.length === 1)) {
    for (const p of s.players) p.choice = p.props[0];
    return reveal(c);
  }
  c.events.push(sellBoard(s));
  startTimer(c, SELL_MS);
}

// 第二階段選單和選擇的共同檢查；回傳錯誤訊息或 null
function sellCheck(s: FState, user: string, seq: number): string | null {
  if (!find(s, user)) return tx(s.lang, 'notPlayer');
  if (s.phase !== 'sell' || seq !== s.seq) return tx(s.lang, 'stale');
  return null;
}

function sellMenu(c: Ctx, user: string, seq: number): boolean {
  const err = sellCheck(c.s, user, seq);
  if (err) return reply(c, user, err);
  const me = find(c.s, user)!;
  const options = [...me.props].sort((a, b) => a - b).map((n) => ({ value: `sell:${seq}:${n}`, label: tx(c.s.lang, 'prop', { n }) }));
  c.events.push({ type: 'prompt', kind: 'forsale', audience: 'ephemeral', user, text: tx(c.s.lang, 'sellMenu'), options, perRow: 5 });
  return false;
}

function sell(c: Ctx, user: string, seq: number, prop: number): boolean {
  const s = c.s;
  const err = sellCheck(s, user, seq);
  if (err) return reply(c, user, err);
  const me = find(s, user)!;
  if (!me.props.includes(prop)) return reply(c, user, tx(s.lang, 'stale'));
  const first = me.choice === undefined;
  me.choice = prop;
  c.events.push({ type: 'ephemeral', to: user, text: tx(s.lang, 'youChose', { prop }), replace: true });
  if (s.players.every((p) => p.choice !== undefined)) reveal(c);
  else if (first) c.events.push(sellBoard(s));
  return true;
}

// 時間到：沒選的真人自動出最小的
function sellTimeout(c: Ctx) {
  for (const p of c.s.players) if (p.choice === undefined) Object.assign(p, { choice: Math.min(...p.props), auto: true });
  reveal(c);
}

function reveal(c: Ctx) {
  const s = c.s;
  c.events.push(sellBoard(s, true));
  ranked(s).forEach((p, i) => {
    p.checks.push(s.checks[i]);
    p.props = p.props.filter((n) => n !== p.choice);
  });
  if (s.checkDeck.length) startSellRound(c);
  else endGame(c);
}

// bot 喊價：上限 = (桌上最大 − 最小) ÷ 5，再和剩下金幣取小；目前最高 + 1 在上限內就出，否則放棄
export function botBid(s: FState, me: FPlayer): number | 'pass' {
  const cap = Math.min(me.money, Math.floor((s.table[s.table.length - 1] - s.table[0]) / 5));
  return s.high + 1 <= cap ? s.high + 1 : 'pass';
}

// bot 賣房產：這輪最大的支票 ≥ $12,000 出最大的房產，否則出最小的
export const botSell = (s: FState, me: FPlayer) => (s.checks[0] >= 12 ? Math.max(...me.props) : Math.min(...me.props));

// 輪到 bot 喊價就立刻行動 (第二階段 bot 在開輪時就選好了)
function botsAct(c: Ctx) {
  for (let guard = 0; guard < 1000; guard++) {
    const s = c.s;
    if (s.phase !== 'bid' || !isBot(current(s).id)) return;
    const move = botBid(s, current(s));
    if (move === 'pass') doPass(c, false);
    else bid(c, current(s).id, s.seq, move);
  }
}

const totalOf = (p: FPlayer) => sum(p.checks) + p.money;

// 支票加剩下金幣最高的贏；同分比剩下金幣，再一樣就並列
function endGame(c: Ctx) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  const ranking = [...s.players].sort((a, b) => totalOf(b) - totalOf(a) || b.money - a.money);
  const top = ranking[0];
  const won = (p: FPlayer) => totalOf(p) === totalOf(top) && p.money === top.money;
  s.winners = s.players.filter(won).map((p) => p.id);
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.winners });
  c.events.push(
    {
      type: 'announce',
      text: [
        tx(s.lang, s.winners.length > 1 ? 'winMany' : 'winOne', { who: s.winners.map(mention).join(tx(s.lang, 'sep')) }),
        ...ranking.map(
          (p, i) => tx(s.lang, 'rankLine', { i: i + 1, who: mention(p.id), total: money(totalOf(p)), checks: money(sum(p.checks)), money: money(p.money) }) + (won(p) ? ' 🏆' : ''),
        ),
      ].join('\n'),
      gif: 'goodWin',
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: t(s.lang, 'rematch.ask'), options: [{ value: 'rematch', label: t(s.lang, 'rematch.button') }] },
  );
}

function statusText(s: FState, me: FPlayer): string {
  return [
    tx(s.lang, 'statusCoins', { money: money(me.money) }) + (s.phase === 'bid' && me.bid ? tx(s.lang, 'statusBid', { money: money(me.bid) }) : ''),
    tx(s.lang, 'statusProps', { props: sortedProps(s, me) }),
    tx(s.lang, 'statusChecks', { checks: me.checks.map(money).join(tx(s.lang, 'sep')) || tx(s.lang, 'none'), total: money(sum(me.checks)) }),
  ].join('\n');
}

function status(c: Ctx, user: string): boolean {
  const me = find(c.s, user);
  return reply(c, user, me && c.s.phase !== 'lobby' ? statusText(c.s, me) : tx(c.s.lang, 'notPlayer'));
}

// 依人數：移除幾張房產和支票、起始金幣
const removedFor = (n: number) => (n === 3 ? 6 : n === 4 ? 2 : 0);
const coinsFor = (n: number) => (n <= 4 ? 18 : 14);

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, tx(s.lang, 'onlyHostStart'));
  if (s.phase !== 'lobby') return false;
  const n = s.players.length;
  if (n < MIN_FORSALE_PLAYERS) return reply(c, user, tx(s.lang, 'notEnough', { n, min: MIN_FORSALE_PLAYERS }));
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
  const rules = [tx(s.lang, 'rules1', { n }), tx(s.lang, 'rules2'), tx(s.lang, 'rules3')].join('\n');
  const players = s.players.map((p) => mention(p.id)).join(tx(s.lang, 'sep'));
  c.events.push({ type: 'announce', text: tx(s.lang, 'begin', { players, money: money(coinsFor(n)), rounds: s.rounds, rules }) });
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
      else sellTimeout(c);
      return true;
    case 'sellMenu':
      return sellMenu(c, action.user, action.seq);
    case 'sell':
      return sell(c, action.user, action.seq, action.prop);
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
    afterChange: botsAct,
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
    checks: [],
    high: 0,
    turn: 0,
    starter: 0,
    log: [],
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
