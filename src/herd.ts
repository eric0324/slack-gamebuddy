// 從眾心理（Herd Mentality）遊戲引擎：純邏輯，不碰任何 I/O。每題大家私下寫答案，跟多數人一樣就得分。
// 介面和其他遊戲一樣：applyHerd(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import { HERD_QUESTIONS } from './herdQuestions.js';

export const MIN_HERD_PLAYERS = 4;
export const MAX_HERD_PLAYERS = 12;
const TITLE = '從眾心理';
const TARGET = 8;
const MAX_ROUNDS = 15;
const MAX_TEXT = 20;
const ANSWER_MS = 60_000;
const MERGE_MS = 30_000;

export interface HerdState {
  game: 'herd';
  channel: string;
  host: string;
  phase: 'lobby' | 'answer' | 'merge' | 'ended';
  players: { id: string; score: number }[];
  deck: number[]; // 還沒抽的題目（HERD_QUESTIONS 的 index），跨局沿用
  question?: number;
  round: number; // 第幾題（1 起算）
  answers: { user: string; text: string }[]; // 這題的原始答案，依送出順序
  groups: { text: string; members: string[] }[]; // 分組／合併後
  selected: number[]; // 房主已選的組
  cow?: string; // 粉紅牛持有者
  seq: number; // 題目／分組訊息的 ref，也用來擋掉舊按鈕
  winners?: string[]; // 正常結束才有（取消的沒有）
  timerSeq: number;
  timers: { phase?: number };
}

export type HerdAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'openWrite'; user: string }
  | { type: 'answer'; user: string; text: string }
  | { type: 'pick'; user: string; seq: number; group: number }
  | { type: 'merge'; user: string; seq?: number; groups?: number[] } // 按鈕帶 seq；指令帶組的編號（1 起算）
  | { type: 'done'; user: string; seq?: number }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<HerdAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: HerdState; events: GameEvent[] };
type Ctx = { s: HerdState; events: GameEvent[]; rng: Rng };

// 比對前正規化：全形轉半形、英文轉小寫、去掉空白、標點和符號
const normalize = (t: string) => t.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const isPlayer = (s: HerdState, id: string) => s.players.some((p) => p.id === id);
const scoreLine = (s: HerdState) => `目前分數：${s.players.map((p) => `${mention(p.id)} ${p.score}${p.id === s.cow ? ' 🐮' : ''}`).join('、')}`;

function answerBoard(s: HerdState): GameEvent {
  const waiting = s.players.filter((p) => !s.answers.some((a) => a.user === p.id));
  return {
    type: 'prompt',
    kind: 'herd',
    audience: 'channel',
    ref: `herd:${s.seq}`,
    text: [
      `🐑 第 ${s.round}/${MAX_ROUNDS} 題：${HERD_QUESTIONS[s.question!]}`,
      `按「✍️ 作答」寫下你覺得多數人會寫的答案（${ANSWER_MS / 1000} 秒，送出前可以改）`,
      `已作答 ${s.answers.length}/${s.players.length}${waiting.length ? `，還沒作答：${waiting.map((p) => mention(p.id)).join(' ')}` : ''}`,
    ].join('\n'),
    options: [{ value: 'write', label: '✍️ 作答' }],
  };
}

function groupBoard(s: HerdState): GameEvent {
  return {
    type: 'prompt',
    kind: 'herd',
    audience: 'channel',
    ref: `herd:${s.seq}`,
    text: [
      `📋 第 ${s.round} 題「${HERD_QUESTIONS[s.question!]}」的答案：`,
      ...s.groups.map((g, i) => `${i + 1}. ${g.text}（${g.members.length} 人）：${g.members.map(mention).join('、')}`),
      ...(s.phase === 'merge' ? [`房主 ${mention(s.host)} ${MERGE_MS / 1000} 秒內可以合併意思一樣的答案`] : []),
    ].join('\n'),
    options: [],
  };
}

function mergeMenu(c: Ctx) {
  const s = c.s;
  c.events.push({
    type: 'prompt',
    kind: 'herd',
    audience: 'ephemeral',
    user: s.host,
    text: '選要合併的組（意思一樣的答案），再按「🔗 合併」；合併完按「✅ 完成」',
    options: [
      ...s.groups.map((g, i) => ({ value: `pick:${s.seq}:${i}`, label: `${s.selected.includes(i) ? '✅ ' : ''}${i + 1}. ${g.text}（${g.members.length}）` })),
      { value: `merge:${s.seq}`, label: '🔗 合併' },
      { value: `done:${s.seq}`, label: '✅ 完成' },
    ],
  });
}

