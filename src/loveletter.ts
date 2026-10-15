// 情書（Love Letter 2019 版）遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyLoveLetter(state, action, rng) → { state, events }。
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';

export const MIN_LOVELETTER_PLAYERS = 2;
export const MAX_LOVELETTER_PLAYERS = 6;
const TITLE = '情書';
const TURN_MS = 120_000;

export type Role = 'spy' | 'guard' | 'priest' | 'baron' | 'handmaid' | 'prince' | 'chancellor' | 'king' | 'countess' | 'princess';

export const CARDS: { role: Role; value: number; count: number; name: string; help: string }[] = [
  { role: 'spy', value: 0, count: 2, name: '間諜', help: '沒有立即效果；一輪結束時只有你出過間諜就多得 1 個好感' },
  { role: 'guard', value: 1, count: 6, name: '衛兵', help: '猜一位其他玩家的角色（不能猜衛兵），猜中他出局' },
  { role: 'priest', value: 2, count: 2, name: '神父', help: '偷看一位其他玩家的手牌' },
  { role: 'baron', value: 3, count: 2, name: '男爵', help: '和一位其他玩家私下比手牌，點數小的出局' },
  { role: 'handmaid', value: 4, count: 2, name: '侍女', help: '直到你下次輪到前，其他人的效果不能選你' },
  { role: 'prince', value: 5, count: 2, name: '王子', help: '讓一位玩家（可以是自己）棄掉手牌再抽一張' },
  { role: 'chancellor', value: 6, count: 2, name: '宰相', help: '抽 2 張，和手牌一起留 1 張，其他放回牌堆底' },
  { role: 'king', value: 7, count: 1, name: '國王', help: '和一位其他玩家交換手牌' },
  { role: 'countess', value: 8, count: 1, name: '伯爵夫人', help: '手上同時有國王或王子時一定要出伯爵夫人' },
  { role: 'princess', value: 9, count: 1, name: '公主', help: '被打出或被棄掉時你出局' },
];
const CARD = Object.fromEntries(CARDS.map((c) => [c.role, c])) as Record<Role, (typeof CARDS)[number]>;
export const TOKENS_TO_WIN: Record<number, number> = { 2: 6, 3: 5, 4: 4, 5: 3, 6: 3 };
const TARGETED: Role[] = ['guard', 'priest', 'baron', 'prince', 'king'];
const GUESSABLE: Role[] = CARDS.map((c) => c.role).filter((r) => r !== 'guard');
const HELP = CARDS.map((c) => `${c.value} ${c.name}×${c.count}：${c.help}`).join('\n');

export const cardLabel = (r: Role) => `${CARD[r].value} ${CARD[r].name}`;

export interface LPlayer {
  id: string;
  hand: Role[];
  discards: Role[]; // 這一輪打出或被棄掉的牌（公開）
  out: boolean;
  protected: boolean;
  tokens: number;
}

export interface LState {
  game: 'loveletter';
  channel: string;
  host: string;
  phase: 'lobby' | 'turn' | 'chancellor' | 'ended';
  players: LPlayer[];
  deck: Role[];
  burned?: Role; // 每輪蓋掉的 1 張
  faceUp: Role[]; // 2 人局翻開的 3 張
  round: number;
  turn: number;
  turnSeq: number; // 每個回合 +1，選單帶著它擋掉舊選單
  chancellor?: { pool: Role[] };
  lastWinners: string[];
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
}

export type LAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'hand'; user: string }
  | { type: 'log'; user: string }
  | { type: 'menu'; user: string }
  | { type: 'pick'; user: string; seq: number; index: number }
  | { type: 'target'; user: string; seq: number; index: number; target: string }
  | { type: 'play'; user: string; seq: number; index: number; target?: string; guess?: Role }
  | { type: 'keep'; user: string; seq: number; index: number }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<LAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: LState;
  events: GameEvent[];
}

interface Ctx {
  s: LState;
  events: GameEvent[];
  rng: Rng;
}

