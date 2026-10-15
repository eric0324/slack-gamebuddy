// 骷髏與玫瑰遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applySkull(state, action, rng) → { state, events }。
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, startTimer } from './common.js';

export const MIN_SKULL_PLAYERS = 3;
export const MAX_SKULL_PLAYERS = 6;
const TITLE = '骷髏與玫瑰';
const STEP_MS = 120_000;
const WINS = 2;
const ICON = { rose: '🌹', skull: '💀' } as const;
const NAME = { rose: '一朵玫瑰', skull: '骷髏' } as const;

export type Disc = 'rose' | 'skull';
export type SkPhase = 'lobby' | 'place' | 'turn' | 'bid' | 'flip' | 'ended';

export interface SkPlayer {
  id: string;
  hand: Disc[];
  stack: Disc[]; // 最後一個是最上面
  flipped: number; // 挑戰時這疊從上面翻開了幾張
  wins: number;
}

export interface SkState {
  game: 'skull';
  channel: string;
  host: string;
  phase: SkPhase;
  players: SkPlayer[];
  round: number;
  step: number; // 換階段或換人就 +1，舊的按鈕和選單用它判斷過期
  starter: number;
  turn: number;
  bid?: { n: number; by: string };
  passed: string[];
  revealed: number; // 挑戰者已經翻開幾朵玫瑰
  winner?: string;
  timerSeq: number;
  timers: { phase?: number };
}

export type SkAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'placeMenu'; user: string }
  | { type: 'challengeMenu'; user: string }
  | { type: 'mine'; user: string }
  | { type: 'disc'; user: string; step: number; disc: Disc }
  | { type: 'bid'; user: string; step: number; n: number }
  | { type: 'pass'; user: string; step: number }
  | { type: 'flip'; user: string; step: number; target: string }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<SkAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: SkState;
  events: GameEvent[];
}

interface Ctx {
  s: SkState;
  events: GameEvent[];
  rng: Rng;
}

const alive = (p: SkPlayer) => p.hand.length + p.stack.length > 0;
const aliveCount = (s: SkState) => s.players.filter(alive).length;
const total = (s: SkState) => s.players.reduce((n, p) => n + p.stack.length, 0);
const current = (s: SkState) => s.players[s.turn];
const find = (s: SkState, id: string) => s.players.find((p) => p.id === id);
const safeDisc = (p: SkPlayer): Disc => (p.hand.includes('rose') ? 'rose' : 'skull');
const status = (s: SkState) =>
  s.players.filter(alive).map((p) => `${mention(p.id)} 疊 ${p.stack.length} 張・手上 ${p.hand.length} 張`).join('｜');

const menu = (c: Ctx, user: string, text: string, options: { value: string; label: string }[], perRow?: number) => {
  c.events.push({ type: 'prompt', kind: 'skull', audience: 'ephemeral', user, text, options, ...(perRow ? { perRow } : {}) });
  return false;
};
const MINE = { value: 'mine', label: '👀 我的牌' };

// 下一位還沒出局（而且不在 skip 裡）的玩家
function nextFrom(s: SkState, from: number, skip: string[] = []) {
  for (let i = 1; i <= s.players.length; i++) {
    const k = (from + i) % s.players.length;
    if (alive(s.players[k]) && !skip.includes(s.players[k].id)) return k;
  }
  return from;
}

// 新的一輪：所有人收回牌，同時蓋第一張
function startRound(c: Ctx, starter: number) {
  const s = c.s;
  s.round++;
  s.step++;
  s.phase = 'place';
  s.starter = starter;
  s.turn = starter;
  s.bid = undefined;
  s.passed = [];
  s.revealed = 0;
  for (const p of s.players) {
    p.hand = [...p.hand, ...p.stack];
    p.stack = [];
    p.flipped = 0;
  }
  c.events.push(
    {
      type: 'announce',
      text: `🃏 第 ${s.round} 輪：${s.players.filter(alive).map((p) => `${mention(p.id)} ${p.hand.length} 張（成功 ${p.wins}）`).join('、')}\n大家同時蓋第一張牌，之後從 ${mention(s.players[starter].id)} 開始（${STEP_MS / 60_000} 分鐘）`,
    },
    {
      type: 'prompt',
      kind: 'skull',
      audience: 'channel',
      text: '按「🃏 蓋牌」選一張蓋下去（只有你看得到選了什麼）',
      options: [{ value: 'place', label: '🃏 蓋牌' }, MINE],
    },
  );
  startTimer(c, STEP_MS);
}

