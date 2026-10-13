// 蟑螂撲克遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyCockroach(state, action, rng) → { state, events }。
import { randomBotName } from './botLines.js';
import { isBot, mention, type GameEvent, type Rng } from './engine.js';

export const MIN_COCKROACH_PLAYERS = 2;
export const MAX_COCKROACH_PLAYERS = 6;
const TITLE = '蟑螂撲克';
const STEP_MS = 120_000;
const LOSE_AT = 4;

export type Bug = 'cockroach' | 'rat' | 'fly' | 'scorpion' | 'stinkbug' | 'spider' | 'toad' | 'bat';
export const BUGS: { bug: Bug; emoji: string; name: string }[] = [
  { bug: 'cockroach', emoji: '🪳', name: '蟑螂' },
  { bug: 'rat', emoji: '🐀', name: '老鼠' },
  { bug: 'fly', emoji: '🪰', name: '蒼蠅' },
  { bug: 'scorpion', emoji: '🦂', name: '蠍子' },
  { bug: 'stinkbug', emoji: '🪲', name: '臭蟲' },
  { bug: 'spider', emoji: '🕷️', name: '蜘蛛' },
  { bug: 'toad', emoji: '🐸', name: '青蛙' },
  { bug: 'bat', emoji: '🦇', name: '蝙蝠' },
];
const info = (b: Bug) => BUGS.find((x) => x.bug === b)!;
const label = (b: Bug) => `${info(b).emoji} ${info(b).name}`;
export const isBug = (b: string): b is Bug => BUGS.some((x) => x.bug === b);

export type CrPhase = 'lobby' | 'give' | 'respond' | 'pass' | 'ended';

export interface CrPlayer {
  id: string;
  hand: Bug[];
  front: Bug[]; // 面前朝上的牌
}

export interface CrCard {
  bug: Bug;
  claim: Bug;
  from: string; // 最後一位傳牌（宣稱）的人
  to: string; // 現在拿著牌的人
  seen: string[]; // 看過這張牌的人
}

export interface CrState {
  game: 'cockroach';
  channel: string;
  host: string;
  phase: CrPhase;
  players: CrPlayer[];
  turn: number;
  step: number; // 換人或換步驟就 +1，舊的按鈕和選單用它判斷過期
  card?: CrCard;
  loser?: string;
  timerSeq: number;
  timers: { phase?: number };
}

export type CrAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'play'; user: string }
  | { type: 'hand'; user: string }
  | { type: 'card'; user: string; step: number; bug: Bug }
  | { type: 'target'; user: string; step: number; bug: Bug; target: string }
  | { type: 'give'; user: string; step: number; bug: Bug; target: string; claim: Bug }
  | { type: 'answer'; user: string; step: number; yes: boolean }
  | { type: 'peek'; user: string; step: number }
  | { type: 'passMenu'; user: string }
  | { type: 'to'; user: string; step: number; target: string }
  | { type: 'pass'; user: string; step: number; target: string; claim: Bug }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<CrAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: CrState;
  events: GameEvent[];
}

interface Ctx {
  s: CrState;
  events: GameEvent[];
  rng: Rng;
}

const lobbyEvent = (s: CrState): GameEvent => ({
  type: 'lobby',
  title: TITLE,
  host: s.host,
  players: s.players.map((p) => p.id),
  open: s.phase === 'lobby',
});

const find = (s: CrState, id: string) => s.players.find((p) => p.id === id);
const count = (bugs: Bug[], b: Bug) => bugs.filter((x) => x === b).length;
const pickOne = <T>(rng: Rng, xs: T[]) => xs[Math.floor(rng() * xs.length)];
const groups = (bugs: Bug[]) => BUGS.filter((b) => bugs.includes(b.bug)).map((b) => ({ bug: b.bug, n: count(bugs, b.bug) }));
const longList = (bugs: Bug[]) => groups(bugs).map((g) => `${label(g.bug)} ×${g.n}`).join('、') || '（沒有）';
const shortList = (bugs: Bug[]) => groups(bugs).map((g) => `${info(g.bug).emoji}×${g.n}`).join(' ') || '—';
const status = (s: CrState) => s.players.map((p) => `${mention(p.id)} 手牌 ${p.hand.length}｜面前 ${shortList(p.front)}`).join('\n');
// 還沒看過這張牌、可以接手的人
const unseen = (s: CrState) => s.players.filter((p) => p.id !== s.card!.to && !s.card!.seen.includes(p.id)).map((p) => p.id);

