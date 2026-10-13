// 截碼戰遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyDecrypto(state, action, rng) → { state, events }。
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { DECRYPTO_WORDS } from './decryptoWords.js';

export const MIN_DECRYPTO_PLAYERS = 4;
export const MAX_DECRYPTO_PLAYERS = 12;
const TITLE = '截碼戰';
const PHASE_MS = 180_000;
const MAX_CLUE = 30;
const MAX_ROUNDS = 8;

export type DPhase = 'lobby' | 'clue' | 'vote' | 'ended';
export type Team = 'black' | 'white';
type Mode = 'decode' | 'intercept';

const TEAMS: Team[] = ['black', 'white'];
const TEAM_NAME: Record<Team, string> = { black: '⚫ 黑隊', white: '⚪ 白隊' };
const other = (t: Team): Team => (t === 'black' ? 'white' : 'black');

// 1～4 取 3 個不重複數字的所有排列（24 組），依字典順序
const CODES = [1, 2, 3, 4].flatMap((a) => [1, 2, 3, 4].flatMap((b) => [1, 2, 3, 4].map((c) => [a, b, c])))
  .filter(([a, b, c]) => a !== b && b !== c && a !== c)
  .map((x) => x.join(''));
const fmt = (code: string) => code.split('').join('-');

export interface DPlayer {
  id: string;
  team?: Team;
}

export interface DTeam {
  words: string[];
  order: string[]; // 加密者順序
  code?: number[];
  clues?: string[];
  history: string[][]; // history[i]：編號 i+1 下用過的提示
  miss: number;
  intercept: number;
}

export interface DState {
  game: 'decrypto';
  channel: string;
  host: string;
  phase: DPhase;
  players: DPlayer[];
  round: number; // 從 0 開始
  teams: Record<Team, DTeam>;
  decodeVotes: Record<string, string>;
  interceptVotes: Record<string, string>;
  winner?: Team | 'tie';
  timerSeq: number;
  timers: { phase?: number };
}

export type DAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'openClue'; user: string }
  | { type: 'clue'; user: string; texts: string[] }
  | { type: 'voteMenu'; user: string; mode: Mode }
  | { type: 'vote'; user: string; mode: Mode; round: number; code: string }
  | { type: 'history'; user: string }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<DAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: DState;
  events: GameEvent[];
}

interface Ctx {
  s: DState;
  events: GameEvent[];
  rng: Rng;
}

const lobbyEvent = (s: DState): GameEvent => ({
  type: 'lobby',
  title: TITLE,
  host: s.host,
  players: s.players.map((p) => p.id),
  open: s.phase === 'lobby',
});

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startTimer(c: Ctx, ms: number) {
  c.s.timers.phase = ++c.s.timerSeq;
  c.events.push({ type: 'startTimer', id: c.s.timerSeq, ms });
}

const reply = (c: Ctx, to: string, text: string) => {
  c.events.push({ type: 'ephemeral', to, text });
  return false;
};

const emptyTeam = (): DTeam => ({ words: [], order: [], history: [[], [], [], []], miss: 0, intercept: 0 });
const teamOf = (s: DState, id: string) => s.players.find((p) => p.id === id)?.team;
const encryptor = (s: DState, t: Team) => s.teams[t].order[s.round % s.teams[t].order.length];
const decoders = (s: DState, t: Team) => s.teams[t].order.filter((id) => id !== encryptor(s, t));
const tokens = (s: DState) => TEAMS.map((t) => `${TEAM_NAME[t]} 🕵️ ${s.teams[t].intercept}　❌ ${s.teams[t].miss}`).join('｜');
const clueLine = (s: DState, t: Team) => {
  const cl = s.teams[t].clues;
  return `${TEAM_NAME[t]}（${mention(encryptor(s, t))}）：${cl ? cl.join(' → ') : '（沒有提示）'}`;
};

