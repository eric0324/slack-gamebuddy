// 妙語說書人（Dixit）遊戲引擎：純邏輯，不碰任何 I/O。說書人看自己的一張梗圖給一句提示，其他人出牌混淆，大家猜哪張是說書人的。
// 介面和其他遊戲一樣：applyDixit(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import { MEME_IMAGES } from './memeImages.js';

export const MIN_DIXIT_PLAYERS = 3;
export const MAX_DIXIT_PLAYERS = 8;
const TITLE = '妙語說書人';
const TARGET = 20;
const CLUE_MS = 120_000;
const PLAY_MS = 90_000;
const VOTE_MS = 60_000;
const MAX_CLUE = 50;
const STALE = '這個選單已經過期了，請重新按「🃏 我的手牌」。';

// 一張牌：只有圖片；by 是頻道投稿者（內建的沒有），不顯示
export type Card = { url: string; by?: string };

export interface DixitPlayer {
  id: string;
  hand: Card[]; // 這輪出的牌留在原位，揭曉後才拿掉，舊選單的按鈕位置才不會錯
  score: number;
  played: Card[]; // 這輪出的牌（說書人不算）
  vote?: number; // 投給 table 的第幾張
}

export interface DixitState {
  game: 'dixit';
  channel: string;
  host: string;
  phase: 'lobby' | 'clue' | 'play' | 'vote' | 'ended';
  players: DixitPlayer[]; // 加入順序 = 說書人順序
  deck: Card[];
  teller: number; // 說書人在 players 的 index
  round: number;
  seq: number; // 頻道訊息的 ref，也用來擋掉舊按鈕
  pick?: number; // 說書人在手牌選單選的牌（還沒送出提示）
  clue?: string;
  tellerCard?: Card;
  table: { card: Card; by: string }[]; // 投票時打亂後的牌
  skips: number; // 連續沒出提示的輪數
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
}

export type DixitAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string; custom?: { url: string; name: string; by: string }[] } // custom：頻道投稿的梗圖，adapter 帶入
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'hand'; user: string }
  | { type: 'pick'; user: string; seq: number; card: number }
  | { type: 'clue'; user: string; text: string; card?: number } // card：指令帶的手牌 index（從 0 起）；視窗送出時用 pick
  | { type: 'play'; user: string; seq: number; card: number }
  | { type: 'vote'; user: string; seq: number; n: number }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<DixitAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: DixitState; events: GameEvent[] };
type Ctx = { s: DixitState; events: GameEvent[]; rng: Rng };

const handSize = (s: DixitState) => (s.players.length === 3 ? 7 : 6);
const teller = (s: DixitState) => s.players[s.teller];
const HAND_BUTTON = { value: 'hand', label: '🃏 我的手牌' };
const find = (s: DixitState, id: string) => s.players.find((p) => p.id === id);
const nonTellers = (s: DixitState) => s.players.filter((_, i) => i !== s.teller);
const perPlay = (s: DixitState) => (s.players.length === 3 ? 2 : 1);
const pickIndex = (rng: Rng, n: number) => Math.floor(rng() * n);
const scores = (s: DixitState) => [...s.players].sort((a, b) => b.score - a.score).map((p) => `${mention(p.id)} ${p.score}`).join('、');

// 手牌第 i 張這輪已經出了（說書人的牌或出到桌上的牌）
const used = (s: DixitState, p: DixitPlayer, i: number) => {
  const url = p.hand[i]?.url;
  return url === undefined || s.tellerCard?.url === url || p.played.some((c) => c.url === url);
};

function clueBoard(s: DixitState): GameEvent {
  return {
    type: 'prompt',
    kind: 'dixit',
    audience: 'channel',
    ref: `dixit:${s.seq}`,
    text: [
      `🎨 第 ${s.round} 輪，說書人是 ${mention(teller(s).id)}`,
      `說書人按「🃏 我的手牌」選一張牌，再輸入一句提示（${CLUE_MS / 1000} 秒）；其他人可以先看看自己的手牌`,
    ].join('\n'),
    options: [HAND_BUTTON],
  };
}

