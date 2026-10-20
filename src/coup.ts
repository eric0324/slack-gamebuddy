// 政變遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyCoup(state, action, rng) → { state, events }。
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/coup.js';

export const MIN_COUP_PLAYERS = 3;
export const MAX_COUP_PLAYERS = 6;
const TITLE = '政變';
const ACTION_MS = 60_000;
const TARGET_MS = 30_000;
const LOSE_MS = 30_000;
const REACT_MS = 20_000;
const EXCHANGE_MS = 30_000;

export type KPhase = 'lobby' | 'action' | 'target' | 'challenge' | 'block' | 'lose' | 'exchange' | 'ended';
export type ActKind = 'income' | 'foreignAid' | 'coup' | 'tax' | 'assassinate' | 'steal' | 'exchange';

export type Role = 'duke' | 'assassin' | 'captain' | 'ambassador' | 'contessa';
const ROLES: Role[] = ['duke', 'assassin', 'captain', 'ambassador', 'contessa'];
// 依這局語系的角色名稱和行動按鈕文字
const roleName = (lang: Lang | undefined, r: Role) => tx(lang, `role.${r}`);

export interface Card {
  role: Role;
  revealed: boolean;
}

export interface KPlayer {
  id: string;
  cards: Card[];
  coins: number;
}

export interface KState {
  game: 'coup';
  channel: string;
  host: string;
  phase: KPhase;
  players: KPlayer[];
  deck: Role[];
  turn: number;
  pending?: { actor: string; kind: ActKind; target?: string };
  losing: string[]; // 等著選要翻開哪張牌的玩家
  after: 'next' | 'proceed' | 'execute' | 'blocked'; // 翻完牌之後要做什麼
  claim?: { by: string; role: Role; forBlock: boolean }; // 等著被質疑的宣稱
  exchange?: { pool: Role[]; keep: number[]; count: number }; // 大使交換：可選的牌、已選的位置、要留幾張
  passed: string[]; // 這個反應視窗裡已經決定不反應的 bot
  winner?: string;
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang; // 開房時的頻道語系 (runGame 存進來)
}

export type KAction =
  | { type: 'new'; user: string; channel: string; lang?: Lang }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'act'; user: string; kind: ActKind }
  | { type: 'target'; user: string; target: string }
  | { type: 'reveal'; user: string; index: number }
  | { type: 'challenge'; user: string }
  | { type: 'block'; user: string; role: Role }
  | { type: 'keep'; user: string; index: number }
  | { type: 'pass'; user: string }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string; lang?: Lang };

type GameAction = Exclude<KAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: KState;
  events: GameEvent[];
}

interface Ctx {
  s: KState;
  events: GameEvent[];
  rng: Rng;
}

const cardList = (s: KState, p: KPlayer) =>
  p.cards.filter((x) => !x.revealed).map((x) => roleName(s.lang, x.role)).join(tx(s.lang, 'sep'));

// 發牌：15 張洗牌，每人 2 張暗牌和 2 枚金幣
function deal(c: Ctx) {
  const s = c.s;
  s.deck = shuffle(ROLES.flatMap((r) => [r, r, r]), c.rng);
  for (const p of s.players) {
    p.cards = [s.deck.shift()!, s.deck.shift()!].map((role) => ({ role, revealed: false }));
    p.coins = 2;
  }
  s.turn = Math.floor(c.rng() * s.players.length);
  const order = s.players.map((_, i) => s.players[(s.turn + i) % s.players.length].id);
  c.events.push({
    type: 'announce',
    text: tx(s.lang, 'start', { order: order.map(mention).join(' → ') }),
    gif: 'start',
  });
  for (const p of s.players) c.events.push({ type: 'dm', to: p.id, text: tx(s.lang, 'yourCards', { cards: cardList(s, p), help: tx(s.lang, 'roleHelp') }) });
}

const actLabel = (lang: Lang | undefined, k: ActKind) => tx(lang, `act.${k}`);
const TARGETED: ActKind[] = ['coup', 'assassinate', 'steal'];
// 可以被阻擋的行動 → 阻擋用的角色
const BLOCK: Partial<Record<ActKind, Role[]>> = { foreignAid: ['duke'], assassinate: ['contessa'], steal: ['captain', 'ambassador'] };
const CLAIM: Partial<Record<ActKind, Role>> = { tax: 'duke', assassinate: 'assassin', steal: 'captain', exchange: 'ambassador' };

