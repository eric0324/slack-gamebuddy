// 四葉草（So Clover!）遊戲引擎：純邏輯，不碰任何 I/O。全員合作：每人為自己的四葉草寫 4 個提示，大家一起把詞卡排回原位。
// 介面和其他遊戲一樣：applySoclover(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import { SOCLOVER_WORDS } from './socloverWords.js';

export const MIN_SOCLOVER_PLAYERS = 3;
export const MAX_SOCLOVER_PLAYERS = 6;
const TITLE = '四葉草';
const CLUE_MS = 300_000;
const PLACE_MS = 240_000;
const MAX_CLUE = 15;
const SIDE = ['⬆️', '➡️', '⬇️', '⬅️'];
const SLOT = ['↖ 格1', '↗ 格2', '↙ 格3', '↘ 格4'];
const SLOT_SIDES = [[0, 3], [0, 1], [2, 3], [2, 1]]; // 每格朝外的兩邊
const LEAF = ['⬆️ 上葉', '➡️ 右葉', '⬇️ 下葉', '⬅️ 左葉'];

// 卡片 4 個詞，方向 0 時依序朝 上、右、下、左；方向 r 時朝第 side 邊的詞
export const faceWord = (card: string[], rot: number, side: number) => card[(side - rot + 4) % 4];

// 4 片葉子（上、右、下、左）各連著哪兩格的哪一邊：[格, 格, 邊]
const LEAVES: [number, number, number][] = [
  [0, 1, 0],
  [1, 3, 1],
  [2, 3, 2],
  [0, 2, 3],
];

// 每片葉子目前連著的兩個詞；空格顯示「？」
export function leafPairs(cards: (string[] | null)[], rots: number[]): [string, string][] {
  const word = (slot: number, side: number) => (cards[slot] ? faceWord(cards[slot]!, rots[slot], side) : '？');
  return LEAVES.map(([a, b, side]) => [word(a, side), word(b, side)]);
}

export type SCPhase = 'lobby' | 'clue' | 'place' | 'ended';

export interface Clover {
  cards: string[][]; // cards[i] 放在格 i
  rot: number[]; // 每格的方向
  decoy: string[]; // 干擾卡
  clues?: string[]; // 上、右、下、左葉的提示；沒送出 = 跳過
}

// 排卡的盤面：手上 5 張卡（卡A～卡E，編號固定），每格放哪張
export interface Board {
  hand: string[][];
  rot: number[]; // 每張卡目前的方向
  slots: (number | null)[]; // 每格放的卡（hand 的 index）
  locked: boolean[]; // 每格是否已確定
  sel: number; // 目前選的格
  attempt: 1 | 2;
  placer: string;
}

export interface SCState {
  game: 'soclover';
  channel: string;
  host: string;
  phase: SCPhase;
  players: { id: string }[]; // 開局後是座位順序
  clovers: Record<string, Clover>;
  queue: string[]; // 要排的四葉草（作者），依序
  cur: number; // 正在排 queue[cur]
  board?: Board;
  seq: number; // 盤面版本：每開一個新盤面 +1，按鈕 value 帶它，舊盤面的按鈕會被擋
  score: number;
  finished?: boolean;
  timerSeq: number;
  timers: { phase?: number };
}

export type SCAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'openClue'; user: string }
  | { type: 'clue'; user: string; texts: string[] }
  | { type: 'board'; user: string; seq: number; op: 'slot' | 'card' | 'rotate' | 'back' | 'submit' | 'take'; n?: number }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<SCAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: SCState;
  events: GameEvent[];
}

interface Ctx {
  s: SCState;
  events: GameEvent[];
  rng: Rng;
}

const isPlayer = (s: SCState, user: string) => s.players.some((p) => p.id === user);
const faces = (card: string[], rot: number, slot: number) => SLOT_SIDES[slot].map((d) => `${SIDE[d]}${faceWord(card, rot, d)}`).join(' ');
const leafLabels = (cl: Clover) => leafPairs(cl.cards, cl.rot).map(([a, b], i) => `${LEAF[i]}：${a} ＋ ${b}`);