// 開局：隨機分隊，每隊 4 個祕密詞，私訊給隊員
function deal(c: Ctx) {
  const s = c.s;
  const shuffled = shuffle(s.players, c.rng);
  shuffled.forEach((p, i) => (s.players.find((x) => x.id === p.id)!.team = i % 2 === 0 ? 'black' : 'white'));
  const words = shuffle(DECRYPTO_WORDS, c.rng);
  TEAMS.forEach((t, i) => {
    s.teams[t].words = words.slice(i * 4, i * 4 + 4);
    s.teams[t].order = shuffled.filter((p) => teamOf(s, p.id) === t).map((p) => p.id);
  });
  const roster = (t: Team) => `${TEAM_NAME[t]}：${s.teams[t].order.map(mention).join('、')}`;
  c.events.push({
    type: 'announce',
    text: `🔐 截碼戰開始！每隊有 4 個祕密詞（已私訊），加密者用提示讓隊友解出 3 碼密碼，也別讓對手攔截。\n攔截成功 2 次獲勝、自己解錯 2 次落敗，最多 ${MAX_ROUNDS} 回合。\n${roster('black')}\n${roster('white')}`,
    gif: 'start',
  });
  for (const t of TEAMS) {
    const list = s.teams[t].words.map((w, i) => `${i + 1} ${w}`).join('\n');
    for (const id of s.teams[t].order) c.events.push({ type: 'dm', to: id, text: `🔐 你是${TEAM_NAME[t]}，你們的祕密詞：\n${list}` });
  }
  startRound(c);
}

// 每回合開始：兩隊各抽一組密碼，私訊加密者
function startRound(c: Ctx) {
  const s = c.s;
  s.phase = 'clue';
  s.decodeVotes = {};
  s.interceptVotes = {};
  for (const t of TEAMS) {
    const team = s.teams[t];
    team.code = shuffle([1, 2, 3, 4], c.rng).slice(0, 3);
    team.clues = undefined;
    const hint = team.code.map((n) => `${n} ${team.words[n - 1]}`).join(' → ');
    c.events.push({
      type: 'dm',
      to: encryptor(s, t),
      text: `🔑 第 ${s.round + 1} 回合你是加密者，密碼是 ${team.code.join('-')}：${hint}\n回到頻道按「✍️ 寫提示」，依順序寫 3 個提示。`,
    });
  }
  c.events.push(
    {
      type: 'announce',
      text: `🔐 第 ${s.round + 1}／${MAX_ROUNDS} 回合：加密者 ${TEAMS.map((t) => `${TEAM_NAME[t]} ${mention(encryptor(s, t))}`).join('、')} 請寫提示（${PHASE_MS / 60_000} 分鐘）\n${tokens(s)}`,
    },
    {
      type: 'prompt',
      kind: 'decrypto',
      audience: 'channel',
      text: '加密者想好了就按這裡寫提示',
      options: [
        { value: 'clue', label: '✍️ 寫提示' },
        { value: 'history', label: '📜 提示紀錄' },
      ],
    },
  );
  startTimer(c, PHASE_MS);
}

function giveClue(c: Ctx, user: string, texts: string[]): boolean {
  const s = c.s;
  const t = teamOf(s, user);
  if (s.phase !== 'clue' || !t || encryptor(s, t) !== user) return reply(c, user, '這回合不是你加密。');
  const clean = texts.map((x) => x.trim());
  if (clean.length !== 3 || clean.some((x) => !x || [...x].length > MAX_CLUE)) {
    return reply(c, user, `要寫剛好 3 個提示，每個 1～${MAX_CLUE} 個字。`);
  }
  s.teams[t].clues = clean;
  c.events.push({ type: 'ephemeral', to: user, text: `已送出：${clean.join(' → ')}` });
  if (TEAMS.every((x) => s.teams[x].clues)) startVote(c);
  return true;
}

// 兩隊提示一起公開，開始投票
function startVote(c: Ctx) {
  const s = c.s;
  s.phase = 'vote';
  const steal = s.round > 0;
  c.events.push(
    {
      type: 'announce',
      text: [
        `🔎 第 ${s.round + 1} 回合的提示：`,
        ...TEAMS.map((t) => clueLine(s, t)),
        steal ? '按「🔓」解自己隊的密碼（加密者不投），按「🕵️」攔截對方的密碼，可以改選' : '按「🔓」解自己隊的密碼（加密者不投），可以改選；第 1 回合不攔截',
        `（${PHASE_MS / 60_000} 分鐘）`,
      ].join('\n'),
    },
    {
      type: 'prompt',
      kind: 'decrypto',
      audience: 'channel',
      text: '投票',
      options: [
        { value: 'decode', label: '🔓 解我們的密碼' },
        ...(steal ? [{ value: 'intercept', label: '🕵️ 攔截對方密碼' }] : []),
        { value: 'history', label: '📜 提示紀錄' },
      ],
    },
  );
  startTimer(c, PHASE_MS);
}

function canVote(s: DState, user: string, mode: Mode) {
  const t = teamOf(s, user);
  if (s.phase !== 'vote' || !t) return '現在不能投票。';
  if (mode === 'decode' && encryptor(s, t) === user) return '這回合你是加密者，不能解自己的密碼。';
  if (mode === 'intercept' && s.round === 0) return '第 1 回合不攔截。';
  return undefined;
}

