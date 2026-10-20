// 炸彈貓 (Exploding Kittens 原版) 遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyKittens(state, action, rng) → { state, events }。
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';

export const MIN_KITTENS_PLAYERS = 2;
export const MAX_KITTENS_PLAYERS = 5;
const TITLE = '炸彈貓';
export const PLAY_MS = 60_000;
export const NOPE_MS = 5_000;
export const FAVOR_MS = 30_000;
export const PLACE_MS = 30_000;

export const CATS = ['taco', 'melon', 'potato', 'beard', 'rainbow'] as const;
export type Cat = (typeof CATS)[number];
// 手牌的固定順序 (也是選單排序)；炸彈不會留在手上
export const CARDS = ['defuse', 'nope', 'attack', 'skip', 'favor', 'shuffle', 'future', ...CATS] as const;
export type Card = 'bomb' | (typeof CARDS)[number];
const ACTIONS = ['attack', 'skip', 'favor', 'shuffle', 'future'] as const;
type ActionCard = (typeof ACTIONS)[number];

export const CARD_NAME: Record<Card, string> = {
  bomb: '💣 炸彈貓',
  defuse: '🧯 拆解',
  nope: '🚫 反對',
  attack: '⚔️ 攻擊',
  skip: '⏭️ 跳過',
  favor: '🙏 索取',
  shuffle: '🔀 洗牌',
  future: '🔮 預見未來',
  taco: '🌮 塔可貓',
  melon: '🍉 西瓜貓',
  potato: '🥔 馬鈴薯貓',
  beard: '🧔 鬍子貓',
  rainbow: '🌈 彩虹貓',
};
const COPIES: Record<Exclude<Card, 'bomb' | 'defuse'>, number> = {
  nope: 5, attack: 4, skip: 4, favor: 4, shuffle: 4, future: 5, taco: 4, melon: 4, potato: 4, beard: 4, rainbow: 4,
};
// 被索取時 bot 給牌的順序：越前面越不重要
const GIVE_ORDER: Card[] = [...CATS, 'shuffle', 'future', 'favor', 'skip', 'attack', 'nope', 'defuse'];
export type Pos = 'top' | '2' | '3' | 'bottom' | 'random';

export interface KPlayer {
  id: string;
  hand: Card[];
  out?: number; // 第幾個出局
}

export interface KState {
  game: 'kittens';
  channel: string;
  host: string;
  phase: 'lobby' | 'play' | 'target' | 'nope' | 'favor' | 'place' | 'ended';
  players: KPlayer[];
  deck: Card[]; // deck[0] 是最上面
  turn: number; // 輪到的玩家 index
  turnsLeft: number; // 這位還要進行幾回合 (被攻擊是 2)
  seq: number; // 每回合 +1：牌桌訊息的 ref，也用來擋掉舊選單
  nopeSeq: number; // 反對等待訊息的 ref
  played: string[]; // 這回合出過的牌 (顯示用)
  outCount: number;
  pending?: { card: Card; pair?: boolean; by: string; target?: string; nopes: number }; // 等反對的牌
  choosing?: { card: Card; pair?: boolean }; // phase 'target'：選對象中
  favor?: { from: string; to: string }; // phase 'favor'：from 要給 to 一張牌
  botTop: Record<string, Card | null>; // bot 記得的牌堆最上面那張
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
}

export type KAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'hand'; user: string }
  | { type: 'play'; user: string; seq: number; card: Card; pair?: boolean }
  | { type: 'target'; user: string; seq: number; target: string }
  | { type: 'nope'; user: string }
  | { type: 'draw'; user: string; seq: number }
  | { type: 'give'; user: string; card: Card }
  | { type: 'place'; user: string; pos: Pos }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<KAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: KState; events: GameEvent[] };
type Ctx = { s: KState; events: GameEvent[]; rng: Rng };

const NOT_PLAYER = '你不在這局遊戲裡。';
const STALE = '這個選單已經過期，請重新按「🃏 我的手牌」。';

