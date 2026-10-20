// 矮人礦坑 (Saboteur) 遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applySaboteur(state, action, rng) → { state, events }。
import { isBot, loud, mention, quiet, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';
import {
  actionCards,
  cardLabel,
  cellAt,
  cellName,
  frontier,
  GOAL_CELLS,
  glyph,
  newGrid,
  pathCards,
  place,
  placements,
  render,
  rotate,
  toolWord,
  type Card,
  type Grid,
  type Tool,
} from './saboteurCards.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/saboteur.js';

export const MIN_SABOTEUR_PLAYERS = 3;
export const MAX_SABOTEUR_PLAYERS = 10;
const TITLE = '矮人礦坑';
const ROUNDS = 3;
export const TURN_MS = 60_000;
export const PICK_MS = 30_000;

// 人數 → [破壞者, 金礦工]，總數比人數多 1 張
export const ROLE_TABLE: Record<number, [number, number]> = {
  3: [1, 3],
  4: [1, 4],
  5: [2, 4],
  6: [2, 5],
  7: [3, 5],
  8: [3, 6],
  9: [3, 7],
  10: [4, 7],
};
const handSize = (n: number) => (n <= 5 ? 6 : n <= 7 ? 5 : 4);
const GOLD_CARDS = [...Array<number>(16).fill(1), ...Array<number>(8).fill(2), ...Array<number>(4).fill(3)];

export type Role = 'digger' | 'saboteur';
const roleName = (role: Role, lang?: Lang) => tx(lang, `role.${role}`);

export interface SPlayer {
  id: string;
  role?: Role;
  hand: Card[];
  broken: Tool[];
  peeked: Record<string, boolean>; // 藏寶圖看過的終點 → 是不是金礦
  gold: number;
}

export interface SState {
  game: 'saboteur';
  channel: string;
  host: string;
  phase: 'lobby' | 'play' | 'pick' | 'ended';
  players: SPlayer[];
  round: number; // 1～3
  turn: number; // 輪到的玩家 index
  seq: number; // 每次輪到新玩家 +1：回合面板的 ref，也用來擋掉舊按鈕
  deck: Card[];
  grid: Grid;
  goldDeck: number[];
  pick?: { cards: number[]; order: string[]; at: number; log: string[] }; // 金礦工輪流挑金塊
  last?: string; // 上一步做了什麼 (面板用)
  lastActor: number; // 最後行動的玩家 index：下一回合從他的下一位開始
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang; // 開房時的頻道語系 (runGame 存進來)
}

export type SAction =
  | { type: 'new'; user: string; channel: string; lang?: Lang }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'turnMenu'; user: string; seq: number }
  | { type: 'hand'; user: string }
  | { type: 'card'; user: string; seq: number; i: number }
  | { type: 'discardMenu'; user: string; seq: number }
  | { type: 'place'; user: string; seq: number; i: number; cell: string; rot: 0 | 1 }
  | { type: 'tool'; user: string; seq: number; i: number; tool: Tool; target: string }
  | { type: 'map'; user: string; seq: number; i: number; cell: string }
  | { type: 'rock'; user: string; seq: number; i: number; cell: string }
  | { type: 'discard'; user: string; seq: number; i: number }
  | { type: 'pickGold'; user: string; seq: number; value: number }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string; lang?: Lang };

type GameAction = Exclude<SAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: SState; events: GameEvent[] };
type Ctx = { s: SState; events: GameEvent[]; rng: Rng };

const NOT_PLAYER = (s: SState) => tx(s.lang, 'notPlayer');
const NOT_YET = (s: SState) => tx(s.lang, 'notYet');
const STALE = (s: SState) => tx(s.lang, 'stale');

const find = (s: SState, id: string) => s.players.find((p) => p.id === id);
// 在私下選單上按的：回應取代那則選單；bot 不需要
const tell = (c: Ctx, to: string, text: string) => {
  if (!isBot(to)) c.events.push({ type: 'ephemeral', to, text, replace: true });
};
const deny = (c: Ctx, to: string, text: string) => (tell(c, to, text), false);
const menu = (c: Ctx, user: string, text: string, options: { value: string; label: string }[]) => {
  if (!isBot(user)) c.events.push({ type: 'prompt', kind: 'saboteur', audience: 'ephemeral', user, text, options, perRow: 5, replace: true });
  return false;
};

