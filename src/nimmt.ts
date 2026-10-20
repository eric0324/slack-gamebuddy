// 誰是牛頭王 (6 Nimmt!) 遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyNimmt(state, action, rng) → { state, events }。
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/nimmt.js';

export const MIN_NIMMT_PLAYERS = 2;
export const MAX_NIMMT_PLAYERS = 10;
const TITLE = '誰是牛頭王';
const HAND = 10;
const PICK_MS = 120_000;
const ROW_MS = 60_000;
const END_HEADS = 66;

export type NPhase = 'lobby' | 'pick' | 'chooseRow' | 'ended';

export interface NPlayer {
  id: string;
  hand: number[];
  pick?: number;
  roundHeads: number; // 這一輪收的牛頭
  total: number; // 累積牛頭 (含這一輪)
}

export interface NState {
  game: 'nimmt';
  channel: string;
  host: string;
  phase: NPhase;
  players: NPlayer[];
  rows: number[][];
  round: number;
  turn: number; // 這一輪的第幾回合 (1～10)
  seq: number; // 全局回合序號，用來擋掉舊選單
  pending?: { order: { id: string; card: number; auto: boolean }[]; index: number; log: string[] }; // 揭曉後待擺的牌
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang; // 開房時的頻道語系 (runGame 存進來)
}

export type NAction =
  | { type: 'new'; user: string; channel: string; lang?: Lang }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'hand'; user: string }
  | { type: 'pick'; user: string; card: number; seq?: number } // 指令選牌沒有 seq
  | { type: 'row'; user: string; row: number; seq: number }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string; lang?: Lang };

type GameAction = Exclude<NAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: NState;
  events: GameEvent[];
}

interface Ctx {
  s: NState;
  events: GameEvent[];
  rng: Rng;
}

// 官方牛頭數：55 → 7、11 的倍數 → 5、10 的倍數 → 3、5 的倍數 → 2、其他 → 1
export function bullheads(card: number): number {
  if (card === 55) return 7;
  if (card % 11 === 0) return 5;
  if (card % 10 === 0) return 3;
  if (card % 5 === 0) return 2;
  return 1;
}

const heads = (cards: number[]) => cards.reduce((n, c) => n + bullheads(c), 0);

const tableText = (s: NState) => s.rows.map((r, i) => tx(s.lang, 'tableRow', { row: i + 1, cards: r.join(' '), h: heads(r) })).join('\n');
const scoreText = (s: NState) => tx(s.lang, 'score', { list: s.players.map((p) => `${mention(p.id)} ${p.total}`).join(tx(s.lang, 'sep')) });

// 新的一輪：重新洗牌，每人 10 張，翻 4 張當四列的開頭
function startRound(c: Ctx) {
  const s = c.s;
  s.round++;
  s.turn = 0;
  const deck = shuffle(Array.from({ length: 104 }, (_, i) => i + 1), c.rng);
  s.players.forEach((p, i) => {
    p.hand = deck.slice(i * HAND, i * HAND + HAND).sort((a, b) => a - b);
    p.roundHeads = 0;
  });
  const used = s.players.length * HAND;
  s.rows = deck.slice(used, used + 4).map((c) => [c]);
  c.events.push({
    type: 'announce',
    text: tx(s.lang, 'roundStart', { round: s.round, table: tableText(s), score: scoreText(s) }),
  });
  for (const p of s.players) {
    if (isBot(p.id)) continue;
    c.events.push({ type: 'dm', to: p.id, text: tx(s.lang, 'handDm', { round: s.round, hand: p.hand.map((x) => `${x} (🐮${bullheads(x)})`).join(' ') }) });
  }
  startTurn(c);
}

// 每回合：bot 立刻選好，其他人按「🃏 選牌」
function startTurn(c: Ctx) {
  const s = c.s;
  s.turn++;
  s.seq++;
  s.phase = 'pick';
  for (const p of s.players) p.pick = isBot(p.id) ? botCard(p.hand, s.rows) : undefined;
  c.events.push(pickPrompt(s));
  startTimer(c, PICK_MS);
  if (s.players.every((p) => p.pick !== undefined)) reveal(c);
}

const label = (card: number) => `${card} 🐮${bullheads(card)}`;

function handMenu(c: Ctx, user: string): boolean {
  const s = c.s;
  const me = s.players.find((p) => p.id === user);
  if (!me) return reply(c, user, tx(s.lang, 'notInGame'));
  if (s.phase !== 'pick') return reply(c, user, tx(s.lang, 'cannotPick'));
  c.events.push({
    type: 'prompt',
    kind: 'nimmt',
    audience: 'ephemeral',
    user,
    text: tx(s.lang, 'pickMenu', { current: me.pick !== undefined ? tx(s.lang, 'pickCurrent', { card: me.pick }) : '' }),
    options: [...me.hand].sort((a, b) => a - b).map((x) => ({ value: `pick:${s.seq}:${x}`, label: label(x) })),
    perRow: 5,
  });
  return false;
}

