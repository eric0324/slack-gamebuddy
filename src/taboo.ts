// 禁語遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyTaboo(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import { TABOO_CARDS } from './tabooCards.js';

export const MIN_TABOO_PLAYERS = 4;
export const MAX_TABOO_PLAYERS = 12;
const TITLE = '禁語';
const READY_MS = 60_000;
const DESCRIBE_MS = 90_000;

export type Team = 'red' | 'blue';
export type TPhase = 'lobby' | 'ready' | 'describe' | 'ended';

const TEAM_NAME: Record<Team, string> = { red: '🔴紅隊', blue: '🔵藍隊' };
const other = (t: Team): Team => (t === 'red' ? 'blue' : 'red');

export interface TState {
  game: 'taboo';
  channel: string;
  host: string;
  phase: TPhase;
  players: { id: string; team?: Team }[];
  order: string[]; // 每輪的描述者，兩隊輪流
  round: number;
  deck: number[]; // 還沒抽的卡 (TABOO_CARDS 的 index)，用完重洗
  card?: number; // 目前的卡
  cardSeq: number; // 卡的流水號：跳過按鈕綁定某一張卡
  log: { word: string; result: 'correct' | 'foul' | 'skip' }[]; // 這輪每張卡的結果
  scores: Record<Team, number>;
  winner?: Team | 'tie'; // 正常結束才有 (取消的沒有)→ 可以再來一局
  timerSeq: number;
  timers: { phase?: number };
}

export type TAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'go'; user: string } // 描述者按「▶️ 開始」
  | { type: 'card'; user: string } // 再看一次目前的卡
  | { type: 'chat'; user: string; text: string } // 頻道裡的一般訊息
  | { type: 'skip'; user: string; seq?: number } // 按鈕帶卡的流水號；指令沒有，跳目前的卡
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<TAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: TState;
  events: GameEvent[];
}

interface Ctx {
  s: TState;
  events: GameEvent[];
  rng: Rng;
}

const teamOf = (s: TState, id: string) => s.players.find((p) => p.id === id)?.team;
const roster = (s: TState, t: Team) => `${TEAM_NAME[t]}：${s.players.filter((p) => p.team === t).map((p) => mention(p.id)).join('、')}`;

// 開局：隨機分隊；兩隊輪流，每隊輪數 = 人數較多那隊的人數，人數少的隊伍從頭再輪
function deal(c: Ctx) {
  const s = c.s;
  const shuffled = shuffle(s.players, c.rng);
  shuffled.forEach((p, i) => (s.players.find((x) => x.id === p.id)!.team = i % 2 === 0 ? 'red' : 'blue'));
  const first: Team = c.rng() < 0.5 ? 'red' : 'blue';
  const lists = [first, other(first)].map((t) => shuffled.filter((p) => teamOf(s, p.id) === t).map((p) => p.id));
  const turns = Math.max(lists[0].length, lists[1].length);
  s.order = Array.from({ length: turns }, (_, i) => [lists[0][i % lists[0].length], lists[1][i % lists[1].length]]).flat();
  c.events.push({
    type: 'announce',
    text: [
      `🤐 禁語開始！共 ${s.order.length} 輪，每輪 ${DESCRIBE_MS / 1000} 秒。`,
      roster(s, 'red'),
      roster(s, 'blue'),
      '描述者私下看到題目詞和禁語，直接在頻道打字描述；隊友在頻道打字猜。說到題目詞或禁語算犯規！',
    ].join('\n'),
    gif: 'start',
  });
}

const describer = (s: TState) => s.order[s.round];
const describerTeam = (s: TState) => teamOf(s, describer(s))!;
const mates = (s: TState) => s.players.filter((p) => p.team === describerTeam(s) && p.id !== describer(s)).map((p) => p.id);
const word = (s: TState) => TABOO_CARDS[s.card!].word;