const pick = <T>(items: T[], rng: Rng): T => items[Math.floor(rng() * items.length)];
const current = (s: LState) => s.players[s.turn];
const playerOf = (s: LState, id: string) => s.players.find((p) => p.id === id);
const say = (c: Ctx, text: string) => c.events.push({ type: 'announce', text });
const dm = (c: Ctx, to: string, text: string) => {
  if (!isBot(to)) c.events.push({ type: 'dm', to, text });
};
const handText = (p: LPlayer) => p.hand.map(cardLabel).join('、');

// 每輪：洗牌、蓋 1 張（2 人局再翻開 3 張）、每人 1 張；上一輪勝者先開始
function startRound(c: Ctx) {
  const s = c.s;
  s.round++;
  s.deck = shuffle(CARDS.flatMap((x) => Array<Role>(x.count).fill(x.role)), c.rng);
  s.burned = s.deck.shift();
  s.faceUp = s.players.length === 2 ? s.deck.splice(0, 3) : [];
  s.chancellor = undefined;
  for (const p of s.players) Object.assign(p, { hand: [s.deck.shift()!], discards: [], out: false, protected: false });
  const ids = s.players.map((p) => p.id);
  s.turn = s.round === 1 ? Math.floor(c.rng() * ids.length) : ids.indexOf(pick(s.lastWinners, c.rng));
  const order = ids.map((_, i) => ids[(s.turn + i) % ids.length]);
  const lines = [
    `💌 第 ${s.round} 輪開始！順序：${order.map(mention).join(' → ')}`,
    `好感標記（先拿到 ${TOKENS_TO_WIN[ids.length]} 個獲勝）：${s.players.map((p) => `${mention(p.id)} 💌${p.tokens}`).join('、')}`,
  ];
  if (s.faceUp.length) lines.push(`翻開放在一旁：${s.faceUp.map(cardLabel).join('、')}`);
  c.events.push({ type: 'announce', text: lines.join('\n'), gif: s.round === 1 ? 'start' : undefined });
  for (const p of s.players) dm(c, p.id, `🃏 第 ${s.round} 輪，你的手牌：${handText(p)}\n\n${HELP}`);
  beginTurn(c);
}

function beginTurn(c: Ctx) {
  const s = c.s;
  const p = current(s);
  p.protected = false;
  p.hand.push(s.deck.shift()!);
  s.turnSeq++;
  s.phase = 'turn';
  say(c, `👉 輪到 ${mention(p.id)}（第 ${s.round} 輪，牌堆剩 ${s.deck.length} 張）`);
  if (!isBot(p.id)) {
    c.events.push({
      type: 'prompt',
      kind: 'loveletter',
      audience: 'channel',
      text: `${mention(p.id)} 請按「🃏 出牌」（${TURN_MS / 60_000} 分鐘）`,
      options: [
        { value: 'menu', label: '🃏 出牌' },
        { value: 'hand', label: '👀 我的手牌' },
        { value: 'log', label: '📜 棄牌紀錄' },
      ],
    });
  }
  startTimer(c, TURN_MS);
}

// 可以出的牌（同一種只列一次）：伯爵夫人和國王／王子同時在手只能出伯爵夫人；公主不能主動出
function playable(p: LPlayer): number[] {
  const forced = p.hand.includes('countess') && (p.hand.includes('king') || p.hand.includes('prince'));
  return p.hand
    .map((r, i) => [r, i] as const)
    .filter(([r, i]) => p.hand.indexOf(r) === i && r !== 'princess' && (!forced || r === 'countess'))
    .map(([, i]) => i);
}

// 可以選的目標：還在場、沒有受到保護的其他玩家；王子也可以選自己
function targetsFor(s: LState, p: LPlayer, role: Role): string[] {
  const others = s.players.filter((x) => x.id !== p.id && !x.out && !x.protected).map((x) => x.id);
  return role === 'prince' ? [...others, p.id] : others;
}