function startQuestion(c: Ctx) {
  const s = c.s;
  if (!s.deck.length) s.deck = shuffle(HERD_QUESTIONS.map((_, i) => i), c.rng);
  s.question = s.deck.shift()!;
  s.round++;
  s.seq++;
  s.phase = 'answer';
  s.answers = [];
  s.groups = [];
  s.selected = [];
  c.events.push(answerBoard(s));
  startTimer(c, ANSWER_MS);
}

// 人數多的排前面；同人數照出現順序
const sortGroups = (groups: HerdState['groups']) => [...groups].sort((a, b) => b.members.length - a.members.length);

function group(c: Ctx) {
  const s = c.s;
  const byKey = new Map<string, { text: string; members: string[] }>();
  for (const a of s.answers) {
    const key = normalize(a.text);
    const g = byKey.get(key);
    if (g) g.members.push(a.user);
    else byKey.set(key, { text: a.text, members: [a.user] });
  }
  s.groups = sortGroups([...byKey.values()]);
  s.seq++;
  if (!s.groups.length) {
    c.events.push({ type: 'announce', text: `⌛ 第 ${s.round} 題沒有人作答。` });
    return next(c);
  }
  if (s.groups.length === 1) {
    c.events.push(groupBoard(s));
    return score(c);
  }
  s.phase = 'merge';
  c.events.push(groupBoard(s));
  mergeMenu(c);
  startTimer(c, MERGE_MS);
}

function score(c: Ctx) {
  const s = c.s;
  s.phase = 'answer'; // 計分中，避免合併按鈕；接著進下一題或結束
  s.timers = {};
  const sizes = s.groups.map((g) => g.members.length);
  const top = Math.max(...sizes);
  const tops = s.groups.filter((g) => g.members.length === top);
  const gained = tops.length === 1 && top >= 2 ? tops[0].members : [];
  for (const id of gained) s.players.find((p) => p.id === id)!.score++;
  const singles = s.groups.filter((g) => g.members.length === 1);
  const lines = [gained.length ? `🐑 跟大家一樣的「${tops[0].text}」：${gained.map(mention).join('、')} 各 +1` : '🤷 這題沒有人得分'];
  if (singles.length === 1 && singles[0].members[0] !== s.cow) {
    const prev = s.cow;
    s.cow = singles[0].members[0];
    lines.push(`🐮 只有 ${mention(s.cow)} 答「${singles[0].text}」，拿到粉紅牛${prev ? `（從 ${mention(prev)} 手上轉過來）` : ''}`);
  }
  lines.push(scoreLine(s));
  c.events.push({ type: 'announce', text: lines.join('\n') });
  next(c);
}

// 檢查勝負，還沒結束就出下一題
function next(c: Ctx) {
  const s = c.s;
  const reached = s.players.filter((p) => p.score >= TARGET && p.id !== s.cow).map((p) => p.id);
  if (reached.length) return endGame(c, reached);
  if (s.round >= MAX_ROUNDS) {
    const others = s.players.filter((p) => p.id !== s.cow);
    const best = Math.max(0, ...others.map((p) => p.score));
    return endGame(c, best > 0 ? others.filter((p) => p.score === best).map((p) => p.id) : []);
  }
  startQuestion(c);
}

