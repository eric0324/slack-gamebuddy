// 犯人在跳舞（犯人は踊る）遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyCriminal(state, action, rng) → { state, events }。
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';

export const MIN_CRIMINAL_PLAYERS = 3;
export const MAX_CRIMINAL_PLAYERS = 8;
const TITLE = '犯人在跳舞';
const CHOOSE_MS = 60_000;

export type Card = 'first' | 'culprit' | 'detective' | 'alibi' | 'accomplice' | 'witness' | 'exchange' | 'trade' | 'rumor' | 'citizen' | 'boy' | 'dog';

const CARDS: { card: Card; label: string; count: number; help: string }[] = [
  { card: 'first', label: '🔎 第一發現者', count: 1, help: '開局時自動打出' },
  { card: 'culprit', label: '🔪 犯人', count: 1, help: '手上只剩這張時才能出，打出就逃跑成功（犯人和共犯贏）' },
  { card: 'detective', label: '🕵️ 偵探', count: 4, help: '第 2 圈開始才能出；指認一人，他拿著犯人又沒有不在場證明就抓到' },
  { card: 'alibi', label: '🛡️ 不在場證明', count: 5, help: '留在手上時，偵探指到你也不算抓到' },
  { card: 'accomplice', label: '🤝 共犯', count: 2, help: '打出後加入犯人陣營' },
  { card: 'witness', label: '👀 目擊者', count: 3, help: '偷看一人的整副手牌' },
  { card: 'exchange', label: '🔄 情報交換', count: 3, help: '有牌的人各選一張傳給下一位' },
  { card: 'trade', label: '💱 交易', count: 5, help: '和一人各選一張交換' },
  { card: 'rumor', label: '🗣️ 謠言', count: 4, help: '有牌的人從上一位手上隨機抽一張' },
  { card: 'citizen', label: '🧍 普通人', count: 2, help: '沒有效果' },
  { card: 'boy', label: '👦 少年', count: 1, help: '知道現在誰拿著犯人' },
  { card: 'dog', label: '🐕 神犬', count: 1, help: '從一人的手牌盲抽一張，抽到犯人就抓到；沒抽到神犬進他的手牌' },
];
const LABEL = Object.fromEntries(CARDS.map((c) => [c.card, c.label])) as Record<Card, string>;
export const FULL_DECK: Card[] = CARDS.flatMap((c) => Array<Card>(c.count).fill(c.card));
const HELP = CARDS.map((c) => `${c.label}×${c.count}：${c.help}`).join('\n');
const TARGETED: Card[] = ['detective', 'witness', 'trade', 'dog'];

// 官方人數表：必放的牌，其餘從剩下的牌隨機補滿
const REQUIRED: Record<number, Card[]> = {
  3: ['first', 'culprit', 'detective', 'alibi'],
  4: ['first', 'culprit', 'detective', 'alibi', 'accomplice'],
  5: ['first', 'culprit', 'detective', 'alibi', 'alibi', 'accomplice'],
  6: ['first', 'culprit', 'detective', 'detective', 'alibi', 'alibi', 'accomplice', 'accomplice'],
  7: ['first', 'culprit', 'detective', 'detective', 'alibi', 'alibi', 'alibi', 'accomplice', 'accomplice'],
  8: FULL_DECK,
};

export function buildDeck(n: number, rng: Rng): Card[] {
  const rest = [...FULL_DECK];
  for (const card of REQUIRED[n]) rest.splice(rest.indexOf(card), 1);
  return shuffle([...REQUIRED[n], ...shuffle(rest, rng).slice(0, n * 4 - REQUIRED[n].length)], rng);
}

export interface CPlayer {
  id: string;
  hand: Card[];
  played: Card[];
  accomplice: boolean;
}

export interface CState {
  game: 'criminal';
  channel: string;
  host: string;
  phase: 'lobby' | 'turn' | 'target' | 'choose' | 'dog' | 'ended';
  players: CPlayer[];
  turn: number;
  first: number; // 第一發現者持有者的座位：輪回這個座位就進入下一圈
  lap: number;
  seq: number; // 每個決策點 +1，選單帶著它擋掉舊選單
  pending?: { card: Card; index: number };
  choose?: { kind: 'exchange' | 'trade'; by: string; target?: string; picks: Record<string, number | null> };
  dog?: { by: string; target: string; order: number[] };
  knows: Record<string, string>; // bot → 它知道拿著犯人的玩家；牌移動後清空
  outcome?: { side: 'culprit' | 'detective' | 'dog'; by: string; culprit: string };
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
  | { type: 'hand'; user: string }
  | { type: 'play'; user: string; seq: number; index: number }
  | { type: 'target'; user: string; seq: number; target: string }
  | { type: 'give'; user: string; seq: number; index: number }
  | { type: 'draw'; user: string; seq: number; slot: number }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<CAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: CState;
  events: GameEvent[];
}