const reply = (c: Ctx, to: string, text: string) => {
  c.events.push({ type: 'ephemeral', to, text });
  return false;
};
const menu = (c: Ctx, user: string, text: string, options: { value: string; label: string }[]) => {
  c.events.push({ type: 'prompt', kind: 'cockroach', audience: 'ephemeral', user, text, options });
  return false;
};
const HAND = { value: 'hand', label: '🃏 我的手牌' };

function startTimer(c: Ctx) {
  c.s.timers.phase = ++c.s.timerSeq;
  c.events.push({ type: 'startTimer', id: c.s.timerSeq, ms: STEP_MS });
}

function promptGive(c: Ctx) {
  const s = c.s;
  s.phase = 'give';
  s.step++;
  const p = s.players[s.turn];
  c.events.push(
    { type: 'announce', text: `👉 輪到 ${mention(p.id)} 出牌（${STEP_MS / 60_000} 分鐘）\n${status(s)}` },
    {
      type: 'prompt',
      kind: 'cockroach',
      audience: 'channel',
      text: `${mention(p.id)} 請按「🪳 出牌」選一張牌、要傳給誰、要說它是什麼`,
      options: [{ value: 'play', label: '🪳 出牌' }, HAND],
    },
  );
  startTimer(c);
}

function promptRespond(c: Ctx) {
  const s = c.s;
  s.phase = 'respond';
  s.step++;
  const card = s.card!;
  const name = info(card.claim).name;
  c.events.push({
    type: 'prompt',
    kind: 'cockroach',
    audience: 'channel',
    text: `${mention(card.to)}：這是 ${label(card.claim)} 嗎？（${STEP_MS / 60_000} 分鐘）`,
    options: [
      { value: `yes:${s.step}`, label: `✅ 是 ${name}` },
      { value: `no:${s.step}`, label: `❌ 不是 ${name}` },
      ...(unseen(s).length ? [{ value: `peek:${s.step}`, label: '👀 偷看再傳' }] : []),
      HAND,
    ],
  });
  startTimer(c);
}

function giveCard(c: Ctx, user: string, bug: Bug, target: string, claim: Bug): boolean {
  const s = c.s;
  if (s.phase !== 'give' || s.players[s.turn].id !== user) return reply(c, user, '還沒輪到你。');
  const p = s.players[s.turn];
  if (!p.hand.includes(bug)) return reply(c, user, '你手上沒有這種牌。');
  if (target === user || !find(s, target)) return reply(c, user, '不能傳給這個人。');
  p.hand.splice(p.hand.indexOf(bug), 1);
  s.card = { bug, claim, from: user, to: target, seen: [user] };
  c.events.push({ type: 'announce', text: `📨 ${mention(user)} 傳了一張牌給 ${mention(target)}：「這是 ${label(claim)}」` });
  promptRespond(c);
  return true;
}

function answer(c: Ctx, user: string, yes: boolean): boolean {
  const s = c.s;
  if (s.phase !== 'respond' || s.card!.to !== user) return reply(c, user, '這張牌不在你手上。');
  const card = s.card!;
  const correct = yes === (card.bug === card.claim);
  const taker = correct ? card.from : card.to;
  c.events.push({
    type: 'announce',
    text: `🃏 ${mention(user)} 說「${yes ? '是' : '不是'} ${label(card.claim)}」，翻開是 ${label(card.bug)}！${mention(user)} 猜${correct ? '對' : '錯'}了，牌放在 ${mention(taker)} 面前`,
  });
  return place(c, taker, card.bug);
}