const count = (cards: Card[], card: Card) => cards.filter((c) => c === card).length;
const alive = (s: KState) => s.players.filter((p) => !p.out);
const current = (s: KState) => s.players[s.turn];
const find = (s: KState, id: string) => s.players.find((p) => p.id === id);
const take = (hand: Card[], card: Card) => hand.splice(hand.indexOf(card), 1)[0];
const grouped = (cards: Card[]) => CARDS.filter((c) => cards.includes(c)).map((c) => `${CARD_NAME[c]} ×${count(cards, c)}`).join('、') || '(沒有手牌)';
const playName = (card: Card, pair?: boolean) => (pair ? `一對 ${CARD_NAME[card]}` : CARD_NAME[card]);
const targetsOf = (s: KState, id: string) => alive(s).filter((p) => p.id !== id && p.hand.length > 0);
const nextAlive = (s: KState, from: number) => {
  for (let i = 1; i <= s.players.length; i++) {
    const idx = (from + i) % s.players.length;
    if (!s.players[idx].out) return idx;
  }
  return from;
};

// 只對真人送私下訊息 (bot 不需要)
const tell = (c: Ctx, to: string, text: string) => {
  if (!isBot(to)) c.events.push({ type: 'ephemeral', to, text });
};
const menu = (c: Ctx, user: string, text: string, options: { value: string; label: string }[]) => {
  if (!isBot(user)) c.events.push({ type: 'prompt', kind: 'kittens', audience: 'ephemeral', user, text, options, perRow: 4 });
};

function board(s: KState, ended = false): GameEvent {
  const me = current(s);
  const lines = ended
    ? [`💣 ${mention(me.id)} 的回合結束`]
    : [
        `💣 輪到 ${mention(me.id)}${s.turnsLeft > 1 ? ` (還要 ${s.turnsLeft} 回合)` : ''}｜牌堆 ${s.deck.length} 張｜出牌或抽牌 (${PLAY_MS / 1000} 秒)`,
        ...s.players.map((p) => `• ${mention(p.id)}：${p.out ? '💀 出局' : `${p.hand.length} 張`}`),
        ...(s.played.length ? [`這回合出過：${s.played.join('、')}`] : []),
      ];
  return {
    type: 'prompt',
    kind: 'kittens',
    audience: 'channel',
    ref: `kittens:${s.seq}`,
    text: lines.join('\n'),
    options: ended ? [] : [{ value: 'hand', label: '🃏 我的手牌' }, { value: `draw:${s.seq}`, label: '🂠 抽牌' }],
  };
}

function nopePrompt(s: KState, text: string, open: boolean): GameEvent {
  return { type: 'prompt', kind: 'kittens', audience: 'channel', ref: `kittens:nope:${s.seq}:${s.nopeSeq}`, text, options: open ? [{ value: 'nope', label: '🚫 反對' }] : [] };
}

function startTurn(c: Ctx) {
  const s = c.s;
  s.seq++;
  s.played = [];
  s.phase = 'play';
  s.choosing = undefined;
  c.events.push(board(s));
  startTimer(c, PLAY_MS);
}

// 結束目前這 1 回合：被攻擊還有剩就再來一回合，否則換下一位
function finishOneTurn(c: Ctx) {
  const s = c.s;
  c.events.push(board(s, true));
  s.turnsLeft--;
  if (s.turnsLeft <= 0) {
    s.turn = nextAlive(s, s.turn);
    s.turnsLeft = 1;
  }
  startTurn(c);
}

function passTurn(c: Ctx, turnsLeft: number) {
  const s = c.s;
  c.events.push(board(s, true));
  s.turn = nextAlive(s, s.turn);
  s.turnsLeft = turnsLeft;
  startTurn(c);
}

function backToPlay(c: Ctx) {
  c.s.phase = 'play';
  c.events.push(board(c.s));
  startTimer(c, PLAY_MS);
}

function handMenu(c: Ctx, user: string): boolean {
  const s = c.s;
  const me = find(s, user);
  if (!me) return reply(c, user, NOT_PLAYER);
  if (me.out) return reply(c, user, '你已經出局了。');
  const myTurn = current(s).id === user && (s.phase === 'play' || s.phase === 'target');
  const canTarget = targetsOf(s, user).length > 0;
  const options = !myTurn
    ? []
    : [
        ...ACTIONS.filter((a) => me.hand.includes(a) && (a !== 'favor' || canTarget)).map((a) => ({ value: `play:${s.seq}:${a}`, label: CARD_NAME[a] })),
        ...(canTarget ? CATS.filter((cat) => count(me.hand, cat) >= 2) : []).map((cat) => ({ value: `play:${s.seq}:pair:${cat}`, label: `${CARD_NAME[cat].split(' ')[0]} 打出一對${CARD_NAME[cat].split(' ')[1]}` })),
      ];
  c.events.push({ type: 'prompt', kind: 'kittens', audience: 'ephemeral', user, text: `🃏 你的手牌：${grouped(me.hand)}`, options, perRow: 4 });
  return false;
}