interface Ctx {
  s: CState;
  events: GameEvent[];
  rng: Rng;
}

const pick = <T>(items: T[], rng: Rng): T => items[Math.floor(rng() * items.length)];
const current = (s: CState) => s.players[s.turn];
const playerOf = (s: CState, id: string) => s.players.find((p) => p.id === id);
const say = (c: Ctx, text: string) => c.events.push({ type: 'announce', text });
const dm = (c: Ctx, to: string, text: string) => {
  if (!isBot(to)) c.events.push({ type: 'dm', to, text });
};
const handText = (cards: Card[]) => (cards.length ? cards.map((x) => LABEL[x]).join('、') : '（沒有牌）');
const holderOf = (s: CState) => s.players.find((p) => p.hand.includes('culprit'));
const AUTO = '⏰（超時自動）';

// 每張牌能不能出；不能出時回傳原因
function blocked(p: CPlayer, i: number, lap: number): string | undefined {
  const card = p.hand[i];
  if (card === 'culprit' && p.hand.length > 1) return '手上只剩這張時才能出';
  if (card === 'detective' && lap === 1 && !p.hand.every((x) => x === 'detective' || x === 'culprit')) return '第 2 圈開始才能出';
  return undefined;
}
const playable = (p: CPlayer, lap: number) => p.hand.map((_, i) => i).filter((i) => !blocked(p, i, lap));
const targetsFor = (s: CState, p: CPlayer) => s.players.filter((x) => x.id !== p.id && x.hand.length).map((x) => x.id);
// 交易出了以後手上沒牌就沒有效果，也不用選對象
const needsTarget = (p: CPlayer, card: Card) => TARGETED.includes(card) && (card !== 'trade' || p.hand.length > 1);

function start(c: Ctx) {
  const s = c.s;
  const deck = buildDeck(s.players.length, c.rng);
  s.players.forEach((p, i) => Object.assign(p, { hand: deck.slice(i * 4, i * 4 + 4), played: [], accomplice: false }));
  c.events.push({
    type: 'announce',
    text: [
      `🕺 犯人在跳舞開始！每人 4 張牌，座位順序：${s.players.map((p) => mention(p.id)).join(' → ')}`,
      '犯人撐到手上最後一張打出就逃跑成功：犯人和共犯贏。',
      '用偵探或神犬抓到犯人：只有出那張牌的人贏（出牌的人是共犯時沒有人贏）。',
    ].join('\n'),
    gif: 'start',
  });
  for (const p of s.players) dm(c, p.id, `🃏 你的手牌：${handText(p.hand)}\n\n${HELP}`);
  s.first = s.players.findIndex((p) => p.hand.includes('first'));
  const holder = s.players[s.first];
  holder.hand.splice(holder.hand.indexOf('first'), 1);
  holder.played.push('first');
  say(c, `🃏 ${mention(holder.id)} 打出 ${LABEL.first}，事件發生了！`);
  s.turn = s.first;
  s.lap = 1;
  advance(c);
}

// 輪到下一位手上有牌的人；經過第一發現者的座位就進入下一圈
function advance(c: Ctx) {
  const s = c.s;
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const k = (s.turn + i) % n;
    if (k === s.first) s.lap++;
    if (s.players[k].hand.length) {
      s.turn = k;
      break;
    }
  }
  beginTurn(c);
}

function beginTurn(c: Ctx) {
  const s = c.s;
  s.phase = 'turn';
  s.seq++;
  s.pending = undefined;
  const lines = [`🕺 第 ${s.lap} 圈，輪到 ${mention(current(s).id)} 出牌（${CHOOSE_MS / 1000} 秒）`];
  for (const p of s.players) {
    const played = p.played.length ? p.played.map((x) => LABEL[x]).join('、') : '（還沒有）';
    lines.push(`${mention(p.id)}：手牌 ${p.hand.length} 張，出過 ${played}${p.accomplice ? '｜🤝 共犯陣營' : ''}`);
  }
  c.events.push({ type: 'prompt', kind: 'criminal', audience: 'channel', text: lines.join('\n'), options: [{ value: 'hand', label: '🃏 我的手牌' }] });
  startTimer(c, CHOOSE_MS);
}