function place(c: Ctx, taker: string, bug: Bug): boolean {
  const s = c.s;
  const p = find(s, taker)!;
  p.front.push(bug);
  s.card = undefined;
  if (count(p.front, bug) >= LOSE_AT) {
    endGame(c, taker, `面前有 ${LOSE_AT} 張 ${label(bug)}`);
    return true;
  }
  s.turn = s.players.indexOf(p);
  if (!p.hand.length) {
    endGame(c, taker, '輪到出牌時手上沒有牌了');
    return true;
  }
  promptGive(c);
  return true;
}

function peek(c: Ctx, user: string): boolean {
  const s = c.s;
  if (s.phase !== 'respond' || s.card!.to !== user) return reply(c, user, '這張牌不在你手上。');
  if (!unseen(s).length) return reply(c, user, '其他人都看過這張牌了，只能回答是或不是。');
  s.card!.seen.push(user);
  s.phase = 'pass';
  s.step++;
  c.events.push(
    { type: 'announce', text: `👀 ${mention(user)} 偷看了這張牌，準備傳下去（${STEP_MS / 60_000} 分鐘）` },
    { type: 'prompt', kind: 'cockroach', audience: 'channel', text: `${mention(user)} 要把牌傳給誰？`, options: [{ value: 'passmenu', label: '📨 傳下去' }, HAND] },
  );
  if (!isBot(user)) passMenu(c, user);
  startTimer(c);
  return true;
}

function passMenu(c: Ctx, user: string): boolean {
  const s = c.s;
  if (s.phase !== 'pass' || s.card!.to !== user) return reply(c, user, '現在不能傳牌。');
  return menu(
    c,
    user,
    `這張牌是 ${label(s.card!.bug)}，要傳給誰？（只有你看得到）`,
    unseen(s).map((id) => ({ value: `to:${s.step}:${id}`, label: id })),
  );
}

function passCard(c: Ctx, user: string, target: string, claim: Bug): boolean {
  const s = c.s;
  if (s.phase !== 'pass' || s.card!.to !== user) return reply(c, user, '現在不能傳牌。');
  if (!unseen(s).includes(target)) return reply(c, user, '只能傳給還沒看過這張牌的人。');
  Object.assign(s.card!, { from: user, to: target, claim });
  c.events.push({ type: 'announce', text: `📨 ${mention(user)} 把牌傳給 ${mention(target)}：「這是 ${label(claim)}」` });
  promptRespond(c);
  return true;
}

