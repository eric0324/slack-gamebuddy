// 印加寶藏 (Incan Gold) 遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyIncan(state, action, rng) → { state, events }。
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';

export const MIN_INCAN_PLAYERS = 3;
export const MAX_INCAN_PLAYERS = 8;
const TITLE = '印加寶藏';
const TEMPLES = 5;
export const CHOOSE_MS = 30_000;

export const HAZARDS = ['spider', 'snake', 'fire', 'rock', 'mummy'] as const;
export type Hazard = (typeof HAZARDS)[number];
export type Card = `gem:${number}` | Hazard | 'relic';

const GEMS = [1, 2, 3, 4, 5, 5, 7, 7, 9, 11, 11, 13, 14, 15, 17];
const HAZARD_NAME: Record<Hazard, string> = { spider: '🕷️ 蜘蛛', snake: '🐍 毒蛇', fire: '🔥 火焰', rock: '🪨 落石', mummy: '🧟 木乃伊' };

// 探險卡 30 張 (不含神器)：寶藏依寶石數、危險每種 3 張
export const newDeck = (): Card[] => [...GEMS.map((n) => `gem:${n}` as Card), ...HAZARDS.flatMap((h) => [h, h, h])];

const gemsOf = (card: Card) => (card.startsWith('gem:') ? Number(card.slice(4)) : 0);
const isHazard = (card: Card): card is Hazard => (HAZARDS as readonly string[]).includes(card);
export const cardName = (card: Card) => (card === 'relic' ? '🏺 神器' : isHazard(card) ? HAZARD_NAME[card] : `💎 ${gemsOf(card)} 顆寶石`);

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

const CHOICE_NAME = { go: '🔦 繼續探險', camp: '⛺ 回營地' } as const;