function showHand(c: Ctx, user: string) {
  const s = c.s;
  const p = playerOf(s, user);
  if (!p) return reply(c, user, '你不在這局遊戲裡。');
  if (s.phase === 'target' && current(s).id === user) return promptTargets(c);
  if (s.phase === 'choose' && s.choose!.picks[user] === null) return promptGive(c, p);
  if (s.phase === 'dog' && s.dog!.by === user) return promptDraw(c);
  if (s.phase !== 'turn' || current(s).id !== user) return reply(c, user, `🃏 你的手牌：${handText(p.hand)}`);
  const lines = p.hand.map((x, i) => `• ${LABEL[x]}${blocked(p, i, s.lap) ? `（不能出：${blocked(p, i, s.lap)}）` : ''}`);
  c.events.push({
    type: 'prompt',
    kind: 'criminal',
    audience: 'ephemeral',
    user,
    text: `🃏 選一張牌打出\n${lines.join('\n')}`,
    options: playable(p, s.lap).map((i) => ({ value: `play:${s.seq}:${i}`, label: LABEL[p.hand[i]] })),
  });
  return false;
}

function promptTargets(c: Ctx) {
  const s = c.s;
  const p = current(s);
  c.events.push({
    type: 'prompt',
    kind: 'criminal',
    audience: 'ephemeral',
    user: p.id,
    text: `🎯 選擇 ${LABEL[s.pending!.card]} 的對象`,
    options: targetsFor(s, p).map((id) => ({ value: `target:${s.seq}:${id}`, label: id })),
  });
  return false;
}

function promptGive(c: Ctx, p: CPlayer) {
  const s = c.s;
  const what = s.choose!.kind === 'exchange' ? '傳給下一位' : '拿去交換';
  c.events.push({
    type: 'prompt',
    kind: 'criminal',
    audience: 'ephemeral',
    user: p.id,
    text: `🤫 選一張牌${what}（只有你看得到）`,
    options: p.hand.map((x, i) => ({ value: `give:${s.seq}:${i}`, label: LABEL[x] })),
  });
  return false;
}

function promptDraw(c: Ctx) {
  const s = c.s;
  const { by, target, order } = s.dog!;
  c.events.push({
    type: 'prompt',
    kind: 'criminal',
    audience: 'ephemeral',
    user: by,
    text: `🐕 從 ${mention(target)} 的手牌盲抽一張`,
    options: order.map((_, slot) => ({ value: `draw:${s.seq}:${slot}`, label: `第 ${slot + 1} 張` })),
  });
  return false;
}

function playCard(c: Ctx, user: string, seq: number, index: number): boolean {
  const s = c.s;
  if (!playerOf(s, user)) return reply(c, user, '你不在這局遊戲裡。');
  if (s.phase !== 'turn' || current(s).id !== user) return reply(c, user, '還沒輪到你。');
  if (seq !== s.seq) return reply(c, user, '這個選單已經過期了。');
  const p = current(s);
  if (!playable(p, s.lap).includes(index)) return reply(c, user, '這張牌現在不能出。');
  return choose(c, p, index);
}

// 選了一張牌：需要對象就等選對象，否則直接打出
function choose(c: Ctx, p: CPlayer, index: number, auto = false): boolean {
  const s = c.s;
  const card = p.hand[index];
  const targets = targetsFor(s, p);
  if (!needsTarget(p, card) || !targets.length || auto) {
    return resolve(c, p, index, needsTarget(p, card) && targets.length ? pick(targets, c.rng) : undefined, auto);
  }
  s.phase = 'target';
  s.pending = { card, index };
  s.seq++;
  promptTargets(c);
  startTimer(c, CHOOSE_MS);
  return true;
}

function chooseTarget(c: Ctx, user: string, seq: number, target: string): boolean {
  const s = c.s;
  if (s.phase !== 'target' || current(s).id !== user) return reply(c, user, '還沒輪到你。');
  if (seq !== s.seq) return reply(c, user, '這個選單已經過期了。');
  const p = current(s);
  if (!targetsFor(s, p).includes(target)) return reply(c, user, '不能選這個人。');
  return resolve(c, p, s.pending!.index, target);
}