const alive = (p: KPlayer) => p.cards.some((x) => !x.revealed);
const current = (s: KState) => s.players[s.turn];
const playerOf = (s: KState, id: string) => s.players.find((p) => p.id === id)!;

function available(p: KPlayer): ActKind[] {
  if (p.coins >= 10) return ['coup'];
  return (['income', 'foreignAid', 'coup', 'tax', 'assassinate', 'steal', 'exchange'] as ActKind[]).filter(
    (k) => (k !== 'coup' || p.coins >= 7) && (k !== 'assassinate' || p.coins >= 3),
  );
}

// 輪到下一位：公告金幣和翻開的牌，給行動按鈕
function startTurn(c: Ctx) {
  const s = c.s;
  s.phase = 'action';
  s.pending = undefined;
  const p = current(s);
  const status = s.players
    .map((x) => {
      const shown = x.cards.filter((k) => k.revealed).map((k) => roleName(s.lang, k.role));
      return tx(s.lang, 'statusLine', {
        who: mention(x.id),
        coins: x.coins,
        shown: shown.length ? tx(s.lang, 'shown', { list: shown.join(tx(s.lang, 'sep')) }) : '',
        dead: alive(x) ? '' : ' 💀',
      });
    })
    .join('\n');
  c.events.push(
    { type: 'announce', text: tx(s.lang, 'turn', { who: mention(p.id), status }) },
    {
      type: 'prompt',
      kind: 'coupAction',
      audience: 'channel',
      text: tx(s.lang, 'chooseAction', { who: mention(p.id), sec: ACTION_MS / 1000 }),
      options: available(p).map((k) => ({ value: k, label: actLabel(s.lang, k) })),
    },
  );
  startTimer(c, ACTION_MS);
}

function nextTurn(c: Ctx) {
  const s = c.s;
  for (let i = 1; i <= s.players.length; i++) {
    const k = (s.turn + i) % s.players.length;
    if (alive(s.players[k])) {
      s.turn = k;
      break;
    }
  }
  startTurn(c);
}

function declare(c: Ctx, user: string, kind: ActKind): boolean {
  const s = c.s;
  const p = current(s);
  if (s.phase !== 'action' || user !== p.id) return reply(c, user, tx(s.lang, 'notYourTurn'));
  if (!available(p).includes(kind)) return reply(c, user, tx(s.lang, p.coins >= 10 ? 'mustCoup' : 'notEnoughCoins'));
  if (kind === 'income') {
    p.coins += 1;
    c.events.push({ type: 'announce', text: tx(s.lang, 'income', { who: mention(p.id) }) });
    nextTurn(c);
    return true;
  }
  if (kind === 'foreignAid') {
    s.pending = { actor: p.id, kind };
    c.events.push({ type: 'announce', text: tx(s.lang, 'foreignAidClaim', { who: mention(p.id) }) });
    openBlock(c);
    return true;
  }
  if (kind === 'tax' || kind === 'exchange') {
    s.pending = { actor: p.id, kind };
    openChallenge(c, p.id, CLAIM[kind]!, false, actLabel(s.lang, kind));
    return true;
  }
  if (TARGETED.includes(kind)) {
    s.phase = 'target';
    s.pending = { actor: p.id, kind };
    c.events.push({
      type: 'prompt',
      kind: 'coupTarget',
      audience: 'channel',
      text: tx(s.lang, 'chooseTarget', { who: mention(p.id), act: actLabel(s.lang, kind), sec: TARGET_MS / 1000 }),
      options: s.players.filter((x) => x.id !== p.id && alive(x)).map((x) => ({ value: x.id, label: x.id })),
    });
    startTimer(c, TARGET_MS);
    return true;
  }
  return false;
}

