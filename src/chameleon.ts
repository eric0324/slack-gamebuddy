// 變色龍遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyChameleon(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, startTimer } from './common.js';
import { CHAMELEON_CARDS } from './chameleonCards.js';

export const MIN_CHAMELEON_PLAYERS = 3;
export const MAX_CHAMELEON_PLAYERS = 8;
const TITLE = '變色龍';
const STEP_MS = 120_000; // 說詞、討論、投票、猜詞都是 2 分鐘
const MAX_WORD = 20;

export type CPhase = 'lobby' | 'speak' | 'discuss' | 'vote' | 'guess' | 'ended';

export interface CState {
  game: 'chameleon';
  channel: string;
  host: string;
  phase: CPhase;
  players: { id: string }[];
  topic?: string;
  words?: string[]; // 16 個，index 0～15 對應 A1～D4
  secret?: number; // 祕密詞的格子編號
  chameleon?: string;
  order: string[]; // 說詞順序，order[0] 是起始玩家
  turn: number;
  said: Record<string, string>; // 玩家 → 說的詞
  votes: Record<string, string>; // 投票者 → 被投的人
  finished?: boolean; // 正常結束（取消的沒有）→ 可以再來一局
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
  | { type: 'openSay'; user: string } // 按「✍️ 說詞」→ 開視窗
  | { type: 'say'; user: string; text: string } // 視窗送出或 `/game chameleon say <詞>`
  | { type: 'next'; user: string } // 房主跳過目前的說詞者
  | { type: 'startVote'; user: string } // 房主提早投票
  | { type: 'vote'; user: string; target: string }
  | { type: 'guess'; user: string; cell?: number; text?: string } // 按鈕帶格子編號，指令帶詞或座標
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

const pickIndex = (n: number, rng: Rng) => Math.min(n - 1, Math.floor(rng() * n));
export const coord = (i: number) => `${'ABCD'[Math.floor(i / 4)]}${(i % 4) + 1}`;
const cell = (s: CState, i: number) => `${coord(i)}「${s.words![i]}」`;

const grid = (s: CState) =>
  [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((k) => `${coord(r * 4 + k)} ${s.words![r * 4 + k]}`).join('｜')).join('\n');

// 開局：抽主題卡、擲骰決定祕密詞、選變色龍和起始玩家，私訊身分
function deal(c: Ctx) {
  const s = c.s;
  const card = CHAMELEON_CARDS[pickIndex(CHAMELEON_CARDS.length, c.rng)];
  s.topic = card.topic;
  s.words = [...card.words];
  s.secret = pickIndex(16, c.rng);
  s.chameleon = s.players[pickIndex(s.players.length, c.rng)].id;
  const first = pickIndex(s.players.length, c.rng);
  s.order = s.players.map((_, i) => s.players[(first + i) % s.players.length].id);
  s.turn = 0;
  s.said = {};
  s.votes = {};
  s.phase = 'speak';
  c.events.push({
    type: 'announce',
    text: [
      `🦎 變色龍開始！${s.players.length} 位玩家，其中 1 位是🦎變色龍，不知道祕密詞。請到和 bot 的私訊查看身分。`,
      `🃏 主題：*${s.topic}*`,
      '```',
      grid(s),
      '```',
      `🗣️ 說詞順序：${s.order.map(mention).join(' → ')}`,
      `每人輪流說一個和祕密詞有關的詞（每人 ${STEP_MS / 60_000} 分鐘，不能直接說主題卡上的詞），說完討論、投票抓變色龍。`,
    ].join('\n'),
    gif: 'start',
  });
  for (const { id } of s.players) {
    const text =
      id === s.chameleon
        ? '🦎 你是變色龍，不知道祕密詞。看大家說的詞偽裝自己，被抓到的話還有一次猜祕密詞的機會！'
        : `🎲 祕密詞是 ${cell(s, s.secret)}。說一個和它有關的詞，但別讓變色龍猜到！`;
    c.events.push({ type: 'dm', to: id, text });
  }
  promptSpeaker(c);
}

function promptSpeaker(c: Ctx) {
  const s = c.s;
  c.events.push({
    type: 'prompt',
    kind: 'chameleon',
    audience: 'channel',
    text: `🎤 輪到 ${mention(s.order[s.turn])} 說詞（${STEP_MS / 60_000} 分鐘）`,
    options: [{ value: 'say', label: '✍️ 說詞' }],
  });
  startTimer(c, STEP_MS);
}

const inGame = (s: CState, id: string) => s.players.some((p) => p.id === id);
const norm = (t: string) => t.trim().toLowerCase();

function speak(c: Ctx, user: string, raw: string): boolean {
  const s = c.s;
  if (s.phase !== 'speak') return reply(c, user, '現在不是說詞時間。');
  if (user !== s.order[s.turn]) return reply(c, user, '還沒輪到你。');
  const text = raw.trim();
  const len = [...text].length;
  if (len < 1 || len > MAX_WORD) return reply(c, user, `請說一個 1～${MAX_WORD} 字的詞。`);
  if (s.words!.some((w) => norm(w) === norm(text))) return reply(c, user, '不能直接說主題卡上的詞，換一個吧。');
  s.said[user] = text;
  c.events.push({ type: 'announce', text: `🗣️ ${mention(user)}：${text}` });
  nextSpeaker(c);
  return true;
}

function nextSpeaker(c: Ctx) {
  const s = c.s;
  s.turn++;
  if (s.turn < s.order.length) return promptSpeaker(c);
  s.phase = 'discuss';
  c.events.push(
    { type: 'announce', text: ['📝 大家說的詞：', ...saidLines(s)].join('\n') },
    {
      type: 'prompt',
      kind: 'chameleon',
      audience: 'channel',
      text: `🔎 找出變色龍！討論誰不知道祕密詞（${STEP_MS / 60_000} 分鐘，房主可以提早投票）`,
      options: [{ value: 'startVote', label: '🗳️ 開始投票' }],
    },
  );
  startTimer(c, STEP_MS);
}

const saidLines = (s: CState) => s.order.map((id) => `${mention(id)}：${s.said[id] ?? '（沒有說詞）'}`);

function startVote(c: Ctx) {
  const s = c.s;
  s.phase = 'vote';
  s.votes = {};
  c.events.push({
    type: 'prompt',
    kind: 'chameleon',
    audience: 'channel',
    text: `🗳️ 投票抓變色龍！每人一票，不能投自己，${STEP_MS / 60_000} 分鐘內可以改票。`,
    options: s.players.map((p) => ({ value: `vote:${p.id}`, label: p.id })),
  });
  startTimer(c, STEP_MS);
}

function castVote(c: Ctx, user: string, target: string): boolean {
  const s = c.s;
  if (!inGame(s, user)) return reply(c, user, '你不在遊戲裡。');
  if (s.phase !== 'vote') return reply(c, user, '現在不是投票時間。');
  if (target === user) return reply(c, user, '不能投自己。');
  if (!inGame(s, target)) return false;
  s.votes[user] = target;
  c.events.push({ type: 'ephemeral', to: user, text: `你投給了 ${mention(target)}` });
  if (s.players.every((p) => s.votes[p.id])) endVote(c);
  return true;
}

// 得票最多的只有 1 人就指認他；平手時看起始玩家投的人在不在同票名單裡
function accused(s: CState): string | undefined {
  const tally = new Map<string, number>();
  for (const t of Object.values(s.votes)) tally.set(t, (tally.get(t) ?? 0) + 1);
  const max = Math.max(0, ...tally.values());
  const top = [...tally].filter(([, k]) => k === max).map(([id]) => id);
  if (top.length === 1) return top[0];
  const pick = s.votes[s.order[0]];
  return pick && top.includes(pick) ? pick : undefined;
}

function endVote(c: Ctx) {
  const s = c.s;
  const lines = s.players.map((p) => `${mention(p.id)} → ${s.votes[p.id] ? mention(s.votes[p.id]) : '沒投票'}`);
  const who = accused(s);
  const verdict = who ? `👉 被指認的是 ${mention(who)}` : '🤷 沒有指認出任何人';
  if (!who || who !== s.chameleon) {
    return endGame(c, ['🗳️ 投票結果：', ...lines, verdict, `🦎 變色龍 ${mention(s.chameleon!)} 沒被抓到，逃脫成功！變色龍獲勝！`], [s.chameleon!]);
  }
  s.phase = 'guess';
  c.events.push(
    { type: 'announce', text: ['🗳️ 投票結果：', ...lines, verdict, `🎯 抓到變色龍 ${mention(who)} 了！最後機會：${STEP_MS / 60_000} 分鐘內猜中祕密詞就能逃脫。`].join('\n') },
    {
      type: 'prompt',
      kind: 'chameleon',
      audience: 'channel',
      text: `🦎 ${mention(who)} 猜祕密詞（按按鈕，或用 \`/game chameleon guess <詞或座標>\`）`,
      options: s.words!.map((w, i) => ({ value: `guess:${i}`, label: `${coord(i)} ${w}` })),
      perRow: 4,
    },
  );
  startTimer(c, STEP_MS);
}

function guess(c: Ctx, user: string, cellIdx?: number, text?: string): boolean {
  const s = c.s;
  if (user !== s.chameleon) return reply(c, user, '只有變色龍可以猜。');
  if (s.phase !== 'guess') return reply(c, user, '現在不能猜祕密詞。');
  let i = cellIdx;
  if (i === undefined) {
    const t = (text ?? '').trim();
    const m = /^([A-D])([1-4])$/i.exec(t);
    i = m ? 'ABCD'.indexOf(m[1].toUpperCase()) * 4 + Number(m[2]) - 1 : s.words!.findIndex((w) => norm(w) === norm(t));
    if (i < 0) return reply(c, user, `主題卡上沒有「${t}」，請輸入主題卡上的詞或座標（例如 B3）。`);
  }
  if (!Number.isInteger(i) || i < 0 || i > 15) return false;
  const result =
    i === s.secret
      ? `🦎 變色龍 ${mention(user)} 猜中祕密詞，逃脫成功！變色龍獲勝！`
      : `❌ 變色龍猜 ${cell(s, i)}，猜錯了！平民獲勝！`;
  endGame(c, [result], i === s.secret ? [user] : others(s));
  return true;
}

// 變色龍以外的所有人
const others = (s: CState) => s.players.map((p) => p.id).filter((id) => id !== s.chameleon);

function endGame(c: Ctx, lines: string[], winners: string[]) {
  const s = c.s;
  s.phase = 'ended';
  s.finished = true;
  s.timers = {};
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: winners });
  c.events.push(
    {
      type: 'announce',
      text: [`🏁 遊戲結束！`, ...lines, `🤫 祕密詞：${cell(s, s.secret!)}`, `🦎 變色龍：${mention(s.chameleon!)}`, '🗣️ 大家說的詞：', ...saidLines(s)].join('\n'),
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_CHAMELEON_PLAYERS, (id) => ({ id }));
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, '變色龍不支援 bot。');
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, '只有房主可以開始遊戲。');
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_CHAMELEON_PLAYERS) return reply(c, action.user, `目前 ${n} 人，至少需要 ${MIN_CHAMELEON_PLAYERS} 人才能開始。`);
      c.events.push(lobbyEvent(TITLE, { ...s, phase: 'speak' }));
      deal(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user, s.chameleon ? `祕密詞是 ${cell(s, s.secret!)}，變色龍是 ${mention(s.chameleon)}。` : '');
    case 'openSay':
      if (s.phase !== 'speak') return reply(c, action.user, '現在不是說詞時間。');
      if (action.user !== s.order[s.turn]) return reply(c, action.user, '還沒輪到你。');
      c.events.push({ type: 'modal', to: action.user, kind: 'chameleonWord', title: '說一個詞', label: `一個和祕密詞有關的詞（1～${MAX_WORD} 字）` });
      return false;
    case 'say':
      return speak(c, action.user, action.text);
    case 'next':
      if (s.phase !== 'speak') return reply(c, action.user, '現在不是說詞時間。');
      if (action.user !== s.host) return reply(c, action.user, '只有房主可以跳過。');
      c.events.push({ type: 'announce', text: `⏭️ 房主跳過 ${mention(s.order[s.turn])}` });
      nextSpeaker(c);
      return true;
    case 'startVote':
      if (s.phase !== 'discuss') return reply(c, action.user, '現在不是討論時間。');
      if (action.user !== s.host) return reply(c, action.user, '只有房主可以提早投票。');
      startVote(c);
      return true;
    case 'vote':
      return castVote(c, action.user, action.target);
    case 'guess':
      return guess(c, action.user, action.cell, action.text);
    case 'timeout': {
      if (action.id !== s.timers.phase) return false;
      if (s.phase === 'speak') {
        c.events.push({ type: 'announce', text: `⌛ ${mention(s.order[s.turn])} 沒有說詞` });
        nextSpeaker(c);
      } else if (s.phase === 'discuss') startVote(c);
      else if (s.phase === 'vote') endVote(c);
      else if (s.phase === 'guess') endGame(c, ['⏰ 變色龍沒有猜祕密詞，平民獲勝！'], others(s));
      return true;
    }
  }
}

export function applyChameleon(state: CState | undefined, action: CAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.finished,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
  });
}

function createLobby(prev: CState | undefined, host: string, channel: string): Result {
  const created: CState = {
    game: 'chameleon',
    channel,
    host,
    phase: 'lobby',
    players: [{ id: host }],
    order: [],
    turn: 0,
    said: {},
    votes: {},
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