function put(c: Ctx, p: SkPlayer, disc: Disc) {
  p.hand.splice(p.hand.indexOf(disc), 1);
  p.stack.push(disc);
}

function placeDisc(c: Ctx, user: string, disc: Disc): boolean {
  const s = c.s;
  const p = find(s, user);
  if (!p || !alive(p)) return reply(c, user, '你不在這局遊戲裡。');
  if (s.phase === 'place') {
    if (p.stack.length) return reply(c, user, '你這輪已經蓋過第一張牌了。');
  } else if (s.phase !== 'turn' || current(s).id !== user) {
    return reply(c, user, s.phase === 'turn' ? '還沒輪到你。' : '現在不能蓋牌。');
  }
  if (!p.hand.includes(disc)) return reply(c, user, '你手上沒有這種牌。');
  put(c, p, disc);
  if (s.phase === 'turn') {
    c.events.push({ type: 'announce', text: `🃏 ${mention(user)} 再蓋一張` });
    s.turn = nextFrom(s, s.turn);
    promptTurn(c);
    return true;
  }
  const done = s.players.filter((x) => alive(x) && x.stack.length).length;
  c.events.push({ type: 'announce', text: `🃏 ${mention(user)} 蓋了一張牌（${done}/${aliveCount(s)}）` });
  if (done === aliveCount(s)) promptTurn(c, true);
  return true;
}

// 還沒人喊數：輪到的人再蓋一張或開始挑戰
function promptTurn(c: Ctx, first = false) {
  const s = c.s;
  s.phase = 'turn';
  s.step++;
  const p = current(s);
  c.events.push(
    { type: 'announce', text: `${first ? '✅ 大家都蓋好了。' : ''}👉 輪到 ${mention(p.id)}：再蓋一張或開始挑戰（${STEP_MS / 60_000} 分鐘）\n${status(s)}` },
    {
      type: 'prompt',
      kind: 'skull',
      audience: 'channel',
      text: `${mention(p.id)} 請選擇`,
      options: [...(p.hand.length ? [{ value: 'place', label: '🃏 再蓋一張' }] : []), { value: 'challenge', label: '📢 開始挑戰' }, MINE],
    },
  );
  startTimer(c, STEP_MS);
}

function promptBid(c: Ctx) {
  const s = c.s;
  s.step++;
  const p = current(s);
  const nums = Array.from({ length: total(s) - s.bid!.n }, (_, i) => s.bid!.n + 1 + i);
  c.events.push(
    { type: 'announce', text: `📢 目前最高 ${s.bid!.n}（${mention(s.bid!.by)}）。輪到 ${mention(p.id)}：加注或放棄（${STEP_MS / 60_000} 分鐘）` },
    {
      type: 'prompt',
      kind: 'skull',
      audience: 'channel',
      text: `${mention(p.id)} 要喊多少？（桌上共 ${total(s)} 張）`,
      options: [...nums.map((n) => ({ value: `bid:${s.step}:${n}`, label: `${n}` })), { value: `pass:${s.step}`, label: '🙅 放棄' }, MINE],
      perRow: 6,
    },
  );
  startTimer(c, STEP_MS);
}

function placeBid(c: Ctx, user: string, n: number): boolean {
  const s = c.s;
  if ((s.phase !== 'turn' && s.phase !== 'bid') || current(s).id !== user) return reply(c, user, '還沒輪到你。');
  const min = (s.bid?.n ?? 0) + 1;
  if (!Number.isInteger(n) || n < min || n > total(s)) return reply(c, user, `要喊 ${min}～${total(s)}。`);
  s.bid = { n, by: user };
  c.events.push({ type: 'announce', text: `📢 ${mention(user)} 喊 ${n}：能翻開 ${n} 朵玫瑰` });
  if (n === total(s)) return startFlip(c);
  s.phase = 'bid';
  s.turn = nextFrom(s, s.turn, s.passed);
  promptBid(c);
  return true;
}

function passBid(c: Ctx, user: string): boolean {
  const s = c.s;
  if (s.phase !== 'bid' || current(s).id !== user) return reply(c, user, '還沒輪到你。');
  s.passed.push(user);
  c.events.push({ type: 'announce', text: `🙅 ${mention(user)} 放棄` });
  if (s.players.filter((p) => alive(p) && !s.passed.includes(p.id)).length === 1) return startFlip(c);
  s.turn = nextFrom(s, s.turn, s.passed);
  promptBid(c);
  return true;
}

