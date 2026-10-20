// 詭影神探（Deception: Murder in Hong Kong）遊戲引擎：純邏輯，不碰任何 I/O。鑑識官知道答案、只能用提示板上的子彈給暗示，大家從每人面前的手段卡和線索卡推敲兇手用了哪一組。
// 介面和其他遊戲一樣：applyDeception(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle } from './common.js';
import { CAUSE_BOARD, CLUES, MEANS, SCENE_BOARDS, type Board } from './deceptionCards.js';

export const MIN_DECEPTION_PLAYERS = 4;
export const MAX_DECEPTION_PLAYERS = 12;
const TITLE = '詭影神探';
const ROUNDS = 3;
const CARDS = 4; // 每人手段、線索各幾張
const SCENES = 4; // 場上的場景板張數

export type Role = 'scientist' | 'murderer' | 'accomplice' | 'witness' | 'investigator';
const ROLE_NAME: Record<Role, string> = {
  scientist: '🔬 鑑識官',
  murderer: '🔪 兇手',
  accomplice: '🤝 共犯',
  witness: '👀 目擊者',
  investigator: '🕵️ 調查員',
};
const ROLE_INTRO: Record<Role, string> = {
  scientist: '🔬 你是鑑識官（好人陣營）。你只能用提示板上的子彈給提示，不能在頻道透露答案，也不發言、不能破案。天亮後會私下告訴你兇手、共犯和答案。',
  murderer: '🔪 你是兇手。馬上會私訊你，從自己面前選 1 張手段和 1 張線索當答案；之後混在調查員裡誤導大家。',
  accomplice: '🤝 你是共犯（兇手陣營）。天亮後會私下告訴你兇手是誰和答案，幫兇手誤導大家。',
  witness: '👀 你是目擊者（好人陣營）。天亮後會私下告訴你兇手和共犯是哪兩位（不知道誰是誰）；小心別被兇手發現，破案後兇手可以指認你翻盤。',
  investigator: '🕵️ 你是調查員（好人陣營）。目標：從大家面前的卡和鑑識官的子彈，找出兇手和他用的手段、線索。',
};

export interface DPlayer {
  id: string;
  role?: Role;
  means: string[];
  clues: string[];
  badge: boolean; // 還有沒有破案機會
}

export interface Placed {
  board: Board;
  bullet?: number; // 子彈在第幾個選項
}

export interface DState {
  game: 'deception';
  channel: string;
  host: string;
  phase: 'lobby' | 'night' | 'evidence' | 'present' | 'reversal' | 'ended';
  players: DPlayer[];
  round: number; // 1～3
  answer: { means?: string; clue?: string };
  cause: Placed; // 死因板
  location?: Placed; // 選定的地點板（還沒選或沒選到是 undefined）
  scenes: Placed[]; // 4 張場景板
  sceneDeck: Board[];
  fresh?: Board; // 第 2、3 輪新抽、還沒放的板
  seen: string[]; // 目擊者看到的兩個名字（順序隨機）
  last?: string; // 這一輪最近的變化（面板用），例如換掉了哪張板
  speakers: string[];
  speaker: number;
  pseq: number; // 每個蒐證／發言階段 +1：面板的 ref，也用來擋掉舊按鈕
  tseq: number; // 每換一位發言者 +1
  guesses: { by: string; suspect: string; means: string; clue: string; ok: boolean }[];
  winner?: 'good' | 'evil';
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
  | { type: 'rematch'; user: string; channel: string }
  | { type: 'me'; user: string }
  | { type: 'nightMeans'; user: string; i: number }
  | { type: 'nightClue'; user: string; i: number }
  | { type: 'fsMenu'; user: string; pseq: number }
  | { type: 'fsBoard'; user: string; pseq: number; slot: string }
  | { type: 'fsPlace'; user: string; pseq: number; slot: string; opt: number }
  | { type: 'fsLocation'; user: string; pseq: number; board: number; opt: number }
  | { type: 'fsBack'; user: string; pseq: number }
  | { type: 'fsSwap'; user: string; pseq: number; slot: string }
  | { type: 'fsNew'; user: string; pseq: number; slot: string; opt: number }
  | { type: 'done'; user: string; tseq: number }
  | { type: 'solveMenu'; user: string }
  | { type: 'suspect'; user: string; target: string }
  | { type: 'solveMeans'; user: string; target: string; mi: number }
  | { type: 'solveBack'; user: string; target?: string }
  | { type: 'solve'; user: string; target: string; mi: number; ci: number }
  | { type: 'witness'; user: string; target: string }
  | { type: 'timeout'; id: number };

type GameAction = Exclude<DAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: DState; events: GameEvent[] };
type Ctx = { s: DState; events: GameEvent[]; rng: Rng };

