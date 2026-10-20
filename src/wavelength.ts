// 心電感應遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyWavelength(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import { SPECTRUMS } from './wavelengthCards.js';

export const MIN_WAVELENGTH_PLAYERS = 4;
export const MAX_WAVELENGTH_PLAYERS = 12;
const TITLE = '心電感應';
const PHASE_MS = 180_000;
const MAX_CLUE = 30;

export type WPhase = 'lobby' | 'clue' | 'guess' | 'side' | 'ended';
export type Team = 'orange' | 'purple';
type Side = 'left' | 'right';

const TEAM_NAME: Record<Team, string> = { orange: '🟠 橘隊', purple: '🟣 紫隊' };
const other = (t: Team): Team => (t === 'orange' ? 'purple' : 'orange');

export interface WPlayer {
  id: string;
  team?: Team;
}

export interface WState {
  game: 'wavelength';
  channel: string;
  host: string;
  phase: WPhase;
  players: WPlayer[];
  order: string[]; // 出題順序
  round: number;
  used: number[]; // 這局用過的光譜卡
  spectrum?: [string, string];
  target?: number;
  clue?: string;
  guesses: Record<string, number>;
  answer?: number;
  sides: Record<string, Side>;
  scores: Record<Team, number>;
  winner?: Team | 'tie';
  timerSeq: number;
  timers: { phase?: number };
}

export type WAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'openClue'; user: string }
  | { type: 'clue'; user: string; text: string }
  | { type: 'guess'; user: string; value: number }
  | { type: 'side'; user: string; value: Side }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<WAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: WState;
  events: GameEvent[];
}

interface Ctx {
  s: WState;
  events: GameEvent[];
  rng: Rng;
}

const teamOf = (s: WState, id: string) => s.players.find((p) => p.id === id)?.team;
const psychic = (s: WState) => s.order[s.round];
const psychicTeam = (s: WState) => teamOf(s, psychic(s))!;
const mates = (s: WState) => s.players.filter((p) => p.team === psychicTeam(s) && p.id !== psychic(s)).map((p) => p.id);
const rivals = (s: WState) => s.players.filter((p) => p.team === other(psychicTeam(s))).map((p) => p.id);
const dial = (s: WState) => `${s.spectrum![0]} ◀ 0 ─ 10 ▶ ${s.spectrum![1]}`;
const scoreLine = (s: WState) => `總分：${TEAM_NAME.orange} ${s.scores.orange}｜${TEAM_NAME.purple} ${s.scores.purple}`;

// 開局：隨機分隊，兩隊輪流出題，每人一題
function deal(c: Ctx) {
  const s = c.s;
  const shuffled = shuffle(s.players, c.rng);
  shuffled.forEach((p, i) => (s.players.find((x) => x.id === p.id)!.team = i % 2 === 0 ? 'orange' : 'purple'));
  const first: Team = c.rng() < 0.5 ? 'orange' : 'purple';
  const lists = [first, other(first)].map((t) => shuffled.filter((p) => teamOf(s, p.id) === t).map((p) => p.id));
  s.order = Array.from({ length: Math.max(lists[0].length, lists[1].length) }, (_, i) => [lists[0][i], lists[1][i]])
    .flat()
    .filter((id): id is string => id !== undefined);
  const roster = (t: Team) => `${TEAM_NAME[t]}：${s.players.filter((p) => p.team === t).map((p) => mention(p.id)).join('、')}`;
  c.events.push({
    type: 'announce',
    text: `📡 心電感應開始！每人輪流出一題，共 ${s.order.length} 題。\n${roster('orange')}\n${roster('purple')}`,
    gif: 'start',
  });
  startRound(c);
}