// 洗座位和詞庫，每人 4 張卡 + 1 張干擾卡，隨機方向
function deal(c: Ctx) {
  const s = c.s;
  s.players = shuffle(s.players, c.rng);
  const words = shuffle(SOCLOVER_WORDS, c.rng);
  const card = () => words.splice(0, 4);
  for (const p of s.players) {
    const cards = [card(), card(), card(), card()];
    s.clovers[p.id] = { cards, rot: cards.map(() => Math.floor(c.rng() * 4)), decoy: card() };
  }
  s.phase = 'clue';
  c.events.push({
    type: 'announce',
    text: `🍀 四葉草開始！大家同一隊。座位順序：${s.players.map((p) => mention(p.id)).join(' → ')}`,
    gif: 'start',
  });
  for (const p of s.players) c.events.push({ type: 'dm', to: p.id, text: cloverText(s.clovers[p.id]) });
  c.events.push(
    { type: 'announce', text: `✍️ 每個人都已收到自己的四葉草（私訊），請按下面的按鈕為 4 片葉子各寫一個提示（${CLUE_MS / 60_000} 分鐘）` },
    { type: 'prompt', kind: 'soclover', audience: 'channel', text: '寫好提示後，大家一起把每個人的詞卡排回原位', options: [{ value: 'clue', label: '✍️ 寫提示' }] },
  );
  startTimer(c, CLUE_MS);
}

// 私訊作者自己的四葉草
function cloverText(cl: Clover): string {
  const [top, right, bottom, left] = leafLabels(cl);
  const slot = (i: number) => `${SLOT[i]}〔${faces(cl.cards[i], cl.rot[i], i)}〕`;
  return [
    '🍀 你的四葉草（只有你看得到）',
    `　　　　${top}`,
    `${left}　　${right}`,
    `　　　　${bottom}`,
    `${slot(0)}　${slot(1)}`,
    `${slot(2)}　${slot(3)}`,
    '回到頻道按「✍️ 寫提示」，每片葉子寫一個提示（不能用卡上的詞）。',
  ].join('\n');
}

function giveClues(c: Ctx, user: string, texts: string[]): boolean {
  const s = c.s;
  if (s.phase !== 'clue' || !isPlayer(s, user)) return reply(c, user, '現在不是寫提示的時間。');
  const cl = s.clovers[user];
  if (cl.clues) return reply(c, user, '你已經送出了。');
  const clues = texts.map((t) => t.trim());
  if (clues.length !== 4 || clues.some((t) => !t || [...t].length > MAX_CLUE)) return reply(c, user, `要寫 4 個提示，每個 1～${MAX_CLUE} 個字。`);
  const own = new Set(cl.cards.flat());
  const bad = clues.find((t) => own.has(t));
  if (bad) return reply(c, user, `提示「${bad}」是你卡上的詞，請換一個。`);
  cl.clues = clues;
  const done = s.players.filter((p) => s.clovers[p.id].clues).length;
  c.events.push(
    { type: 'ephemeral', to: user, text: '✅ 提示已送出。' },
    { type: 'announce', text: `✍️ ${mention(user)} 已寫好提示（${done}／${s.players.length}）` },
  );
  if (done === s.players.length) startPlacing(c);
  return true;
}

// 寫提示結束：有寫的四葉草依隨機順序排
function startPlacing(c: Ctx) {
  const s = c.s;
  for (const p of s.players) {
    if (!s.clovers[p.id].clues) c.events.push({ type: 'announce', text: `⌛ ${mention(p.id)} 沒有寫完提示，這片四葉草跳過、0 分。` });
  }
  s.queue = shuffle(s.players.filter((p) => s.clovers[p.id].clues).map((p) => p.id), c.rng);
  s.cur = 0;
  if (!s.queue.length) return endGame(c);
  s.phase = 'place';
  c.events.push({ type: 'announce', text: '🧩 開始一起排卡！四葉草的作者請保持安靜，讓大家討論。' });
  openBoard(c);
}

const author = (s: SCState) => s.queue[s.cur];
const LETTER = 'ABCDE';

// 開始排一片四葉草：5 張卡打亂、隨機方向，擺放者是作者的下一位
function openBoard(c: Ctx) {
  const s = c.s;
  const cl = s.clovers[author(s)];
  const hand = shuffle([...cl.cards, cl.decoy], c.rng);
  const seat = s.players.findIndex((p) => p.id === author(s));
  s.board = {
    hand,
    rot: hand.map(() => Math.floor(c.rng() * 4)),
    slots: [null, null, null, null],
    locked: [false, false, false, false],
    sel: 0,
    attempt: 1,
    placer: s.players[(seat + 1) % s.players.length].id,
  };
  s.seq++;
  drawBoard(c);
  startTimer(c, PLACE_MS);
}