// 打出一張牌並發動效果
function resolve(c: Ctx, p: CPlayer, index: number, targetId?: string, auto = false): boolean {
  const s = c.s;
  const card = p.hand.splice(index, 1)[0];
  p.played.push(card);
  const t = targetId ? playerOf(s, targetId) : undefined;
  const head = `${auto ? `${AUTO} ` : ''}🃏 ${mention(p.id)} ${t ? `對 ${mention(t.id)} ` : ''}打出 ${LABEL[card]}`;
  if (TARGETED.includes(card) && !t) {
    say(c, card === 'trade' ? `${head}，但手上沒有牌了，沒有效果。` : `${head}，但沒有可以選的對象，沒有效果。`);
  } else if (card === 'culprit') {
    say(c, `${head}！`);
    return endGame(c, { side: 'culprit', by: p.id, culprit: p.id });
  } else if (card === 'detective' && t) {
    if (t.hand.includes('culprit') && !t.hand.includes('alibi')) {
      say(c, `${head}…`);
      return endGame(c, { side: 'detective', by: p.id, culprit: t.id });
    }
    say(c, `${head}…${mention(t.id)} 不是犯人。`);
  } else if (card === 'accomplice') {
    p.accomplice = true;
    say(c, `${head}，加入犯人陣營！`);
  } else if (card === 'witness' && t) {
    dm(c, p.id, `👀 ${mention(t.id)} 的手牌：${handText(t.hand)}`);
    if (t.hand.includes('culprit')) s.knows[p.id] = t.id;
    say(c, `${head}。`);
  } else if (card === 'boy') {
    const holder = holderOf(s)!;
    dm(c, p.id, `👦 現在拿著犯人的是 ${holder.id === p.id ? '你自己' : mention(holder.id)}`);
    if (holder.id !== p.id) s.knows[p.id] = holder.id;
    say(c, `${head}。`);
  } else if (card === 'rumor') {
    say(c, `${head}，每個人從上一位手上抽一張牌。`);
    rumor(c);
  } else if (card === 'exchange' || (card === 'trade' && t)) {
    say(c, `${head}。`);
    const pickers = card === 'exchange' ? s.players.filter((x) => x.hand.length).map((x) => x.id) : [p.id, t!.id];
    if (pickers.length >= 2) return startChoose(c, card as 'exchange' | 'trade', p.id, t?.id, pickers);
    say(c, '只有一個人手上有牌，沒有效果。');
  } else if (card === 'dog' && t) {
    say(c, `${head}，從 ${mention(t.id)} 的手牌盲抽一張…`);
    s.phase = 'dog';
    s.dog = { by: p.id, target: t.id, order: shuffle(t.hand.map((_, i) => i), c.rng) };
    s.seq++;
    if (auto) return draw(c, Math.floor(c.rng() * t.hand.length), true);
    promptDraw(c);
    startTimer(c, CHOOSE_MS);
    return true;
  } else {
    say(c, `${head}。`);
  }
  advance(c);
  return true;
}

// 謠言：有牌的人同時從上一位有牌的人手上隨機抽一張（以抽之前的手牌為準）
function rumor(c: Ctx) {
  const s = c.s;
  const ring = s.players.filter((x) => x.hand.length);
  if (ring.length < 2) return;
  const taken = ring.map((from) => from.hand.splice(Math.floor(c.rng() * from.hand.length), 1)[0]);
  ring.forEach((from, i) => {
    const to = ring[(i + 1) % ring.length];
    to.hand.push(taken[i]);
    dm(c, to.id, `🗣️ 你從 ${mention(from.id)} 手上抽到 ${LABEL[taken[i]]}，手牌：${handText(to.hand)}`);
  });
  s.knows = {};
}

function startChoose(c: Ctx, kind: 'exchange' | 'trade', by: string, target: string | undefined, pickers: string[]): boolean {
  const s = c.s;
  s.phase = 'choose';
  s.choose = { kind, by, target, picks: Object.fromEntries(pickers.map((id) => [id, null])) };
  s.seq++;
  say(c, `🤫 等 ${pickers.map(mention).join('、')} 私下選一張牌…`);
  for (const id of pickers) if (!isBot(id)) promptGive(c, playerOf(s, id)!);
  startTimer(c, CHOOSE_MS);
  return true;
}

