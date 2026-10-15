// 圈內人遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyInsider(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import { DECRYPTO_WORDS } from './decryptoWords.js';

export const MIN_INSIDER_PLAYERS = 4;
export const MAX_INSIDER_PLAYERS = 8;
const TITLE = '圈內人';
const QUESTION_MS = 300_000;
const DISCUSS_MS = 120_000;
const VOTE_MS = 120_000;
const MAX_SHOWN = 200;

const ANSWERS: Answer[] = ['yes', 'no', 'unknown', 'correct'];
const ANSWER_LABEL: Record<Answer, string> = { yes: '✅ 是', no: '❌ 否', unknown: '🤷 不知道', correct: '🎯 猜中了' };

export interface IQuestion {
  id: number;
  user: string;
  text: string;
  answer?: Answer;
}

export type Answer = 'yes' | 'no' | 'unknown' | 'correct';

export type IPhase = 'lobby' | 'question' | 'discuss' | 'vote' | 'ended';

export interface IState {
  game: 'insider';
  channel: string;
  host: string;
  phase: IPhase;
  players: { id: string }[];
  master?: string;
  insider?: string;
  word?: string;
  questions: IQuestion[];
  guesser?: string;
  votes: Record<string, string>; // 投票者 → 被投的人
  finished?: boolean; // 正常結束（取消的沒有）→ 可以再來一局
  timerSeq: number;
  timers: { phase?: number };
}

export type IAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'chat'; user: string; text: string } // 頻道裡的一般訊息
  | { type: 'ask'; user: string; text: string } // `/game insider ask <問題>`
  | { type: 'answer'; user: string; question: number; answer: Answer }
  | { type: 'skip'; user: string } // 房主提早投票
  | { type: 'vote'; user: string; target: string }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<IAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: IState;
  events: GameEvent[];
}

interface Ctx {
  s: IState;
  events: GameEvent[];
  rng: Rng;
}

// 開局：抽主持人、圈內人和答案，私訊身分
function deal(c: Ctx) {
  const s = c.s;
  const [master, insider] = shuffle(s.players, c.rng).map((p) => p.id);
  s.master = master;
  s.insider = insider;
  s.word = shuffle(DECRYPTO_WORDS, c.rng)[0];
  s.phase = 'question';
  c.events.push({
    type: 'announce',
    text: [
      `🕴️ 圈內人開始！🎩 主持人是 ${mention(master)}，他知道答案，只會回答是／否／不知道。`,
      '大家之中還藏著一位🕴️圈內人，他也知道答案，會暗中引導大家。',
      `⏱️ 5 分鐘內猜出答案：直接在頻道打字發問（問答期間在頻道打的字都會送給主持人），或用 \`/game insider ask <問題>\`。`,
    ].join('\n'),
    gif: 'start',
  });
  for (const { id } of s.players) {
    const text =
      id === master
        ? `🎩 你是主持人，答案是「${s.word}」。每個問題都會出現按鈕：✅ 是／❌ 否／🤷 不知道；有人說出答案時按「🎯 猜中了」。`
        : id === insider
          ? `🕴️ 你是圈內人，答案是「${s.word}」。暗中引導大家在 5 分鐘內猜中，但別被發現！`
          : '🙂 你是平民，不知道答案。問主持人是非題猜出答案，再找出圈內人！';
    c.events.push({ type: 'dm', to: id, text });
  }
  startTimer(c, QUESTION_MS);
}

const inGame = (s: IState, id: string) => s.players.some((p) => p.id === id);
const shown = (q: IQuestion) => `${mention(q.user)}：${[...q.text].slice(0, MAX_SHOWN).join('')}`;

// 發問：記下問題，只讓主持人看到回答按鈕。echo：用指令發問時先在頻道公告問題
function addQuestion(c: Ctx, user: string, text: string, echo: boolean): boolean {
  const s = c.s;
  const q: IQuestion = { id: s.questions.length + 1, user, text };
  s.questions.push(q);
  if (echo) c.events.push({ type: 'announce', text: `❓ ${shown(q)}` });
  c.events.push({
    type: 'prompt',
    kind: 'insider',
    audience: 'ephemeral',
    user: s.master,
    text: `❓ ${shown(q)}`,
    options: ANSWERS.map((a) => ({ value: `answer:${q.id}:${a}`, label: ANSWER_LABEL[a] })),
  });
  return true;
}

function answerQuestion(c: Ctx, user: string, id: number, answer: Answer): boolean {
  const s = c.s;
  if (user !== s.master) return reply(c, user, '只有主持人可以回答。');
  if (s.phase !== 'question') return reply(c, user, '問答已經結束了。');
  const q = s.questions.find((x) => x.id === id);
  if (!q) return false;
  if (q.answer) return reply(c, user, '這題已經回答過了。');
  q.answer = answer;
  if (answer !== 'correct') {
    c.events.push({ type: 'announce', text: `❓ ${shown(q)} → ${ANSWER_LABEL[answer]}` });
    return true;
  }
  s.guesser = q.user;
  s.phase = 'discuss';
  c.events.push(
    { type: 'announce', text: `🎉 ${mention(q.user)} 猜中了！答案是「${s.word}」`, gif: 'guessRight' },
    {
      type: 'prompt',
      kind: 'insider',
      audience: 'channel',
      text: `🔎 找出圈內人！討論誰在引導大家（${DISCUSS_MS / 60_000} 分鐘，房主可以提早投票）`,
      options: [{ value: 'skip', label: '🗳️ 開始投票' }],
    },
  );
  startTimer(c, DISCUSS_MS);
  return true;
}