// 盤面訊息：每次操作用同一個 ref 更新
function drawBoard(c: Ctx) {
  const s = c.s;
  const b = s.board!;
  const cl = s.clovers[author(s)];
  const placed = b.slots.map((h) => (h === null ? null : b.hand[h]));
  const rots = b.slots.map((h) => (h === null ? 0 : b.rot[h]));
  const slotText = (i: number) => {
    const h = b.slots[i];
    return h === null ? `${SLOT[i]}：（空）` : `${SLOT[i]}：${b.locked[i] ? '🔒' : ''}卡${LETTER[h]}〔${faces(b.hand[h], b.rot[h], i)}〕`;
  };
  const inHand = b.hand.map((_, h) => h).filter((h) => !b.slots.includes(h));
  const text = [
    `🍀 第 ${s.cur + 1}／${s.queue.length} 片：${mention(author(s))} 的四葉草（第 ${b.attempt} 次）・擺放者 ${mention(b.placer)}`,
    ...leafPairs(placed, rots).map(([x, y], i) => `${LEAF[i]}「${cl.clues![i]}」：${x} ＋ ${y}`),
    `${slotText(0)}　${slotText(1)}`,
    `${slotText(2)}　${slotText(3)}`,
    `✋ 手上：${inHand.map((h) => `卡${LETTER[h]} ${[0, 1, 2, 3].map((d) => faceWord(b.hand[h], b.rot[h], d)).join('→')}`).join('　') || '（沒有）'}`,
  ].join('\n');
  const v = (x: string) => `${s.seq}:${x}`;
  c.events.push({
    type: 'prompt',
    kind: 'soclover',
    audience: 'channel',
    ref: `soclover:${s.seq}`,
    perRow: 5,
    text,
    options: [
      ...[0, 1, 2, 3].map((i) => ({ value: v(`slot:${i}`), label: `${i === b.sel ? '▶' : ''}${b.locked[i] ? '🔒' : ''}格${i + 1}` })),
      { value: v('rotate'), label: '🔄 旋轉' },
      ...[0, 1, 2, 3, 4].map((h) => ({ value: v(`card:${h}`), label: `卡${LETTER[h]}` })),
      { value: v('back'), label: '↩️ 拿回' },
      { value: v('submit'), label: '✅ 送出' },
      { value: v('take'), label: '🙋 換我排' },
    ],
  });
}

// 擺放者的操作；回傳 false 表示 state 沒變
function boardOp(c: Ctx, a: Extract<SCAction, { type: 'board' }>): boolean {
  const s = c.s;
  const b = s.board;
  if (s.phase !== 'place' || !b || a.seq !== s.seq) return reply(c, a.user, '這個盤面已經結束了。');
  if (!isPlayer(s, a.user)) return reply(c, a.user, '你不在這局遊戲中。');
  if (a.user === author(s)) return reply(c, a.user, '這是你的四葉草，請保持安靜讓大家猜。');
  if (a.op === 'take') {
    b.placer = a.user;
    drawBoard(c);
    return true;
  }
  if (a.user !== b.placer) return reply(c, a.user, `現在由 ${mention(b.placer)} 擺放，可以按 🙋 換我排接手。`);
  const n = a.n ?? -1;
  const cur = b.slots[b.sel];
  switch (a.op) {
    case 'slot':
      if (n < 0 || n > 3) return false;
      b.sel = n;
      break;
    case 'card': {
      if (n < 0 || n > 4) return false;
      const from = b.slots.indexOf(n);
      if (b.locked[b.sel] || (from >= 0 && b.locked[from])) return reply(c, a.user, '這張卡已經確定了。');
      b.slots[b.sel] = n;
      if (from >= 0 && from !== b.sel) b.slots[from] = cur;
      const next = [1, 2, 3].map((k) => (b.sel + k) % 4).find((i) => b.slots[i] === null);
      if (next !== undefined) b.sel = next;
      break;
    }
    case 'rotate':
    case 'back':
      if (cur === null) return reply(c, a.user, '這一格還沒有卡。');
      if (b.locked[b.sel]) return reply(c, a.user, '這張卡已經確定了。');
      if (a.op === 'rotate') b.rot[cur] = (b.rot[cur] + 1) % 4;
      else b.slots[b.sel] = null;
      break;
    case 'submit':
      if (b.slots.includes(null)) return reply(c, a.user, '4 格都要放卡才能送出。');
      judge(c);
      return true;
  }
  drawBoard(c);
  return true;
}

// 一張卡在作者原本的格子、方向也一樣才算對
function correctSlots(s: SCState): boolean[] {
  const b = s.board!;
  const cl = s.clovers[author(s)];
  return b.slots.map((h, i) => h !== null && b.hand[h][0] === cl.cards[i][0] && b.rot[h] === cl.rot[i]);
}