export function cardName(card: Card, lang?: Lang): string {
  switch (card.kind) {
    case 'path':
      return cardLabel(card, lang);
    case 'break':
      return tx(lang, 'card.break', { tool: toolWord(card.tool, lang) });
    case 'fix':
      return tx(lang, 'card.fix', { tools: card.tools.map((t) => toolWord(t, lang)).join(tx(lang, 'toolSep')) });
    case 'map':
      return tx(lang, 'card.map');
    case 'rock':
      return tx(lang, 'card.rock');
  }
}

const current = (s: SState) => s.players[s.turn];
const toolList = (tools: Tool[], lang?: Lang) => tools.map((t) => toolWord(t, lang)).join(tx(lang, 'sep'));
const playerLine = (p: SPlayer, lang?: Lang) =>
  tx(lang, 'playerLine', { who: mention(p.id), n: p.hand.length, broken: p.broken.length ? tx(lang, 'playerBroken', { tools: toolList(p.broken, lang) }) : '' });

// 回合面板：輪到的人和玩家清單用 @ 標記；ended 時拿掉按鈕
function board(s: SState, ended = false): GameEvent {
  const me = current(s);
  const lines = [
    ended ? tx(s.lang, 'turnEnded', { who: mention(me.id) }) : tx(s.lang, 'turnHead', { round: s.round, rounds: ROUNDS, who: mention(me.id), sec: TURN_MS / 1000 }),
    tx(s.lang, 'deckLeft', { n: s.deck.length }),
    '```',
    render(s.grid),
    '```',
    ...s.players.map((p) => (p === me ? `👉 ${playerLine(p, s.lang)}` : playerLine(p, s.lang))),
    ...(s.last ? [tx(s.lang, 'lastMove', { last: loud(s.last) })] : []),
  ];
  return {
    type: 'prompt',
    kind: 'saboteur',
    audience: 'channel',
    ref: `saboteur:turn:${s.seq}`,
    text: lines.join('\n'),
    options: ended ? [] : [{ value: `turnMenu:${s.seq}`, label: tx(s.lang, 'btn.play') }, { value: 'hand', label: tx(s.lang, 'btn.hand') }],
  };
}

const cellOf = (s: SState, name: string) => {
  const at = cellAt(name);
  return at ? s.grid[at.r][at.c] : null;
};
const closedGoals = (s: SState) => GOAL_CELLS.filter((name) => {
  const g = cellOf(s, name);
  return g?.kind === 'goal' && !g.open;
});
const pathCells = (s: SState) =>
  s.grid.flatMap((row, r) => row.flatMap((cell, c) => (cell?.kind === 'path' ? [{ name: cellName({ r, c }), cell }] : [])));

// 這張牌的目標：[value 的尾巴, 按鈕文字]；通道牌是位置，行動牌是玩家／終點／格子
function targets(s: SState, me: SPlayer, card: Card): { act: string; rest: string; label: string }[] {
  switch (card.kind) {
    case 'path':
      if (me.broken.length) return [];
      return placements(s.grid, card.edges).map((p) => ({ act: 'place', rest: `${p.cell}:${p.rot}`, label: p.rot ? `${p.cell} ↻` : p.cell }));
    case 'break':
      return s.players
        .filter((p) => p !== me && !p.broken.includes(card.tool))
        .map((p) => ({ act: 'tool', rest: `${card.tool}:${p.id}`, label: p.id }));
    case 'fix':
      return s.players.flatMap((p) =>
        card.tools.filter((t) => p.broken.includes(t)).map((t) => ({ act: 'tool', rest: `${t}:${p.id}`, label: `${p.id} ${toolWord(t, s.lang)}` })),
      );
    case 'map':
      return closedGoals(s).map((name) => ({ act: 'map', rest: name, label: name }));
    case 'rock':
      return pathCells(s).map(({ name, cell }) => ({ act: 'rock', rest: name, label: `${name} ${cell.dead ? 'X' : glyph(cell.edges)}` }));
  }
}