function startRound(c: Ctx) {
  const s = c.s;
  s.round++;
  s.seq++;
  s.phase = 'clue';
  delete s.pick;
  delete s.clue;
  delete s.tellerCard;
  s.table = [];
  for (const p of s.players) {
    p.played = [];
    delete p.vote;
  }
  c.events.push(clueBoard(s));
  startTimer(c, CLUE_MS);
}

function playBoard(s: DixitState): GameEvent {
  const waiting = nonTellers(s).filter((p) => p.played.length < perPlay(s));
  const total = s.players.length - 1;
  return {
    type: 'prompt',
    kind: 'dixit',
    audience: 'channel',
    ref: `dixit:${s.seq}`,
    text: [
      `🃏 第 ${s.round} 輪出牌：${mention(teller(s).id)} 的提示是「${s.clue}」`,
      `其他人按「🃏 我的手牌」出${perPlay(s) === 2 ? ' 2 張' : '一張'}最符合提示的牌，出了不能改（${PLAY_MS / 1000} 秒）`,
      `已出 ${total - waiting.length}/${total}${waiting.length ? `，還沒出完：${waiting.map((p) => mention(p.id)).join(' ')}` : ''}`,
    ].join('\n'),
    options: [HAND_BUTTON],
  };
}

function startPlay(c: Ctx) {
  const s = c.s;
  s.phase = 'play';
  s.seq++;
  c.events.push(playBoard(s));
  startTimer(c, PLAY_MS);
}

function nextRound(c: Ctx) {
  c.s.teller = (c.s.teller + 1) % c.s.players.length;
  startRound(c);
}

// 手牌選單：只有本人看到，圖片依序編號；按鈕的 value 用手牌原本的位置，出過的牌不再列出
function handMenu(c: Ctx, user: string): boolean {
  const s = c.s;
  const me = find(s, user);
  if (!me) return reply(c, user, '你不在這局遊戲裡。');
  if (s.phase === 'lobby') return reply(c, user, '遊戲還沒開始。');
  const isTeller = me === teller(s);
  const act = s.phase === 'clue' && isTeller ? 'pick' : s.phase === 'play' && !isTeller && me.played.length < perPlay(s) ? 'play' : undefined;
  const left = me.hand.flatMap((_, i) => (used(s, me, i) ? [] : [i]));
  const text =
    act === 'pick'
      ? '🃏 你是說書人：選一張牌，接著輸入一句提示（也可以用 `/game dixit clue <編號> <提示>`）'
      : act === 'play'
        ? `🃏 挑一張最符合提示「${s.clue}」的牌（還要出 ${perPlay(s) - me.played.length} 張，出了不能改）`
        : '🃏 你的手牌（現在不用出牌）';
  c.events.push({
    type: 'prompt',
    kind: 'dixit',
    audience: 'ephemeral',
    user,
    text,
    images: left.map((i, k) => ({ url: me.hand[i].url, title: String(k + 1) })),
    options: act ? left.map((i, k) => ({ value: `${act}:${s.seq}:${i}`, label: String(k + 1) })) : [],
  });
  return false;
}

// 說書階段的共同檢查：回傳說書人，不行時回傳 null（已經回覆原因）
function storyteller(c: Ctx, user: string): DixitPlayer | null {
  const s = c.s;
  if (!find(s, user)) return (reply(c, user, '你不在這局遊戲裡。'), null);
  if (s.phase !== 'clue') return (reply(c, user, '現在不是說書的時間。'), null);
  if (user !== teller(s).id) return (reply(c, user, `這輪的說書人是 ${mention(teller(s).id)}。`), null);
  return teller(s);
}

function pick(c: Ctx, user: string, seq: number, card: number): boolean {
  const me = storyteller(c, user);
  if (!me) return false;
  if (seq !== c.s.seq || !Number.isInteger(card) || !me.hand[card]) return reply(c, user, STALE);
  c.s.pick = card;
  c.events.push({ type: 'modal', to: user, kind: 'dixitClue', title: '說書人的提示', label: `提示（1～${MAX_CLUE} 字）` });
  return true;
}