// 檢查選單的每一步：回合編號、輪到誰、這張牌能不能出；不行就回覆原因並回傳 null
function check(c: Ctx, user: string, seq: number, index: number): LPlayer | null {
  const s = c.s;
  const p = current(s);
  const error =
    seq !== s.turnSeq ? '這個選單已經過期了。'
    : s.phase !== 'turn' || p.id !== user ? '還沒輪到你。'
    : !playable(p).includes(index) ? '這張牌現在不能出。'
    : undefined;
  if (!error) return p;
  reply(c, user, error);
  return null;
}

function menu(c: Ctx, user: string): boolean {
  const s = c.s;
  const p = current(s);
  if (s.phase === 'chancellor' && p.id === user) {
    promptKeep(c); // 宰相選到一半，重新顯示選牌按鈕
    return false;
  }
  if (s.phase !== 'turn' || p.id !== user) return reply(c, user, '還沒輪到你。');
  const lines = p.hand.map((r) => `• ${cardLabel(r)}：${CARD[r].help}`);
  c.events.push({
    type: 'prompt',
    kind: 'loveletter',
    audience: 'ephemeral',
    user,
    text: `🃏 選一張牌打出\n${lines.join('\n')}`,
    options: playable(p).map((i) => ({ value: `pick:${s.turnSeq}:${i}`, label: cardLabel(p.hand[i]) })),
  });
  return false;
}

function choose(c: Ctx, user: string, seq: number, index: number): boolean {
  const p = check(c, user, seq, index);
  if (!p) return false;
  const role = p.hand[index];
  const targets = targetsFor(c.s, p, role);
  if (!TARGETED.includes(role) || !targets.length) return resolve(c, p, index);
  c.events.push({
    type: 'prompt',
    kind: 'loveletter',
    audience: 'ephemeral',
    user,
    text: `🎯 選擇 ${cardLabel(role)} 的目標`,
    options: targets.map((id) => ({ value: `tgt:${seq}:${index}:${id}`, label: id })),
  });
  return false;
}

function chooseTarget(c: Ctx, user: string, seq: number, index: number, target: string): boolean {
  const p = check(c, user, seq, index);
  if (!p) return false;
  const role = p.hand[index];
  if (!targetsFor(c.s, p, role).includes(target)) return reply(c, user, '不能選這個人。');
  if (role !== 'guard') return resolve(c, p, index, target);
  c.events.push({
    type: 'prompt',
    kind: 'loveletter',
    audience: 'ephemeral',
    user,
    text: `💂 猜 ${mention(target)} 的手牌是哪個角色`,
    options: GUESSABLE.map((r) => ({ value: `guess:${seq}:${index}:${r}:${target}`, label: cardLabel(r) })),
  });
  return false;
}

function playCard(c: Ctx, a: Extract<LAction, { type: 'play' }>): boolean {
  const p = check(c, a.user, a.seq, a.index);
  if (!p) return false;
  const role = p.hand[a.index];
  const targets = targetsFor(c.s, p, role);
  if (TARGETED.includes(role) && targets.length) {
    if (!a.target || !targets.includes(a.target)) return reply(c, a.user, '不能選這個人。');
    if (role === 'guard' && (!a.guess || !GUESSABLE.includes(a.guess))) return reply(c, a.user, '衛兵不能猜衛兵。');
  }
  return resolve(c, p, a.index, a.target, a.guess);
}

function eliminate(c: Ctx, t: LPlayer) {
  const shown = t.hand;
  t.out = true;
  t.discards.push(...shown);
  t.hand = [];
  say(c, `💀 ${mention(t.id)} 出局${shown.length ? `（手牌是 ${shown.map(cardLabel).join('、')}）` : ''}`);
}