function voteMenu(c: Ctx, user: string, mode: Mode): boolean {
  const err = canVote(c.s, user, mode);
  if (err) return reply(c, user, err);
  c.events.push({
    type: 'prompt',
    kind: 'decrypto',
    audience: 'ephemeral',
    user,
    text: mode === 'decode' ? '🔓 我們的密碼是？' : '🕵️ 對方的密碼是？',
    options: CODES.map((code) => ({ value: `vote:${mode}:${c.s.round}:${code}`, label: fmt(code) })),
    perRow: 6,
  });
  return false;
}

function vote(c: Ctx, user: string, mode: Mode, round: number, code: string): boolean {
  const s = c.s;
  const err = canVote(s, user, mode);
  if (err) return reply(c, user, err);
  if (round !== s.round) return reply(c, user, '這是之前回合的選單。');
  if (!CODES.includes(code)) return false;
  (mode === 'decode' ? s.decodeVotes : s.interceptVotes)[user] = code;
  c.events.push({ type: 'ephemeral', to: user, text: `你選了 ${fmt(code)}` });
  const done =
    TEAMS.every((t) => decoders(s, t).every((id) => id in s.decodeVotes)) &&
    (s.round === 0 || s.players.every((p) => p.id in s.interceptVotes));
  if (done) reveal(c);
  return true;
}

// 多數決，平手時從最高票隨機選一組；沒有票回傳 undefined
function majority(c: Ctx, votes: string[]): string | undefined {
  const count = new Map<string, number>();
  for (const v of votes) count.set(v, (count.get(v) ?? 0) + 1);
  const top = Math.max(0, ...count.values());
  const tied = [...count].filter(([, n]) => n === top).map(([v]) => v).sort();
  return tied.length ? tied[Math.floor(c.rng() * tied.length)] : undefined;
}

function reveal(c: Ctx) {
  const s = c.s;
  const lines = [`📍 第 ${s.round + 1} 回合揭曉`];
  const teamVotes = (t: Team, votes: Record<string, string>) => s.teams[t].order.filter((id) => id in votes).map((id) => votes[id]);
  const answers = TEAMS.map((t) => ({
    t,
    decode: majority(c, teamVotes(t, s.decodeVotes)),
    steal: s.round > 0 ? majority(c, teamVotes(t, s.interceptVotes)) : undefined,
  }));
  for (const { t, decode, steal } of answers) {
    const team = s.teams[t];
    const code = team.code!.join('');
    const ok = decode === code;
    if (!ok) team.miss++;
    let line = `${TEAM_NAME[t]} 密碼 ${fmt(code)}｜解碼 ${decode ? fmt(decode) : '（沒有人投）'} ${ok ? '✅' : '❌ 解錯'}`;
    if (s.round > 0) {
      const caught = steal === s.teams[other(t)].code!.join('');
      if (caught) team.intercept++;
      line += `｜攔截${TEAM_NAME[other(t)]} ${steal ? fmt(steal) : '（沒有人投）'} ${caught ? '🕵️ 成功' : '✗'}`;
    }
    lines.push(line);
    team.code!.forEach((n, i) => team.clues?.[i] && team.history[n - 1].push(team.clues[i]));
  }
  lines.push(tokens(s));
  c.events.push({ type: 'announce', text: lines.join('\n') });
  checkEnd(c);
}

function checkEnd(c: Ctx) {
  const s = c.s;
  const signal = (t: Team) => s.teams[t].intercept >= 2 || s.teams[other(t)].miss >= 2;
  const [b, w] = TEAMS.map(signal);
  if (b !== w) return endGame(c, b ? 'black' : 'white');
  if (b || s.round >= MAX_ROUNDS - 1) {
    const score = (t: Team) => s.teams[t].intercept - s.teams[t].miss;
    return endGame(c, score('black') > score('white') ? 'black' : score('white') > score('black') ? 'white' : 'tie');
  }
  s.round++;
  startRound(c);
}