// 輪到的人出牌前的共同檢查；回傳錯誤訊息或 null
function turnCheck(s: KState, user: string, seq: number): string | null {
  const me = find(s, user);
  if (!me) return NOT_PLAYER;
  if (me.out) return '你已經出局了。';
  if (seq !== s.seq) return STALE;
  if (current(s).id !== user) return '還沒輪到你。';
  if (s.phase !== 'play' && s.phase !== 'target') return '現在不能出牌，請等一下。';
  return null;
}

function play(c: Ctx, user: string, seq: number, card: Card, pair?: boolean): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return reply(c, user, err);
  const hand = current(s).hand;
  const ok = pair ? (CATS as readonly Card[]).includes(card) && count(hand, card) >= 2 : (ACTIONS as readonly Card[]).includes(card) && hand.includes(card);
  if (!ok) return reply(c, user, STALE);
  if (pair || card === 'favor') {
    const targets = targetsOf(s, user);
    if (!targets.length) return reply(c, user, '沒有可以指定的玩家。');
    s.phase = 'target';
    s.choosing = { card, pair };
    menu(c, user, `${playName(card, pair)}：要指定誰？`, targets.map((p) => ({ value: `target:${s.seq}:${p.id}`, label: p.id })));
    return true;
  }
  commit(c, card, pair);
  return true;
}

function chooseTarget(c: Ctx, user: string, seq: number, target: string): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return reply(c, user, err);
  if (s.phase !== 'target' || !s.choosing) return reply(c, user, STALE);
  if (!targetsOf(s, user).some((p) => p.id === target)) return reply(c, user, '不能指定這位玩家。');
  const { card, pair } = s.choosing;
  s.choosing = undefined;
  commit(c, card, pair, target);
  return true;
}

// 打出牌：從手牌移出、公告，開始等反對
function commit(c: Ctx, card: Card, pair?: boolean, target?: string) {
  const s = c.s;
  const me = current(s);
  take(me.hand, card);
  if (pair) take(me.hand, card);
  s.played.push(playName(card, pair));
  s.pending = { card, pair, by: me.id, target, nopes: 0 };
  s.phase = 'nope';
  s.nopeSeq++;
  const text = `${mention(me.id)} 出了 ${playName(card, pair)}${target ? `，對 ${mention(target)}` : ''}`;
  c.events.push({ type: 'announce', text });
  c.events.push(nopePrompt(s, `🚫 ${text}：${NOPE_MS / 1000} 秒內可以按「🚫 反對」`, true));
  c.events.push(board(s));
  startTimer(c, NOPE_MS);
}

function nope(c: Ctx, user: string): boolean {
  const s = c.s;
  const me = find(s, user);
  if (!me) return reply(c, user, NOT_PLAYER);
  if (me.out) return reply(c, user, '你已經出局了。');
  if (s.phase !== 'nope' || !s.pending) return reply(c, user, '來不及了。');
  if (!me.hand.includes('nope')) return reply(c, user, '你手上沒有反對。');
  take(me.hand, 'nope');
  s.pending.nopes++;
  const p = s.pending;
  c.events.push({ type: 'announce', text: `🚫 ${mention(user)} 反對！(第 ${p.nopes} 張)` });
  c.events.push(nopePrompt(s, `🚫 ${mention(p.by)} 的 ${playName(p.card, p.pair)} 已被反對 ${p.nopes} 次：${NOPE_MS / 1000} 秒內可以再按「🚫 反對」`, true));
  c.events.push(board(s));
  startTimer(c, NOPE_MS);
  return true;
}