function handText(s: SState, me: SPlayer): string {
  const L = s.lang;
  const sep = tx(L, 'sep');
  const peeked = Object.entries(me.peeked).map(([cell, gold]) => tx(L, 'hand.peekItem', { cell, what: tx(L, gold ? 'gold' : 'stone') }));
  return [
    tx(L, 'hand.head', { round: s.round, rounds: ROUNDS, role: roleName(me.role!, L), gold: me.gold }),
    tx(L, 'hand.cards', { cards: me.hand.map((x) => cardName(x, L)).join(sep) || tx(L, 'none') }),
    tx(L, 'hand.broken', { tools: toolList(me.broken, L) || tx(L, 'none') }),
    ...(peeked.length ? [tx(L, 'hand.peeked', { list: peeked.join(sep) })] : []),
  ].join('\n');
}

function showHand(c: Ctx, user: string): boolean {
  const me = find(c.s, user);
  return reply(c, user, me && c.s.phase !== 'lobby' ? handText(c.s, me) : NOT_PLAYER(c.s));
}

// 輪到的人操作前的共同檢查；回傳錯誤訊息或 null
function turnCheck(s: SState, user: string, seq: number): string | null {
  if (!find(s, user)) return NOT_PLAYER(s);
  if (s.phase !== 'play' || current(s).id !== user) return NOT_YET(s);
  if (seq !== s.seq) return STALE(s);
  return null;
}

function turnMenu(c: Ctx, user: string, seq: number): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return deny(c, user, err);
  const me = current(s);
  const notes: string[] = [];
  if (me.broken.length && me.hand.some((x) => x.kind === 'path')) notes.push(tx(s.lang, 'note.broken'));
  const options: { value: string; label: string }[] = [];
  me.hand.forEach((card, i) => {
    if (targets(s, me, card).length) options.push({ value: `card:${seq}:${i}`, label: cardName(card, s.lang) });
    else if (card.kind !== 'path' || !me.broken.length) notes.push(tx(s.lang, card.kind === 'path' ? 'note.noPlace' : 'note.noTarget', { card: cardName(card, s.lang) }));
  });
  options.push({ value: `discardMenu:${seq}`, label: tx(s.lang, 'btn.discard') });
  return menu(c, user, [tx(s.lang, 'menu.turn'), handText(s, me), ...[...new Set(notes)]].join('\n'), options);
}

function cardMenu(c: Ctx, user: string, seq: number, i: number): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return deny(c, user, err);
  const me = current(s);
  const card = me.hand[i];
  const list = card ? targets(s, me, card) : [];
  if (!list.length) return deny(c, user, STALE(s));
  const hint =
    card.kind === 'path'
      ? tx(s.lang, 'hint.place', { card: cardName(card, s.lang), rot: rotate(card.edges) !== card.edges ? tx(s.lang, 'hint.rot', { glyph: glyph(rotate(card.edges)) }) : '' })
      : tx(s.lang, 'hint.action', { card: cardName(card, s.lang) });
  const options = list.map((x) => ({ value: `${x.act}:${seq}:${i}:${x.rest}`, label: x.label }));
  return menu(c, user, ['```', render(s.grid), '```', hint].join('\n'), [...options, { value: `turnMenu:${seq}`, label: tx(s.lang, 'btn.back') }]);
}

function discardMenu(c: Ctx, user: string, seq: number): boolean {
  const err = turnCheck(c.s, user, seq);
  if (err) return deny(c, user, err);
  const options = current(c.s).hand.map((card, i) => ({ value: `discard:${seq}:${i}`, label: cardName(card, c.s.lang) }));
  return menu(c, user, tx(c.s.lang, 'menu.discard'), [...options, { value: `turnMenu:${seq}`, label: tx(c.s.lang, 'btn.back') }]);
}

// 出牌前的檢查：輪到他、選單沒過期、這張牌可以打在這個目標
function playable(c: Ctx, user: string, seq: number, i: number, act: string, rest: string): boolean {
  const err = turnCheck(c.s, user, seq);
  if (err) return deny(c, user, err);
  const me = current(c.s);
  const card = me.hand[i];
  if (!card || !targets(c.s, me, card).some((x) => x.act === act && x.rest === rest)) return deny(c, user, STALE(c.s));
  return true;
}