function endGame(c: Ctx, loser: string, why: string) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  s.loser = loser;
  const lines = s.players.map((p) => `${mention(p.id)}：面前 ${shortList(p.front)}`);
  c.events.push(
    { type: 'announce', text: `🪳 遊戲結束，${mention(loser)} 輸了：${why}\n${lines.join('\n')}` },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

function playMenu(c: Ctx, user: string): boolean {
  const s = c.s;
  if (!find(s, user)) return reply(c, user, '你不在這局遊戲裡。');
  if (s.phase !== 'give' || s.players[s.turn].id !== user) return reply(c, user, '還沒輪到你。');
  const options = groups(s.players[s.turn].hand).map((g) => ({ value: `card:${s.step}:${g.bug}`, label: `${label(g.bug)} ×${g.n}` }));
  return menu(c, user, '選一張要傳出去的牌（只有你看得到）', options);
}

function targetMenu(c: Ctx, user: string, bug: Bug): boolean {
  const s = c.s;
  if (s.phase !== 'give' || s.players[s.turn].id !== user) return reply(c, user, '還沒輪到你。');
  if (!s.players[s.turn].hand.includes(bug)) return reply(c, user, '你手上沒有這種牌。');
  const others = s.players.filter((p) => p.id !== user);
  return menu(c, user, `要把 ${label(bug)} 傳給誰？`, others.map((p) => ({ value: `tgt:${s.step}:${bug}:${p.id}`, label: p.id })));
}

const claimOptions = (prefix: string, target: string) => BUGS.map((b) => ({ value: `${prefix}:${b.bug}:${target}`, label: `${b.emoji} ${b.name}` }));

function claimMenu(c: Ctx, user: string, bug: Bug, target: string): boolean {
  const s = c.s;
  if (s.phase !== 'give' || s.players[s.turn].id !== user) return reply(c, user, '還沒輪到你。');
  if (target === user || !find(s, target)) return reply(c, user, '不能傳給這個人。');
  return menu(c, user, `要跟 ${mention(target)} 說這是什麼？（可以說謊）`, claimOptions(`claim:${s.step}:${bug}`, target));
}

function sayMenu(c: Ctx, user: string, target: string): boolean {
  const s = c.s;
  if (s.phase !== 'pass' || s.card!.to !== user) return reply(c, user, '現在不能傳牌。');
  if (!unseen(s).includes(target)) return reply(c, user, '只能傳給還沒看過這張牌的人。');
  return menu(c, user, `要跟 ${mention(target)} 說這是什麼？（可以說謊）`, claimOptions(`say:${s.step}`, target));
}

function showHand(c: Ctx, user: string): boolean {
  const p = find(c.s, user);
  if (!p) return reply(c, user, '你不在這局遊戲裡。');
  return reply(c, user, `🃏 你的手牌：${longList(p.hand)}，共 ${p.hand.length} 張\n面前：${longList(p.front)}`);
}

// 帶 step 的按鈕：step 不同就是過期的選單
function stale(c: Ctx, user: string, step: number) {
  if (step === c.s.step) return false;
  reply(c, user, '這個選單已經過期。');
  return true;
}

function onTimeout(c: Ctx): boolean {
  const s = c.s;
  if (s.phase === 'give') {
    const p = s.players[s.turn];
    const bug = pickOne(c.rng, p.hand);
    const target = pickOne(c.rng, s.players.filter((x) => x.id !== p.id)).id;
    c.events.push({ type: 'announce', text: `⏰ 時間到，系統替 ${mention(p.id)} 出牌` });
    return giveCard(c, p.id, bug, target, bug);
  }
  if (s.phase === 'respond') {
    c.events.push({ type: 'announce', text: `⏰ 時間到，系統替 ${mention(s.card!.to)} 回答「不是」` });
    return answer(c, s.card!.to, false);
  }
  if (s.phase === 'pass') {
    c.events.push({ type: 'announce', text: `⏰ 時間到，系統替 ${mention(s.card!.to)} 把牌傳下去` });
    return passCard(c, s.card!.to, pickOne(c.rng, unseen(s)), s.card!.claim);
  }
  return false;
}

// 從 ids 中選面前 bug 最多的人（同張數隨機）
function mostFront(s: CrState, ids: string[], bug: Bug, rng: Rng) {
  const n = (id: string) => count(find(s, id)!.front, bug);
  const best = Math.max(...ids.map(n));
  return pickOne(rng, ids.filter((id) => n(id) === best));
}

// bot 只用自己看得到的資訊：自己的手牌、所有人面前的牌、偷看過的牌
function nextBotAction(s: CrState, rng: Rng): GameAction | null {
  if (s.phase === 'give') {
    const me = s.players[s.turn];
    if (!isBot(me.id)) return null;
    const gs = groups(me.hand);
    const most = Math.max(...gs.map((g) => g.n));
    const bug = pickOne(rng, gs.filter((g) => g.n === most)).bug;
    const target = mostFront(s, s.players.filter((p) => p.id !== me.id).map((p) => p.id), bug, rng);
    const claim = rng() < 0.5 ? bug : pickOne(rng, BUGS.filter((b) => b.bug !== bug)).bug;
    return { type: 'give', user: me.id, step: s.step, bug, target, claim };
  }
  const card = s.card;
  if (!card || !isBot(card.to)) return null;
  const me = find(s, card.to)!;
  if (s.phase === 'respond') {
    const known = count(me.hand, card.claim) + s.players.reduce((n, p) => n + count(p.front, card.claim), 0);
    const canPass = unseen(s).length > 0;
    if (known >= 8) return { type: 'answer', user: me.id, step: s.step, yes: false };
    if (canPass && (count(me.front, card.claim) >= LOSE_AT - 1 || rng() < 0.3)) return { type: 'peek', user: me.id, step: s.step };
    return { type: 'answer', user: me.id, step: s.step, yes: rng() < 0.5 };
  }
  if (s.phase === 'pass') {
    const target = mostFront(s, unseen(s), card.bug, rng);
    return { type: 'pass', user: me.id, step: s.step, target, claim: rng() < 0.5 ? card.bug : card.claim };
  }
  return null;
}

function runBots(c: Ctx) {
  for (let i = 0; i < 1000; i++) {
    const action = nextBotAction(c.s, c.rng);
    if (!action || !handle(c, action)) return;
  }
}

function shuffle<T>(xs: T[], rng: Rng) {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

function startGame(c: Ctx) {
  const s = c.s;
  const n = s.players.length;
  c.events.push(lobbyEvent({ ...s, phase: 'give' }));
  const deck = shuffle(BUGS.flatMap((b) => Array<Bug>(8).fill(b.bug)), c.rng);
  for (const p of s.players) {
    p.hand = [];
    p.front = [];
  }
  deck.forEach((b, i) => s.players[i % n].hand.push(b));
  s.turn = Math.floor(c.rng() * n);
  c.events.push({
    type: 'announce',
    text: [
      '🪳 蟑螂撲克開始！64 張牌全部發完',
      `座位順序：${s.players.map((p) => mention(p.id)).join(' → ')}`,
      `手牌：${s.players.map((p) => `${mention(p.id)} ${p.hand.length} 張`).join('、')}`,
      `第一位出牌：${mention(s.players[s.turn].id)}`,
      `面前同一種害蟲 ${LOSE_AT} 張，或輪到你出牌時手上沒牌，就輸了`,
    ].join('\n'),
  });
  for (const p of s.players.filter((x) => !isBot(x.id))) {
    c.events.push({ type: 'dm', to: p.id, text: `${RULES}\n\n🃏 你的手牌：${longList(p.hand)}，共 ${p.hand.length} 張` });
  }
  promptGive(c);
}

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join': {
      if (s.phase !== 'lobby') return reply(c, action.user, '遊戲已經開始了。');
      if (find(s, action.user)) return reply(c, action.user, '你已經在房間裡了。');
      if (s.players.length >= MAX_COCKROACH_PLAYERS) return reply(c, action.user, '房間已滿。');
      s.players.push(newPlayer(action.user));
      c.events.push(lobbyEvent(s));
      return true;
    }
    case 'leave': {
      if (!find(s, action.user)) return false;
      if (s.phase !== 'lobby') return reply(c, action.user, '遊戲已經開始了，不能離開。');
      if (action.user === s.host) {
        s.phase = 'ended';
        c.events.push(lobbyEvent(s), { type: 'announce', text: '🛑 房主離開，遊戲已取消。' });
        return true;
      }
      s.players = s.players.filter((p) => p.id !== action.user);
      c.events.push(lobbyEvent(s));
      return true;
    }
    case 'addBot': {
      if (action.user !== s.host) return reply(c, action.user, '只有房主可以加入 bot。');
      if (s.phase !== 'lobby') return reply(c, action.user, '遊戲已經開始了。');
      const room = MAX_COCKROACH_PLAYERS - s.players.length;
      const bots = s.players.filter((p) => isBot(p.id));
      const taken = new Set(bots.map((p) => p.id.split(':')[2]));
      for (let i = 1; i <= Math.min(action.count, room); i++) {
        const name = randomBotName(c.rng, taken);
        taken.add(name);
        s.players.push(newPlayer(`bot:${bots.length + i}:${name}`));
      }
      if (room > 0) c.events.push(lobbyEvent(s));
      if (action.count > room) reply(c, action.user, '房間已滿。');
      return room > 0;
    }
    case 'removeBot': {
      if (action.user !== s.host) return reply(c, action.user, '只有房主可以移除 bot。');
      if (s.phase !== 'lobby') return reply(c, action.user, '遊戲已經開始了。');
      const bots = s.players.filter((p) => isBot(p.id));
      if (!bots.length) return reply(c, action.user, '房間裡沒有 bot。');
      const removed = new Set(bots.slice(-action.count).map((p) => p.id));
      s.players = s.players.filter((p) => !removed.has(p.id));
      c.events.push(lobbyEvent(s));
      return true;
    }
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, '只有房主可以開始遊戲。');
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_COCKROACH_PLAYERS) return reply(c, action.user, `目前 ${n} 人，至少需要 ${MIN_COCKROACH_PLAYERS} 人才能開始。`);
      startGame(c);
      return true;
    }
    case 'cancel': {
      if (action.user !== s.host) return reply(c, action.user, '只有房主可以取消遊戲。');
      s.phase = 'ended';
      s.timers = {};
      c.events.push({ type: 'announce', text: '🛑 房主已取消遊戲。' });
      return true;
    }
    case 'play':
      return playMenu(c, action.user);
    case 'hand':
      return showHand(c, action.user);
    case 'passMenu':
      return passMenu(c, action.user);
    case 'card':
      return stale(c, action.user, action.step) ? false : targetMenu(c, action.user, action.bug);
    case 'target':
      return stale(c, action.user, action.step) ? false : claimMenu(c, action.user, action.bug, action.target);
    case 'give':
      return stale(c, action.user, action.step) ? false : giveCard(c, action.user, action.bug, action.target, action.claim);
    case 'answer':
      return stale(c, action.user, action.step) ? false : answer(c, action.user, action.yes);
    case 'peek':
      return stale(c, action.user, action.step) ? false : peek(c, action.user);
    case 'to':
      return stale(c, action.user, action.step) ? false : sayMenu(c, action.user, action.target);
    case 'pass':
      return stale(c, action.user, action.step) ? false : passCard(c, action.user, action.target, action.claim);
    case 'timeout':
      return action.id === s.timers.phase ? onTimeout(c) : false;
  }
}