// 步驟訊息：揭曉前不顯示任何人的選擇；任何時候都不顯示帳篷
function board(s: IState, revealed = false): GameEvent {
  const cave = inCave(s);
  const waiting = cave.filter((p) => !p.choice);
  const camp = s.players.filter((p) => !p.inCave);
  const last = s.revealed[s.revealed.length - 1];
  const lines = [
    `💎 第 ${s.temple}/${TEMPLES} 座神殿第 ${s.step} 步：翻到 ${cardName(last)}`,
    `🛤️ 路上的牌：${s.revealed.map(cardName).join(' → ')}`,
    `路上剩 ${s.path} 顆寶石、神器 ${s.pathRelics} 個｜已出現危險：${s.seen.map((h) => HAZARD_NAME[h]).join('、') || '(無)'}｜牌庫剩 ${s.deck.length} 張`,
    `🔦 洞裡：${cave.map((p) => `${mention(p.id)} ${p.carry} 顆`).join('、')}`,
    `⛺ 營地：${camp.map((p) => mention(p.id)).join('、') || '(無)'}`,
    revealed
      ? `揭曉：${cave.map((p) => `${mention(p.id)} ${CHOICE_NAME[p.choice!]}${p.auto ? ' (逾時，自動回營)' : ''}`).join('、')}`
      : `已選 ${cave.length - waiting.length}/${cave.length}${waiting.length ? `，還沒選：${waiting.map((p) => mention(p.id)).join(' ')}` : ''} (${CHOOSE_MS / 1000} 秒)`,
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
          { value: `go:${s.seq}`, label: CHOICE_NAME.go },
          { value: `camp:${s.seq}`, label: CHOICE_NAME.camp },
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
  c.events.push({ type: 'announce', text: `🏛️ 第 ${s.temple}/${TEMPLES} 座神殿開始！牌庫加入 1 個神器，共 ${s.deck.length} 張。` });
  nextStep(c);
}

// 翻一張牌
function nextStep(c: Ctx) {
  const s = c.s;
  const cave = inCave(s);
  // 照原版牌數不會發生，防禦用
  if (!s.deck.length) {
    c.events.push({ type: 'announce', text: '🃏 牌庫翻完了，洞裡的人全部回營地。' });
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

const NOT_PLAYER = '你不在這局遊戲裡。';

function choose(c: Ctx, user: string, seq: number, choice: 'go' | 'camp'): boolean {
  const s = c.s;
  const me = s.players.find((p) => p.id === user);
  if (!me) return reply(c, user, NOT_PLAYER);
  if (s.phase !== 'choose') return reply(c, user, '遊戲還沒開始。');
  if (!me.inCave) return reply(c, user, '你已經回營地了。');
  if (seq !== s.seq) return reply(c, user, '這個按鈕已經過期了。');
  const first = !me.choice;
  me.choice = choice;
  c.events.push({ type: 'ephemeral', to: user, text: `你選了 ${CHOICE_NAME[choice]} (揭曉前可以改)` });
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
  const lines = [`⛺ ${campers.map((p) => mention(p.id)).join('、')} 回營地，每人從路上分到 ${share} 顆寶石 (路上剩 ${s.path} 顆)。`];
  if (campers.length === 1 && s.pathRelics) {
    const got = Array.from({ length: s.pathRelics }, () => (s.relicsTaken++ < 3 ? 5 : 10));
    campers[0].relics.push(...got);
    s.pathRelics = 0;
    lines.push(`🏺 ${mention(campers[0].id)} 一人回營，帶走 ${got.length} 個神器 (${got.join('＋')} 分)！`);
  } else if (s.pathRelics) lines.push(`🏺 不只一人回營，路上的 ${s.pathRelics} 個神器沒人拿。`);
  c.events.push({ type: 'announce', text: lines.join('\n') });
}

// 同種危險第二張：洞裡的人失去這座神殿的寶石，這張危險移出這局 (不放回 revealed)
function fail(c: Ctx, hazard: Hazard) {
  const cave = inCave(c.s);
  for (const p of cave) p.carry = 0;
  c.events.push({ type: 'announce', text: `💥 又是 ${HAZARD_NAME[hazard]}！探險失敗，${cave.map((p) => mention(p.id)).join('、')} 空手而回。這張 ${HAZARD_NAME[hazard]} 移出這局。` });
  endTemple(c);
}

const scoreOf = (p: IPlayer) => p.tent + p.relics.reduce((a, b) => a + b, 0);

// 神殿結束：路上的神器移出這局，其他翻開的牌洗回牌庫
function endTemple(c: Ctx) {
  const s = c.s;
  const lost = s.pathRelics ? `路上 ${s.pathRelics} 個神器沒人拿走，移出這局。` : '';
  s.deck.push(...s.revealed.filter((card) => card !== 'relic'));
  s.pathRelics = 0;
  c.events.push({ type: 'announce', text: `🏛️ 第 ${s.temple}/${TEMPLES} 座神殿結束。${lost}` });
  for (const p of s.players) {
    if (!isBot(p.id)) c.events.push({ type: 'ephemeral', to: p.id, text: `你的帳篷：${p.tent} 顆寶石、神器 ${p.relics.length} 個，共 ${scoreOf(p)} 分` });
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
        `🏆 遊戲結束，${s.winners.map(mention).join('、')} 獲勝！`,
        ...ranking.map((p, i) => `${i + 1}. ${mention(p.id)} ${scoreOf(p)} 分 (寶石 ${p.tent}、神器 ${p.relics.length} 個 ${relicPoints(p)} 分)${won(p) ? ' 🏆' : ''}`),
      ].join('\n'),
      gif: 'goodWin',
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

const RULES = [
  `共 ${TEMPLES} 座神殿。每一步翻一張探險卡，洞裡的人同時私下選「🔦 繼續探險」或「⛺ 回營地」(${CHOOSE_MS / 1000} 秒，沒選視為回營地)。`,
  '💎 寶藏：洞裡的人平分，餘數留在路上｜⛺ 回營的人平分路上剩下的寶石，連同這座神殿拿到的寶石放進帳篷；恰好一人回營才拿到路上的 🏺 神器',
  '⚠️ 同種危險出現第二張，洞裡的人失去這座神殿的寶石。',
  `${TEMPLES} 座神殿後帳篷寶石加神器分數最高的人贏 (神器：前 3 個各 5 分、第 4、5 個各 10 分)，同分比神器多。`,
].join('\n');

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, '只有房主可以開始遊戲。');
  if (s.phase !== 'lobby') return false;
  const n = s.players.length;
  if (n < MIN_INCAN_PLAYERS) return reply(c, user, `目前 ${n} 人，至少需要 ${MIN_INCAN_PLAYERS} 人才能開始。`);
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'choose' }));
  for (const p of s.players) Object.assign(p, newPlayer(p.id));
  Object.assign(s, { phase: 'choose', deck: newDeck(), temple: 0, relicsTaken: 0 });
  c.events.push({ type: 'announce', text: `💎 印加寶藏開始！玩家：${s.players.map((p) => mention(p.id)).join('、')}，每人 0 分。\n${RULES}` });
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
