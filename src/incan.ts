// 印加寶藏 (Incan Gold) 遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyIncan(state, action, rng) → { state, events }。
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/incan.js';

export const MIN_INCAN_PLAYERS = 3;
export const MAX_INCAN_PLAYERS = 8;
const TITLE = '印加寶藏';
const TEMPLES = 5;
export const CHOOSE_MS = 30_000;

export const HAZARDS = ['spider', 'snake', 'fire', 'rock', 'mummy'] as const;
export type Hazard = (typeof HAZARDS)[number];
export type Card = `gem:${number}` | Hazard | 'relic';

const GEMS = [1, 2, 3, 4, 5, 5, 7, 7, 9, 11, 11, 13, 14, 15, 17];

// 探險卡 30 張 (不含神器)：寶藏依寶石數、危險每種 3 張
export const newDeck = (): Card[] => [...GEMS.map((n) => `gem:${n}` as Card), ...HAZARDS.flatMap((h) => [h, h, h])];

const gemsOf = (card: Card) => (card.startsWith('gem:') ? Number(card.slice(4)) : 0);
const isHazard = (card: Card): card is Hazard => (HAZARDS as readonly string[]).includes(card);
const hazardName = (lang: Lang | undefined, h: Hazard) => tx(lang, h);
export const cardName = (card: Card, lang?: Lang) =>
  card === 'relic' ? tx(lang, 'relic') : isHazard(card) ? hazardName(lang, card) : tx(lang, gemsOf(card) === 1 ? 'gem' : 'gems', { n: gemsOf(card) });

export interface IPlayer {
  id: string;
  tent: number; // 帳篷裡的寶石
  relics: number[]; // 帶回的神器分數 (5 或 10)
  carry: number; // 這座神殿拿到、還沒帶回的寶石
  inCave: boolean;
  choice?: 'go' | 'camp';
  auto?: boolean; // 這一步是逾時自動回營
}

export interface IState {
  game: 'incan';
  channel: string;
  host: string;
  phase: 'lobby' | 'choose' | 'ended';
  players: IPlayer[];
  temple: number; // 第幾座神殿 (1～5)
  step: number; // 這座神殿第幾步
  seq: number; // 全局步數：步驟訊息的 ref，也用來擋掉舊按鈕
  deck: Card[]; // deck[0] 是下一張
  revealed: Card[]; // 這座神殿翻開的牌 (路上的牌，依翻開順序)
  seen: Hazard[]; // 這座神殿出現過的危險
  path: number; // 路上剩餘寶石
  pathRelics: number; // 路上的神器數
  relicsTaken: number; // 全局已被帶回營地的神器數 (決定 5 或 10 分)
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang;
}

export type IAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'choose'; user: string; seq: number; choice: 'go' | 'camp' }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<IAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: IState; events: GameEvent[] };
type Ctx = { s: IState; events: GameEvent[]; rng: Rng };

const inCave = (s: IState) => s.players.filter((p) => p.inCave);

const choiceName = (s: IState, choice: 'go' | 'camp') => tx(s.lang, choice);
const list = (s: IState, xs: string[]) => xs.join(tx(s.lang, 'sep'));

// 步驟訊息：揭曉前不顯示任何人的選擇；任何時候都不顯示帳篷
function board(s: IState, revealed = false): GameEvent {
  const cave = inCave(s);
  const waiting = cave.filter((p) => !p.choice);
  const camp = s.players.filter((p) => !p.inCave);
  const last = s.revealed[s.revealed.length - 1];
  const none = tx(s.lang, 'none');
  const lines = [
    tx(s.lang, 'boardHead', { temple: s.temple, temples: TEMPLES, step: s.step, card: cardName(last, s.lang) }),
    tx(s.lang, 'boardPath', { cards: s.revealed.map((card) => cardName(card, s.lang)).join(' → ') }),
    tx(s.lang, 'boardStatus', { path: s.path, relics: s.pathRelics, hazards: list(s, s.seen.map((h) => hazardName(s.lang, h))) || none, deck: s.deck.length }),
    tx(s.lang, 'boardCave', { list: list(s, cave.map((p) => tx(s.lang, 'caveEntry', { who: mention(p.id), n: p.carry }))) }),
    tx(s.lang, 'boardCamp', { list: list(s, camp.map((p) => mention(p.id))) || none }),
    revealed
      ? tx(s.lang, 'revealLine', { list: list(s, cave.map((p) => `${mention(p.id)} ${choiceName(s, p.choice!)}${p.auto ? tx(s.lang, 'autoCamp') : ''}`)) })
      : tx(s.lang, 'waitLine', {
          done: cave.length - waiting.length,
          total: cave.length,
          waiting: waiting.length ? tx(s.lang, 'waiting', { list: waiting.map((p) => mention(p.id)).join(' ') }) : '',
          secs: CHOOSE_MS / 1000,
        }),
  ];
  return {
    type: 'prompt',
    kind: 'incan',
    audience: 'channel',
    ref: `incan:${s.seq}`,
    text: lines.join('\n'),
    options: revealed
      ? []
      : [
          { value: `go:${s.seq}`, label: choiceName(s, 'go') },
          { value: `camp:${s.seq}`, label: choiceName(s, 'camp') },
        ],
  };
}

