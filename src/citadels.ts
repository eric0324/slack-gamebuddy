// 富饒之城（Citadels 經典版）遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyCitadels(state, action, rng) → { state, events }。
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';
import { CHARS, DECK, DISTRICTS, districtInfo, districtLabel, RANKS, type Rank } from './citadelsCards.js';

export const MIN_CITADELS_PLAYERS = 4;
export const MAX_CITADELS_PLAYERS = 7;
const TITLE = '富饒之城';
export const DRAFT_MS = 45_000;
export const TURN_MS = 90_000;
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
  turn?: Turn;
  notes: string[]; // 沒人拿的角色，附註在下一則牌桌訊息
  revealed: Rank[]; // 這輪已經翻開的角色
  seq: number;
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
}

// 一個角色回合的進度；drawn 是抽牌後還沒選完的牌，keep 是還要留幾張
export interface Turn {
  player: number;
  gathered: boolean;
  drawn?: string[];
  keep?: number;
  ability: boolean;
  taxed: boolean;
  builds: number;
  lab: boolean;
  smithy: boolean;
}

export type Sub = 'build';

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
  | { type: 'turnMenu'; user: string; seq: number; sub?: Sub }
  | { type: 'gather'; user: string; seq: number; kind: 'gold' | 'draw' }
  | { type: 'keep'; user: string; seq: number; card: string }
  | { type: 'build'; user: string; seq: number; card: string }
  | { type: 'tax'; user: string; seq: number }
  | { type: 'end'; user: string; seq: number }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<CAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: CState; events: GameEvent[] };
type Ctx = { s: CState; events: GameEvent[]; rng: Rng };

const NOT_PLAYER = '你不在這局遊戲裡。';
const NOT_YET = '還沒輪到你。';
const STALE = '這個選單已經過期，請重新按「🏰 我的回合」。';

const find = (s: CState, id: string) => s.players.find((p) => p.id === id);
// 只對真人送私下訊息（bot 不需要）
const tell = (c: Ctx, to: string, text: string) => {
  if (!isBot(to)) c.events.push({ type: 'ephemeral', to, text });
};
const menu = (c: Ctx, user: string, text: string, options: { value: string; label: string }[]) => {
  if (!isBot(user)) c.events.push({ type: 'prompt', kind: 'citadels', audience: 'ephemeral', user, text, options, perRow: 4 });
};
const current = (s: CState) => s.players[s.turn!.player];
const holder = (s: CState, r: Rank) => s.players.findIndex((p) => p.char === r);
const has = (p: CPlayer, card: string) => p.city.some((x) => x.card === card);
const maxBuilds = (p: CPlayer) => (p.char === 7 ? 3 : 1);
// 手上付得起、城市裡沒有同名的建築（同名的只列一次）
const buildable = (p: CPlayer) => p.hand.filter((card, i) => p.hand.indexOf(card) === i && !has(p, card) && DISTRICTS[card].cost <= p.gold);
const taxAmount = (p: CPlayer) => p.city.filter((x) => DISTRICTS[x.card].color === CHARS[p.char!].tax).length;
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
  const faceUp: Rank[] = pool.filter((r) => r !== 4).slice(0, FACE_UP[n] ?? 0);
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
  const s = c.s;
  s.phase = 'turn';
  s.calling = 0;
  s.revealed = [];
  s.notes = [];
  nextCall(c);
}

// 叫下一號：沒人拿的跳過並記下附註；8 號叫完這一輪結束
function nextCall(c: Ctx) {
  const s = c.s;
  s.turn = undefined;
  s.notes = [];
  while (++s.calling <= 8) {
    const r = s.calling as Rank;
    const i = holder(s, r);
    if (i < 0) {
      s.notes.push(`沒有人是 ${r} 號 ${CHARS[r].name}`);
      continue;
    }
    return reveal(c, i, r);
  }
  endRound(c);
}

function reveal(c: Ctx, i: number, r: Rank) {
  const s = c.s;
  const me = s.players[i];
  s.revealed.push(r);
  c.events.push({ type: 'announce', text: `🎭 ${r} 號 ${CHARS[r].name} 是 ${mention(me.id)}` });
  s.seq++;
  s.turn = { player: i, gathered: false, ability: false, taxed: false, builds: 0, lab: false, smithy: false };
  c.events.push(board(s));
  startTimer(c, TURN_MS);
}