const RULES = [
  '🪳 *蟑螂撲克* 規則摘要',
  '• 8 種害蟲各 8 張，全部發完；手牌只有你知道',
  '• 輪到你時選一張牌蓋著傳給別人，說「這是 X」（可以說謊）',
  '• 收到牌的人回答「是」或「不是」；猜對，牌放在傳牌的人面前；猜錯，放在自己面前',
  '• 也可以偷看後傳給還沒看過的人，重新宣稱',
  `• 面前同一種害蟲 ${LOSE_AT} 張，或輪到你出牌時手上沒牌，你就輸了`,
  '• 隨時按「🃏 我的手牌」看自己的牌',
].join('\n');

const newPlayer = (id: string): CrPlayer => ({ id, hand: [], front: [] });

export function applyCockroach(state: CrState | undefined, action: CrAction, rng: Rng): Result {
  if (action.type === 'new') {
    if (state && state.phase !== 'ended') {
      return { state, events: [{ type: 'ephemeral', to: action.user, text: '這個頻道已經有遊戲了。' }] };
    }
    return createLobby(state, action.user, action.channel);
  }
  if (action.type === 'rematch') {
    if (!state) return { state: state!, events: [] };
    if (state.phase !== 'ended') return { state, events: [{ type: 'ephemeral', to: action.user, text: '這個頻道已經有遊戲了。' }] };
    if (!state.loser) return { state, events: [] };
    if (isBot(action.user) || !find(state, action.user)) {
      return { state, events: [{ type: 'ephemeral', to: action.user, text: '只有上一局的玩家可以開新的一局。' }] };
    }
    return createLobby(state, action.user, action.channel);
  }
  if (!state || state.phase === 'ended') return { state: state!, events: [] };
  const c: Ctx = { s: structuredClone(state), events: [], rng };
  const changed = handle(c, action);
  if (changed) runBots(c);
  return { state: changed ? c.s : state, events: c.events };
}

function createLobby(prev: CrState | undefined, host: string, channel: string): Result {
  const created: CrState = {
    game: 'cockroach',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    turn: 0,
    step: 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(created)] };
}