const find = (s: DState, id: string) => s.players.find((p) => p.id === id);
const withRole = (s: DState, role: Role) => s.players.find((p) => p.role === role);
const scientist = (s: DState) => withRole(s, 'scientist')!;
const suspects = (s: DState) => s.players.filter((p) => p.role !== 'scientist');

// 場上一覽：鑑識官以外每人一行
const tableLines = (s: DState) => suspects(s).map((p) => `${mention(p.id)}　手段：${p.means.join('、')}　線索：${p.clues.join('、')}`);

// 人數 → 角色（鑑識官另外選）；6 人以上一律有共犯和目擊者
function roleDeck(n: number): Role[] {
  const extra: Role[] = n >= 6 ? ['accomplice', 'witness'] : [];
  return ['murderer', ...extra, ...Array<Role>(n - 2 - extra.length).fill('investigator')];
}

function rules(s: DState) {
  const extra = withRole(s, 'witness') ? '這局有共犯和目擊者' : '這局沒有共犯和目擊者';
  return [
    `🔎 詭影神探開始！玩家：${s.players.map((p) => mention(p.id)).join('、')}`,
    `${ROLE_NAME.scientist}：${mention(scientist(s).id)}（身分公開）｜${extra}｜共 ${ROUNDS} 輪`,
    '兇手會暗中選自己面前的 1 張手段和 1 張線索；鑑識官知道答案，但只能用提示板上的子彈給暗示。',
    '鑑識官以外每人整局只有一次破案機會，要選對嫌犯、手段和線索；3 輪都沒人破案，兇手贏。',
    '身分已經用私訊傳給大家。',
    '',
    '場上一覽',
    ...tableLines(s),
  ].join('\n');
}

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, '只有房主可以開始遊戲。');
  if (s.phase !== 'lobby') return false;
  const n = s.players.length;
  if (n < MIN_DECEPTION_PLAYERS) return reply(c, user, `目前 ${n} 人，至少需要 ${MIN_DECEPTION_PLAYERS} 人才能開始。`);
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'night' }));
  const sci = Math.floor(c.rng() * n);
  const roles = shuffle(roleDeck(n), c.rng);
  const means = shuffle(MEANS, c.rng);
  const clues = shuffle(CLUES, c.rng);
  s.players.forEach((p, i) => {
    Object.assign(p, newPlayer(p.id));
    if (i === sci) p.role = 'scientist';
    else {
      p.role = roles.shift()!;
      p.means = means.splice(0, CARDS);
      p.clues = clues.splice(0, CARDS);
      p.badge = true;
    }
  });
  const deck = shuffle(SCENE_BOARDS, c.rng);
  Object.assign(s, { round: 1, answer: {}, cause: { board: CAUSE_BOARD }, location: undefined, scenes: deck.splice(0, SCENES).map((board) => ({ board })), sceneDeck: deck, guesses: [] });
  c.events.push({ type: 'announce', text: rules(s), gif: 'start' });
  for (const p of s.players) c.events.push({ type: 'dm', to: p.id, text: ROLE_INTRO[p.role!] });
  s.phase = 'night';
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_DECEPTION_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, '詭影神探不支援 bot。');
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user);
    default:
      return false;
  }
}

const newPlayer = (id: string): DPlayer => ({ id, means: [], clues: [], badge: false });

export function applyDeception(state: DState | undefined, action: DAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winner,
    isPlayer: (s, user) => !!find(s, user),
    createLobby,
    handle,
  });
}

function createLobby(prev: DState | undefined, host: string, channel: string): Result {
  const created: DState = {
    game: 'deception',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    round: 0,
    answer: {},
    cause: { board: CAUSE_BOARD },
    scenes: [],
    sceneDeck: [],
    seen: [],
    speakers: [],
    speaker: 0,
    pseq: prev?.pseq ?? 0,
    tseq: prev?.tseq ?? 0,
    guesses: [],
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