// 挑戰者先自動翻開自己整疊（由上往下）
function startFlip(c: Ctx): boolean {
  const s = c.s;
  s.phase = 'flip';
  s.revealed = 0;
  const me = find(s, s.bid!.by)!;
  const shown: string[] = [];
  while (me.flipped < me.stack.length) {
    const d = me.stack[me.stack.length - 1 - me.flipped++];
    shown.push(ICON[d]);
    if (d === 'skull') {
      c.events.push({ type: 'announce', text: `🔍 ${mention(me.id)} 先翻開自己的牌：${shown.join(' ')}` });
      return fail(c, me.id);
    }
    s.revealed++;
  }
  c.events.push({ type: 'announce', text: `🔍 ${mention(me.id)} 先翻開自己的牌：${shown.join(' ')}` });
  if (s.revealed >= s.bid!.n) return success(c);
  promptFlip(c);
  return true;
}

const flipChoices = (s: SkState) => s.players.filter((p) => p.id !== s.bid!.by && p.flipped < p.stack.length);

function promptFlip(c: Ctx) {
  const s = c.s;
  s.step++;
  c.events.push({
    type: 'prompt',
    kind: 'skull',
    audience: 'channel',
    text: `🔍 ${mention(s.bid!.by)} 已翻開 ${s.revealed}／${s.bid!.n} 朵玫瑰，選要翻誰的牌（${STEP_MS / 60_000} 分鐘）`,
    options: [...flipChoices(s).map((p) => ({ value: `flip:${s.step}:${p.id}`, label: `翻 ${p.id} （剩 ${p.stack.length - p.flipped} 張）` })), MINE],
  });
  startTimer(c, STEP_MS);
}

function flipOne(c: Ctx, user: string, target: string): boolean {
  const s = c.s;
  if (s.phase !== 'flip' || s.bid!.by !== user) return reply(c, user, '只有挑戰者可以翻牌。');
  const t = flipChoices(s).find((p) => p.id === target);
  if (!t) return reply(c, user, '這個人沒有可以翻的牌了。');
  const d = t.stack[t.stack.length - 1 - t.flipped++];
  c.events.push({ type: 'announce', text: `🔍 ${mention(user)} 翻開 ${mention(t.id)} 的牌：${ICON[d]}` });
  if (d === 'skull') return fail(c, t.id);
  s.revealed++;
  if (s.revealed >= s.bid!.n) return success(c);
  promptFlip(c);
  return true;
}

function success(c: Ctx): boolean {
  const s = c.s;
  const me = find(s, s.bid!.by)!;
  me.wins++;
  c.events.push({ type: 'announce', text: `🎉 ${mention(me.id)} 挑戰成功！（成功 ${me.wins} 次）` });
  if (me.wins >= WINS) endGame(c, me.id);
  else startRound(c, s.players.indexOf(me));
  return true;
}

// 挑戰失敗：收回牌後隨機拿走挑戰者 1 張，只私訊他失去哪一種
function fail(c: Ctx, owner: string): boolean {
  const s = c.s;
  const me = find(s, s.bid!.by)!;
  const idx = s.players.indexOf(me);
  c.events.push({ type: 'announce', text: `💥 翻到${owner === me.id ? '自己' : ` ${mention(owner)} `}的骷髏，${mention(me.id)} 挑戰失敗！` });
  me.hand = [...me.hand, ...me.stack];
  me.stack = [];
  const [lost] = me.hand.splice(Math.floor(c.rng() * me.hand.length), 1);
  c.events.push({ type: 'announce', text: `🗑️ ${mention(me.id)} 失去一張牌，剩 ${me.hand.length} 張` });
  if (!isBot(me.id)) {
    const left = me.hand.length ? me.hand.map((d) => ICON[d]).join(' ') : '沒有牌了';
    c.events.push({ type: 'dm', to: me.id, text: `🗑️ 你失去了${NAME[lost]}，剩下：${left}` });
  }
  if (!me.hand.length) c.events.push({ type: 'announce', text: `☠️ ${mention(me.id)} 出局（沒有牌了）！` });
  const left = s.players.filter(alive);
  if (left.length === 1) {
    endGame(c, left[0].id);
    return true;
  }
  const starter = me.hand.length ? idx : owner !== me.id ? s.players.findIndex((p) => p.id === owner) : nextFrom(s, idx);
  startRound(c, starter);
  return true;
}