// 反對等待結束：奇數張失效，偶數張生效
function resolve(c: Ctx) {
  const s = c.s;
  const p = s.pending!;
  s.pending = undefined;
  const name = playName(p.card, p.pair);
  if (p.nopes % 2 === 1) {
    c.events.push(nopePrompt(s, `🚫 ${mention(p.by)} 的 ${name} 被反對，失效`, false));
    c.events.push({ type: 'announce', text: `🚫 ${mention(p.by)} 的 ${name} 被反對，失效。` });
    return backToPlay(c);
  }
  c.events.push(nopePrompt(s, `✅ ${mention(p.by)} 的 ${name} 生效`, false));
  if (p.pair) return steal(c, p.by, p.target!);
  switch (p.card) {
    case 'attack':
      c.events.push({ type: 'announce', text: `⚔️ 攻擊生效！${mention(p.by)} 不用抽牌，下一位要進行 2 回合。` });
      return passTurn(c, 2);
    case 'skip':
      c.events.push({ type: 'announce', text: `⏭️ 跳過生效，${mention(p.by)} 不用抽牌。` });
      return finishOneTurn(c);
    case 'shuffle':
      s.deck = shuffle(s.deck, c.rng);
      s.botTop = {};
      c.events.push({ type: 'announce', text: '🔀 洗牌生效，牌堆重新洗過了。' });
      return backToPlay(c);
    case 'future': {
      const top = s.deck.slice(0, 3);
      tell(c, p.by, `🔮 牌堆最上面 (由上到下)：${top.map((x) => CARD_NAME[x]).join(' → ')}`);
      if (isBot(p.by)) s.botTop[p.by] = top[0] ?? null;
      c.events.push({ type: 'announce', text: `🔮 ${mention(p.by)} 看了未來。` });
      return backToPlay(c);
    }
    case 'favor':
      return askFavor(c, p.by, p.target!);
  }
}

function askFavor(c: Ctx, to: string, from: string) {
  const s = c.s;
  const giver = find(s, from)!;
  if (!giver.hand.length) {
    c.events.push({ type: 'announce', text: `🙏 ${mention(from)} 沒有手牌可以給。` });
    return backToPlay(c);
  }
  s.phase = 'favor';
  s.favor = { from, to };
  c.events.push({ type: 'announce', text: `🙏 等 ${mention(from)} 選一張牌給 ${mention(to)} (${FAVOR_MS / 1000} 秒)` });
  menu(c, from, `🙏 選一張牌給 ${mention(to)}`, CARDS.filter((x) => giver.hand.includes(x)).map((x) => ({ value: `give:${x}`, label: `${CARD_NAME[x]} ×${count(giver.hand, x)}` })));
  startTimer(c, FAVOR_MS);
}

function give(c: Ctx, user: string, card: Card): boolean {
  const s = c.s;
  if (s.phase !== 'favor' || s.favor?.from !== user) return reply(c, user, '現在不用給牌。');
  if (!find(s, user)!.hand.includes(card)) return reply(c, user, `你手上沒有 ${CARD_NAME[card]}。`);
  transfer(c, user, s.favor.to, card);
  c.events.push({ type: 'announce', text: `🙏 ${mention(user)} 給了 ${mention(s.favor.to)} 一張牌。` });
  s.favor = undefined;
  backToPlay(c);
  return true;
}

function transfer(c: Ctx, from: string, to: string, card: Card) {
  take(find(c.s, from)!.hand, card);
  find(c.s, to)!.hand.push(card);
  tell(c, to, `你從 ${mention(from)} 拿到 ${CARD_NAME[card]}。`);
  tell(c, from, `你的 ${CARD_NAME[card]} 給了 ${mention(to)}。`);
}

function steal(c: Ctx, by: string, target: string) {
  const victim = find(c.s, target)!;
  if (!victim.hand.length) {
    c.events.push({ type: 'announce', text: `🐱 ${mention(target)} 沒有手牌可以偷。` });
    return backToPlay(c);
  }
  transfer(c, target, by, victim.hand[Math.floor(c.rng() * victim.hand.length)]);
  c.events.push({ type: 'announce', text: `🐱 ${mention(by)} 從 ${mention(target)} 偷了一張牌。` });
  backToPlay(c);
}

function draw(c: Ctx, user: string, seq: number): boolean {
  const err = turnCheck(c.s, user, seq);
  if (err) return reply(c, user, err);
  drawCard(c);
  return true;
}

function drawCard(c: Ctx) {
  const s = c.s;
  const me = current(s);
  s.choosing = undefined;
  const card = s.deck.shift()!;
  s.botTop = {};
  if (card !== 'bomb') {
    me.hand.push(card);
    tell(c, me.id, `🂠 你抽到 ${CARD_NAME[card]}。`);
    return finishOneTurn(c);
  }
  c.events.push({ type: 'announce', text: `💥 ${mention(me.id)} 抽到 ${CARD_NAME.bomb}！` });
  if (me.hand.includes('defuse')) {
    take(me.hand, 'defuse');
    s.phase = 'place';
    c.events.push({ type: 'announce', text: `🧯 ${mention(me.id)} 拆解成功！正在把炸彈放回牌堆…` });
    menu(c, me.id, '💣 要把炸彈放回牌堆哪裡？(只有你知道)', placeOptions(s.deck.length));
    return startTimer(c, PLACE_MS);
  }
  eliminate(c, me);
}