function startVote(c: Ctx) {
  const s = c.s;
  s.phase = 'vote';
  s.votes = {};
  c.events.push({
    type: 'prompt',
    kind: 'insider',
    audience: 'channel',
    text: `🗳️ 投票找出圈內人！每人一票（主持人也要投），不能投自己，${VOTE_MS / 60_000} 分鐘內可以改票。`,
    options: s.players.filter((p) => p.id !== s.master).map((p) => ({ value: `vote:${p.id}`, label: p.id })),
  });
  startTimer(c, VOTE_MS);
}

function castVote(c: Ctx, user: string, target: string): boolean {
  const s = c.s;
  if (!inGame(s, user)) return reply(c, user, '你不在遊戲裡。');
  if (s.phase !== 'vote') return reply(c, user, '現在不是投票時間。');
  if (target === user) return reply(c, user, '不能投自己。');
  if (target === s.master || !inGame(s, target)) return false;
  s.votes[user] = target;
  c.events.push({ type: 'ephemeral', to: user, text: `你投給了 ${mention(target)}` });
  if (s.players.every((p) => s.votes[p.id])) endVote(c);
  return true;
}

// 得票最多的只有 1 人就指認他；平手時看主持人投的人在不在同票名單裡
function accused(s: IState): string | undefined {
  const tally = new Map<string, number>();
  for (const t of Object.values(s.votes)) tally.set(t, (tally.get(t) ?? 0) + 1);
  const max = Math.max(0, ...tally.values());
  const top = [...tally].filter(([, k]) => k === max).map(([id]) => id);
  if (top.length === 1) return top[0];
  const pick = s.votes[s.master!];
  return pick && top.includes(pick) ? pick : undefined;
}

function endVote(c: Ctx) {
  const s = c.s;
  const lines = s.players.map((p) => `${mention(p.id)} → ${s.votes[p.id] ? mention(s.votes[p.id]) : '沒投票'}`);
  const who = accused(s);
  const verdict = who ? `👉 被指認的是 ${mention(who)}` : '🤷 沒有指認出任何人';
  const result = who === s.insider ? '🎉 主持人和平民獲勝！找到圈內人了！' : `🕴️ 圈內人 ${mention(s.insider!)} 獲勝！`;
  endGame(c, ['🗳️ 投票結果：', ...lines, verdict, `🏁 遊戲結束！${result}`, `🎯 猜中的人：${mention(s.guesser!)}`], who === s.insider ? s.players.map((p) => p.id).filter((id) => id !== s.insider) : [s.insider!]);
}

function endGame(c: Ctx, lines: string[], winners: string[]) {
  const s = c.s;
  s.phase = 'ended';
  s.finished = true;
  s.timers = {};
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: winners });
  c.events.push(
    { type: 'announce', text: [...lines, `答案：「${s.word}」`, `🕴️ 圈內人：${mention(s.insider!)}`, `🎩 主持人：${mention(s.master!)}`].join('\n') },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_INSIDER_PLAYERS, (id) => ({ id }));
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, '圈內人不支援 bot。');
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, '只有房主可以開始遊戲。');
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_INSIDER_PLAYERS) return reply(c, action.user, `目前 ${n} 人，至少需要 ${MIN_INSIDER_PLAYERS} 人才能開始。`);
      c.events.push(lobbyEvent(TITLE, { ...s, phase: 'question' }));
      deal(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user, s.word ? `答案是「${s.word}」。` : '');
    case 'chat':
    case 'ask': {
      const text = action.text.trim();
      const echo = action.type === 'ask';
      if (s.phase !== 'question') return echo ? reply(c, action.user, '現在不是問答時間。') : false;
      if (!inGame(s, action.user)) return echo ? reply(c, action.user, '你不在遊戲裡。') : false;
      if (action.user === s.master) return echo ? reply(c, action.user, '主持人不能發問。') : false;
      if (!text) return false;
      return addQuestion(c, action.user, text, echo);
    }
    case 'answer':
      return answerQuestion(c, action.user, action.question, action.answer);
    case 'skip':
      if (s.phase !== 'discuss') return false;
      if (action.user !== s.host) return reply(c, action.user, '只有房主可以提早投票。');
      startVote(c);
      return true;
    case 'vote':
      return castVote(c, action.user, action.target);
    case 'timeout': {
      if (action.id !== s.timers.phase) return false;
      if (s.phase === 'question') endGame(c, ['⏰ 時間到，沒有人猜中答案！所有人一起落敗。'], []);
      else if (s.phase === 'discuss') startVote(c);
      else if (s.phase === 'vote') endVote(c);
      return true;
    }
  }
}

export function applyInsider(state: IState | undefined, action: IAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.finished,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
  });
}

function createLobby(prev: IState | undefined, host: string, channel: string): Result {
  const created: IState = {
    game: 'insider',
    channel,
    host,
    phase: 'lobby',
    players: [{ id: host }],
    questions: [],
    votes: {},
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
