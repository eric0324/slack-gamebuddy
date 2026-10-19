// 富饒之城（Citadels 經典版）遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyCitadels(state, action, rng) → { state, events }。
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';
import { CHARS, DECK, districtInfo, districtLabel, RANKS, type Rank } from './citadelsCards.js';

export const MIN_CITADELS_PLAYERS = 4;
export const MAX_CITADELS_PLAYERS = 7;
const TITLE = '富饒之城';
export const DRAFT_MS = 45_000;
const FACE_UP: Record<number, number> = { 4: 2, 5: 1 };

export interface CPlayer {
  id: string;
  gold: number;
  hand: string[];
  city: { card: string; round: number }[];
  char?: Rank;
}

export interface CState {
  game: 'citadels';
  channel: string;
  host: string;
  phase: 'lobby' | 'draft' | 'turn' | 'graveyard' | 'ended';
  players: CPlayer[];
  deck: string[]; // deck[0] 是最上面，放回去放到最後
  crown: number; // 王冠持有者 index
  round: number;
  draft?: { pool: Rank[]; faceUp: Rank[]; faceDown: Rank; order: number[]; at: number };
  calling: number; // 目前叫到幾號（0 表示還沒開始叫號）
  seq: number;
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
}

export type CAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'status'; user: string }
  | { type: 'pickMenu'; user: string }
  | { type: 'pick'; user: string; rank: Rank }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<CAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: CState; events: GameEvent[] };
type Ctx = { s: CState; events: GameEvent[]; rng: Rng };

const NOT_PLAYER = '你不在這局遊戲裡。';
const NOT_YET = '還沒輪到你。';

const find = (s: CState, id: string) => s.players.find((p) => p.id === id);
// 只對真人送私下訊息（bot 不需要）
const tell = (c: Ctx, to: string, text: string) => {
  if (!isBot(to)) c.events.push({ type: 'ephemeral', to, text });
};
const menu = (c: Ctx, user: string, text: string, options: { value: string; label: string }[]) => {
  if (!isBot(user)) c.events.push({ type: 'prompt', kind: 'citadels', audience: 'ephemeral', user, text, options, perRow: 4 });
};
const handText = (hand: string[]) => (hand.length ? hand.map(districtInfo).join('\n') : '（沒有手牌）');
const cityText = (p: CPlayer) => (p.city.length ? p.city.map((x) => districtLabel(x.card)).join('、') : '（還沒有建築）');

const RULES = [
  '🏰 富饒之城規則：每輪先祕密選一個角色，再依角色編號 1→8 叫號行動。輪到你時先「💰 拿 2 金」或「🃏 抽 2 張留 1 張」，再可以用角色能力、建 1 棟建築（付等於費用的金幣；不能蓋同名建築）。',
  '有人建滿 8 棟後，這一輪打完遊戲結束：建築費用總和 + 五色齊全 3 分 + 第一個建滿 4 分（其他建滿 2 分），分數最高者獲勝。',
  RANKS.map((r) => `${r} ${CHARS[r].name}：${CHARS[r].desc}`).join('\n'),
].join('\n');

function status(c: Ctx, user: string): boolean {
  const me = find(c.s, user);
  if (!me) return reply(c, user, NOT_PLAYER);
  const lines = [
    `📜 你的狀態｜💰 ${me.gold} 金${me.char ? `｜角色：${CHARS[me.char].name}` : ''}`,
    `🏘️ 城市（${me.city.length} 棟）：${cityText(me)}`,
    `🃏 手牌（${me.hand.length} 張）：`,
    handText(me.hand),
  ];
  return reply(c, user, lines.join('\n'));
}

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, '只有房主可以開始遊戲。');
  if (s.phase !== 'lobby') return false;
  const n = s.players.length;
  if (n < MIN_CITADELS_PLAYERS) return reply(c, user, `目前 ${n} 人，至少需要 ${MIN_CITADELS_PLAYERS} 人才能開始。`);
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'draft' }));
  s.deck = shuffle(DECK, c.rng);
  for (const p of s.players) Object.assign(p, newPlayer(p.id), { hand: s.deck.splice(0, 4) });
  s.crown = Math.floor(c.rng() * n);
  s.round = 0;
  c.events.push({
    type: 'announce',
    text: [
      `🏰 富饒之城開始！座位：${s.players.map((p) => mention(p.id)).join(' → ')}`,
      `👑 王冠：${mention(s.players[s.crown].id)}｜每人 2 金、4 張建築牌`,
      '有人建滿 8 棟後，這一輪打完遊戲結束，分數最高者獲勝！',
      RANKS.map((r) => `${r} ${CHARS[r].name}：${CHARS[r].desc}`).join('\n'),
    ].join('\n'),
    gif: 'start',
  });
  for (const p of s.players) if (!isBot(p.id)) c.events.push({ type: 'dm', to: p.id, text: `${RULES}\n\n🃏 你的手牌：\n${handText(p.hand)}` });
  startRound(c);
  return true;
}