// 打出一張牌並執行效果
function resolve(c: Ctx, p: LPlayer, index: number, targetId?: string, guess?: Role, auto = false): boolean {
  const s = c.s;
  const role = p.hand.splice(index, 1)[0];
  p.discards.push(role);
  const head = `${auto ? '⏰ 超時，系統自動出牌：' : ''}🃏 ${mention(p.id)} 打出 ${cardLabel(role)}`;
  const t = targetId && TARGETED.includes(role) ? playerOf(s, targetId) : undefined;
  if (TARGETED.includes(role) && !t) {
    say(c, `${head}，但沒有可以選的目標。`);
  } else if (role === 'guard' && t && guess) {
    const hit = t.hand[0] === guess;
    say(c, `${head}，猜 ${mention(t.id)} 是 ${cardLabel(guess)}…${hit ? '猜中了！' : '猜錯了。'}`);
    if (hit) eliminate(c, t);
  } else if (role === 'priest' && t) {
    dm(c, p.id, `👀 ${mention(t.id)} 的手牌是 ${handText(t)}`);
    say(c, `${head}，偷看了 ${mention(t.id)} 的手牌。`);
  } else if (role === 'baron' && t) {
    dm(c, p.id, `⚖️ 你和 ${mention(t.id)} 比牌：對方是 ${handText(t)}`);
    dm(c, t.id, `⚖️ ${mention(p.id)} 用男爵和你比牌：對方是 ${handText(p)}`);
    const diff = CARD[p.hand[0]].value - CARD[t.hand[0]].value;
    say(c, `${head}，和 ${mention(t.id)} 比牌${diff === 0 ? '，平手。' : '。'}`);
    if (diff !== 0) eliminate(c, diff > 0 ? t : p);
  } else if (role === 'handmaid') {
    p.protected = true;
    say(c, `${head}，直到下次輪到前受到保護。`);
  } else if (role === 'prince' && t) {
    const dropped = t.hand.shift()!;
    t.discards.push(dropped);
    say(c, `${head}，讓 ${mention(t.id)} 棄掉 ${cardLabel(dropped)}。`);
    if (dropped === 'princess') eliminate(c, t);
    else {
      let card = s.deck.shift();
      if (!card) [card, s.burned] = [s.burned, undefined]; // 牌堆空了拿蓋掉的那張
      t.hand = card ? [card] : [];
      if (card) dm(c, t.id, `🃏 你棄掉了 ${cardLabel(dropped)}，新的手牌：${cardLabel(card)}`);
    }
  } else if (role === 'chancellor') {
    const drawn = s.deck.splice(0, 2);
    if (drawn.length) {
      s.chancellor = { pool: [...p.hand, ...drawn] };
      s.phase = 'chancellor';
      say(c, `${head}，正在從 ${s.chancellor.pool.length} 張牌中選 1 張留下…`);
      promptKeep(c);
      startTimer(c, TURN_MS);
      return true;
    }
    say(c, `${head}，但牌堆沒有牌了。`);
  } else if (role === 'king' && t) {
    [p.hand, t.hand] = [t.hand, p.hand];
    dm(c, p.id, `👑 你和 ${mention(t.id)} 交換了手牌，新的手牌：${handText(p)}`);
    dm(c, t.id, `👑 ${mention(p.id)} 和你交換了手牌，新的手牌：${handText(t)}`);
    say(c, `${head}，和 ${mention(t.id)} 交換了手牌。`);
  } else if (role === 'princess') {
    say(c, `${head}…`);
    eliminate(c, p);
  } else {
    say(c, `${head}。`);
  }
  endTurn(c);
  return true;
}

function promptKeep(c: Ctx) {
  const s = c.s;
  c.events.push({
    type: 'prompt',
    kind: 'loveletter',
    audience: 'ephemeral',
    user: current(s).id,
    text: `📜 宰相：選 1 張留下，其他放回牌堆底（${TURN_MS / 60_000} 分鐘，超時留原本的牌）`,
    options: s.chancellor!.pool.map((r, i) => ({ value: `keep:${s.turnSeq}:${i}`, label: cardLabel(r) })),
  });
}