function playPath(c: Ctx, a: Extract<SAction, { type: 'place' }>): boolean {
  if (!playable(c, a.user, a.seq, a.i, 'place', `${a.cell}:${a.rot}`)) return false;
  const s = c.s;
  const me = current(s);
  const card = me.hand.splice(a.i, 1)[0] as Extract<Card, { kind: 'path' }>;
  const edges = a.rot ? rotate(card.edges) : card.edges;
  const found = place(s.grid, cellAt(a.cell)!, edges, card.dead);
  const shown = cardLabel({ ...card, edges }, s.lang);
  tell(c, a.user, tx(s.lang, 'place.you', { cell: a.cell, card: shown }));
  for (const f of found) c.events.push({ type: 'announce', text: tx(s.lang, 'reveal', { cell: f.cell, what: tx(s.lang, f.gold ? 'goldFound' : 'stone') }) });
  const last = tx(s.lang, 'place.last', { who: quiet(me.id), cell: a.cell, card: shown });
  if (!found.some((f) => f.gold)) finishTurn(c, last);
  else {
    s.last = last;
    s.lastActor = s.turn;
    c.events.push(board(s, true));
    endRound(c, 'digger');
  }
  return true;
}

function playTool(c: Ctx, a: Extract<SAction, { type: 'tool' }>): boolean {
  if (!playable(c, a.user, a.seq, a.i, 'tool', `${a.tool}:${a.target}`)) return false;
  const me = current(c.s);
  const card = me.hand.splice(a.i, 1)[0];
  const target = find(c.s, a.target)!;
  const verb = card.kind === 'break' ? 'break' : 'fix';
  const tool = toolWord(a.tool, c.s.lang);
  target.broken = card.kind === 'break' ? [...target.broken, a.tool] : target.broken.filter((t) => t !== a.tool);
  tell(c, a.user, tx(c.s.lang, `${verb}.you`, { target: mention(target.id), tool }));
  finishTurn(c, tx(c.s.lang, `${verb}.last`, { who: quiet(me.id), target: quiet(target.id), tool }));
  return true;
}

function playMap(c: Ctx, a: Extract<SAction, { type: 'map' }>): boolean {
  if (!playable(c, a.user, a.seq, a.i, 'map', a.cell)) return false;
  const me = current(c.s);
  me.hand.splice(a.i, 1);
  const goal = cellOf(c.s, a.cell) as Extract<Grid[number][number], { kind: 'goal' }>;
  me.peeked[a.cell] = goal.gold;
  tell(c, a.user, tx(c.s.lang, 'map.you', { cell: a.cell, what: tx(c.s.lang, goal.gold ? 'gold' : 'stone') }));
  finishTurn(c, tx(c.s.lang, 'map.last', { who: quiet(me.id), cell: a.cell }));
  return true;
}

function playRock(c: Ctx, a: Extract<SAction, { type: 'rock' }>): boolean {
  if (!playable(c, a.user, a.seq, a.i, 'rock', a.cell)) return false;
  const me = current(c.s);
  me.hand.splice(a.i, 1);
  const { r, c: col } = cellAt(a.cell)!;
  c.s.grid[r][col] = null;
  tell(c, a.user, tx(c.s.lang, 'rock.you', { cell: a.cell }));
  finishTurn(c, tx(c.s.lang, 'rock.last', { who: quiet(me.id), cell: a.cell }));
  return true;
}

function discard(c: Ctx, user: string, seq: number, i: number): boolean {
  const err = turnCheck(c.s, user, seq);
  if (err) return deny(c, user, err);
  const me = current(c.s);
  if (!me.hand[i]) return deny(c, user, STALE(c.s));
  me.hand.splice(i, 1);
  tell(c, user, tx(c.s.lang, 'discard.you'));
  finishTurn(c, tx(c.s.lang, 'discard.last', { who: quiet(me.id) }));
  return true;
}

// 出完牌：抽一張、收掉這次的面板、輪到下一位有手牌的人
function finishTurn(c: Ctx, last: string) {
  const s = c.s;
  const me = current(s);
  if (s.deck.length) me.hand.push(s.deck.shift()!);
  s.last = last;
  s.lastActor = s.turn;
  c.events.push(board(s, true));
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const next = (s.turn + k) % n;
    if (s.players[next].hand.length) {
      s.turn = next;
      return beginTurn(c);
    }
  }
  endRound(c, 'saboteur'); // 牌庫空了而且所有人的手牌都出完
}

// 破壞者獲勝時每人拿的金塊：1 人 4、2～3 人各 3、4 人各 2
const saboteurPay = (k: number) => (k === 1 ? 4 : k <= 3 ? 3 : 2);

