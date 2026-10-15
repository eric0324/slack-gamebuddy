// 誰是牛頭王（6 Nimmt!）遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyNimmt(state, action, rng) → { state, events }。
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';

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
  total: number; // 累積牛頭（含這一輪）
}

export interface NState {
  game: 'nimmt';
  channel: string;
  host: string;
  phase: NPhase;
  players: NPlayer[];
  rows: number[][];
  round: number;
  turn: number; // 這一輪的第幾回合（1～10）
  seq: number; // 全局回合序號，用來擋掉舊選單
  pending?: { order: { id: string; card: number; auto: boolean }[]; index: number; log: string[] }; // 揭曉後待擺的牌
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
}

export type NAction =
  | { type: 'new'; user: string; channel: string }
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
  | { type: 'rematch'; user: string; channel: string };

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

const tableText = (s: NState) => s.rows.map((r, i) => `第 ${i + 1} 列：${r.join(' ')}（🐮${heads(r)}）`).join('\n');
const scoreText = (s: NState) => `🐮 累積：${s.players.map((p) => `${mention(p.id)} ${p.total}`).join('、')}`;

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
    text: `🐮 誰是牛頭王 第 ${s.round} 輪開始！每人 10 張手牌（已私訊），每回合大家同時出一張。\n${tableText(s)}\n${scoreText(s)}`,
  });
  for (const p of s.players) {
    if (isBot(p.id)) continue;
    c.events.push({ type: 'dm', to: p.id, text: `🐮 第 ${s.round} 輪你的手牌：${p.hand.map((x) => `${x}（🐮${bullheads(x)}）`).join(' ')}` });
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
  if (!me) return reply(c, user, '你不在這局遊戲中。');
  if (s.phase !== 'pick') return reply(c, user, '現在不能選牌。');
  c.events.push({
    type: 'prompt',
    kind: 'nimmt',
    audience: 'ephemeral',
    user,
    text: `🃏 選一張牌（揭曉前可以改）${me.pick !== undefined ? `，目前選了 ${me.pick}` : ''}`,
    options: [...me.hand].sort((a, b) => a - b).map((x) => ({ value: `pick:${s.seq}:${x}`, label: label(x) })),
    perRow: 5,
  });
  return false;
}

function pickCard(c: Ctx, user: string, card: number, seq?: number): boolean {
  const s = c.s;
  const me = s.players.find((p) => p.id === user);
  if (!me) return reply(c, user, '你不在這局遊戲中。');
  if (s.phase === 'chooseRow') return reply(c, user, '還在擺牌，請等一下。');
  if (s.phase !== 'pick') return reply(c, user, '現在不能選牌。');
  if (seq !== undefined && seq !== s.seq) return reply(c, user, '這是上一回合的選單，請重新按「🃏 選牌」。');
  if (!me.hand.includes(card)) return reply(c, user, `你手上沒有 ${card}。`);
  const first = me.pick === undefined;
  me.pick = card;
  c.events.push({ type: 'ephemeral', to: user, text: `你選了 ${card}（揭曉前可以改）` });
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
    { type: 'prompt', kind: 'nimmt', audience: 'channel', ref: `nimmt:${s.seq}`, text: `🃏 第 ${s.round} 輪第 ${s.turn}/${HAND} 回合：已揭曉`, options: [] },
    { type: 'announce', text: `🃏 揭曉：${order.map((o) => `${mention(o.id)} ${o.card}${o.auto ? '（超時自動出牌）' : ''}`).join('、')}` },
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

// bot：依目前牌桌估風險（比所有列尾小 → 最便宜那列的牛頭；第 6 張 → 那列的牛頭；其他 0），出風險最低、同樣低出最小的
export function botCard(hand: number[], rows: number[][]): number {
  const risk = (card: number) => {
    const t = targetRow(rows, card);
    if (t < 0) return heads(rows[cheapestRow(rows)]);
    return rows[t].length >= 5 ? heads(rows[t]) : 0;
  };
  return [...hand].sort((a, b) => risk(a) - risk(b) || a - b)[0];
}

function takeRow(c: Ctx, id: string, row: number, card: number, why: string) {
  const s = c.s;
  const p = s.players.find((x) => x.id === id)!;
  const got = heads(s.rows[row]);
  p.roundHeads += got;
  p.total += got;
  s.rows[row] = [card];
  s.pending!.log.push(`🐮 ${mention(id)} 的 ${card} ${why}，收走第 ${row + 1} 列（🐮${got}）`);
}

// 比所有列尾都小的那張牌收走指定的列
function takeLowest(c: Ctx, row: number) {
  const s = c.s;
  const o = s.pending!.order[s.pending!.index];
  takeRow(c, o.id, row, o.card, '比所有列尾都小');
  s.pending!.index++;
  s.phase = 'pick';
}

function rowError(s: NState, user: string, seq: number): string | undefined {
  if (s.phase !== 'chooseRow' || !s.pending) return '現在不用選列。';
  const who = s.pending.order[s.pending.index].id;
  if (user !== who) return s.players.some((p) => p.id === user) ? `現在是 ${mention(who)} 在選列。` : '你不在這局遊戲中。';
  if (seq !== s.seq) return '這是上一回合的選單。';
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
        text: `👉 ${mention(o.id)} 的 ${o.card} 比所有列尾都小，請選一列收走（${ROW_MS / 1000} 秒，超時自動選牛頭最少的）`,
        options: s.rows.map((r, i) => ({ value: `row:${s.seq}:${i}`, label: `第 ${i + 1} 列（${r.length} 張 🐮${heads(r)}）` })),
      });
      startTimer(c, ROW_MS);
      return;
    }
    if (s.rows[t].length >= 5) takeRow(c, o.id, t, o.card, '是第 6 張');
    else {
      s.rows[t].push(o.card);
      pd.log.push(`${o.card} → 第 ${t + 1} 列`);
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
    text: `🏁 第 ${s.round} 輪結束：${s.players.map((p) => `${mention(p.id)} 這輪 🐮${p.roundHeads}，累積 🐮${p.total}`).join('、')}`,
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
  c.events.push(
    {
      type: 'announce',
      text: `🏆 遊戲結束，${s.winners.map(mention).join('、')} 牛頭最少獲勝！\n${ranking.map((p, i) => `${i + 1}. ${mention(p.id)} 🐮${p.total}${p.total === min ? ' 🏆' : ''}`).join('\n')}`,
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
    text: `🃏 第 ${s.round} 輪第 ${s.turn}/${HAND} 回合：按「🃏 選牌」選一張牌（${PICK_MS / 60_000} 分鐘）\n${tableText(s)}\n已選 ${s.players.length - waiting.length}/${s.players.length}${waiting.length ? `，還沒選：${waiting.map((p) => mention(p.id)).join(' ')}` : ''}`,
    options: [{ value: 'hand', label: '🃏 選牌' }],
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
      if (action.user !== s.host) return reply(c, action.user, '只有房主可以開始遊戲。');
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_NIMMT_PLAYERS) return reply(c, action.user, `目前 ${n} 人，至少需要 ${MIN_NIMMT_PLAYERS} 人才能開始。`);
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