function finishChancellor(c: Ctx, k: number) {
  const s = c.s;
  const p = current(s);
  const pool = s.chancellor!.pool;
  const rest = shuffle(pool.filter((_, i) => i !== k), c.rng);
  s.deck.push(...rest);
  p.hand = [pool[k]];
  s.chancellor = undefined;
  s.phase = 'turn';
  dm(c, p.id, `📜 你留下了 ${cardLabel(pool[k])}`);
  say(c, `📜 ${mention(p.id)} 把 ${rest.length} 張牌放回牌堆底。`);
  endTurn(c);
}

function endTurn(c: Ctx) {
  const s = c.s;
  const living = s.players.filter((p) => !p.out);
  if (living.length === 1) return endRound(c, [living[0].id], false);
  if (!s.deck.length) {
    const best = Math.max(...living.map((p) => (p.hand[0] ? CARD[p.hand[0]].value : -1)));
    return endRound(c, living.filter((p) => p.hand[0] && CARD[p.hand[0]].value === best).map((p) => p.id), true);
  }
  for (let i = 1; i <= s.players.length; i++) {
    const k = (s.turn + i) % s.players.length;
    if (!s.players[k].out) {
      s.turn = k;
      break;
    }
  }
  beginTurn(c);
}

function endRound(c: Ctx, winners: string[], showdown: boolean) {
  const s = c.s;
  const living = s.players.filter((p) => !p.out);
  for (const id of winners) playerOf(s, id)!.tokens++;
  const spies = living.filter((p) => p.discards.includes('spy'));
  const lines = [`💌 第 ${s.round} 輪結束，${winners.map(mention).join('、')} 贏得這一輪！`];
  if (showdown) lines.push(`牌堆抽完，比手牌：${living.map((p) => `${mention(p.id)} ${handText(p)}`).join('、')}`);
  if (spies.length === 1) {
    spies[0].tokens++;
    lines.push(`🕵️ 只有 ${mention(spies[0].id)} 出過間諜，多得 1 個好感標記`);
  }
  if (s.burned) lines.push(`蓋掉的牌：${cardLabel(s.burned)}`);
  lines.push(`好感標記：${s.players.map((p) => `${mention(p.id)} 💌${p.tokens}`).join('、')}`);
  say(c, lines.join('\n'));
  s.lastWinners = winners;
  const reached = s.players.filter((p) => p.tokens >= TOKENS_TO_WIN[s.players.length]);
  if (!reached.length) return startRound(c);
  const top = Math.max(...reached.map((p) => p.tokens));
  endGame(c, s.players.filter((p) => p.tokens === top).map((p) => p.id));
}