const POS_NAME: Record<Pos, string> = { top: '最上面', '2': '第 2 張', '3': '第 3 張', bottom: '最底下', random: '隨機' };
const placeOptions = (n: number) =>
  (['top', ...(n >= 2 ? ['2'] : []), ...(n >= 3 ? ['3'] : []), ...(n >= 1 ? ['bottom', 'random'] : [])] as Pos[]).map((p) => ({ value: `place:${p}`, label: POS_NAME[p] }));

function place(c: Ctx, user: string, pos: Pos): boolean {
  const s = c.s;
  if (s.phase !== 'place' || current(s).id !== user) return reply(c, user, '現在不用放炸彈。');
  const n = s.deck.length;
  const index = { top: 0, '2': 1, '3': 2, bottom: n, random: Math.floor(c.rng() * (n + 1)) }[pos];
  s.deck.splice(Math.min(index, n), 0, 'bomb');
  s.botTop = {};
  c.events.push({ type: 'announce', text: '💣 炸彈已經放回牌堆。' });
  finishOneTurn(c);
  return true;
}

function eliminate(c: Ctx, me: KPlayer) {
  const s = c.s;
  me.hand = [];
  me.out = ++s.outCount;
  c.events.push({ type: 'announce', text: `💀 ${mention(me.id)} 出局！(沒有拆解)` });
  if (alive(s).length === 1) return endGame(c);
  passTurn(c, 1);
}