function pickCard(c: Ctx, user: string, card: number, seq?: number): boolean {
  const s = c.s;
  const me = s.players.find((p) => p.id === user);
  if (!me) return reply(c, user, tx(s.lang, 'notInGame'));
  if (s.phase === 'chooseRow') return reply(c, user, tx(s.lang, 'placing'));
  if (s.phase !== 'pick') return reply(c, user, tx(s.lang, 'cannotPick'));
  if (seq !== undefined && seq !== s.seq) return reply(c, user, tx(s.lang, 'oldMenu'));
  if (!me.hand.includes(card)) return reply(c, user, tx(s.lang, 'noCard', { card }));
  const first = me.pick === undefined;
  me.pick = card;
  c.events.push({ type: 'ephemeral', to: user, text: tx(s.lang, 'picked', { card }) });
  if (s.players.every((p) => p.pick !== undefined)) reveal(c);
  else if (first) c.events.push(pickPrompt(s));
  return true;
}

// 揭曉：沒選的人自動出最小的牌，依牌號由小到大開始擺
function reveal(c: Ctx) {
  const s = c.s;
  const order = s.players.map((p) => {
    const auto = p.pick === undefined;
    const card = auto ? Math.min(...p.hand) : p.pick!;
    p.hand = p.hand.filter((x) => x !== card);
    p.pick = undefined;
    return { id: p.id, card, auto };
  });
  order.sort((a, b) => a.card - b.card);
  c.events.push(
    { type: 'prompt', kind: 'nimmt', audience: 'channel', ref: `nimmt:${s.seq}`, text: tx(s.lang, 'revealed', { round: s.round, turn: s.turn, hand: HAND }), options: [] },
    { type: 'announce', text: tx(s.lang, 'reveal', { list: order.map((o) => `${mention(o.id)} ${o.card}${o.auto ? tx(s.lang, 'autoPlayed') : ''}`).join(tx(s.lang, 'sep')) }) },
  );
  s.pending = { order, index: 0, log: [] };
  place(c);
}

// 列尾比它小、差距最小的那一列；沒有就是 -1
function targetRow(rows: number[][], card: number): number {
  let best = -1;
  rows.forEach((r, i) => {
    const end = r[r.length - 1];
    if (end < card && (best < 0 || end > rows[best][rows[best].length - 1])) best = i;
  });
  return best;
}

export function cheapestRow(rows: number[][]): number {
  return rows.reduce((best, r, i) => (heads(r) < heads(rows[best]) ? i : best), 0);
}

// bot：依目前牌桌估風險 (比所有列尾小 → 最便宜那列的牛頭；第 6 張 → 那列的牛頭；其他 0)，出風險最低、同樣低出最小的
export function botCard(hand: number[], rows: number[][]): number {
  const risk = (card: number) => {
    const t = targetRow(rows, card);
    if (t < 0) return heads(rows[cheapestRow(rows)]);
    return rows[t].length >= 5 ? heads(rows[t]) : 0;
  };
  return [...hand].sort((a, b) => risk(a) - risk(b) || a - b)[0];
}

function takeRow(c: Ctx, id: string, row: number, card: number, why: 'whyLowest' | 'whySixth') {
  const s = c.s;
  const p = s.players.find((x) => x.id === id)!;
  const got = heads(s.rows[row]);
  p.roundHeads += got;
  p.total += got;
  s.rows[row] = [card];
  s.pending!.log.push(tx(s.lang, 'take', { who: mention(id), card, why: tx(s.lang, why), row: row + 1, got }));
}

// 比所有列尾都小的那張牌收走指定的列
function takeLowest(c: Ctx, row: number) {
  const s = c.s;
  const o = s.pending!.order[s.pending!.index];
  takeRow(c, o.id, row, o.card, 'whyLowest');
  s.pending!.index++;
  s.phase = 'pick';
}

function rowError(s: NState, user: string, seq: number): string | undefined {
  if (s.phase !== 'chooseRow' || !s.pending) return tx(s.lang, 'noRowNeeded');
  const who = s.pending.order[s.pending.index].id;
  if (user !== who) return s.players.some((p) => p.id === user) ? tx(s.lang, 'otherChoosing', { who: mention(who) }) : tx(s.lang, 'notInGame');
  if (seq !== s.seq) return tx(s.lang, 'oldRowMenu');
  return undefined;
}