function endGame(c: Ctx, winners: string[]) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  s.winners = winners;
  c.events.push(
    { type: 'announce', text: `🏆 遊戲結束，${winners.map(mention).join('、')} 獲勝！💌`, gif: 'goodWin' },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

// 每個角色還沒公開出現的張數（打出、棄掉、出局、2 人局翻開的都算公開）
function unseen(s: LState): Record<Role, number> {
  const left = Object.fromEntries(CARDS.map((x) => [x.role, x.count])) as Record<Role, number>;
  for (const r of [...s.faceUp, ...s.players.flatMap((p) => p.discards)]) left[r]--;
  return left;
}

function showLog(c: Ctx, user: string) {
  const s = c.s;
  const left = unseen(s);
  const lines = [`📜 第 ${s.round} 輪棄牌紀錄`];
  for (const p of s.players) {
    const tags = `${p.out ? ' 💀出局' : ''}${p.protected ? ' 🛡️侍女保護中' : ''}`;
    lines.push(`${mention(p.id)} 💌${p.tokens}${tags}：${p.discards.length ? p.discards.map(cardLabel).join('、') : '（還沒有）'}`);
  }
  if (s.faceUp.length) lines.push(`翻開放在一旁：${s.faceUp.map(cardLabel).join('、')}`);
  lines.push(`還沒公開的牌：${CARDS.map((x) => `${x.name} ${Math.max(0, left[x.role])}`).join('、')}`);
  c.events.push({ type: 'ephemeral', to: user, text: lines.join('\n') });
}

function showHand(c: Ctx, user: string) {
  const p = playerOf(c.s, user);
  if (!p || p.out) {
    reply(c, user, '你不在這一輪。');
    return;
  }
  const lines = [`🃏 你的手牌：${handText(p)}`];
  if (p.protected) lines.push('🛡️ 受到侍女保護中');
  lines.push(`💌 好感標記：${p.tokens}`);
  c.events.push({ type: 'ephemeral', to: user, text: lines.join('\n') });
}

// 超時（smart=false）和 bot（smart=true）共用的自動出牌
function autoPlay(c: Ctx, p: LPlayer, smart: boolean) {
  const opts = playable(p);
  const maid = opts.find((i) => p.hand[i] === 'handmaid');
  const index = smart && maid !== undefined ? maid : opts.reduce((a, b) => (CARD[p.hand[b]].value < CARD[p.hand[a]].value ? b : a));
  const role = p.hand[index];
  const targets = targetsFor(c.s, p, role);
  const others = targets.filter((id) => id !== p.id);
  const target = TARGETED.includes(role) && targets.length ? pick(smart && others.length ? others : targets, c.rng) : undefined;
  const left = unseen(c.s);
  const guesses = smart ? GUESSABLE.filter((r) => left[r] > 0) : GUESSABLE;
  const guess = role === 'guard' ? pick(guesses.length ? guesses : GUESSABLE, c.rng) : undefined;
  resolve(c, p, index, target, guess, !smart);
}

const bestIndex = (pool: Role[]) => pool.reduce((a, r, i) => (CARD[r].value > CARD[pool[a]].value ? i : a), 0);

function runBots(c: Ctx) {
  const s = c.s;
  for (let i = 0; i < 10_000; i++) {
    if (s.phase !== 'turn' && s.phase !== 'chancellor') return;
    const p = current(s);
    if (!isBot(p.id)) return;
    if (s.phase === 'chancellor') finishChancellor(c, bestIndex(s.chancellor!.pool));
    else autoPlay(c, p, true);
  }
}

const newPlayer = (id: string): LPlayer => ({ id, hand: [], discards: [], out: false, protected: false, tokens: 0 });

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_LOVELETTER_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_LOVELETTER_PLAYERS, newPlayer);
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, '只有房主可以開始遊戲。');
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_LOVELETTER_PLAYERS) return reply(c, action.user, `目前 ${n} 人，至少需要 ${MIN_LOVELETTER_PLAYERS} 人才能開始。`);
      c.events.push(lobbyEvent(TITLE, { ...s, phase: 'turn' }));
      startRound(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user);
    case 'hand':
      showHand(c, action.user);
      return false;
    case 'log':
      if (s.phase === 'lobby') return false;
      showLog(c, action.user);
      return false;
    case 'menu':
      return menu(c, action.user);
    case 'pick':
      return choose(c, action.user, action.seq, action.index);
    case 'target':
      return chooseTarget(c, action.user, action.seq, action.index, action.target);
    case 'play':
      return playCard(c, action);
    case 'keep': {
      if (s.phase !== 'chancellor' || action.seq !== s.turnSeq || current(s).id !== action.user) return reply(c, action.user, '這個選單已經過期了。');
      if (!s.chancellor!.pool[action.index]) return false;
      finishChancellor(c, action.index);
      return true;
    }
    case 'timeout': {
      if (action.id !== s.timers.phase) return false;
      if (s.phase === 'chancellor') finishChancellor(c, 0);
      else if (s.phase === 'turn') autoPlay(c, current(s), false);
      else return false;
      return true;
    }
  }
}

export function applyLoveLetter(state: LState | undefined, action: LAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
    afterChange: runBots,
  });
}

function createLobby(prev: LState | undefined, host: string, channel: string): Result {
  const created: LState = {
    game: 'loveletter',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    deck: [],
    faceUp: [],
    round: 0,
    turn: 0,
    turnSeq: prev?.turnSeq ?? 0,
    lastWinners: [],
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