// 每輪開始：公告描述者，等他按「▶️ 開始」
function startReady(c: Ctx) {
  const s = c.s;
  s.phase = 'ready';
  s.card = undefined;
  const d = describer(s);
  c.events.push(
    {
      type: 'announce',
      text: `🎙️ 第 ${s.round + 1}／${s.order.length} 輪：${TEAM_NAME[describerTeam(s)]} ${mention(d)} 描述，隊友 ${mates(s).map(mention).join('、')} 負責猜；${TEAM_NAME[other(describerTeam(s))]}監督。`,
    },
    { type: 'prompt', kind: 'taboo', audience: 'channel', text: `${mention(d)} 準備好就按開始 (${READY_MS / 1000} 秒內)`, options: [{ value: 'go', label: '▶️ 開始' }] },
  );
  startTimer(c, READY_MS);
}

function go(c: Ctx, user: string): boolean {
  const s = c.s;
  if (s.phase !== 'ready') return false;
  if (user !== describer(s)) return reply(c, user, '只有描述者可以開始。');
  s.phase = 'describe';
  s.log = [];
  c.events.push({ type: 'announce', text: `⏱️ 開始！${mention(user)} 描述 ${DESCRIBE_MS / 1000} 秒，隊友直接在頻道打字猜。` });
  drawCard(c);
  startTimer(c, DESCRIBE_MS);
  return true;
}

// 抽下一張卡 (同一局不重複，用完重洗)，只讓描述者看到
function drawCard(c: Ctx) {
  const s = c.s;
  if (!s.deck.length) s.deck = shuffle(TABOO_CARDS.map((_, i) => i), c.rng);
  s.card = s.deck.shift()!;
  s.cardSeq++;
  showCard(c);
}

function showCard(c: Ctx) {
  const s = c.s;
  const { word: w, taboo } = TABOO_CARDS[s.card!];
  c.events.push({
    type: 'prompt',
    kind: 'taboo',
    audience: 'ephemeral',
    user: describer(s),
    text: `🃏 題目：「${w}」\n🚫 禁語：${taboo.join('、')}`,
    options: [{ value: `skip:${s.cardSeq}`, label: '⏭️ 跳過' }],
  });
}

// 比對前正規化：全形轉半形、英文轉小寫、去掉空白、標點和符號
const normalize = (t: string) => t.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
export const contains = (text: string, w: string) => normalize(text).includes(normalize(w));
// 描述者不能用來代替文字的字 (例如「老x」)；比對原始訊息，因為 normalize 會去掉符號
const placeholder = (t: string) => t.normalize('NFKC').match(/[x×✕✖○〇●*]/i)?.[0];

// 一張卡結束：記錄、加分、公告，換下一張
function finishCard(c: Ctx, result: 'correct' | 'foul' | 'skip', text: string) {
  const s = c.s;
  const team = result === 'correct' ? describerTeam(s) : other(describerTeam(s));
  s.scores[team]++;
  s.log.push({ word: word(s), result });
  c.events.push({ type: 'announce', text: `${text}${TEAM_NAME[team]} +1` });
  drawCard(c);
}

// 頻道訊息：描述者檢查犯規，隊友檢查猜中，其他人忽略
function chat(c: Ctx, user: string, text: string): boolean {
  const s = c.s;
  if (s.phase !== 'describe') return false;
  const { word: w, taboo } = TABOO_CARDS[s.card!];
  if (user === describer(s)) {
    const hit = [w, ...taboo].find((x) => contains(text, x));
    const sub = placeholder(text);
    if (!hit && !sub) return false;
    const why = hit ? `說了「${hit}」` : `用了「${sub}」代替文字`;
    finishCard(c, 'foul', `🚨 ${mention(user)} 犯規！${why}，題目是「${w}」。`);
    return true;
  }
  if (!mates(s).includes(user) || !contains(text, w)) return false;
  finishCard(c, 'correct', `✅ ${mention(user)} 猜中「${w}」！`);
  return true;
}