function endGame(c: Ctx, winner: Team | 'tie') {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  s.winner = winner;
  const result = winner === 'tie' ? '🤝 平手！' : `🎉 ${TEAM_NAME[winner]}獲勝！`;
  const words = TEAMS.map((t) => `${TEAM_NAME[t]}的祕密詞：${s.teams[t].words.map((x, i) => `${i + 1} ${x}`).join('、')}`);
  c.events.push(
    { type: 'announce', text: [`🏁 遊戲結束！${result}`, tokens(s), ...words].join('\n'), gif: 'goodWin' },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

function history(c: Ctx, user: string): boolean {
  const s = c.s;
  const lines = ['📜 提示紀錄'];
  for (const t of TEAMS) {
    lines.push(TEAM_NAME[t], ...s.teams[t].history.map((h, i) => `${i + 1}：${h.length ? h.join('、') : '—'}`));
  }
  return reply(c, user, lines.join('\n'));
}

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join': {
      if (s.phase !== 'lobby') return reply(c, action.user, '遊戲已經開始了。');
      if (s.players.some((p) => p.id === action.user)) return reply(c, action.user, '你已經在房間裡了。');
      if (s.players.length >= MAX_DECRYPTO_PLAYERS) return reply(c, action.user, '房間已滿。');
      s.players.push({ id: action.user });
      c.events.push(lobbyEvent(s));
      return true;
    }
    case 'leave': {
      if (!s.players.some((p) => p.id === action.user)) return false;
      if (s.phase !== 'lobby') return reply(c, action.user, '遊戲已經開始了，不能離開。');
      if (action.user === s.host) {
        s.phase = 'ended';
        c.events.push(lobbyEvent(s), { type: 'announce', text: '🛑 房主離開，遊戲已取消。' });
        return true;
      }
      s.players = s.players.filter((p) => p.id !== action.user);
      c.events.push(lobbyEvent(s));
      return true;
    }
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, '截碼戰不支援 bot。');
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, '只有房主可以開始遊戲。');
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_DECRYPTO_PLAYERS) return reply(c, action.user, `目前 ${n} 人，至少需要 ${MIN_DECRYPTO_PLAYERS} 人才能開始。`);
      c.events.push(lobbyEvent({ ...s, phase: 'clue' }));
      deal(c);
      return true;
    }
    case 'cancel': {
      if (action.user !== s.host) return reply(c, action.user, '只有房主可以取消遊戲。');
      s.phase = 'ended';
      s.timers = {};
      c.events.push({ type: 'announce', text: '🛑 房主已取消遊戲。' });
      return true;
    }
    case 'openClue': {
      const t = teamOf(s, action.user);
      if (s.phase !== 'clue' || !t || encryptor(s, t) !== action.user) return reply(c, action.user, '這回合不是你加密。');
      const code = s.teams[t].code!;
      c.events.push({
        type: 'modal',
        to: action.user,
        kind: 'decryptoClue',
        title: '寫提示',
        label: `密碼 ${code.join('-')}`,
        fields: code.map((n, i) => `第 ${i + 1} 個提示（${n} ${s.teams[t].words[n - 1]}）`),
      });
      return false;
    }
    case 'clue':
      return giveClue(c, action.user, action.texts);
    case 'voteMenu':
      return voteMenu(c, action.user, action.mode);
    case 'vote':
      return vote(c, action.user, action.mode, action.round, action.code);
    case 'history':
      if (s.phase === 'lobby') return false;
      return history(c, action.user);
    case 'timeout': {
      if (action.id !== s.timers.phase) return false;
      if (s.phase === 'clue') startVote(c);
      else if (s.phase === 'vote') reveal(c);
      return true;
    }
  }
}

export function applyDecrypto(state: DState | undefined, action: DAction, rng: Rng): Result {
  if (action.type === 'new') {
    if (state && state.phase !== 'ended') {
      return { state, events: [{ type: 'ephemeral', to: action.user, text: '這個頻道已經有遊戲了。' }] };
    }
    return createLobby(state, action.user, action.channel);
  }
  if (action.type === 'rematch') {
    if (!state) return { state: state!, events: [] };
    if (state.phase !== 'ended') return { state, events: [{ type: 'ephemeral', to: action.user, text: '這個頻道已經有遊戲了。' }] };
    if (!state.winner) return { state, events: [] };
    if (isBot(action.user) || !state.players.some((p) => p.id === action.user)) {
      return { state, events: [{ type: 'ephemeral', to: action.user, text: '只有上一局的玩家可以開新的一局。' }] };
    }
    return createLobby(state, action.user, action.channel);
  }
  if (!state || state.phase === 'ended') return { state: state!, events: [] };
  const c: Ctx = { s: structuredClone(state), events: [], rng };
  const changed = handle(c, action);
  return { state: changed ? c.s : state, events: c.events };
}

function createLobby(prev: DState | undefined, host: string, channel: string): Result {
  const created: DState = {
    game: 'decrypto',
    channel,
    host,
    phase: 'lobby',
    players: [{ id: host }],
    round: 0,
    teams: { black: emptyTeam(), white: emptyTeam() },
    decodeVotes: {},
    interceptVotes: {},
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(created)] };
}