function startTemple(c: Ctx) {
  const s = c.s;
  s.temple++;
  s.step = 0;
  s.deck = shuffle([...s.deck, 'relic'], c.rng);
  Object.assign(s, { revealed: [], seen: [], path: 0, pathRelics: 0 });
  for (const p of s.players) Object.assign(p, { carry: 0, inCave: true, choice: undefined, auto: false });
  c.events.push({ type: 'announce', text: tx(s.lang, 'templeStart', { temple: s.temple, temples: TEMPLES, deck: s.deck.length }) });
  nextStep(c);
}

// 翻一張牌
function nextStep(c: Ctx) {
  const s = c.s;
  const cave = inCave(s);
  // 照原版牌數不會發生，防禦用
  if (!s.deck.length) {
    c.events.push({ type: 'announce', text: tx(s.lang, 'deckOut') });
    settle(c, cave);
    return endTemple(c);
  }
  const card = s.deck.shift()!;
  s.step++;
  s.seq++;
  if (isHazard(card) && s.seen.includes(card)) return fail(c, card);
  s.revealed.push(card);
  if (card === 'relic') s.pathRelics++;
  else if (isHazard(card)) s.seen.push(card);
  else {
    const share = Math.floor(gemsOf(card) / cave.length);
    for (const p of cave) p.carry += share;
    s.path += gemsOf(card) - share * cave.length;
  }
  for (const p of s.players) Object.assign(p, { choice: undefined, auto: false });
  for (const p of inCave(s)) if (isBot(p.id)) p.choice = botChoice(s, p);
  c.events.push(board(s));
  startTimer(c, CHOOSE_MS);
  if (inCave(s).every((p) => p.choice)) reveal(c);
}

// 危險率：牌庫中這座神殿已出現過的危險種類剩下的張數 ÷ 牌庫張數
export function hazardRisk(s: IState): number {
  if (!s.deck.length) return 0;
  return s.deck.filter((card) => isHazard(card) && s.seen.includes(card)).length / s.deck.length;
}

// bot 依序判斷：獨自一人且路上有神器、危險率 ≥ 0.2、拿了 10 顆以上又有危險 → 回營地；其他繼續探險
export function botChoice(s: IState, me: IPlayer): 'go' | 'camp' {
  const risk = hazardRisk(s);
  if (inCave(s).length === 1 && s.pathRelics > 0) return 'camp';
  if (risk >= 0.2) return 'camp';
  if (me.carry >= 10 && risk > 0) return 'camp';
  return 'go';
}

function choose(c: Ctx, user: string, seq: number, choice: 'go' | 'camp'): boolean {
  const s = c.s;
  const me = s.players.find((p) => p.id === user);
  if (!me) return reply(c, user, tx(s.lang, 'notPlayer'));
  if (s.phase !== 'choose') return reply(c, user, tx(s.lang, 'notStarted'));
  if (!me.inCave) return reply(c, user, tx(s.lang, 'alreadyCamp'));
  if (seq !== s.seq) return reply(c, user, tx(s.lang, 'expired'));
  const first = !me.choice;
  me.choice = choice;
  c.events.push({ type: 'ephemeral', to: user, text: tx(s.lang, 'chose', { choice: choiceName(s, choice) }) });
  if (inCave(s).every((p) => p.choice)) reveal(c);
  else if (first) c.events.push(board(s));
  return true;
}

// 時間到：沒選的真人一律回營地
function timeout(c: Ctx) {
  for (const p of inCave(c.s)) if (!p.choice) Object.assign(p, { choice: 'camp', auto: true });
  reveal(c);
}

function reveal(c: Ctx) {
  const s = c.s;
  c.events.push(board(s, true));
  settle(c, inCave(s).filter((p) => p.choice === 'camp'));
  if (inCave(s).length) nextStep(c);
  else endTemple(c);
}

// 回營：平分路上的寶石 (餘數留在路上)，連同這座神殿的寶石放進帳篷；恰好一人回營才拿走路上的神器
function settle(c: Ctx, campers: IPlayer[]) {
  const s = c.s;
  if (!campers.length) return;
  const share = Math.floor(s.path / campers.length);
  s.path -= share * campers.length;
  for (const p of campers) Object.assign(p, { tent: p.tent + p.carry + share, carry: 0, inCave: false });
  const lines = [tx(s.lang, 'settle', { who: list(s, campers.map((p) => mention(p.id))), share, path: s.path })];
  if (campers.length === 1 && s.pathRelics) {
    const got = Array.from({ length: s.pathRelics }, () => (s.relicsTaken++ < 3 ? 5 : 10));
    campers[0].relics.push(...got);
    s.pathRelics = 0;
    lines.push(tx(s.lang, 'relicTaken', { who: mention(campers[0].id), n: got.length, points: got.join(tx(s.lang, 'plus')) }));
  } else if (s.pathRelics) lines.push(tx(s.lang, 'relicLeft', { n: s.pathRelics }));
  c.events.push({ type: 'announce', text: lines.join('\n') });
}