function chooseTarget(c: Ctx, user: string, targetId: string): boolean {
  const s = c.s;
  if (s.phase !== 'target' || user !== s.pending!.actor) return reply(c, user, tx(s.lang, 'notYourTarget'));
  const t = s.players.find((x) => x.id === targetId);
  if (!t || t.id === user || !alive(t)) return false;
  s.pending!.target = t.id;
  const actor = playerOf(s, user);
  if (s.pending!.kind === 'coup') {
    actor.coins -= 7;
    c.events.push({ type: 'announce', text: tx(s.lang, 'coup', { who: mention(user), target: mention(t.id) }) });
    loseInfluence(c, [t.id]);
    return true;
  }
  if (s.pending!.kind === 'assassinate') actor.coins -= 3;
  openChallenge(c, user, CLAIM[s.pending!.kind]!, false, tx(s.lang, 'whatTarget', { target: mention(t.id), act: actLabel(s.lang, s.pending!.kind) }));
  return true;
}

// 宣稱角色後的質疑視窗
function openChallenge(c: Ctx, by: string, role: Role, forBlock: boolean, what: string) {
  const s = c.s;
  s.phase = 'challenge';
  s.passed = [];
  s.claim = { by, role, forBlock };
  c.events.push(
    { type: 'announce', text: tx(s.lang, 'claim', { who: mention(by), role: roleName(s.lang, role), what }) },
    {
      type: 'prompt',
      kind: 'challenge',
      audience: 'channel',
      text: tx(s.lang, 'challengePrompt', { who: mention(by), role: roleName(s.lang, role), sec: REACT_MS / 1000 }),
      options: [{ value: 'challenge', label: tx(s.lang, 'challengeBtn') }],
    },
  );
  startTimer(c, REACT_MS);
}

function resolveChallenge(c: Ctx, challenger: string) {
  const s = c.s;
  const { by, role, forBlock } = s.claim!;
  const claimant = playerOf(s, by);
  const card = claimant.cards.find((x) => !x.revealed && x.role === role);
  if (card) {
    s.deck.push(card.role);
    s.deck = shuffle(s.deck, c.rng);
    card.role = s.deck.shift()!;
    c.events.push(
      { type: 'announce', text: tx(s.lang, 'challengeFailed', { who: mention(by), role: roleName(s.lang, role), challenger: mention(challenger) }) },
      { type: 'dm', to: by, text: tx(s.lang, 'newCard', { cards: cardList(s, claimant) }) },
    );
    loseInfluence(c, [challenger], forBlock ? 'blocked' : 'proceed');
  } else {
    c.events.push({ type: 'announce', text: tx(s.lang, 'challengeWon', { who: mention(by), role: roleName(s.lang, role), challenger: mention(challenger) }) });
    loseInfluence(c, [by], forBlock ? 'execute' : 'next');
  }
}

// 行動通過質疑：可以被阻擋的就開阻擋視窗，否則執行
function proceed(c: Ctx) {
  const { kind, target } = c.s.pending!;
  if (BLOCK[kind] && kind !== 'foreignAid' && target && alive(playerOf(c.s, target))) openBlock(c);
  else execute(c);
}

// 能阻擋的人：外援是其他所有人，刺殺和勒索只有目標
const blockers = (s: KState) => {
  const { actor, kind, target } = s.pending!;
  return kind === 'foreignAid' ? s.players.filter((p) => p.id !== actor && alive(p)).map((p) => p.id) : [target!];
};

function openBlock(c: Ctx) {
  const s = c.s;
  s.phase = 'block';
  s.passed = [];
  const { kind } = s.pending!;
  const who = kind === 'foreignAid' ? tx(s.lang, 'anyone') : mention(s.pending!.target!);
  c.events.push({
    type: 'prompt',
    kind: 'block',
    audience: 'channel',
    text: tx(s.lang, 'blockPrompt', { who, sec: REACT_MS / 1000 }),
    options: BLOCK[kind]!.map((r) => ({ value: r, label: tx(s.lang, 'blockBtn', { role: roleName(s.lang, r) }) })),
  });
  startTimer(c, REACT_MS);
}