function endRound(c: Ctx, winner: Role) {
  const s = c.s;
  for (const row of s.grid) for (const cell of row) if (cell?.kind === 'goal') cell.open = true;
  const L = s.lang;
  const roles = s.players.map((p) => `${quiet(p.id)} ${roleName(p.role!, L)}`).join(tx(L, 'sep'));
  const headline = tx(L, `headline.${winner}`);
  c.events.push({ type: 'announce', text: [tx(L, 'roundEnd', { round: s.round, rounds: ROUNDS, headline }), tx(L, 'roles', { roles }), '```', render(s.grid), '```'].join('\n') });
  if (winner === 'digger') return startPick(c);
  const saboteurs = s.players.filter((p) => p.role === 'saboteur');
  if (!saboteurs.length) c.events.push({ type: 'announce', text: tx(L, 'noSaboteur') });
  else {
    const pay = saboteurPay(saboteurs.length);
    for (const p of saboteurs) p.gold += pay;
    c.events.push({ type: 'announce', text: tx(L, 'saboteurPay', { who: saboteurs.map((p) => quiet(p.id)).join(tx(L, 'sep')), pay }) });
  }
  finishRound(c);
}

// 抽玩家人數張金塊牌；從挖到的人開始 (他是破壞者就從下一位金礦工開始)，金礦工依座位輪流挑
function startPick(c: Ctx) {
  const s = c.s;
  const n = s.players.length;
  const order = Array.from({ length: n }, (_, k) => s.players[(s.lastActor + k) % n]).filter((p) => p.role === 'digger').map((p) => p.id);
  const cards = s.goldDeck.splice(0, n).sort((a, b) => b - a);
  s.phase = 'pick';
  s.pick = { cards, order, at: 0, log: [] };
  pickPrompt(c);
}

const picker = (s: SState) => s.pick!.order[s.pick!.at % s.pick!.order.length];

function pickPrompt(c: Ctx) {
  const s = c.s;
  const { cards, log } = s.pick!;
  s.seq++;
  const done = !cards.length;
  const L = s.lang;
  const lines = [
    tx(L, 'pick.head', { rest: done ? tx(L, 'pick.done') : tx(L, 'pick.left', { cards: cards.join(tx(L, 'sep')) }) }),
    ...log,
    ...(done ? [] : [tx(L, 'pick.turn', { who: mention(picker(s)), sec: PICK_MS / 1000 })]),
  ];
  const options = [...new Set(cards)].map((v) => ({ value: `gold:${s.seq}:${v}`, label: tx(L, 'btn.gold', { v }) }));
  c.events.push({ type: 'prompt', kind: 'saboteur', audience: 'channel', ref: `saboteur:gold:${s.round}`, text: lines.join('\n'), options });
  if (done) return finishRound(c);
  startTimer(c, PICK_MS);
}

function takeGold(c: Ctx, user: string, value: number) {
  const s = c.s;
  const pick = s.pick!;
  pick.cards.splice(pick.cards.indexOf(value), 1);
  find(s, user)!.gold += value;
  pick.log.push(tx(s.lang, 'pick.log', { who: quiet(user), v: value }));
  pick.at++;
  pickPrompt(c);
}

function pickGold(c: Ctx, user: string, seq: number, value: number): boolean {
  const s = c.s;
  if (!find(s, user)) return reply(c, user, NOT_PLAYER(s));
  if (s.phase !== 'pick' || picker(s) !== user) return reply(c, user, NOT_YET(s));
  if (seq !== s.seq || !s.pick!.cards.includes(value)) return reply(c, user, tx(s.lang, 'expired'));
  takeGold(c, user, value);
  return true;
}

function finishRound(c: Ctx) {
  const s = c.s;
  s.pick = undefined;
  s.phase = 'play';
  c.events.push({ type: 'announce', text: tx(s.lang, 'totals', { list: s.players.map((p) => `${quiet(p.id)} ${p.gold}`).join(tx(s.lang, 'sep')) }) });
  if (s.round < ROUNDS) startRound(c, (s.lastActor + 1) % s.players.length);
  else endGame(c);
}