function clue(c: Ctx, user: string, raw: string, card?: number): boolean {
  const s = c.s;
  const me = storyteller(c, user);
  if (!me) return false;
  const i = card ?? s.pick;
  if (i === undefined) return reply(c, user, '請先按「🃏 我的手牌」選一張牌。');
  if (!Number.isInteger(i) || !me.hand[i]) return reply(c, user, `編號要在 1～${me.hand.length} 之間。`);
  const text = raw.trim();
  if (!text || [...text].length > MAX_CLUE) return reply(c, user, `提示要 1～${MAX_CLUE} 個字。`);
  s.tellerCard = me.hand[i];
  s.clue = text;
  s.skips = 0;
  c.events.push({ type: 'announce', text: `💬 ${mention(user)} 的提示：${text}` });
  startPlay(c);
  return true;
}

function clueTimeout(c: Ctx) {
  const s = c.s;
  s.skips++;
  c.events.push({ type: 'announce', text: `⌛ ${mention(teller(s).id)} 沒出提示，這輪跳過。` });
  if (s.skips < s.players.length) return nextRound(c);
  // 一整圈都沒人出提示：大家可能都不在了，結束但不算戰績
  s.phase = 'ended';
  s.timers = {};
  c.events.push({ type: 'announce', text: `😴 大家好像都不在了，遊戲結束。\n目前分數：${scores(s)}` });
}

function voteBoard(s: DixitState, ended = false): GameEvent {
  const voters = nonTellers(s);
  const voted = voters.filter((p) => p.vote !== undefined).length;
  return {
    type: 'prompt',
    kind: 'dixit',
    audience: 'channel',
    ref: `dixit:${s.seq}`,
    text: [
      ended
        ? `🗳️ 第 ${s.round} 輪投票：已結束`
        : `🗳️ 第 ${s.round} 輪：哪一張是說書人 ${mention(teller(s).id)} 的牌？提示是「${s.clue}」（不能投自己的牌，${VOTE_MS / 1000} 秒內可以改票）`,
      ...(ended ? [] : [`已投 ${voted}/${voters.length}`]),
    ].join('\n'),
    images: s.table.map((t, i) => ({ url: t.card.url, title: String(i + 1) })),
    options: ended ? [] : [...s.table.map((_, i) => ({ value: `vote:${s.seq}:${i}`, label: String(i + 1) })), HAND_BUTTON],
    perRow: s.table.length,
  };
}

function startVote(c: Ctx) {
  const s = c.s;
  s.phase = 'vote';
  s.seq++;
  const t = teller(s);
  s.table = shuffle([{ card: s.tellerCard!, by: t.id }, ...nonTellers(s).flatMap((p) => p.played.map((card) => ({ card, by: p.id })))], c.rng);
  c.events.push(voteBoard(s));
  startTimer(c, VOTE_MS);
}

function play(c: Ctx, user: string, seq: number, card: number): boolean {
  const s = c.s;
  const me = find(s, user);
  if (!me) return reply(c, user, '你不在這局遊戲裡。');
  if (s.phase !== 'play') return reply(c, user, '現在不是出牌的時間。');
  if (me === teller(s)) return reply(c, user, '說書人不用再出牌。');
  if (me.played.length >= perPlay(s)) return reply(c, user, '你這輪已經出過牌了。');
  if (seq !== s.seq || !Number.isInteger(card) || used(s, me, card)) return reply(c, user, STALE);
  me.played.push(me.hand[card]); // 牌留在手牌原位，揭曉後才拿掉
  if (me.played.length < perPlay(s)) {
    c.events.push({ type: 'ephemeral', to: user, text: '✅ 已出 1 張，再出一張（同一個選單或重新按「🃏 我的手牌」）。' });
    c.events.push(playBoard(s));
    return true;
  }
  c.events.push({ type: 'ephemeral', to: user, text: '✅ 已出牌' });
  if (nonTellers(s).every((p) => p.played.length >= perPlay(s))) startVote(c);
  else c.events.push(playBoard(s));
  return true;
}