function endRound(c: Ctx) {
  const s = c.s;
  if (s.notes.length) c.events.push({ type: 'announce', text: s.notes.map((n) => `（${n}）`).join('\n') });
  startRound(c);
}

const playerLine = (p: CPlayer) => `• ${mention(p.id)}：💰 ${p.gold} 金｜🃏 ${p.hand.length} 張｜🏘️ ${p.city.length} 棟${p.city.length ? `：${cityText(p)}` : ''}`;

function board(s: CState, ended = false): GameEvent {
  const me = current(s);
  const head = `🏰 第 ${s.round} 輪｜${me.char} 號 ${CHARS[me.char!].name} ${mention(me.id)}`;
  const lines = ended
    ? [`${head} 的回合結束`]
    : [
        `${head}（${TURN_MS / 1000} 秒）`,
        ...s.notes.map((n) => `（${n}）`),
        `👑 王冠：${mention(s.players[s.crown].id)}｜已翻開：${s.revealed.map((r) => `${CHARS[r].name} ${mention(s.players[holder(s, r)].id)}`).join('、')}`,
        ...s.players.map(playerLine),
      ];
  return {
    type: 'prompt',
    kind: 'citadels',
    audience: 'channel',
    ref: `citadels:${s.seq}`,
    text: lines.join('\n'),
    options: ended ? [] : [{ value: `turnMenu:${s.seq}`, label: '🏰 我的回合' }, { value: 'status', label: '📜 我的狀態' }],
  };
}

// 輪到的人操作前的共同檢查；回傳錯誤訊息或 null
function turnCheck(s: CState, user: string, seq: number): string | null {
  if (!find(s, user)) return NOT_PLAYER;
  if ((s.phase !== 'turn' && s.phase !== 'graveyard') || current(s).id !== user) return NOT_YET;
  if (seq !== s.seq) return STALE;
  if (s.phase === 'graveyard') return '正在等墓地主人決定，請稍候。';
  return null;
}

function turnMenu(c: Ctx, user: string, seq: number, sub?: Sub): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return reply(c, user, err);
  const t = s.turn!;
  const me = current(s);
  const o = (act: string, label: string) => ({ value: `${act}:${seq}`, label });
  if (t.drawn) {
    keepMenu(c);
    return false;
  }
  if (!t.gathered) {
    menu(c, user, '🏰 先收集資源：', [o('gather', '💰 拿 2 金'), o('gather', '🃏 抽牌')].map((x, i) => ({ ...x, value: `${x.value}:${i ? 'draw' : 'gold'}` })));
    return false;
  }
  if (sub === 'build') {
    const cards = t.builds < maxBuilds(me) ? buildable(me) : [];
    if (!cards.length) return reply(c, user, '現在沒有可以建造的建築。');
    menu(c, user, ['🔨 要建哪一棟？', ...cards.map(districtInfo)].join('\n'), cards.map((card) => ({ value: `build:${seq}:${card}`, label: districtLabel(card) })));
    return false;
  }
  const options = [
    ...(t.builds < maxBuilds(me) && buildable(me).length ? [{ value: `turnMenu:${seq}:build`, label: '🔨 建造' }] : []),
    ...(CHARS[me.char!].tax && !t.taxed ? [o('tax', '💰 收稅')] : []),
    o('end', '✅ 結束回合'),
  ];
  menu(c, user, `🏰 你的回合（${CHARS[me.char!].name}）｜💰 ${me.gold} 金｜🃏 ${me.hand.length} 張`, options);
  return false;
}

function keepMenu(c: Ctx) {
  const s = c.s;
  const t = s.turn!;
  menu(c, current(s).id, `🃏 你抽到這些牌，選 ${t.keep} 張留下（其他放到牌堆底）：`, t.drawn!.map((card) => ({ value: `keep:${s.seq}:${card}`, label: districtLabel(card) })));
}

function gather(c: Ctx, user: string, seq: number, kind: 'gold' | 'draw'): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return reply(c, user, err);
  const t = s.turn!;
  const me = current(s);
  if (t.gathered || t.drawn) return reply(c, user, STALE);
  if (kind === 'gold') {
    me.gold += 2;
    c.events.push({ type: 'announce', text: `💰 ${mention(me.id)} 拿了 2 金` });
    afterGather(c);
  } else {
    const drawn = s.deck.splice(0, 2);
    const keep = 1;
    c.events.push({ type: 'announce', text: `🃏 ${mention(me.id)} 抽了牌` });
    if (drawn.length <= keep) {
      me.hand.push(...drawn);
      tell(c, me.id, drawn.length ? `🃏 你拿到 ${drawn.map(districtLabel).join('、')}。` : '🃏 牌堆沒有牌了。');
      afterGather(c);
    } else {
      t.drawn = drawn;
      t.keep = keep;
      keepMenu(c);
    }
  }
  c.events.push(board(s));
  return true;
}