// 金塊最多的人贏，同分並列
function endGame(c: Ctx) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  const top = Math.max(...s.players.map((p) => p.gold));
  s.winners = s.players.filter((p) => p.gold === top).map((p) => p.id);
  const ranking = [...s.players].sort((a, b) => b.gold - a.gold);
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.winners });
  c.events.push(
    {
      type: 'announce',
      text: [
        tx(s.lang, 'gameOver', { who: s.winners.map(mention).join(tx(s.lang, 'sep')) }),
        ...ranking.map((p, i) => tx(s.lang, 'rankLine', { i: i + 1, who: mention(p.id), gold: p.gold, top: p.gold === top ? ' 🏆' : '' })),
      ].join('\n'),
      gif: 'goodWin',
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

function timeout(c: Ctx) {
  if (c.s.phase === 'pick') return takeGold(c, picker(c.s), c.s.pick!.cards[0]);
  const me = current(c.s);
  me.hand.shift();
  finishTurn(c, tx(c.s.lang, 'timeout.last', { who: quiet(me.id) }));
}

function startRound(c: Ctx, first: number) {
  const s = c.s;
  const n = s.players.length;
  const [saboteurs, diggers] = ROLE_TABLE[n];
  const roles = shuffle([...Array<Role>(saboteurs).fill('saboteur'), ...Array<Role>(diggers).fill('digger')], c.rng);
  s.round++;
  s.deck = shuffle([...pathCards(), ...actionCards()], c.rng);
  s.grid = newGrid(Math.floor(c.rng() * 3));
  s.last = undefined;
  s.players.forEach((p, i) => Object.assign(p, { role: roles[i], hand: s.deck.splice(0, handSize(n)), broken: [], peeked: {} }));
  c.events.push({ type: 'announce', text: tx(s.lang, 'roundStart', { round: s.round, rounds: ROUNDS, n: handSize(n) }) });
  for (const p of s.players) if (!isBot(p.id)) c.events.push({ type: 'dm', to: p.id, text: tx(s.lang, 'yourRole', { round: s.round, rounds: ROUNDS, role: roleName(p.role!, s.lang) }) });
  s.turn = first;
  beginTurn(c);
}

function beginTurn(c: Ctx) {
  const s = c.s;
  s.seq++;
  c.events.push(board(s));
  startTimer(c, TURN_MS);
}

// ---------- bot ----------

// bot 知道的金礦位置：偷看過或已翻開
const knownGold = (s: SState, me: SPlayer) =>
  GOAL_CELLS.find((name) => {
    const g = cellOf(s, name);
    return me.peeked[name] || (g?.kind === 'goal' && g.open && g.gold);
  });

// 目標終點：知道金礦就是金礦；否則是還蓋著、沒被看出是石頭的最上面一張
export function targetGoal(s: SState, me: SPlayer): string {
  return knownGold(s, me) ?? closedGoals(s).find((name) => me.peeked[name] !== false) ?? 'K5';
}

const dist = (a: { r: number; c: number }, b: { r: number; c: number }) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
const frontDist = (grid: Grid, goal: { r: number; c: number }) => Math.min(Infinity, ...frontier(grid).map((p) => dist(p, goal)));

// bot 這一步要做什麼 (回傳和真人按按鈕一樣的 action)
export function botMove(s: SState, me: SPlayer): SAction {
  const base = { user: me.id, seq: s.seq };
  const goal = cellAt(targetGoal(s, me))!;
  const hand = me.hand.map((card, i) => ({ card, i }));
  const discardAt = (i: number): SAction => ({ type: 'discard', ...base, i });
  // 通道牌的所有放法，依手牌、位置、方向的順序
  const moves = (dead: boolean) =>
    me.broken.length
      ? []
      : hand.flatMap(({ card, i }) =>
          card.kind === 'path' && card.dead === dead ? placements(s.grid, card.edges).map((p) => ({ ...p, i, card })) : [],
        );
  const best = <T>(list: T[], score: (x: T) => number) => list.reduce<{ x: T; v: number } | undefined>((b, x) => {
    const v = score(x);
    return !b || v < b.v ? { x, v } : b;
  }, undefined);

  if (me.role === 'digger') {
    for (const { card, i } of hand) {
      const tool = card.kind === 'fix' ? card.tools.find((t) => me.broken.includes(t)) : undefined;
      if (tool) return { type: 'tool', ...base, i, tool, target: me.id };
    }
    const now = frontDist(s.grid, goal);
    const dig = best(moves(false), (m) => {
      const grid = structuredClone(s.grid);
      const found = place(grid, cellAt(m.cell)!, m.rot ? rotate(m.card.edges) : m.card.edges, false);
      return found.some((f) => f.gold) ? -1 : frontDist(grid, goal);
    });
    if (dig && dig.v < now) return { type: 'place', ...base, i: dig.x.i, cell: dig.x.cell, rot: dig.x.rot };
    const map = hand.find(({ card }) => card.kind === 'map');
    if (map && !knownGold(s, me)) return { type: 'map', ...base, i: map.i, cell: cellName(goal) };
    return discardAt(hand.find(({ card }) => card.kind === 'path' && card.dead)?.i ?? 0);
  }

  const block = best(moves(true), (m) => dist(cellAt(m.cell)!, goal));
  if (block) return { type: 'place', ...base, i: block.x.i, cell: block.x.cell, rot: block.x.rot };
  const n = s.players.length;
  const seat = s.players.indexOf(me);
  for (const { card, i } of hand) {
    if (card.kind !== 'break') continue;
    for (let k = 1; k < n; k++) {
      const p = s.players[(seat + k) % n];
      if (!p.broken.includes(card.tool)) return { type: 'tool', ...base, i, tool: card.tool, target: p.id };
    }
  }
  const rock = hand.find(({ card }) => card.kind === 'rock');
  const near = best(
    pathCells(s).filter(({ name, cell }) => !cell.dead && dist(cellAt(name)!, goal) <= 3),
    ({ name }) => dist(cellAt(name)!, goal),
  );
  if (rock && near) return { type: 'rock', ...base, i: rock.i, cell: near.x.name };
  return discardAt(0);
}

// state 有變之後：輪到 bot 就讓它行動，直到輪到真人或遊戲結束
function botsAct(c: Ctx) {
  for (let guard = 0; guard < 1000; guard++) {
    const s = c.s;
    if (s.phase === 'pick' && isBot(picker(s))) takeGold(c, picker(s), s.pick!.cards[0]);
    else if (s.phase === 'play' && isBot(current(s).id)) {
      const me = current(s);
      // 防禦：策略算出的動作萬一被拒，改成蓋掉第一張，不會卡住
      if (!handle(c, botMove(s, me) as GameAction)) discard(c, me.id, s.seq, 0);
    }
    else return;
  }
}

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, tx(s.lang, 'onlyHostStart'));
  if (s.phase !== 'lobby') return false;
  const n = s.players.length;
  if (n < MIN_SABOTEUR_PLAYERS) return reply(c, user, tx(s.lang, 'tooFew', { n, min: MIN_SABOTEUR_PLAYERS }));
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'play' }));
  for (const p of s.players) Object.assign(p, newPlayer(p.id));
  Object.assign(s, { phase: 'play', round: 0, goldDeck: shuffle(GOLD_CARDS, c.rng) });
  const players = s.players.map((p) => mention(p.id)).join(tx(s.lang, 'sep'));
  c.events.push({ type: 'announce', text: tx(s.lang, 'started', { players, rules: tx(s.lang, 'rules', { rounds: ROUNDS }) }) });
  startRound(c, Math.floor(c.rng() * n));
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_SABOTEUR_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_SABOTEUR_PLAYERS, newPlayer);
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user);
    case 'hand':
      return showHand(c, action.user);
    case 'turnMenu':
      return turnMenu(c, action.user, action.seq);
    case 'card':
      return cardMenu(c, action.user, action.seq, action.i);
    case 'discardMenu':
      return discardMenu(c, action.user, action.seq);
    case 'place':
      return playPath(c, action);
    case 'tool':
      return playTool(c, action);
    case 'map':
      return playMap(c, action);
    case 'rock':
      return playRock(c, action);
    case 'discard':
      return discard(c, action.user, action.seq, action.i);
    case 'pickGold':
      return pickGold(c, action.user, action.seq, action.value);
    case 'timeout':
      if (action.id !== c.s.timers.phase) return false;
      timeout(c);
      return true;
    default:
      return false;
  }
}

const newPlayer = (id: string): SPlayer => ({ id, hand: [], broken: [], peeked: {}, gold: 0 });

export function applySaboteur(state: SState | undefined, action: SAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
    afterChange: botsAct,
  });
}

function createLobby(prev: SState | undefined, host: string, channel: string): Result {
  const created: SState = {
    game: 'saboteur',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    round: 0,
    turn: 0,
    seq: prev?.seq ?? 0,
    deck: [],
    grid: newGrid(0),
    goldDeck: [],
    lastActor: 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