function give(c: Ctx, user: string, seq: number, index: number): boolean {
  const s = c.s;
  if (s.phase !== 'choose' || !(user in s.choose!.picks)) return reply(c, user, '現在不需要你選牌。');
  if (seq !== s.seq) return reply(c, user, '這個選單已經過期了。');
  if (s.choose!.picks[user] !== null) return reply(c, user, '你已經選好了。');
  if (!playerOf(s, user)!.hand[index]) return false;
  s.choose!.picks[user] = index;
  if (Object.values(s.choose!.picks).every((v) => v !== null)) settle(c);
  return true;
}

// 全部選好：情報交換傳給下一位有牌的人，交易兩人互換
function settle(c: Ctx, auto = false) {
  const s = c.s;
  const ids = s.players.map((p) => p.id).filter((id) => id in s.choose!.picks);
  const ring = ids.map((id) => playerOf(s, id)!);
  const out = ring.map((p) => p.hand.splice(s.choose!.picks[p.id]!, 1)[0]);
  ring.forEach((from, i) => {
    const to = ring[(i + 1) % ring.length];
    to.hand.push(out[i]);
    dm(c, to.id, `🤫 你交出 ${LABEL[out[(i + 1) % ring.length]]}，拿到 ${LABEL[out[i]]}，手牌：${handText(to.hand)}`);
  });
  say(c, `${auto ? `${AUTO} ` : ''}${s.choose!.kind === 'exchange' ? '🔄 情報交換完成。' : '💱 交易完成。'}`);
  s.choose = undefined;
  s.knows = {};
  advance(c);
}

function draw(c: Ctx, slot: number, auto = false): boolean {
  const s = c.s;
  const { by, target, order } = s.dog!;
  const t = playerOf(s, target)!;
  const card = t.hand[order[slot]];
  s.dog = undefined;
  s.knows = {};
  if (card === 'culprit') {
    say(c, `${auto ? `${AUTO} ` : ''}🐕 ${mention(by)} 從 ${mention(target)} 手上抽到 ${LABEL.culprit}！`);
    return endGame(c, { side: 'dog', by, culprit: target });
  }
  t.hand.push('dog');
  say(c, `${auto ? `${AUTO} ` : ''}🐕 ${mention(by)} 從 ${mention(target)} 手上抽到 ${LABEL[card]}，放回去；神犬進了 ${mention(target)} 的手牌。`);
  dm(c, target, `🐕 神犬進了你的手牌，手牌：${handText(t.hand)}`);
  advance(c);
  return true;
}

function drawAction(c: Ctx, user: string, seq: number, slot: number): boolean {
  const s = c.s;
  if (s.phase !== 'dog' || s.dog!.by !== user) return reply(c, user, '還沒輪到你。');
  if (seq !== s.seq) return reply(c, user, '這個選單已經過期了。');
  if (!(slot in s.dog!.order)) return false;
  return draw(c, slot);
}