function playTimeout(c: Ctx) {
  const s = c.s;
  const late = nonTellers(s).filter((p) => p.played.length < perPlay(s));
  for (const p of late) {
    while (p.played.length < perPlay(s)) {
      const left = p.hand.flatMap((_, i) => (used(s, p, i) ? [] : [i]));
      p.played.push(p.hand[left[pickIndex(c.rng, left.length)]]);
    }
  }
  if (late.length) c.events.push({ type: 'announce', text: `⌛ ${late.map((p) => mention(p.id)).join(' ')} 沒出牌，系統幫他出了。` });
  startVote(c);
}

function vote(c: Ctx, user: string, seq: number, n: number): boolean {
  const s = c.s;
  const me = find(s, user);
  if (!me) return reply(c, user, '你不在這局遊戲裡。');
  if (s.phase !== 'vote' || seq !== s.seq) return reply(c, user, '這次投票已經結束了。');
  if (me === teller(s)) return reply(c, user, '說書人不投票。');
  if (!s.table[n]) return false;
  if (s.table[n].by === user) return reply(c, user, '不能投自己的牌。');
  me.vote = n;
  c.events.push({ type: 'ephemeral', to: user, text: `你投了 ${n + 1}` });
  if (nonTellers(s).every((p) => p.vote !== undefined)) reveal(c);
  else c.events.push(voteBoard(s));
  return true;
}

// 計分：全部猜對或全部沒猜對時說書人 0、其他人 +2；否則說書人和猜對的人 +3；說書人以外的牌每得 1 票 +1
function score(s: DixitState): Map<string, number> {
  const t = teller(s);
  const others = nonTellers(s);
  const answer = s.table.findIndex((x) => x.by === t.id);
  const right = others.filter((p) => p.vote === answer);
  const gain = new Map(s.players.map((p) => [p.id, 0]));
  const add = (id: string, n: number) => gain.set(id, gain.get(id)! + n);
  if (right.length === 0 || right.length === others.length) for (const p of others) add(p.id, 2);
  else for (const p of [t, ...right]) add(p.id, 3);
  for (const p of others) if (p.vote !== undefined && s.table[p.vote].by !== t.id) add(s.table[p.vote].by, 1);
  return gain;
}

function reveal(c: Ctx) {
  const s = c.s;
  c.events.push(voteBoard(s, true));
  const gain = score(s);
  for (const p of s.players) p.score += gain.get(p.id)!;
  const t = teller(s);
  const answer = s.table.findIndex((x) => x.by === t.id);
  c.events.push({
    type: 'announce',
    text: [
      `🎉 第 ${s.round} 輪揭曉：說書人 ${mention(t.id)} 的牌是第 ${answer + 1} 號`,
      ...s.table.map((x, i) => {
        const voters = s.players.filter((p) => p.vote === i).map((p) => mention(p.id));
        return `${i + 1}. ${mention(x.by)}${i === answer ? '（說書人）' : ''} ← ${voters.join(' ') || '沒有人'}`;
      }),
      `本輪得分：${s.players.map((p) => `${mention(p.id)} +${gain.get(p.id)}`).join('、')}`,
      `目前總分：${scores(s)}`,
    ].join('\n'),
  });
  for (const p of s.players) p.hand = p.hand.filter((_, i) => !used(s, p, i));
  if (s.players.some((p) => p.score >= TARGET)) return endGame(c, `有人達到 ${TARGET} 分`);
  const need = s.players.reduce((n, p) => n + handSize(s) - p.hand.length, 0);
  if (s.deck.length < need) return endGame(c, '牌庫不夠補牌');
  for (const p of s.players) p.hand.push(...s.deck.splice(0, handSize(s) - p.hand.length));
  nextRound(c);
}