// 每題開始：抽光譜卡和目標，私訊出題者
function startRound(c: Ctx) {
  const s = c.s;
  const unused = SPECTRUMS.map((_, i) => i).filter((i) => !s.used.includes(i));
  const card = unused[Math.floor(c.rng() * unused.length)];
  s.used.push(card);
  s.spectrum = SPECTRUMS[card];
  s.target = Math.floor(c.rng() * 11);
  s.clue = undefined;
  s.answer = undefined;
  s.guesses = {};
  s.sides = {};
  s.phase = 'clue';
  const p = psychic(s);
  c.events.push(
    {
      type: 'dm',
      to: p,
      text: `🎯 你這題的光譜是「${s.spectrum[0]} ↔ ${s.spectrum[1]}」，目標在 ${s.target} (0 是最左「${s.spectrum[0]}」，10 是最右「${s.spectrum[1]}」)。\n回到頻道按「✍️ 寫提示」，給一個讓隊友猜到這個位置的提示詞。`,
    },
    {
      type: 'announce',
      text: `🔮 第 ${s.round + 1}／${s.order.length} 題：輪到 ${TEAM_NAME[psychicTeam(s)]} ${mention(p)} 出題 (${PHASE_MS / 60_000} 分鐘)\n光譜：${dial(s)}`,
    },
    { type: 'prompt', kind: 'wavelength', audience: 'channel', text: `${mention(p)} 想好了就按這裡寫提示`, options: [{ value: 'clue', label: '✍️ 寫提示' }] },
  );
  startTimer(c, PHASE_MS);
}

function giveClue(c: Ctx, user: string, text: string): boolean {
  const s = c.s;
  if (s.phase !== 'clue' || user !== psychic(s)) return reply(c, user, '現在不是你出題。');
  const clue = text.trim();
  if (!clue || [...clue].length > MAX_CLUE) return reply(c, user, `提示詞要 1～${MAX_CLUE} 個字。`);
  s.clue = clue;
  s.phase = 'guess';
  c.events.push(
    {
      type: 'announce',
      text: `💬 ${mention(user)} 的提示：「${clue}」\n光譜：${dial(s)}\n${TEAM_NAME[psychicTeam(s)]}隊友 ${mates(s).map(mention).join('、')} 請按 0～10 猜目標位置，可以改選 (${PHASE_MS / 60_000} 分鐘)`,
    },
    {
      type: 'prompt',
      kind: 'wavelength',
      audience: 'channel',
      text: `「${clue}」在哪裡？`,
      options: Array.from({ length: 11 }, (_, i) => ({ value: `guess:${i}`, label: String(i) })),
      perRow: 6,
    },
  );
  startTimer(c, PHASE_MS);
  return true;
}

function guess(c: Ctx, user: string, value: number): boolean {
  const s = c.s;
  if (s.phase !== 'guess' || !mates(s).includes(user)) return reply(c, user, '現在不是你猜位置。');
  if (!Number.isInteger(value) || value < 0 || value > 10) return false;
  s.guesses[user] = value;
  c.events.push({ type: 'ephemeral', to: user, text: `你選了 ${value}` });
  if (mates(s).every((id) => id in s.guesses)) finishGuess(c);
  return true;
}

// 隊友猜完：平均四捨五入當全隊答案，換對手猜左右；沒人猜就直接公布
function finishGuess(c: Ctx) {
  const s = c.s;
  const picked = Object.values(s.guesses);
  if (!picked.length) {
    c.events.push({ type: 'announce', text: `⌛ ${TEAM_NAME[psychicTeam(s)]}沒有人猜，這題 0 分。` });
    reveal(c);
    return;
  }
  s.answer = Math.round(picked.reduce((a, b) => a + b, 0) / picked.length);
  s.phase = 'side';
  const rival = other(psychicTeam(s));
  c.events.push(
    {
      type: 'announce',
      text: `📌 ${TEAM_NAME[psychicTeam(s)]}的答案：${s.answer}\n${TEAM_NAME[rival]} ${rivals(s).map(mention).join('、')} 請猜目標在 ${s.answer} 的左邊還是右邊，可以改選 (${PHASE_MS / 60_000} 分鐘)`,
    },
    {
      type: 'prompt',
      kind: 'wavelength',
      audience: 'channel',
      text: `目標在 ${s.answer} 的哪一邊？`,
      options: [
        { value: 'side:left', label: '⬅️ 偏左' },
        { value: 'side:right', label: '偏右 ➡️' },
      ],
    },
  );
  startTimer(c, PHASE_MS);
}

function pickSide(c: Ctx, user: string, value: Side): boolean {
  const s = c.s;
  if (s.phase !== 'side' || !rivals(s).includes(user)) return reply(c, user, '現在不是你猜左右。');
  s.sides[user] = value;
  c.events.push({ type: 'ephemeral', to: user, text: `你選了${value === 'left' ? '偏左' : '偏右'}` });
  if (rivals(s).every((id) => id in s.sides)) reveal(c);
  return true;
}