function execute(c: Ctx) {
  const s = c.s;
  const { actor, kind, target } = s.pending!;
  const p = playerOf(s, actor);
  const t = target ? playerOf(s, target) : undefined;
  if (kind === 'tax') {
    p.coins += 3;
    c.events.push({ type: 'announce', text: tx(s.lang, 'tax', { who: mention(actor) }) });
  } else if (kind === 'foreignAid') {
    p.coins += 2;
    c.events.push({ type: 'announce', text: tx(s.lang, 'foreignAid', { who: mention(actor) }) });
  } else if (kind === 'steal' && t) {
    const n = Math.min(2, t.coins);
    t.coins -= n;
    p.coins += n;
    c.events.push({ type: 'announce', text: tx(s.lang, 'steal', { who: mention(actor), target: mention(t.id), n }) });
  } else if (kind === 'exchange') {
    startExchange(c, p);
    return;
  } else if (kind === 'assassinate' && t && alive(t)) {
    c.events.push({ type: 'announce', text: tx(s.lang, 'assassinate', { who: mention(actor), target: mention(t.id) }) });
    loseInfluence(c, [t.id]);
    return;
  }
  nextTurn(c);
}

// 失去影響力：依序讓玩家選要翻開哪張牌
function loseInfluence(c: Ctx, ids: string[], after: KState['after'] = 'next') {
  const s = c.s;
  s.phase = 'lose';
  s.losing = ids;
  s.after = after;
  promptLose(c);
}

const hidden = (p: KPlayer) => p.cards.map((x, i) => [x, i] as const).filter(([x]) => !x.revealed);

function promptLose(c: Ctx) {
  const s = c.s;
  while (s.losing.length) {
    const p = playerOf(s, s.losing[0]);
    const cards = hidden(p);
    if (!cards.length) {
      s.losing.shift();
      continue;
    }
    if (cards.length === 1) {
      revealCard(c, p, cards[0][1]);
      continue;
    }
    c.events.push({
      type: 'prompt',
      kind: 'loseCard',
      audience: 'user',
      user: p.id,
      text: tx(s.lang, 'loseCard', { sec: LOSE_MS / 1000 }),
      options: cards.map(([x, i]) => ({ value: String(i), label: tx(s.lang, 'revealBtn', { role: roleName(s.lang, x.role) }) })),
    });
    c.events.push({ type: 'announce', text: tx(s.lang, 'waitLose', { who: mention(p.id) }) });
    startTimer(c, LOSE_MS);
    return;
  }
  afterLoss(c);
}

function revealCard(c: Ctx, p: KPlayer, index: number) {
  const s = c.s;
  p.cards[index].revealed = true;
  c.events.push({ type: 'announce', text: tx(s.lang, 'revealed', { who: mention(p.id), role: roleName(s.lang, p.cards[index].role) }) });
  if (!alive(p)) c.events.push({ type: 'announce', text: tx(s.lang, 'out', { who: mention(p.id) }) });
  s.losing.shift();
}

function afterLoss(c: Ctx) {
  const s = c.s;
  const living = s.players.filter(alive);
  if (living.length === 1) {
    endGame(c, living[0].id);
    return;
  }
  if (s.after === 'proceed') proceed(c);
  else if (s.after === 'execute') execute(c);
  else if (s.after === 'blocked') {
    c.events.push({ type: 'announce', text: tx(s.lang, 'blocked', { who: mention(s.pending!.actor) }) });
    nextTurn(c);
  } else nextTurn(c);
}