// 一張一張擺；遇到要選列的真人就暫停
function place(c: Ctx) {
  const s = c.s;
  const pd = s.pending!;
  while (pd.index < pd.order.length) {
    const o = pd.order[pd.index];
    const t = targetRow(s.rows, o.card);
    if (t < 0) {
      if (isBot(o.id) || o.auto) {
        takeLowest(c, cheapestRow(s.rows));
        continue;
      }
      s.phase = 'chooseRow';
      if (pd.log.length) c.events.push({ type: 'announce', text: pd.log.join('\n') });
      pd.log = [];
      c.events.push({
        type: 'prompt',
        kind: 'nimmt',
        audience: 'channel',
        text: tx(s.lang, 'chooseRow', { who: mention(o.id), card: o.card, sec: ROW_MS / 1000 }),
        options: s.rows.map((r, i) => ({ value: `row:${s.seq}:${i}`, label: tx(s.lang, 'rowBtn', { row: i + 1, n: r.length, cards: tx(s.lang, r.length === 1 ? 'cardOne' : 'cardMany'), h: heads(r) }) })),
      });
      startTimer(c, ROW_MS);
      return;
    }
    if (s.rows[t].length >= 5) takeRow(c, o.id, t, o.card, 'whySixth');
    else {
      s.rows[t].push(o.card);
      pd.log.push(tx(s.lang, 'placed', { card: o.card, row: t + 1 }));
    }
    pd.index++;
  }
  c.events.push({ type: 'announce', text: [...pd.log, tableText(s), scoreText(s)].join('\n') });
  s.pending = undefined;
  if (s.turn >= HAND) endRound(c);
  else startTurn(c);
}

function endRound(c: Ctx) {
  const s = c.s;
  c.events.push({
    type: 'announce',
    text: tx(s.lang, 'roundEnd', {
      round: s.round,
      list: s.players.map((p) => tx(s.lang, 'roundEndItem', { who: mention(p.id), round: p.roundHeads, total: p.total })).join(tx(s.lang, 'sep')),
    }),
  });
  if (s.players.some((p) => p.total >= END_HEADS)) endGame(c);
  else startRound(c);
}

function endGame(c: Ctx) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  const min = Math.min(...s.players.map((p) => p.total));
  s.winners = s.players.filter((p) => p.total === min).map((p) => p.id);
  const ranking = [...s.players].sort((a, b) => a.total - b.total);
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.winners });
  c.events.push(
    {
      type: 'announce',
      text: tx(s.lang, 'win', {
        winners: s.winners.map(mention).join(tx(s.lang, 'sep')),
        ranking: ranking.map((p, i) => `${i + 1}. ${mention(p.id)} 🐮${p.total}${p.total === min ? ' 🏆' : ''}`).join('\n'),
      }),
      gif: 'goodWin',
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

function pickPrompt(s: NState): GameEvent {
  const waiting = s.players.filter((p) => p.pick === undefined);
  return {
    type: 'prompt',
    kind: 'nimmt',
    audience: 'channel',
    ref: `nimmt:${s.seq}`,
    text: tx(s.lang, 'pickPrompt', {
      round: s.round,
      turn: s.turn,
      hand: HAND,
      min: PICK_MS / 60_000,
      table: tableText(s),
      done: s.players.length - waiting.length,
      total: s.players.length,
      waiting: waiting.length ? tx(s.lang, 'waiting', { list: waiting.map((p) => mention(p.id)).join(' ') }) : '',
    }),
    options: [{ value: 'hand', label: tx(s.lang, 'pickBtn') }],
  };
}

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_NIMMT_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_NIMMT_PLAYERS, newPlayer);
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostStart'));
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_NIMMT_PLAYERS) return reply(c, action.user, tx(s.lang, 'needPlayers', { n, min: MIN_NIMMT_PLAYERS }));
      c.events.push(lobbyEvent(TITLE, { ...s, phase: 'pick' }));
      startRound(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user);
    case 'hand':
      return handMenu(c, action.user);
    case 'pick':
      return pickCard(c, action.user, action.card, action.seq);
    case 'row': {
      const err = rowError(s, action.user, action.seq);
      if (err) return reply(c, action.user, err);
      if (!Number.isInteger(action.row) || action.row < 0 || action.row > 3) return false;
      takeLowest(c, action.row);
      place(c);
      return true;
    }
    case 'timeout': {
      if (action.id !== s.timers.phase) return false;
      if (s.phase === 'pick') reveal(c);
      else {
        takeLowest(c, cheapestRow(s.rows));
        place(c);
      }
      return true;
    }
  }
}

const newPlayer = (id: string): NPlayer => ({ id, hand: [], roundHeads: 0, total: 0 });

export function applyNimmt(state: NState | undefined, action: NAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
  });
}

function createLobby(prev: NState | undefined, host: string, channel: string): Result {
  const created: NState = {
    game: 'nimmt',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    rows: [],
    round: 0,
    turn: 0,
    seq: prev?.seq ?? 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