// 公布這題：出題隊依距離得 4／3／2／0 分，對手猜對方向得 1 分 (正中時不算)
function reveal(c: Ctx) {
  const s = c.s;
  const team = psychicTeam(s);
  const rival = other(team);
  const votes = Object.values(s.sides);
  const lefts = votes.filter((v) => v === 'left').length;
  const rights = votes.length - lefts;
  const side: Side | undefined = lefts > rights ? 'left' : rights > lefts ? 'right' : undefined;
  const dist = s.answer === undefined ? Infinity : Math.abs(s.answer - s.target!);
  const gained = dist === 0 ? 4 : dist === 1 ? 3 : dist === 2 ? 2 : 0;
  const actual = s.answer === undefined || dist === 0 ? undefined : s.target! < s.answer ? 'left' : 'right';
  const rivalGained = side && side === actual ? 1 : 0;
  s.scores[team] += gained;
  s.scores[rival] += rivalGained;
  const cells = Array.from({ length: 11 }, (_, i) => (i === s.target && i === s.answer ? '💥' : i === s.target ? '🎯' : i === s.answer ? '📌' : '▫️'));
  c.events.push({
    type: 'announce',
    text: [
      `📍 答案揭曉：提示「${s.clue ?? '(無)'}」`,
      `${s.spectrum![0]} ${cells.join('')} ${s.spectrum![1]}`,
      `目標 ${s.target}${s.answer === undefined ? '' : `，${TEAM_NAME[team]}答案 ${s.answer}`}`,
      `${TEAM_NAME[team]} +${gained}、${TEAM_NAME[rival]} +${rivalGained}`,
      scoreLine(s),
    ].join('\n'),
  });
  nextRound(c);
}

function nextRound(c: Ctx) {
  const s = c.s;
  s.round++;
  if (s.round >= s.order.length) endGame(c);
  else startRound(c);
}

function endGame(c: Ctx) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  const { orange, purple } = s.scores;
  s.winner = orange > purple ? 'orange' : purple > orange ? 'purple' : 'tie';
  const result = s.winner === 'tie' ? '🤝 平手！' : `🎉 ${TEAM_NAME[s.winner]}獲勝！`;
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.players.filter((p) => p.team === s.winner).map((p) => p.id) });
  c.events.push(
    { type: 'announce', text: `🏁 遊戲結束！${scoreLine(s)}\n${result}`, gif: 'goodWin' },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_WAVELENGTH_PLAYERS, (id) => ({ id }));
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, '心電感應不支援 bot。');
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, '只有房主可以開始遊戲。');
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_WAVELENGTH_PLAYERS) return reply(c, action.user, `目前 ${n} 人，至少需要 ${MIN_WAVELENGTH_PLAYERS} 人才能開始。`);
      c.events.push(lobbyEvent(TITLE, { ...s, phase: 'clue' }));
      deal(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user);
    case 'openClue':
      if (s.phase !== 'clue' || action.user !== psychic(s)) return reply(c, action.user, '現在不是你出題。');
      c.events.push({ type: 'modal', to: action.user, kind: 'wavelengthClue', title: '寫提示', label: `提示詞 (1～${MAX_CLUE} 字)` });
      return false;
    case 'clue':
      return giveClue(c, action.user, action.text);
    case 'guess':
      return guess(c, action.user, action.value);
    case 'side':
      return pickSide(c, action.user, action.value);
    case 'timeout': {
      if (action.id !== s.timers.phase) return false;
      if (s.phase === 'clue') {
        c.events.push({ type: 'announce', text: `⌛ ${mention(psychic(s))} 沒有寫提示，這題跳過。` });
        nextRound(c);
      } else if (s.phase === 'guess') finishGuess(c);
      else if (s.phase === 'side') reveal(c);
      return true;
    }
  }
}

export function applyWavelength(state: WState | undefined, action: WAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winner,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
  });
}

function createLobby(prev: WState | undefined, host: string, channel: string): Result {
  const created: WState = {
    game: 'wavelength',
    channel,
    host,
    phase: 'lobby',
    players: [{ id: host }],
    order: [],
    round: 0,
    used: [],
    guesses: {},
    sides: {},
    scores: { orange: 0, purple: 0 },
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