// 送出（或超時）：第 1 次全對 6 分；否則對的鎖住、錯的回手上再試一次；第 2 次對幾張得幾分
function judge(c: Ctx) {
  const s = c.s;
  const b = s.board!;
  const right = correctSlots(s);
  const count = right.filter(Boolean).length;
  if (count === 4 && b.attempt === 1) return finishClover(c, 6, '🎉 第一次就全對！+6');
  if (b.attempt === 2) return finishClover(c, count, `🧩 這片 +${count}（對了 ${count} 張）`);
  b.attempt = 2;
  b.locked = right;
  b.slots = b.slots.map((h, i) => (right[i] ? h : null));
  b.sel = b.slots.indexOf(null);
  s.seq++;
  c.events.push({ type: 'announce', text: `❌ 對了 ${count} 張，對的卡鎖在原位🔒，其他的收回手上，再試一次（第 2 次）` });
  drawBoard(c);
  startTimer(c, PLACE_MS);
}

// 正確擺法：4 格的卡和朝外的詞、葉子的提示和詞對、干擾卡
function answerText(s: SCState): string {
  const b = s.board!;
  const cl = s.clovers[author(s)];
  const label = (card: string[]) => `卡${LETTER[b.hand.findIndex((h) => h[0] === card[0])]}`;
  const slot = (i: number) => `${SLOT[i]}：${label(cl.cards[i])}〔${faces(cl.cards[i], cl.rot[i], i)}〕`;
  return [
    `📖 ${mention(author(s))} 的正確擺法：`,
    `${slot(0)}　${slot(1)}`,
    `${slot(2)}　${slot(3)}`,
    ...leafPairs(cl.cards, cl.rot).map(([x, y], i) => `${LEAF[i]}「${cl.clues![i]}」：${x} ＋ ${y}`),
    `干擾卡：${label(cl.decoy)}`,
  ].join('\n');
}

function finishClover(c: Ctx, gained: number, headline: string) {
  const s = c.s;
  s.score += gained;
  c.events.push({ type: 'announce', text: `${headline}\n${answerText(s)}\n目前總分 ${s.score}` });
  s.board = undefined;
  s.cur++;
  if (s.cur >= s.queue.length) endGame(c);
  else openBoard(c);
}

function endGame(c: Ctx) {
  const s = c.s;
  s.phase = 'ended';
  s.finished = true;
  s.timers = {};
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: [], score: s.score }); // 合作遊戲：只記分數
  const max = 6 * s.players.length;
  c.events.push(
    { type: 'announce', text: `🏁 遊戲結束！全隊總分 ${s.score}／${max}\n${ratingFor(s.score, max)}`, gif: 'goodWin' },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

// 依總分佔滿分的比例給評價：從高到低找第一個門檻
const RATINGS: [number, string][] = [
  [100, '🍀 完美的四葉草，幸運滿點！'],
  [85, '🌈 心有靈犀，默契絕佳'],
  [70, '😎 很有默契！'],
  [50, '🙂 還不錯，算是好朋友'],
  [30, '🤔 有點默契，還要再磨合'],
  [0, '🌧️ 今天的幸運草沒有開花'],
];
export const ratingFor = (score: number, max: number) => RATINGS.find(([pct]) => score * 100 >= pct * max)![1];

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_SOCLOVER_PLAYERS, (id) => ({ id }));
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, '四葉草不支援 bot。');
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, '只有房主可以開始遊戲。');
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_SOCLOVER_PLAYERS) return reply(c, action.user, `目前 ${n} 人，至少需要 ${MIN_SOCLOVER_PLAYERS} 人才能開始。`);
      c.events.push(lobbyEvent(TITLE, { ...s, phase: 'clue' }));
      deal(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user, s.phase === 'place' && s.board ? `\n${answerText(s)}` : '');
    case 'openClue':
      if (s.phase !== 'clue' || !isPlayer(s, action.user)) return reply(c, action.user, '現在不是寫提示的時間。');
      if (s.clovers[action.user].clues) return reply(c, action.user, '你已經送出了。');
      c.events.push({ type: 'modal', to: action.user, kind: 'socloverClue', title: '寫提示', label: '', fields: leafLabels(s.clovers[action.user]) });
      return false;
    case 'clue':
      return giveClues(c, action.user, action.texts);
    case 'board':
      return boardOp(c, action);
    case 'timeout':
      if (action.id !== s.timers.phase) return false;
      if (s.phase === 'clue') startPlacing(c);
      else if (s.phase === 'place') {
        c.events.push({ type: 'announce', text: '⌛ 時間到，以目前的盤面送出。' });
        judge(c);
      }
      return true;
  }
}

export function applySoclover(state: SCState | undefined, action: SCAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.finished,
    isPlayer,
    createLobby,
    handle,
  });
}

function createLobby(prev: SCState | undefined, host: string, channel: string): Result {
  const created: SCState = {
    game: 'soclover',
    channel,
    host,
    phase: 'lobby',
    players: [{ id: host }],
    clovers: {},
    queue: [],
    cur: 0,
    seq: 0,
    score: 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