function endGame(c: Ctx, outcome: NonNullable<CState['outcome']>): boolean {
  const s = c.s;
  const allies = s.players.filter((p) => p.accomplice).map((p) => p.id);
  const by = playerOf(s, outcome.by)!;
  const winners = outcome.side === 'culprit' ? [...new Set([outcome.by, ...allies])] : by.accomplice ? [] : [outcome.by];
  s.phase = 'ended';
  s.timers = {};
  s.outcome = outcome;
  s.winners = winners;
  const lines = [
    outcome.side === 'culprit' ? `🏃 犯人 ${mention(outcome.culprit)} 逃跑成功！`
    : `🚨 ${mention(outcome.by)} 抓到犯人 ${mention(outcome.culprit)}！（${outcome.side === 'detective' ? '偵探' : '神犬'}）`,
    winners.length ? `🏆 ${winners.map(mention).join('、')} 獲勝！` : `🤝 ${mention(outcome.by)} 是共犯，這局沒有人獲勝。`,
    `🔪 犯人：${mention(outcome.culprit)}｜🤝 共犯：${allies.length ? allies.map(mention).join('、') : '沒有'}`,
    ...s.players.map((p) => `${mention(p.id)} 最後的手牌：${handText(p.hand)}`),
  ];
  c.events.push(
    { type: 'result', players: s.players.map((p) => p.id), winners },
    { type: 'announce', text: lines.join('\n'), gif: outcome.side === 'culprit' ? 'wolvesWin' : 'goodWin' },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
  return true;
}

function timeout(c: Ctx): boolean {
  const s = c.s;
  if (s.phase === 'turn') return choose(c, current(s), pick(playable(current(s), s.lap), c.rng), true);
  if (s.phase === 'target') return resolve(c, current(s), s.pending!.index, pick(targetsFor(s, current(s)), c.rng), true);
  if (s.phase === 'dog') return draw(c, Math.floor(c.rng() * s.dog!.order.length), true);
  if (s.phase !== 'choose') return false;
  for (const [id, v] of Object.entries(s.choose!.picks)) {
    if (v === null) s.choose!.picks[id] = Math.floor(c.rng() * playerOf(s, id)!.hand.length);
  }
  settle(c, true);
  return true;
}

// bot：知道誰拿犯人就出偵探指認；留著不在場證明；拿著犯人時交出別張；神犬隨機抽
function botPlay(c: Ctx, p: CPlayer) {
  const s = c.s;
  const legal = playable(p, s.lap);
  const known = s.knows[p.id];
  const targets = targetsFor(s, p);
  const det = legal.find((i) => p.hand[i] === 'detective');
  if (det !== undefined && known && targets.includes(known)) return resolve(c, p, det, known);
  const keep = legal.filter((i) => p.hand[i] !== 'alibi');
  const index = pick(keep.length ? keep : legal, c.rng);
  const card = p.hand[index];
  if (!needsTarget(p, card) || !targets.length) return resolve(c, p, index);
  const smart = (card === 'detective' || card === 'dog') && known && targets.includes(known);
  return resolve(c, p, index, smart ? known : pick(targets, c.rng));
}

function botGive(p: CPlayer, rng: Rng): number {
  const all = p.hand.map((_, i) => i);
  const safe = all.filter((i) => p.hand[i] !== 'culprit');
  const spare = safe.filter((i) => p.hand[i] !== 'alibi');
  return pick(spare.length ? spare : safe.length ? safe : all, rng);
}

function runBots(c: Ctx) {
  const s = c.s;
  for (let i = 0; i < 10_000; i++) {
    if (s.phase === 'turn' && isBot(current(s).id)) botPlay(c, current(s));
    else if (s.phase === 'dog' && isBot(s.dog!.by)) draw(c, Math.floor(c.rng() * s.dog!.order.length));
    else if (s.phase === 'choose') {
      const bots = Object.keys(s.choose!.picks).filter((id) => isBot(id) && s.choose!.picks[id] === null);
      if (!bots.length) return;
      for (const id of bots) s.choose!.picks[id] = botGive(playerOf(s, id)!, c.rng);
      if (Object.values(s.choose!.picks).every((v) => v !== null)) settle(c);
    } else return;
  }
}

const newPlayer = (id: string): CPlayer => ({ id, hand: [], played: [], accomplice: false });

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_CRIMINAL_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_CRIMINAL_PLAYERS, newPlayer);
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, '只有房主可以開始遊戲。');
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_CRIMINAL_PLAYERS) return reply(c, action.user, `目前 ${n} 人，至少需要 ${MIN_CRIMINAL_PLAYERS} 人才能開始。`);
      c.events.push(lobbyEvent(TITLE, { ...s, phase: 'turn' }));
      start(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user);
    case 'hand':
      if (s.phase === 'lobby') return false;
      return showHand(c, action.user);
    case 'play':
      return playCard(c, action.user, action.seq, action.index);
    case 'target':
      return chooseTarget(c, action.user, action.seq, action.target);
    case 'give':
      return give(c, action.user, action.seq, action.index);
    case 'draw':
      return drawAction(c, action.user, action.seq, action.slot);
    case 'timeout':
      if (action.id !== s.timers.phase) return false;
      return timeout(c);
  }
}

export function applyCriminal(state: CState | undefined, action: CAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
    afterChange: runBots,
  });
}

function createLobby(prev: CState | undefined, host: string, channel: string): Result {
  const created: CState = {
    game: 'criminal',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    turn: 0,
    first: 0,
    lap: 0,
    seq: prev?.seq ?? 0,
    knows: {},
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