// 每輪開始：洗角色、面朝下棄 1 張、依人數面朝上棄牌（國王不能面朝上），從王冠持有者開始選角
function startRound(c: Ctx) {
  const s = c.s;
  const n = s.players.length;
  s.round++;
  s.phase = 'draft';
  for (const p of s.players) p.char = undefined;
  const pool = shuffle(RANKS, c.rng);
  const faceDown = pool.shift()!;
  const faceUp = pool.filter((r) => r !== 4).slice(0, FACE_UP[n] ?? 0);
  s.draft = { pool: pool.filter((r) => !faceUp.includes(r)), faceUp, faceDown, order: s.players.map((_, i) => (s.crown + i) % n), at: 0 };
  c.events.push({
    type: 'announce',
    text: [
      `🎭 第 ${s.round} 輪開始！`,
      faceUp.length ? `面朝上棄掉：${faceUp.map((r) => CHARS[r].name).join('、')}` : '沒有面朝上的棄牌',
      `選角順序：${s.draft.order.map((i) => mention(s.players[i].id)).join(' → ')}`,
    ].join('\n'),
  });
  nextPicker(c);
}

const drafter = (s: CState) => s.players[s.draft!.order[s.draft!.at]];
// 7 人局的最後一位可以改拿面朝下的那張
const isLastOf7 = (s: CState) => s.players.length === 7 && s.draft!.at === 6;
const pickChoices = (s: CState): Rank[] => [...s.draft!.pool, ...(isLastOf7(s) ? [s.draft!.faceDown] : [])];

function draftMsg(s: CState, done = false): GameEvent {
  const d = s.draft!;
  const text = done
    ? `🎭 第 ${s.round} 輪選角完成，開始叫號！`
    : `🎭 第 ${s.round} 輪選角：輪到 ${mention(drafter(s).id)}（${DRAFT_MS / 1000} 秒）｜已選 ${d.at}/${s.players.length}`;
  return { type: 'prompt', kind: 'citadels', audience: 'channel', ref: `citadels:draft:${s.round}`, text, options: done ? [] : [{ value: 'pickMenu', label: '🎭 選角色' }] };
}

function nextPicker(c: Ctx) {
  c.events.push(draftMsg(c.s));
  startTimer(c, DRAFT_MS);
}

function pickMenu(c: Ctx, user: string): boolean {
  const s = c.s;
  if (!find(s, user)) return reply(c, user, NOT_PLAYER);
  if (s.phase !== 'draft' || drafter(s).id !== user) return reply(c, user, NOT_YET);
  const d = s.draft!;
  const options = pickChoices(s).map((r) => ({ value: `pick:${r}`, label: CHARS[r].name + (isLastOf7(s) && r === d.faceDown ? '（面朝下的棄牌）' : '') }));
  const text = [
    '🎭 選一個角色（只有你知道）：',
    ...pickChoices(s).map((r) => `${r} ${CHARS[r].name}：${CHARS[r].desc}`),
    ...(d.faceUp.length ? [`面朝上棄掉：${d.faceUp.map((r) => CHARS[r].name).join('、')}`] : []),
  ].join('\n');
  menu(c, user, text, options);
  return false;
}

function pick(c: Ctx, user: string, rank: Rank): boolean {
  const s = c.s;
  if (!find(s, user)) return reply(c, user, NOT_PLAYER);
  if (s.phase !== 'draft' || drafter(s).id !== user) return reply(c, user, NOT_YET);
  if (!pickChoices(s).includes(rank)) return reply(c, user, '不能選這個角色。');
  const d = s.draft!;
  if (rank === d.faceDown) d.faceDown = d.pool.shift()!;
  else d.pool = d.pool.filter((r) => r !== rank);
  drafter(s).char = rank;
  tell(c, user, `你選了 ${CHARS[rank].name}。`);
  d.at++;
  if (d.at < s.players.length) {
    nextPicker(c);
    return true;
  }
  c.events.push(draftMsg(s, true));
  startCalling(c);
  return true;
}

function startCalling(c: Ctx) {
  c.s.phase = 'turn';
}

function timeout(c: Ctx) {
  const s = c.s;
  if (s.phase === 'draft') {
    const choices = pickChoices(s);
    const rank = choices[Math.floor(c.rng() * choices.length)];
    tell(c, drafter(s).id, `⏰ 時間到，系統替你選了 ${CHARS[rank].name}。`);
    pick(c, drafter(s).id, rank);
  }
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_CITADELS_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_CITADELS_PLAYERS, newPlayer);
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user);
    case 'status':
      return status(c, action.user);
    case 'pickMenu':
      return pickMenu(c, action.user);
    case 'pick':
      return pick(c, action.user, action.rank);
    case 'timeout':
      if (action.id !== c.s.timers.phase) return false;
      timeout(c);
      return true;
    default:
      return false;
  }
}

const newPlayer = (id: string): CPlayer => ({ id, gold: 2, hand: [], city: [] });

export function applyCitadels(state: CState | undefined, action: CAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
  });
}

function createLobby(prev: CState | undefined, host: string, channel: string): Result {
  const created: CState = {
    game: 'citadels',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    deck: [],
    crown: 0,
    round: 0,
    calling: 0,
    seq: prev?.seq ?? 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