function endGame(c: Ctx, winners: string[]) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  s.winners = winners;
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners });
  c.events.push(
    {
      type: 'announce',
      text: [
        winners.length ? `🏆 遊戲結束，${winners.map(mention).join('、')} 獲勝！` : '🏁 遊戲結束，沒有人獲勝。',
        `最終分數：${s.players.map((p) => `${mention(p.id)} ${p.score}`).join('、')}`,
        ...(s.cow ? [`🐮 粉紅牛在 ${mention(s.cow)} 手上`] : []),
      ].join('\n'),
      gif: winners.length ? 'goodWin' : undefined,
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

function answer(c: Ctx, user: string, raw: string): boolean {
  const s = c.s;
  if (!isPlayer(s, user)) return reply(c, user, '你不在這局遊戲裡。');
  if (s.phase !== 'answer') return reply(c, user, '現在不是作答的時間。');
  const text = raw.trim();
  if ([...text].length > MAX_TEXT) return reply(c, user, `答案最多 ${MAX_TEXT} 個字`);
  if (!normalize(text)) return reply(c, user, '答案不能是空的');
  const had = s.answers.some((a) => a.user === user);
  s.answers = [...s.answers.filter((a) => a.user !== user), { user, text }];
  c.events.push({ type: 'ephemeral', to: user, text: had ? '已更新答案' : '已收到答案' });
  if (s.answers.length === s.players.length) group(c);
  else c.events.push(answerBoard(s));
  return true;
}

function openWrite(c: Ctx, user: string): boolean {
  if (!isPlayer(c.s, user)) return reply(c, user, '你不在這局遊戲裡。');
  if (c.s.phase !== 'answer') return reply(c, user, '現在不是作答的時間。');
  c.events.push({ type: 'modal', to: user, kind: 'herdAnswer', title: '作答', label: `你的答案（1～${MAX_TEXT} 字）` });
  return false;
}

// 合併階段的共同檢查：房主、合併中、選單沒過期
function merger(c: Ctx, user: string, seq?: number): boolean {
  if (c.s.phase !== 'merge') return reply(c, user, '現在不是合併答案的時間。');
  if (user !== c.s.host) return reply(c, user, '只有房主可以合併答案');
  if (seq !== undefined && seq !== c.s.seq) return reply(c, user, '這個選單已經過期了。');
  return true;
}

function pick(c: Ctx, user: string, seq: number, n: number): boolean {
  const s = c.s;
  if (!merger(c, user, seq) || !s.groups[n]) return false;
  s.selected = s.selected.includes(n) ? s.selected.filter((x) => x !== n) : [...s.selected, n];
  mergeMenu(c);
  return true;
}

function merge(c: Ctx, user: string, seq?: number, numbers?: number[]): boolean {
  const s = c.s;
  if (!merger(c, user, seq)) return false;
  const picked = [...new Set(numbers ? numbers.map((n) => n - 1) : s.selected)].filter((i) => s.groups[i]).sort((a, b) => a - b);
  if (picked.length < 2) return reply(c, user, '請至少選兩組');
  const [keep, ...rest] = picked;
  s.groups[keep].members.push(...rest.flatMap((i) => s.groups[i].members));
  s.groups = sortGroups(s.groups.filter((_, i) => !rest.includes(i)));
  s.selected = [];
  c.events.push(groupBoard(s));
  if (s.groups.length === 1) score(c);
  else mergeMenu(c);
  return true;
}

function done(c: Ctx, user: string, seq?: number): boolean {
  if (!merger(c, user, seq)) return false;
  score(c);
  return true;
}

const RULES = (s: HerdState) =>
  [
    `🐑 從眾心理開始！玩家：${s.players.map((p) => mention(p.id)).join('、')}`,
    `每題大家私下寫答案（${ANSWER_MS / 1000} 秒），跟最多人一樣的那組每人得 1 分（最多人數平手就沒人得分）。`,
    '只有一個人的答案跟大家都不一樣時，他拿到 🐮 粉紅牛；粉紅牛會轉給下一個唯一單獨答案的人。',
    `先到 ${TARGET} 分且手上沒有粉紅牛的人獲勝；最多 ${MAX_ROUNDS} 題。房主可以合併意思一樣的答案。`,
  ].join('\n');

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, '只有房主可以開始遊戲。');
  if (s.phase !== 'lobby') return false;
  if (s.players.length < MIN_HERD_PLAYERS) return reply(c, user, `目前 ${s.players.length} 人，至少需要 ${MIN_HERD_PLAYERS} 人才能開始。`);
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'answer' }));
  c.events.push({ type: 'announce', text: RULES(s), gif: 'start' });
  startQuestion(c);
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_HERD_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, '從眾心理不支援 bot。');
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user, c.s.phase === 'lobby' ? '' : `\n${scoreLine(c.s)}`);
    case 'openWrite':
      return openWrite(c, action.user);
    case 'answer':
      return answer(c, action.user, action.text);
    case 'pick':
      return pick(c, action.user, action.seq, action.group);
    case 'merge':
      return merge(c, action.user, action.seq, action.groups);
    case 'done':
      return done(c, action.user, action.seq);
    case 'timeout':
      if (action.id !== c.s.timers.phase) return false;
      if (c.s.phase === 'answer') group(c);
      else if (c.s.phase === 'merge') score(c);
      else return false;
      return true;
    default:
      return false;
  }
}

const newPlayer = (id: string) => ({ id, score: 0 });

export function applyHerd(state: HerdState | undefined, action: HerdAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer,
    createLobby,
    handle,
  });
}

function createLobby(prev: HerdState | undefined, host: string, channel: string): Result {
  const created: HerdState = {
    game: 'herd',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    deck: prev?.deck ?? [], // 接著上一局剩下的題目抽，同一頻道跨局不重複
    round: 0,
    answers: [],
    groups: [],
    selected: [],
    seq: prev?.seq ?? 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