// 同種危險第二張：洞裡的人失去這座神殿的寶石，這張危險移出這局 (不放回 revealed)
function fail(c: Ctx, hazard: Hazard) {
  const s = c.s;
  const cave = inCave(s);
  for (const p of cave) p.carry = 0;
  c.events.push({ type: 'announce', text: tx(s.lang, 'fail', { hazard: hazardName(s.lang, hazard), who: list(s, cave.map((p) => mention(p.id))) }) });
  endTemple(c);
}

const scoreOf = (p: IPlayer) => p.tent + p.relics.reduce((a, b) => a + b, 0);

// 神殿結束：路上的神器移出這局，其他翻開的牌洗回牌庫
function endTemple(c: Ctx) {
  const s = c.s;
  const lost = s.pathRelics ? tx(s.lang, 'relicLost', { n: s.pathRelics }) : '';
  s.deck.push(...s.revealed.filter((card) => card !== 'relic'));
  s.pathRelics = 0;
  c.events.push({ type: 'announce', text: tx(s.lang, 'templeEnd', { temple: s.temple, temples: TEMPLES, lost }) });
  for (const p of s.players) {
    if (!isBot(p.id)) c.events.push({ type: 'ephemeral', to: p.id, text: tx(s.lang, 'tent', { gems: p.tent, relics: p.relics.length, score: scoreOf(p) }) });
  }
  if (s.temple < TEMPLES) startTemple(c);
  else endGame(c);
}

// 總分最高的贏；同分比神器張數，再一樣就並列
function endGame(c: Ctx) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  const ranking = [...s.players].sort((a, b) => scoreOf(b) - scoreOf(a) || b.relics.length - a.relics.length);
  const top = ranking[0];
  const won = (p: IPlayer) => scoreOf(p) === scoreOf(top) && p.relics.length === top.relics.length;
  s.winners = s.players.filter(won).map((p) => p.id);
  const relicPoints = (p: IPlayer) => scoreOf(p) - p.tent;
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.winners });
  c.events.push(
    {
      type: 'announce',
      text: [
        tx(s.lang, 'winner', { who: list(s, s.winners.map(mention)) }),
        ...ranking.map((p, i) =>
          tx(s.lang, 'rankLine', { rank: i + 1, who: mention(p.id), score: scoreOf(p), gems: p.tent, relics: p.relics.length, relicPoints: relicPoints(p), crown: won(p) ? ' 🏆' : '' }),
        ),
      ].join('\n'),
      gif: 'goodWin',
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: tx(s.lang, 'rematch'), options: [{ value: 'rematch', label: tx(s.lang, 'rematchBtn') }] },
  );
}

const rules = (lang: Lang | undefined) =>
  (['rules1', 'rules2', 'rules3', 'rules4'] as const).map((k) => tx(lang, k, { temples: TEMPLES, secs: CHOOSE_MS / 1000 })).join('\n');

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, tx(s.lang, 'onlyHostStart'));
  if (s.phase !== 'lobby') return false;
  const n = s.players.length;
  if (n < MIN_INCAN_PLAYERS) return reply(c, user, tx(s.lang, 'tooFew', { n, min: MIN_INCAN_PLAYERS }));
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'choose' }));
  for (const p of s.players) Object.assign(p, newPlayer(p.id));
  Object.assign(s, { phase: 'choose', deck: newDeck(), temple: 0, relicsTaken: 0 });
  c.events.push({ type: 'announce', text: tx(s.lang, 'startAnn', { players: list(s, s.players.map((p) => mention(p.id))), rules: rules(s.lang) }) });
  startTemple(c);
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_INCAN_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_INCAN_PLAYERS, newPlayer);
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user);
    case 'choose':
      return choose(c, action.user, action.seq, action.choice);
    case 'timeout':
      if (action.id !== c.s.timers.phase || c.s.phase !== 'choose') return false;
      timeout(c);
      return true;
    default:
      return false;
  }
}

const newPlayer = (id: string): IPlayer => ({ id, tent: 0, relics: [], carry: 0, inCave: false });

export function applyIncan(state: IState | undefined, action: IAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
  });
}

function createLobby(prev: IState | undefined, host: string, channel: string): Result {
  const created: IState = {
    game: 'incan',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    temple: 0,
    step: 0,
    seq: prev?.seq ?? 0,
    deck: [],
    revealed: [],
    seen: [],
    path: 0,
    pathRelics: 0,
    relicsTaken: 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