function skip(c: Ctx, user: string, seq?: number): boolean {
  const s = c.s;
  if (s.phase !== 'describe' || user !== describer(s)) return reply(c, user, '只有描述者可以跳過。');
  if (seq !== undefined && seq !== s.cardSeq) return reply(c, user, '這張卡已經結束了。');
  finishCard(c, 'skip', `⏭️ 跳過「${word(s)}」。`);
  return true;
}

const scoreLine = (s: TState) => `${TEAM_NAME.red} ${s.scores.red}｜${TEAM_NAME.blue} ${s.scores.blue}`;

// 時間到：進行中的卡不計分，公告這輪結果
function endRound(c: Ctx) {
  const s = c.s;
  const team = describerTeam(s);
  const words = (r: 'correct' | 'foul' | 'skip') => s.log.filter((x) => x.result === r).map((x) => x.word).join('、') || '(無)';
  const gained = (t: Team) => s.log.filter((x) => (x.result === 'correct') === (t === team)).length;
  c.events.push({
    type: 'announce',
    text: [
      `⏰ 時間到！${mention(describer(s))} 這輪結果：`,
      `✅ 猜中：${words('correct')}`,
      `🚨 犯規：${words('foul')}`,
      `⏭️ 跳過：${words('skip')}`,
      `這輪：${TEAM_NAME.red} +${gained('red')}、${TEAM_NAME.blue} +${gained('blue')}`,
      `總分：${scoreLine(s)}`,
    ].join('\n'),
  });
  nextRound(c);
}

function nextRound(c: Ctx) {
  const s = c.s;
  s.round++;
  if (s.round >= s.order.length) endGame(c);
  else startReady(c);
}

function endGame(c: Ctx) {
  const s = c.s;
  s.phase = 'ended';
  s.card = undefined;
  s.timers = {};
  const { red, blue } = s.scores;
  s.winner = red > blue ? 'red' : blue > red ? 'blue' : 'tie';
  const result = s.winner === 'tie' ? '🤝 平手！' : `🎉 ${TEAM_NAME[s.winner]}獲勝！`;
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.players.filter((p) => p.team === s.winner).map((p) => p.id) });
  c.events.push(
    { type: 'announce', text: `🏁 遊戲結束！${scoreLine(s)}\n${result}\n${roster(s, 'red')}\n${roster(s, 'blue')}`, gif: 'goodWin' },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_TABOO_PLAYERS, (id) => ({ id }));
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, '禁語不支援 bot。');
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, '只有房主可以開始遊戲。');
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_TABOO_PLAYERS) return reply(c, action.user, `目前 ${n} 人，至少需要 ${MIN_TABOO_PLAYERS} 人才能開始。`);
      c.events.push(lobbyEvent(TITLE, { ...s, phase: 'ready' }));
      deal(c);
      startReady(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user, s.phase === 'lobby' ? '' : `目前比分：${scoreLine(s)}`);
    case 'go':
      return go(c, action.user);
    case 'chat':
      return chat(c, action.user, action.text);
    case 'skip':
      return skip(c, action.user, action.seq);
    case 'card':
      if (s.phase !== 'describe' || action.user !== describer(s)) return reply(c, action.user, '只有描述者可以看題目卡。');
      showCard(c);
      return false;
    case 'timeout':
      if (action.id !== s.timers.phase) return false;
      if (s.phase === 'ready') {
        c.events.push({ type: 'announce', text: `⌛ ${mention(describer(s))} 沒有開始，這輪跳過。` });
        nextRound(c);
      } else if (s.phase === 'describe') endRound(c);
      return true;
    default:
      return false;
  }
}

export function applyTaboo(state: TState | undefined, action: TAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winner,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
  });
}

function createLobby(prev: TState | undefined, host: string, channel: string): Result {
  const created: TState = {
    game: 'taboo',
    channel,
    host,
    phase: 'lobby',
    players: [{ id: host }],
    order: [],
    round: 0,
    deck: prev?.deck ?? [], // 接著上一局剩下的牌堆抽，同一頻道跨局不重複
    cardSeq: 0,
    log: [],
    scores: { red: 0, blue: 0 },
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