function endGame(c: Ctx, winner: string) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  s.winner = winner;
  const roster = s.players
    .map((p) => tx(s.lang, 'rosterLine', { who: mention(p.id), cards: p.cards.map((x) => roleName(s.lang, x.role)).join(tx(s.lang, 'sep')) }))
    .join('\n');
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: [winner] });
  c.events.push(
    { type: 'announce', text: tx(s.lang, 'win', { who: mention(winner), roster }), gif: 'goodWin' },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

// 大使交換：手上的暗牌加上牌堆抽 2 張，私訊選要留下的牌
function startExchange(c: Ctx, p: KPlayer) {
  const s = c.s;
  const own = hidden(p).map(([x]) => x.role);
  const drawn = [s.deck.shift()!, s.deck.shift()!];
  s.phase = 'exchange';
  s.exchange = { pool: [...own, ...drawn], keep: [], count: own.length };
  c.events.push({ type: 'announce', text: tx(s.lang, 'exchanging', { who: mention(p.id) }) });
  promptKeep(c);
  startTimer(c, EXCHANGE_MS);
}

function promptKeep(c: Ctx) {
  const s = c.s;
  const ex = s.exchange!;
  const actor = s.pending!.actor;
  c.events.push({
    type: 'prompt',
    kind: 'keepCard',
    audience: 'user',
    user: actor,
    text: tx(s.lang, 'keepCard', { n: ex.count - ex.keep.length, sec: EXCHANGE_MS / 1000 }),
    options: ex.pool.map((r, i) => ({ value: String(i), label: roleName(s.lang, r) })).filter((_, i) => !ex.keep.includes(i)),
  });
}

function finishExchange(c: Ctx, keep: number[]) {
  const s = c.s;
  const ex = s.exchange!;
  const p = playerOf(s, s.pending!.actor);
  const slots = hidden(p).map(([, i]) => i);
  slots.forEach((slot, k) => (p.cards[slot].role = ex.pool[keep[k]]));
  s.deck = shuffle([...s.deck, ...ex.pool.filter((_, i) => !keep.includes(i))], c.rng);
  s.exchange = undefined;
  c.events.push(
    { type: 'announce', text: tx(s.lang, 'exchanged', { who: mention(p.id) }) },
    { type: 'dm', to: p.id, text: tx(s.lang, 'exchangedDm', { cards: cardList(s, p) }) },
  );
  nextTurn(c);
}

// 反應視窗裡可以反應的人
const reactors = (s: KState) =>
  s.phase === 'challenge' ? s.players.filter((p) => alive(p) && p.id !== s.claim!.by).map((p) => p.id) : blockers(s);

const has = (p: KPlayer, role: Role) => p.cards.some((x) => !x.revealed && x.role === role);
const pick = <T>(items: T[], rng: Rng): T => items[Math.floor(rng() * items.length)];

// bot 的簡單策略：有角色就用、偶爾假裝公爵、20% 機率質疑、有牌就阻擋
function nextBotAction(s: KState, rng: Rng): GameAction | null {
  const others = (id: string) => s.players.filter((p) => p.id !== id && alive(p));
  if (s.phase === 'action') {
    const me = current(s);
    if (!isBot(me.id)) return null;
    if (me.coins >= 7) return { type: 'act', user: me.id, kind: 'coup' };
    if (has(me, 'duke')) return { type: 'act', user: me.id, kind: 'tax' };
    if (has(me, 'assassin') && me.coins >= 3) return { type: 'act', user: me.id, kind: 'assassinate' };
    if (has(me, 'captain') && others(me.id).some((p) => p.coins > 0)) return { type: 'act', user: me.id, kind: 'steal' };
    return { type: 'act', user: me.id, kind: rng() < 0.3 ? 'tax' : 'income' };
  }
  if (s.phase === 'target' && isBot(s.pending!.actor)) {
    const pool = others(s.pending!.actor);
    const rich = s.pending!.kind === 'steal' ? pool.filter((p) => p.coins > 0) : pool;
    return { type: 'target', user: s.pending!.actor, target: pick(rich.length ? rich : pool, rng).id };
  }
  if (s.phase === 'challenge' || s.phase === 'block') {
    const bot = reactors(s).find((id) => isBot(id) && !s.passed.includes(id));
    if (!bot) return null;
    if (s.phase === 'challenge') return rng() < 0.2 ? { type: 'challenge', user: bot } : { type: 'pass', user: bot };
    const me = playerOf(s, bot);
    const role = BLOCK[s.pending!.kind]!.find((r) => has(me, r));
    if (role) return { type: 'block', user: bot, role };
    if (s.pending!.kind === 'assassinate' && hidden(me).length === 1) return { type: 'block', user: bot, role: 'contessa' };
    return { type: 'pass', user: bot };
  }
  if (s.phase === 'lose' && isBot(s.losing[0])) {
    return { type: 'reveal', user: s.losing[0], index: pick(hidden(playerOf(s, s.losing[0])), rng)[1] };
  }
  if (s.phase === 'exchange' && isBot(s.pending!.actor)) {
    const ex = s.exchange!;
    return { type: 'keep', user: s.pending!.actor, index: pick(ex.pool.map((_, i) => i).filter((i) => !ex.keep.includes(i)), rng) };
  }
  return null;
}

function runBots(c: Ctx) {
  for (let i = 0; i < 1000; i++) {
    const action = nextBotAction(c.s, c.rng);
    if (!action || !handle(c, action)) return;
  }
}

// 反應視窗結束沒人反應：質疑視窗 → 繼續 (阻擋成立或行動照常)，阻擋視窗 → 執行
function closeWindow(c: Ctx) {
  const s = c.s;
  if (s.phase === 'block') execute(c);
  else if (s.claim!.forBlock) {
    s.after = 'blocked';
    afterLoss(c);
  } else proceed(c);
}

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_COUP_PLAYERS, (id) => ({ id, cards: [], coins: 0 }));
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_COUP_PLAYERS, (id) => ({ id, cards: [], coins: 0 }));
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostStart'));
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_COUP_PLAYERS) return reply(c, action.user, tx(s.lang, 'needPlayers', { n, min: MIN_COUP_PLAYERS }));
      c.events.push(lobbyEvent(TITLE, { ...s, phase: 'action' }));
      deal(c);
      startTurn(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user);
    case 'act':
      return declare(c, action.user, action.kind);
    case 'target':
      return chooseTarget(c, action.user, action.target);
    case 'reveal': {
      if (s.phase !== 'lose' || action.user !== s.losing[0]) return false;
      const p = playerOf(s, action.user);
      if (!p.cards[action.index] || p.cards[action.index].revealed) return false;
      revealCard(c, p, action.index);
      promptLose(c);
      return true;
    }
    case 'challenge': {
      if (s.phase !== 'challenge') return false;
      const p = s.players.find((x) => x.id === action.user);
      if (!p || !alive(p) || p.id === s.claim!.by) return false;
      resolveChallenge(c, p.id);
      return true;
    }
    case 'block': {
      if (s.phase !== 'block' || !blockers(s).includes(action.user)) return false;
      if (!BLOCK[s.pending!.kind]!.includes(action.role)) return false;
      openChallenge(c, action.user, action.role, true, tx(s.lang, 'whatBlock', { who: mention(s.pending!.actor), act: actLabel(s.lang, s.pending!.kind) }));
      return true;
    }
    case 'keep': {
      const ex = s.exchange;
      if (s.phase !== 'exchange' || !ex || action.user !== s.pending!.actor) return false;
      if (!ex.pool[action.index] || ex.keep.includes(action.index)) return false;
      ex.keep.push(action.index);
      if (ex.keep.length === ex.count) finishExchange(c, ex.keep);
      else promptKeep(c);
      return true;
    }
    case 'pass': {
      if (s.phase !== 'challenge' && s.phase !== 'block') return false;
      s.passed.push(action.user);
      // 能反應的都是 bot 而且都不反應：不用等計時
      if (reactors(s).every((id) => isBot(id) && s.passed.includes(id))) closeWindow(c);
      return true;
    }
    case 'timeout': {
      if (action.id !== s.timers.phase) return false;
      if (s.phase === 'exchange') {
        finishExchange(c, Array.from({ length: s.exchange!.count }, (_, i) => i));
        return true;
      }
      if (s.phase === 'block' || s.phase === 'challenge') {
        closeWindow(c);
        return true;
      }
      if (s.phase === 'lose') {
        const p = playerOf(s, s.losing[0]);
        const cards = hidden(p);
        revealCard(c, p, cards[Math.floor(c.rng() * cards.length)][1]);
        promptLose(c);
        return true;
      }
      const others = () => s.players.filter((x) => x.id !== current(s).id && alive(x));
      if (s.phase === 'action') {
        if (current(s).coins < 10) return declare(c, current(s).id, 'income');
        declare(c, current(s).id, 'coup');
        return chooseTarget(c, current(s).id, others()[Math.floor(c.rng() * others().length)].id);
      }
      if (s.phase === 'target') return chooseTarget(c, s.pending!.actor, others()[Math.floor(c.rng() * others().length)].id);
      return false;
    }
  }
}

export function applyCoup(state: KState | undefined, action: KAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winner,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
    afterChange: runBots,
  });
}

function createLobby(prev: KState | undefined, host: string, channel: string): Result {
  const created: KState = {
    game: 'coup',
    channel,
    host,
    phase: 'lobby',
    players: [{ id: host, cards: [], coins: 0 }],
    deck: [],
    turn: 0,
    losing: [],
    after: 'next',
    passed: [],
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
