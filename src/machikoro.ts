// 骰子街（Machi Koro 基本版＋港口擴充）遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyMachikoro(state, action, rng) → { state, events }。
import { isBot, mention, quiet, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';
import { buildDeck, cardLabel, CARDS, fillMarket, LANDMARK, LANDMARKS, marketOrder } from './machikoroCards.js';

export const MIN_MACHIKORO_PLAYERS = 2;
export const MAX_MACHIKORO_PLAYERS = 5;
export const MAX_ROUNDS = 30;
export const TURN_MS = 60_000;
const TITLE = '骰子街';

export type Step = 'roll' | 'reroll' | 'harbor' | 'tv' | 'bizGive' | 'bizPlayer' | 'bizTake' | 'buy';

export interface MPlayer {
  id: string;
  coins: number;
  cards: Record<string, number>; // 一般建築代號 → 張數
  landmarks: string[]; // 已蓋好的地標（含開局的市政廳）
}

export interface MState {
  game: 'machikoro';
  channel: string;
  host: string;
  phase: 'lobby' | 'play' | 'ended';
  players: MPlayer[];
  deck: string[]; // 市場還沒翻的牌，deck[0] 是最上面
  market: Record<string, number>; // 代號 → 剩幾張，最多 10 種
  first: number; // 第 1 輪從誰開始：輪回他時輪數 +1
  current: number;
  round: number;
  seq: number; // 每個新回合（含遊樂園的額外回合）+1：回合面板的 ref，也用來擋掉舊按鈕
  turn?: {
    step: Step;
    dice: number[];
    rerolled: boolean;
    total: number;
    harbor: boolean;
    log: string[]; // 面板上這回合的點數和結算明細
    give?: string; // 商業中心要給出的建築
    target?: string; // 商業中心的對象
    bought: boolean;
  };
  winners?: string[];
  reason?: 'landmarks' | 'limit';
  timerSeq: number;
  timers: { phase?: number };
}

export type MAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'turnMenu'; user: string; seq: number }
  | { type: 'town'; user: string }
  | { type: 'roll'; user: string; seq: number; n: 1 | 2 }
  | { type: 'keep'; user: string; seq: number }
  | { type: 'reroll'; user: string; seq: number; n: 1 | 2 }
  | { type: 'harbor'; user: string; seq: number; yes: boolean }
  | { type: 'tv'; user: string; seq: number; target: string }
  | { type: 'bizGive'; user: string; seq: number; card: string }
  | { type: 'bizPlayer'; user: string; seq: number; give: string; target: string }
  | { type: 'bizTake'; user: string; seq: number; give: string; take: string; target: string }
  | { type: 'bizSkip'; user: string; seq: number }
  | { type: 'buy'; user: string; seq: number; code: string }
  | { type: 'pass'; user: string; seq: number }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<MAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: MState; events: GameEvent[] };
type Ctx = { s: MState; events: GameEvent[]; rng: Rng };

const current = (s: MState) => s.players[s.current];
const built = (p: MPlayer) => LANDMARKS.filter((l) => p.landmarks.includes(l));
const cardCount = (p: MPlayer) => Object.values(p.cards).reduce((a, b) => a + b, 0);
const marketLines = (s: MState) => marketOrder(s.market).map((code) => `• ${cardLabel(code)}剩 ${s.market[code]} 張`);
const playerLine = (p: MPlayer) =>
  `${quiet(p.id)} ${p.coins} 元｜地標：${built(p).map((l) => LANDMARK[l].name).join('、') || '（沒有）'}｜建築 ${cardCount(p)} 張`;
const roundText = (s: MState) => (s.round >= 25 ? `第 ${s.round}/${MAX_ROUNDS} 輪` : `第 ${s.round} 輪`);

// 回合面板：只 @ 輪到的人；ended 時拿掉按鈕
function board(s: MState, ended = false): GameEvent {
  const me = current(s);
  const lines = [
    ended ? `✅ ${roundText(s)}｜${quiet(me.id)} 的回合結束` : `*🏘️ ${roundText(s)}｜👉 輪到 ${mention(me.id)}（${TURN_MS / 1000} 秒）*`,
    ...(s.turn?.log ?? []),
    '市場：',
    ...marketLines(s),
    ...s.players.map((p) => (p === me ? `👉 ${playerLine(p)}` : playerLine(p))),
  ];
  return {
    type: 'prompt',
    kind: 'machikoro',
    audience: 'channel',
    ref: `machikoro:turn:${s.seq}`,
    text: lines.join('\n'),
    options: ended ? [] : [{ value: `turnMenu:${s.seq}`, label: '🏘️ 行動' }, { value: 'town', label: '📋 城鎮一覽' }],
  };
}

function beginTurn(c: Ctx) {
  const s = c.s;
  s.seq++;
  s.turn = { step: 'roll', dice: [], rerolled: false, total: 0, harbor: false, log: [], bought: false };
  c.events.push(board(s));
  startTimer(c, TURN_MS);
}

const RULES = [
  '輪到時擲骰，大家的建築依骰點收錢：紅色向擲骰的人收、藍色任何人擲都收、綠色和紫色只有自己擲時收。',
  '之後可以從市場買 1 棟建築或蓋 1 個地標，也可以不買。',
  '先蓋好港口、火車站、購物中心、遊樂園、廣播塔、機場 6 個地標的人獲勝；第 30 輪結束還沒人蓋完就比地標數，再比金錢。',
].join('\n');

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, '只有房主可以開始遊戲。');
  if (s.phase !== 'lobby') return false;
  const n = s.players.length;
  if (n < MIN_MACHIKORO_PLAYERS) return reply(c, user, `目前 ${n} 人，至少需要 ${MIN_MACHIKORO_PLAYERS} 人才能開始。`);
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'play' }));
  for (const p of s.players) Object.assign(p, newPlayer(p.id));
  s.deck = shuffle(buildDeck(n), c.rng);
  s.market = {};
  fillMarket(s.market, s.deck);
  const first = Math.floor(c.rng() * n);
  Object.assign(s, { phase: 'play', first, current: first, round: 1, turn: undefined });
  c.events.push({
    type: 'announce',
    text: [
      `🏘️ 骰子街開始！玩家（依座位）：${s.players.map((p) => mention(p.id)).join('、')}`,
      '每人起始 3 元、麥田、麵包店和蓋好的市政廳。',
      RULES,
      '市場：',
      ...marketLines(s),
    ].join('\n'),
  });
  beginTurn(c);
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_MACHIKORO_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_MACHIKORO_PLAYERS, newPlayer);
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user);
    default:
      return false;
  }
}

const newPlayer = (id: string): MPlayer => ({ id, coins: 3, cards: { wheat: 1, bakery: 1 }, landmarks: ['cityhall'] });

export function applyMachikoro(state: MState | undefined, action: MAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
  });
}

function createLobby(prev: MState | undefined, host: string, channel: string): Result {
  const created: MState = {
    game: 'machikoro',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    deck: [],
    market: {},
    first: 0,
    current: 0,
    round: 0,
    seq: prev?.seq ?? 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