function endGame(c: Ctx) {
  const s = c.s;
  c.events.push(board(s, true));
  s.phase = 'ended';
  s.timers = {};
  const winner = alive(s)[0];
  s.winners = [winner.id];
  const ranking = [winner, ...s.players.filter((p) => p.out).sort((a, b) => b.out! - a.out!)];
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.winners });
  c.events.push(
    {
      type: 'announce',
      text: [`🏆 遊戲結束，${mention(winner.id)} 獲勝！`, ...ranking.map((p, i) => `${i + 1}. ${mention(p.id)}${i === 0 ? ' 🏆' : ''}`)].join('\n'),
      gif: 'goodWin',
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

function timeout(c: Ctx) {
  const s = c.s;
  switch (s.phase) {
    case 'play':
    case 'target':
      c.events.push({ type: 'announce', text: `⏰ ${mention(current(s).id)} 超時，自動抽牌。` });
      return drawCard(c);
    case 'nope':
      return resolve(c);
    case 'favor': {
      const hand = find(s, s.favor!.from)!.hand;
      return give(c, s.favor!.from, hand[Math.floor(c.rng() * hand.length)]);
    }
    case 'place':
      return place(c, current(s).id, 'random');
  }
}

// bot：輪到自己就出牌或抽牌；對自己不利的牌反對一次；被索取給最不重要的；拆解後隨機放
function botStep(c: Ctx): boolean {
  const s = c.s;
  const me = current(s);
  if (s.phase === 'nope') {
    const p = s.pending!;
    if (p.nopes > 0) return false;
    const victim = p.card === 'attack' && !p.pair ? s.players[nextAlive(s, s.turn)].id : p.card === 'favor' || p.pair ? p.target : undefined;
    const bot = victim && victim !== p.by && isBot(victim) ? find(s, victim)! : undefined;
    if (!bot?.hand.includes('nope')) return false;
    return nope(c, bot.id);
  }
  if (s.phase === 'favor' && isBot(s.favor!.from)) {
    const hand = find(s, s.favor!.from)!.hand;
    return give(c, s.favor!.from, GIVE_ORDER.find((x) => hand.includes(x))!);
  }
  if (!isBot(me.id)) return false;
  if (s.phase === 'place') return place(c, me.id, 'random');
  if (s.phase !== 'play') return false;
  const top = s.botTop[me.id];
  if (top === undefined && me.hand.includes('future')) return play(c, me.id, s.seq, 'future');
  if (top === 'bomb') {
    const dodge = (['attack', 'skip', 'shuffle'] as Card[]).find((x) => me.hand.includes(x));
    if (dodge) return play(c, me.id, s.seq, dodge);
    return draw(c, me.id, s.seq);
  }
  const cat = CATS.find((x) => count(me.hand, x) >= 2);
  const targets = targetsOf(s, me.id);
  if (cat && targets.length) {
    const target = targets.reduce((best, p) => (p.hand.length > best.hand.length ? p : best));
    s.phase = 'target';
    s.choosing = { card: cat, pair: true };
    return chooseTarget(c, me.id, s.seq, target.id);
  }
  return draw(c, me.id, s.seq);
}

function runBots(c: Ctx) {
  for (let i = 0; i < 200 && c.s.phase !== 'ended' && botStep(c); i++);
}

const RULES = [
  '💣 炸彈貓規則：輪到你時可以出任意張功能牌，最後抽一張牌結束回合。抽到 💣 炸彈貓時，有 🧯 拆解就自動拆掉並私下選炸彈放回哪裡；沒有拆解就出局。最後活下來的人贏！',
  '⚔️ 攻擊：不抽牌結束回合，下一位要進行 2 回合｜⏭️ 跳過：不抽牌結束 1 回合｜🙏 索取：指定一人給你一張牌 (他選)｜🔀 洗牌：洗牌堆｜🔮 預見未來：偷看牌堆最上面 3 張',
  '🐱 兩張相同的貓咪卡：指定一人隨機偷一張｜🚫 反對：別人出牌後 5 秒內按頻道的「🚫 反對」讓它失效 (反對也能被反對)',
  '每回合 60 秒，超時自動抽牌。按牌桌訊息的「🃏 我的手牌」出牌，「🂠 抽牌」抽牌。',
].join('\n');

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, '只有房主可以開始遊戲。');
  if (s.phase !== 'lobby') return false;
  const n = s.players.length;
  if (n < MIN_KITTENS_PLAYERS) return reply(c, user, `目前 ${n} 人，至少需要 ${MIN_KITTENS_PLAYERS} 人才能開始。`);
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'play' }));
  const deck = shuffle(
    (Object.keys(COPIES) as (keyof typeof COPIES)[]).flatMap((x) => Array<Card>(COPIES[x]).fill(x)),
    c.rng,
  );
  for (const p of s.players) Object.assign(p, newPlayer(p.id), { hand: [...deck.splice(0, 7), 'defuse'] });
  const bombs = n - 1;
  s.deck = shuffle([...deck, ...Array<Card>(n <= 3 ? 2 : 6 - n).fill('defuse'), ...Array<Card>(bombs).fill('bomb')], c.rng);
  s.turn = Math.floor(c.rng() * n);
  s.turnsLeft = 1;
  s.outCount = 0;
  s.botTop = {};
  c.events.push({
    type: 'announce',
    text: [
      `💣 炸彈貓開始！座位：${s.players.map((p) => mention(p.id)).join(' → ')}`,
      `第一位：${mention(current(s).id)}｜牌堆 ${s.deck.length} 張，裡面有 ${bombs} 張炸彈`,
      '最後活下來的人贏！抽到炸彈又沒有拆解就出局。',
    ].join('\n'),
    gif: 'start',
  });
  for (const p of s.players) if (!isBot(p.id)) c.events.push({ type: 'dm', to: p.id, text: `${RULES}\n\n🃏 你的手牌：${grouped(p.hand)}` });
  startTurn(c);
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_KITTENS_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_KITTENS_PLAYERS, newPlayer);
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user);
    case 'hand':
      return handMenu(c, action.user);
    case 'play':
      return play(c, action.user, action.seq, action.card, action.pair);
    case 'target':
      return chooseTarget(c, action.user, action.seq, action.target);
    case 'nope':
      return nope(c, action.user);
    case 'draw':
      return draw(c, action.user, action.seq);
    case 'give':
      return give(c, action.user, action.card);
    case 'place':
      return place(c, action.user, action.pos);
    case 'timeout':
      if (action.id !== c.s.timers.phase || c.s.phase === 'lobby') return false;
      timeout(c);
      return true;
    default:
      return false;
  }
}

const newPlayer = (id: string): KPlayer => ({ id, hand: [] });

export function applyKittens(state: KState | undefined, action: KAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
    afterChange: runBots,
  });
}

function createLobby(prev: KState | undefined, host: string, channel: string): Result {
  const created: KState = {
    game: 'kittens',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    deck: [],
    turn: 0,
    turnsLeft: 1,
    seq: prev?.seq ?? 0,
    nopeSeq: prev?.nopeSeq ?? 0,
    played: [],
    outCount: 0,
    botTop: {},
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