function endGame(c: Ctx, winner: string) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  s.winner = winner;
  const lines = s.players.map((p) => `${mention(p.id)}：成功 ${p.wins} 次、剩 ${p.hand.length + p.stack.length} 張`);
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: [winner] });
  c.events.push(
    { type: 'announce', text: `🏆 遊戲結束，${mention(winner)} 獲勝！\n${lines.join('\n')}`, gif: 'goodWin' },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

function placeMenu(c: Ctx, user: string): boolean {
  const s = c.s;
  const p = find(s, user);
  if (!p || !alive(p)) return reply(c, user, '你不在這局遊戲裡。');
  if (s.phase === 'place') {
    if (p.stack.length) return reply(c, user, '你這輪已經蓋過第一張牌了。');
  } else if (s.phase !== 'turn' || current(s).id !== user) {
    return reply(c, user, s.phase === 'turn' ? '還沒輪到你。' : '現在不能蓋牌。');
  }
  const options = (['rose', 'skull'] as Disc[])
    .filter((d) => p.hand.includes(d))
    .map((d) => ({ value: `disc:${s.step}:${d}`, label: d === 'rose' ? '🌹 蓋玫瑰' : '💀 蓋骷髏' }));
  return menu(c, user, '選一張蓋下去（只有你看得到）', options);
}

function challengeMenu(c: Ctx, user: string): boolean {
  const s = c.s;
  if (s.phase !== 'turn' || current(s).id !== user) return reply(c, user, '還沒輪到你。');
  const options = Array.from({ length: total(s) }, (_, i) => ({ value: `bid:${s.step}:${i + 1}`, label: `${i + 1}` }));
  return menu(c, user, `你能翻開幾朵玫瑰？（桌上共 ${total(s)} 張，只有你看得到）`, options, 6);
}

function showMine(c: Ctx, user: string): boolean {
  const s = c.s;
  const p = find(s, user);
  if (!p || s.phase === 'lobby') return reply(c, user, '你不在這局遊戲裡。');
  if (!alive(p)) return reply(c, user, '你已經出局了。');
  const roses = p.hand.filter((d) => d === 'rose').length;
  const skull = p.hand.includes('skull') ? '骷髏在手上' : '骷髏不在手上';
  const stack = p.stack.length ? p.stack.map((d) => ICON[d]).join(' → ') : '（沒有）';
  return reply(
    c,
    user,
    `👀 你的牌：手上 ${roses} 朵玫瑰、${skull}\n牌疊（由下到上）：${stack}\n共 ${p.hand.length + p.stack.length} 張，成功 ${p.wins} 次`,
  );
}

// 帶 step 的按鈕：step 不同就是過期的選單
function stale(c: Ctx, user: string, step: number) {
  if (step === c.s.step) return false;
  reply(c, user, '這個選單已經過期。');
  return true;
}

function onTimeout(c: Ctx): boolean {
  const s = c.s;
  switch (s.phase) {
    case 'place': {
      for (const p of s.players.filter((x) => alive(x) && !x.stack.length)) {
        put(c, p, safeDisc(p));
        c.events.push({ type: 'announce', text: `⏰ 時間到，系統替 ${mention(p.id)} 蓋了一張牌` });
      }
      promptTurn(c, true);
      return true;
    }
    case 'turn': {
      const p = current(s);
      return p.hand.length ? placeDisc(c, p.id, safeDisc(p)) : placeBid(c, p.id, 1);
    }
    case 'bid':
      return passBid(c, current(s).id);
    case 'flip': {
      const choices = flipChoices(s);
      return flipOne(c, s.bid!.by, choices[Math.floor(c.rng() * choices.length)].id);
    }
    default:
      return false;
  }
}

// bot：安全數 = 自己牌疊沒有骷髏時是張數 + 1，有骷髏時是 0
function nextBotAction(s: SkState, rng: Rng): GameAction | null {
  const pick = (p: SkPlayer): Disc => (p.hand.includes('skull') && (rng() < 0.3 || !p.hand.includes('rose')) ? 'skull' : 'rose');
  const safe = (p: SkPlayer) => (p.stack.includes('skull') ? 0 : p.stack.length + 1);
  if (s.phase === 'place') {
    const bot = s.players.find((p) => isBot(p.id) && alive(p) && !p.stack.length);
    return bot ? { type: 'disc', user: bot.id, step: s.step, disc: pick(bot) } : null;
  }
  if (s.phase === 'flip') {
    if (!isBot(s.bid!.by)) return null;
    const choices = flipChoices(s);
    return { type: 'flip', user: s.bid!.by, step: s.step, target: choices[Math.floor(rng() * choices.length)].id };
  }
  const me = current(s);
  if (!isBot(me.id)) return null;
  if (s.phase === 'turn') {
    if (me.hand.length && (total(s) < aliveCount(s) * 2 || safe(me) === 0)) return { type: 'disc', user: me.id, step: s.step, disc: pick(me) };
    return { type: 'bid', user: me.id, step: s.step, n: Math.min(Math.max(safe(me), 1), total(s)) };
  }
  if (s.phase === 'bid') {
    const n = s.bid!.n + 1;
    return n <= safe(me) && n <= total(s) ? { type: 'bid', user: me.id, step: s.step, n } : { type: 'pass', user: me.id, step: s.step };
  }
  return null;
}

function runBots(c: Ctx) {
  for (let i = 0; i < 1000; i++) {
    const action = nextBotAction(c.s, c.rng);
    if (!action || !handle(c, action)) return;
  }
}

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_SKULL_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_SKULL_PLAYERS, newPlayer);
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, '只有房主可以開始遊戲。');
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_SKULL_PLAYERS) return reply(c, action.user, `目前 ${n} 人，至少需要 ${MIN_SKULL_PLAYERS} 人才能開始。`);
      c.events.push(lobbyEvent(TITLE, { ...s, phase: 'place' }));
      for (const p of s.players) p.hand = ['rose', 'rose', 'rose', 'skull'];
      const starter = Math.floor(c.rng() * n);
      c.events.push({
        type: 'announce',
        text: `💀 骷髏與玫瑰開始！每人 3 朵🌹玫瑰、1 個💀骷髏\n座位順序：${s.players.map((p) => mention(p.id)).join(' → ')}\n起始玩家：${mention(s.players[starter].id)}\n挑戰成功 ${WINS} 次，或最後一位還有牌的人獲勝`,
      });
      for (const p of s.players.filter((x) => !isBot(x.id))) c.events.push({ type: 'dm', to: p.id, text: RULES });
      startRound(c, starter);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user);
    case 'placeMenu':
      return placeMenu(c, action.user);
    case 'challengeMenu':
      return challengeMenu(c, action.user);
    case 'mine':
      return showMine(c, action.user);
    case 'disc':
      return stale(c, action.user, action.step) ? false : placeDisc(c, action.user, action.disc);
    case 'bid':
      return stale(c, action.user, action.step) ? false : placeBid(c, action.user, action.n);
    case 'pass':
      return stale(c, action.user, action.step) ? false : passBid(c, action.user);
    case 'flip':
      return stale(c, action.user, action.step) ? false : flipOne(c, action.user, action.target);
    case 'timeout':
      return action.id === s.timers.phase ? onTimeout(c) : false;
  }
}

const RULES = [
  '💀 *骷髏與玫瑰* 規則摘要',
  '• 你有 3 朵🌹玫瑰、1 個💀骷髏，蓋了什麼只有你知道',
  '• 每輪大家先同時蓋一張；之後輪流「再蓋一張」或「開始挑戰」喊一個數字',
  '• 有人喊數後輪流加注或放棄，最高的人要翻開那麼多張牌，而且要先翻完自己的',
  '• 全是玫瑰就挑戰成功，成功 2 次獲勝；翻到骷髏就隨機失去一張牌，沒牌就出局',
  '• 隨時按「👀 我的牌」看自己的手牌和牌疊',
].join('\n');

const newPlayer = (id: string): SkPlayer => ({ id, hand: [], stack: [], flipped: 0, wins: 0 });

export function applySkull(state: SkState | undefined, action: SkAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winner,
    isPlayer: (s, user) => !!find(s, user),
    createLobby,
    handle,
    afterChange: runBots,
  });
}

function createLobby(prev: SkState | undefined, host: string, channel: string): Result {
  const created: SkState = {
    game: 'skull',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    round: 0,
    step: 0,
    starter: 0,
    turn: 0,
    passed: [],
    revealed: 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