function keep(c: Ctx, user: string, seq: number, card: string): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return reply(c, user, err);
  const t = s.turn!;
  if (!t.drawn?.includes(card)) return reply(c, user, STALE);
  t.drawn.splice(t.drawn.indexOf(card), 1);
  current(s).hand.push(card);
  t.keep!--;
  if (t.keep! > 0 && t.drawn.length) keepMenu(c);
  else {
    s.deck.push(...t.drawn);
    t.drawn = undefined;
    t.keep = undefined;
    afterGather(c);
  }
  c.events.push(board(s));
  return true;
}

// 收集資源完成
function afterGather(c: Ctx) {
  c.s.turn!.gathered = true;
}

function build(c: Ctx, user: string, seq: number, card: string): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return reply(c, user, err);
  const t = s.turn!;
  const me = current(s);
  if (!t.gathered || t.builds >= maxBuilds(me)) return reply(c, user, STALE);
  if (!buildable(me).includes(card)) return reply(c, user, '不能建這棟建築。');
  me.gold -= DISTRICTS[card].cost;
  me.hand.splice(me.hand.indexOf(card), 1);
  me.city.push({ card, round: s.round });
  t.builds++;
  c.events.push({ type: 'announce', text: `🔨 ${mention(me.id)} 建了 ${districtLabel(card)}` });
  c.events.push(board(s));
  return true;
}

function collectTax(c: Ctx) {
  const me = current(c.s);
  const amount = taxAmount(me);
  me.gold += amount;
  c.s.turn!.taxed = true;
  c.events.push({ type: 'announce', text: `💰 ${mention(me.id)} 收稅 ${amount} 金` });
}

function tax(c: Ctx, user: string, seq: number): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return reply(c, user, err);
  if (!s.turn!.gathered || !CHARS[current(s).char!].tax || s.turn!.taxed) return reply(c, user, STALE);
  collectTax(c);
  c.events.push(board(s));
  return true;
}

function end(c: Ctx, user: string, seq: number): boolean {
  const err = turnCheck(c.s, user, seq);
  if (err) return reply(c, user, err);
  if (!c.s.turn!.gathered) return reply(c, user, '請先收集資源。');
  finishTurn(c);
  return true;
}

// 結束回合：還沒收稅就自動收
function finishTurn(c: Ctx) {
  const s = c.s;
  if (CHARS[current(s).char!].tax && !s.turn!.taxed) collectTax(c);
  c.events.push(board(s, true));
  nextCall(c);
}

// 回合逾時：還沒收集就拿 2 金、選牌中就留第一張，然後結束
function turnTimeout(c: Ctx) {
  const s = c.s;
  const me = current(s);
  const t = s.turn!;
  c.events.push({ type: 'announce', text: `⏰ ${mention(me.id)} 時間到，自動完成回合。` });
  while (t.drawn) keep(c, me.id, s.seq, t.drawn[0]);
  if (!t.gathered) gather(c, me.id, s.seq, 'gold');
  finishTurn(c);
}

function timeout(c: Ctx) {
  const s = c.s;
  if (s.phase === 'draft') {
    const choices = pickChoices(s);
    const rank = choices[Math.floor(c.rng() * choices.length)];
    tell(c, drafter(s).id, `⏰ 時間到，系統替你選了 ${CHARS[rank].name}。`);
    pick(c, drafter(s).id, rank);
  } else if (s.phase === 'turn') turnTimeout(c);
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
    case 'turnMenu':
      return turnMenu(c, action.user, action.seq, action.sub);
    case 'gather':
      return gather(c, action.user, action.seq, action.kind);
    case 'keep':
      return keep(c, action.user, action.seq, action.card);
    case 'build':
      return build(c, action.user, action.seq, action.card);
    case 'tax':
      return tax(c, action.user, action.seq);
    case 'end':
      return end(c, action.user, action.seq);
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
    notes: [],
    revealed: [],
    seq: prev?.seq ?? 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
