// 圈內人遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyInsider(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import { INSIDER_WORDS } from './insiderWords.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/insider.js';

export const MIN_INSIDER_PLAYERS = 4;
export const MAX_INSIDER_PLAYERS = 8;
const TITLE = '圈內人';
const QUESTION_MS = 300_000;
const DISCUSS_MS = 120_000;
const VOTE_MS = 120_000;
const MAX_SHOWN = 200;

const ANSWERS: Answer[] = ['yes', 'no', 'unknown', 'correct'];
const answerLabel = (s: IState, a: Answer) => tx(s.lang, `answer.${a}`);

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
  finished?: boolean; // 正常結束 (取消的沒有)→ 可以再來一局
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang; // 開房時的頻道語系 (runGame 存進去的)
}

export type IAction =
  | { type: 'new'; user: string; channel: string; lang?: Lang }
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
  | { type: 'rematch'; user: string; channel: string; lang?: Lang };

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
  s.word = shuffle(INSIDER_WORDS[s.lang ?? 'zh-TW'], c.rng)[0];
  s.phase = 'question';
  c.events.push({
    type: 'announce',
    text: [
      tx(s.lang, 'startLine1', { master: mention(master) }),
      tx(s.lang, 'startLine2'),
      tx(s.lang, 'startLine3'),
    ].join('\n'),
    gif: 'start',
  });
  for (const { id } of s.players) {
    const text =
      id === master
        ? tx(s.lang, 'dmMaster', { word: s.word })
        : id === insider
          ? tx(s.lang, 'dmInsider', { word: s.word })
          : tx(s.lang, 'dmCommon');
    c.events.push({ type: 'dm', to: id, text });
  }
  startTimer(c, QUESTION_MS);
}

const inGame = (s: IState, id: string) => s.players.some((p) => p.id === id);
const shown = (s: IState, q: IQuestion) => tx(s.lang, 'shown', { who: mention(q.user), text: [...q.text].slice(0, MAX_SHOWN).join('') });

// 發問：記下問題，只讓主持人看到回答按鈕。echo：用指令發問時先在頻道公告問題
function addQuestion(c: Ctx, user: string, text: string, echo: boolean): boolean {
  const s = c.s;
  const q: IQuestion = { id: s.questions.length + 1, user, text };
  s.questions.push(q);
  if (echo) c.events.push({ type: 'announce', text: `❓ ${shown(s, q)}` });
  c.events.push({
    type: 'prompt',
    kind: 'insider',
    audience: 'ephemeral',
    user: s.master,
    text: `❓ ${shown(s, q)}`,
    options: ANSWERS.map((a) => ({ value: `answer:${q.id}:${a}`, label: answerLabel(s, a) })),
  });
  return true;
}

function answerQuestion(c: Ctx, user: string, id: number, answer: Answer): boolean {
  const s = c.s;
  if (user !== s.master) return reply(c, user, tx(s.lang, 'onlyMaster'));
  if (s.phase !== 'question') return reply(c, user, tx(s.lang, 'qaOver'));
  const q = s.questions.find((x) => x.id === id);
  if (!q) return false;
  if (q.answer) return reply(c, user, tx(s.lang, 'answered'));
  q.answer = answer;
  if (answer !== 'correct') {
    c.events.push({ type: 'announce', text: `❓ ${shown(s, q)} → ${answerLabel(s, answer)}` });
    return true;
  }
  s.guesser = q.user;
  s.phase = 'discuss';
  c.events.push(
    { type: 'announce', text: tx(s.lang, 'guessed', { who: mention(q.user), word: s.word! }), gif: 'guessRight' },
    {
      type: 'prompt',
      kind: 'insider',
      audience: 'channel',
      text: tx(s.lang, 'discuss', { min: DISCUSS_MS / 60_000 }),
      options: [{ value: 'skip', label: tx(s.lang, 'startVote') }],
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
    text: tx(s.lang, 'vote', { min: VOTE_MS / 60_000 }),
    options: s.players.filter((p) => p.id !== s.master).map((p) => ({ value: `vote:${p.id}`, label: p.id })),
  });
  startTimer(c, VOTE_MS);
}

function castVote(c: Ctx, user: string, target: string): boolean {
  const s = c.s;
  if (!inGame(s, user)) return reply(c, user, tx(s.lang, 'notInGame'));
  if (s.phase !== 'vote') return reply(c, user, tx(s.lang, 'notVoting'));
  if (target === user) return reply(c, user, tx(s.lang, 'noSelf'));
  if (target === s.master || !inGame(s, target)) return false;
  s.votes[user] = target;
  c.events.push({ type: 'ephemeral', to: user, text: tx(s.lang, 'voted', { who: mention(target) }) });
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
  const lines = s.players.map((p) => `${mention(p.id)} → ${s.votes[p.id] ? mention(s.votes[p.id]) : tx(s.lang, 'noVote')}`);
  const who = accused(s);
  const verdict = who ? tx(s.lang, 'accused', { who: mention(who) }) : tx(s.lang, 'nobody');
  const result = who === s.insider ? tx(s.lang, 'commonsWin') : tx(s.lang, 'insiderWins', { who: mention(s.insider!) });
  endGame(c, [tx(s.lang, 'voteResult'), ...lines, verdict, tx(s.lang, 'gameOver', { result }), tx(s.lang, 'guesser', { who: mention(s.guesser!) })], who === s.insider ? s.players.map((p) => p.id).filter((id) => id !== s.insider) : [s.insider!]);
}

function endGame(c: Ctx, lines: string[], winners: string[]) {
  const s = c.s;
  s.phase = 'ended';
  s.finished = true;
  s.timers = {};
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: winners });
  c.events.push(
    { type: 'announce', text: [...lines, tx(s.lang, 'answerIs', { word: s.word! }), tx(s.lang, 'insiderIs', { who: mention(s.insider!) }), tx(s.lang, 'masterIs', { who: mention(s.master!) })].join('\n') },
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
      return reply(c, action.user, tx(s.lang, 'noBots'));
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostStart'));
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_INSIDER_PLAYERS) return reply(c, action.user, tx(s.lang, 'needPlayers', { n, min: MIN_INSIDER_PLAYERS }));
      c.events.push(lobbyEvent(TITLE, { ...s, phase: 'question' }));
      deal(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user, s.word ? tx(s.lang, 'cancelWord', { word: s.word }) : '');
    case 'chat':
    case 'ask': {
      const text = action.text.trim();
      const echo = action.type === 'ask';
      if (s.phase !== 'question') return echo ? reply(c, action.user, tx(s.lang, 'notQa')) : false;
      if (!inGame(s, action.user)) return echo ? reply(c, action.user, tx(s.lang, 'notInGame')) : false;
      if (action.user === s.master) return echo ? reply(c, action.user, tx(s.lang, 'masterNoAsk')) : false;
      if (!text) return false;
      return addQuestion(c, action.user, text, echo);
    }
    case 'answer':
      return answerQuestion(c, action.user, action.question, action.answer);
    case 'skip':
      if (s.phase !== 'discuss') return false;
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostVote'));
      startVote(c);
      return true;
    case 'vote':
      return castVote(c, action.user, action.target);
    case 'timeout': {
      if (action.id !== s.timers.phase) return false;
      if (s.phase === 'question') endGame(c, [tx(s.lang, 'timeUp')], []);
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