function endGame(c: Ctx, reason: string) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  const top = Math.max(...s.players.map((p) => p.score));
  s.winners = s.players.filter((p) => p.score === top).map((p) => p.id);
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.winners });
  const ranking = [...s.players].sort((a, b) => b.score - a.score);
  c.events.push(
    {
      type: 'announce',
      text: [
        `🏆 遊戲結束（${reason}），${s.winners.map(mention).join('、')} 獲勝！`,
        ...ranking.map((p, i) => `${i + 1}. ${mention(p.id)} ${p.score} 分${p.score === top ? ' 🏆' : ''}`),
      ].join('\n'),
      gif: 'goodWin',
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

function rules(s: DixitState): string {
  return [
    '🎨 妙語說書人開始！',
    `說書人順序：${s.players.map((p) => mention(p.id)).join(' → ')}`,
    '每輪說書人從手牌選一張牌，給一句提示；其他人從手牌出一張最符合提示的牌混進去，大家再匿名猜哪張是說書人的（不能投自己的牌）。',
    ...(s.players.length === 3 ? ['3 人局：每人 7 張手牌，非說書人每輪出 2 張。'] : []),
    '計分：全部猜對或全部沒猜對時，說書人 0 分、其他人各 2 分；否則說書人和猜對的人各 3 分。說書人以外的牌每被投 1 票，出牌的人 +1。',
    `有人到 ${TARGET} 分，或牌庫不夠補牌時遊戲結束，總分最高的人獲勝。`,
  ].join('\n');
}

// 內建梗圖加上頻道投稿，網址相同只留一張，不留名稱
function buildDeck(custom: { url: string; by: string }[]): Card[] {
  const seen = new Set<string>();
  const cards: Card[] = [];
  for (const m of [...MEME_IMAGES.map(({ url }) => ({ url })), ...custom.map(({ url, by }) => ({ url, by }))]) {
    if (seen.has(m.url)) continue;
    seen.add(m.url);
    cards.push(m);
  }
  return cards;
}

function start(c: Ctx, user: string, custom: { url: string; name: string; by: string }[] = []): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, '只有房主可以開始遊戲。');
  if (s.phase !== 'lobby') return false;
  if (s.players.length < MIN_DIXIT_PLAYERS) return reply(c, user, `目前 ${s.players.length} 人，至少需要 ${MIN_DIXIT_PLAYERS} 人才能開始。`);
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'clue' }));
  s.deck = shuffle(buildDeck(custom), c.rng);
  for (const p of s.players) Object.assign(p, newPlayer(p.id), { hand: s.deck.splice(0, handSize(s)) });
  s.teller = 0;
  s.round = 0;
  s.skips = 0;
  c.events.push({ type: 'announce', text: rules(s) });
  startRound(c);
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_DIXIT_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, '妙語說書人不支援 bot。');
    case 'start':
      return start(c, action.user, action.custom);
    case 'cancel':
      return cancelGame(c, action.user, c.s.phase === 'lobby' ? '' : `\n目前分數：${scores(c.s)}`);
    case 'hand':
      return handMenu(c, action.user);
    case 'pick':
      return pick(c, action.user, action.seq, action.card);
    case 'clue':
      return clue(c, action.user, action.text, action.card);
    case 'play':
      return play(c, action.user, action.seq, action.card);
    case 'vote':
      return vote(c, action.user, action.seq, action.n);
    case 'timeout':
      if (action.id !== c.s.timers.phase) return false;
      if (c.s.phase === 'clue') clueTimeout(c);
      else if (c.s.phase === 'play') playTimeout(c);
      else reveal(c);
      return true;
    default:
      return false;
  }
}

const newPlayer = (id: string): DixitPlayer => ({ id, hand: [], score: 0, played: [] });

export function applyDixit(state: DixitState | undefined, action: DixitAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
  });
}

function createLobby(prev: DixitState | undefined, host: string, channel: string): Result {
  const created: DixitState = {
    game: 'dixit',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    deck: [],
    teller: 0,
    round: 0,
    seq: prev?.seq ?? 0,
    table: [],
    skips: 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
