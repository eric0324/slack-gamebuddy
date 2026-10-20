// 詭影神探 (Deception: Murder in Hong Kong) 遊戲引擎：純邏輯，不碰任何 I/O。鑑識官知道答案、只能用提示板上的子彈給暗示，大家從每人面前的手段卡和線索卡推敲兇手用了哪一組。
// 介面和其他遊戲一樣：applyDeception(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import { CAUSE_BOARD, DECKS, type Board } from './deceptionCards.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/deception.js';

export const MIN_DECEPTION_PLAYERS = 4;
export const MAX_DECEPTION_PLAYERS = 12;
const TITLE = '詭影神探';
const ROUNDS = 3;
const CARDS = 4; // 每人手段、線索各幾張
const SCENES = 4; // 場上的場景板張數
const NIGHT_MS = 90_000;
const FIRST_EVIDENCE_MS = 240_000;
const EVIDENCE_MS = 120_000;
const SPEAK_MS = 90_000;
const REVERSAL_MS = 120_000;

export type Role = 'scientist' | 'murderer' | 'accomplice' | 'witness' | 'investigator';
const ROLE_NAME = {
  scientist: 'roleScientist',
  murderer: 'roleMurderer',
  accomplice: 'roleAccomplice',
  witness: 'roleWitness',
  investigator: 'roleInvestigator',
} as const;
const ROLE_INTRO = {
  scientist: 'introScientist',
  murderer: 'introMurderer',
  accomplice: 'introAccomplice',
  witness: 'introWitness',
  investigator: 'introInvestigator',
} as const;

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
  location?: Placed; // 選定的地點板 (還沒選或沒選到是 undefined)
  scenes: Placed[]; // 4 張場景板
  sceneDeck: Board[];
  fresh?: Board; // 第 2、3 輪新抽、還沒放的板
  seen: string[]; // 目擊者看到的兩個名字 (順序隨機)
  last?: string; // 這一輪最近的變化 (面板用)，例如換掉了哪張板
  speakers: string[];
  speaker: number;
  pseq: number; // 每個蒐證／發言階段 +1：面板的 ref，也用來擋掉舊按鈕
  tseq: number; // 每換一位發言者 +1
  guesses: { by: string; suspect: string; means: string; clue: string; ok: boolean }[];
  winner?: 'good' | 'evil';
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang; // 開房時的頻道語系 (runGame 存進來)
}

export type DAction =
  | { type: 'new'; user: string; channel: string; lang?: Lang }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'rematch'; user: string; channel: string; lang?: Lang }
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

// 這局語系的文字、詞庫和提示板
const say = (s: DState, key: Parameters<typeof tx>[1], params?: Record<string, string | number>) => tx(s.lang, key, params);
const deckOf = (s: DState) => DECKS[s.lang ?? 'zh-TW'];
const find = (s: DState, id: string) => s.players.find((p) => p.id === id);
const withRole = (s: DState, role: Role) => s.players.find((p) => p.role === role);
const scientist = (s: DState) => withRole(s, 'scientist')!;
const suspects = (s: DState) => s.players.filter((p) => p.role !== 'scientist');

// 場上一覽：鑑識官以外每人一行
const tableLines = (s: DState) =>
  suspects(s).map((p) => say(s, 'tableLine', { who: mention(p.id), means: p.means.join(say(s, 'listSep')), clues: p.clues.join(say(s, 'listSep')) }));

// 人數 → 角色 (鑑識官另外選)；6 人以上一律有共犯和目擊者
function roleDeck(n: number): Role[] {
  const extra: Role[] = n >= 6 ? ['accomplice', 'witness'] : [];
  return ['murderer', ...extra, ...Array<Role>(n - 2 - extra.length).fill('investigator')];
}

function rules(s: DState) {
  const extra = say(s, withRole(s, 'witness') ? 'extraYes' : 'extraNo');
  return [
    say(s, 'rulesStart', { players: s.players.map((p) => mention(p.id)).join(say(s, 'listSep')) }),
    say(s, 'rulesScientist', { role: say(s, ROLE_NAME.scientist), sci: mention(scientist(s).id), extra, rounds: ROUNDS }),
    say(s, 'rules1'),
    say(s, 'rules2'),
    say(s, 'rules3'),
    '',
    say(s, 'tableTitle'),
    ...tableLines(s),
  ].join('\n');
}

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, say(s, 'onlyHostStart'));
  if (s.phase !== 'lobby') return false;
  const n = s.players.length;
  if (n < MIN_DECEPTION_PLAYERS) return reply(c, user, say(s, 'needMore', { n, min: MIN_DECEPTION_PLAYERS }));
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'night' }));
  const sci = Math.floor(c.rng() * n);
  const roles = shuffle(roleDeck(n), c.rng);
  const cards = deckOf(s);
  const means = shuffle(cards.means, c.rng);
  const clues = shuffle(cards.clues, c.rng);
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
  const deck = shuffle(cards.scenes, c.rng);
  Object.assign(s, { round: 1, answer: {}, cause: { board: cards.cause }, location: undefined, scenes: deck.splice(0, SCENES).map((board) => ({ board })), sceneDeck: deck, guesses: [] });
  c.events.push({ type: 'announce', text: rules(s), gif: 'start' });
  for (const p of s.players) c.events.push({ type: 'dm', to: p.id, text: say(s, ROLE_INTRO[p.role!]) });
  startNight(c);
  return true;
}

// ---------- 夜晚 ----------

const answerText = (s: DState) => say(s, 'answerText', { means: s.answer.means ?? '', clue: s.answer.clue ?? '' });

function startNight(c: Ctx) {
  const s = c.s;
  s.phase = 'night';
  const m = withRole(s, 'murderer')!;
  c.events.push({ type: 'announce', text: say(s, 'nightFalls') });
  c.events.push({
    type: 'prompt',
    kind: 'deception',
    audience: 'user',
    user: m.id,
    text: say(s, 'nightPickMeans', { sec: NIGHT_MS / 1000 }),
    options: m.means.map((label, i) => ({ value: `nm:${i}`, label })),
  });
  startTimer(c, NIGHT_MS);
}

// 兇手選答案的共同檢查；回傳兇手或 null
function nightCheck(c: Ctx, user: string, done: boolean): DPlayer | null {
  const me = find(c.s, user);
  if (me?.role !== 'murderer') return (reply(c, user, say(c.s, 'onlyMurdererPick')), null);
  if (c.s.phase !== 'night' || done) return (reply(c, user, say(c.s, 'alreadyPicked')), null);
  return me;
}

function nightMeans(c: Ctx, user: string, i: number): boolean {
  const me = nightCheck(c, user, !!c.s.answer.means);
  if (!me || !me.means[i]) return false;
  c.s.answer.means = me.means[i];
  c.events.push({
    type: 'prompt',
    kind: 'deception',
    audience: 'user',
    user,
    text: say(c.s, 'nightPickClue', { means: me.means[i] }),
    options: me.clues.map((label, k) => ({ value: `nc:${k}`, label })),
  });
  return true;
}

function nightClue(c: Ctx, user: string, i: number): boolean {
  const me = nightCheck(c, user, !c.s.answer.means || !!c.s.answer.clue);
  if (!me || !me.clues[i]) return false;
  c.s.answer.clue = me.clues[i];
  endNight(c);
  return true;
}

// 每個角色在夜晚之後知道的事
function nightInfo(s: DState, p: DPlayer): string {
  const m = mention(withRole(s, 'murderer')!.id);
  const acc = withRole(s, 'accomplice');
  switch (p.role) {
    case 'scientist':
      return say(s, 'infoScientist', { m, acc: acc ? say(s, 'infoAcc', { acc: mention(acc.id) }) : '', answer: answerText(s) });
    case 'accomplice':
      return say(s, 'infoAccomplice', { m, answer: answerText(s) });
    case 'witness':
      return say(s, 'infoWitness', { pair: s.seen.map(mention).join(say(s, 'pairSep')) });
    case 'murderer':
      return say(s, 'infoMurderer', { answer: answerText(s) });
    default:
      return '';
  }
}

// 夜晚結束：私訊鑑識官、共犯、目擊者和兇手，天亮進入第 1 輪蒐證
function endNight(c: Ctx) {
  const s = c.s;
  const pair = [withRole(s, 'murderer')!.id, withRole(s, 'accomplice')?.id ?? ''];
  s.seen = withRole(s, 'witness') ? shuffle(pair, c.rng) : [];
  for (const p of s.players) {
    const info = nightInfo(s, p);
    if (info) c.events.push({ type: 'dm', to: p.id, text: say(s, 'dawnDm', { info }) });
  }
  c.events.push({ type: 'announce', text: say(s, 'dawn') });
  startEvidence(c);
}

// 夜晚時間到：兇手沒選的項目隨機選
function nightTimeout(c: Ctx) {
  const s = c.s;
  const m = withRole(s, 'murderer')!;
  s.answer.means ??= m.means[Math.floor(c.rng() * m.means.length)];
  s.answer.clue = m.clues[Math.floor(c.rng() * m.clues.length)];
  endNight(c);
}

// ---------- 蒐證與發言 ----------

// 一張板一行，子彈用【】標出
const boardLine = (s: DState, title: string, x: Placed) =>
  say(s, 'boardLine', { title, options: x.board.options.map((o, i) => (i === x.bullet ? say(s, 'bullet', { o }) : o)).join(say(s, 'optSep')) });

function boardLines(s: DState): string[] {
  const loc = s.location
    ? boardLine(s, say(s, 'locTitle', { title: s.location.board.title }), s.location)
    : say(s, 'locNone', { state: say(s, s.round === 1 && s.phase === 'evidence' ? 'notChosen' : 'notUsed') });
  return [
    boardLine(s, s.cause.board.title, s.cause),
    loc,
    ...s.scenes.map((x) => boardLine(s, x.board.title, x)),
    ...(s.fresh ? [say(s, 'freshLine', { line: boardLine(s, say(s, 'freshTitle', { title: s.fresh.title }), { board: s.fresh }) })] : []),
  ];
}

// 回合面板：同一個階段帶同一個 ref，原地更新
function panel(s: DState): GameEvent {
  const sci = mention(scientist(s).id);
  const head =
    s.phase === 'evidence'
      ? say(s, 'headEvidence', { round: s.round, rounds: ROUNDS, sci })
      : say(s, 'headPresent', { round: s.round, rounds: ROUNDS, who: mention(s.speakers[s.speaker]), sci });
  const badges = suspects(s).filter((p) => p.badge);
  const lines = [
    head,
    ...boardLines(s),
    ...(s.last ? [s.last] : []),
    '',
    say(s, 'tableTitle'),
    ...tableLines(s),
    say(s, 'badges', { list: badges.length ? badges.map((p) => mention(p.id)).join(' ') : say(s, 'noneParen') }),
  ];
  const options = [
    ...(s.phase === 'evidence' ? [{ value: `fs:${s.pseq}`, label: say(s, 'btnPlace') }] : []),
    { value: 'solve', label: say(s, 'btnSolve') },
    { value: 'me', label: say(s, 'btnMe') },
  ];
  return { type: 'prompt', kind: 'deception', audience: 'channel', ref: `deception:panel:${s.pseq}`, text: lines.join('\n'), options };
}

// 在私人選單上按的：回應取代那則選單
const tell = (c: Ctx, to: string, text: string) => c.events.push({ type: 'ephemeral', to, text, replace: true });
const deny = (c: Ctx, to: string, text: string) => (tell(c, to, text), false);
const menu = (c: Ctx, user: string, text: string, options: { value: string; label: string }[], perRow = 5) => {
  c.events.push({ type: 'prompt', kind: 'deception', audience: 'ephemeral', user, text, options, perRow, replace: true });
  return false;
};

function startEvidence(c: Ctx) {
  const s = c.s;
  s.phase = 'evidence';
  s.pseq++;
  s.last = undefined;
  if (s.round > 1) s.fresh = s.sceneDeck.shift();
  c.events.push(panel(s));
  startTimer(c, s.round === 1 ? FIRST_EVIDENCE_MS : EVIDENCE_MS);
}

// 鑑識官操作前的共同檢查；回傳錯誤訊息或 null
function fsCheck(s: DState, user: string, pseq: number): string | null {
  const me = find(s, user);
  if (!me) return say(s, 'notPlayer');
  if (me.role !== 'scientist') return say(s, 'onlyScientist');
  if (s.phase !== 'evidence' || pseq !== s.pseq) return say(s, 'stale');
  return null;
}

// 第 1 輪還沒放子彈的板：[slot, 按鈕文字]
function openSlots(s: DState): [string, string][] {
  const list: [string, string][] = [];
  if (s.cause.bullet === undefined) list.push(['cause', s.cause.board.title]);
  if (!s.location) list.push(['loc', say(s, 'locSlot')]);
  s.scenes.forEach((x, i) => {
    if (x.bullet === undefined) list.push([`s${i}`, x.board.title]);
  });
  return list;
}

// slot 是 cause 或 s0～s3
const slotOf = (s: DState, slot: string): Placed | undefined => (slot === 'cause' ? s.cause : /^s[0-3]$/.test(slot) ? s.scenes[Number(slot[1])] : undefined);
const sceneOf = (s: DState, slot: string) => (/^s[0-3]$/.test(slot) ? s.scenes[Number(slot[1])] : undefined);

function fsMenu(c: Ctx, user: string, pseq: number): boolean {
  const s = c.s;
  const err = fsCheck(s, user, pseq);
  if (err) return deny(c, user, err);
  if (s.round === 1) {
    const options = openSlots(s).map(([slot, label]) => ({ value: `fb:${pseq}:${slot}`, label }));
    return menu(c, user, say(s, 'pickBoard'), options);
  }
  if (!s.fresh) return deny(c, user, say(s, 'stale'));
  const options = s.scenes.map((x, i) => ({ value: `fx:${pseq}:s${i}`, label: x.board.title }));
  return menu(c, user, say(s, 'freshAsk', { title: s.fresh.title, options: s.fresh.options.join(say(s, 'optSep')) }), options);
}

function fsBoard(c: Ctx, user: string, pseq: number, slot: string): boolean {
  const s = c.s;
  const err = fsCheck(s, user, pseq);
  if (err) return deny(c, user, err);
  if (s.round !== 1) return deny(c, user, say(s, 'stale'));
  const back = { value: `fback:${pseq}`, label: say(s, 'pickAnother') };
  if (slot === 'loc') {
    if (s.location) return deny(c, user, say(s, 'stale'));
    const locations = deckOf(s).locations;
    const rows = locations.map((b, i) => say(s, 'locRow', { i: i + 1, title: b.title, options: b.options.join(say(s, 'optSep')) }));
    const options = locations.flatMap((b, i) => b.options.map((label, o) => ({ value: `fl:${pseq}:${i}:${o}`, label })));
    return menu(c, user, [say(s, 'locAsk'), ...rows].join('\n'), [...options, back], 6);
  }
  const x = slotOf(s, slot);
  if (!x || x.bullet !== undefined) return deny(c, user, say(s, 'stale'));
  const options = x.board.options.map((label, o) => ({ value: `fp:${pseq}:${slot}:${o}`, label }));
  return menu(c, user, say(s, 'whereBullet', { title: x.board.title }), [...options, back]);
}

// 放好一顆子彈：面板原地更新；6 顆都放好就進入發言，否則選單回到第 1 步
function placed(c: Ctx, user: string) {
  const s = c.s;
  c.events.push(panel(s));
  if (openSlots(s).length) fsMenu(c, user, s.pseq);
  else {
    tell(c, user, say(s, 'allPlaced'));
    startPresent(c);
  }
}

function fsPlace(c: Ctx, user: string, pseq: number, slot: string, opt: number): boolean {
  const s = c.s;
  const err = fsCheck(s, user, pseq);
  if (err) return deny(c, user, err);
  const x = slotOf(s, slot);
  if (s.round !== 1 || !x || x.bullet !== undefined || !x.board.options[opt]) return deny(c, user, say(s, 'stale'));
  x.bullet = opt;
  placed(c, user);
  return true;
}

function fsLocation(c: Ctx, user: string, pseq: number, board: number, opt: number): boolean {
  const s = c.s;
  const err = fsCheck(s, user, pseq);
  if (err) return deny(c, user, err);
  const b = deckOf(s).locations[board];
  if (s.round !== 1 || s.location || !b?.options[opt]) return deny(c, user, say(s, 'stale'));
  s.location = { board: b, bullet: opt };
  placed(c, user);
  return true;
}

// 第 2、3 輪：選要換掉的場景板
function fsSwap(c: Ctx, user: string, pseq: number, slot: string): boolean {
  const s = c.s;
  const err = fsCheck(s, user, pseq);
  if (err) return deny(c, user, err);
  const x = sceneOf(s, slot);
  if (!s.fresh || !x) return deny(c, user, say(s, 'stale'));
  const options = s.fresh.options.map((label, o) => ({ value: `fn:${pseq}:${slot}:${o}`, label }));
  return menu(c, user, say(s, 'swapAsk', { old: x.board.title, title: s.fresh.title }), [...options, { value: `fs:${pseq}`, label: say(s, 'pickAnother') }]);
}

// 第 2、3 輪：新板取代舊板的位置，進入發言
function fsNew(c: Ctx, user: string, pseq: number, slot: string, opt: number): boolean {
  const s = c.s;
  const err = fsCheck(s, user, pseq);
  if (err) return deny(c, user, err);
  const x = sceneOf(s, slot);
  if (!s.fresh || !x || !s.fresh.options[opt]) return deny(c, user, say(s, 'stale'));
  s.last = say(s, 'swapped', { title: x.board.title });
  s.scenes[Number(slot[1])] = { board: s.fresh, bullet: opt };
  s.fresh = undefined;
  c.events.push(panel(s));
  tell(c, user, say(s, 'swappedDone', { last: s.last }));
  startPresent(c);
  return true;
}

// 蒐證時間到：系統不替鑑識官放子彈
function evidenceTimeout(c: Ctx) {
  const s = c.s;
  if (s.round === 1) {
    if (openSlots(s).length === 6) {
      s.phase = 'ended';
      s.timers = {};
      c.events.push({ type: 'announce', text: say(s, 'aborted', { m: mention(withRole(s, 'murderer')!.id), answer: answerText(s) }) });
      return;
    }
    c.events.push({ type: 'announce', text: say(s, 'evidenceTimeout') });
  } else {
    s.fresh = undefined;
    c.events.push({ type: 'announce', text: say(s, 'noSwap') });
  }
  startPresent(c);
}

// 發言：鑑識官以外的人從鑑識官的下一位開始依座位輪流
function startPresent(c: Ctx) {
  const s = c.s;
  const n = s.players.length;
  const sci = s.players.indexOf(scientist(s));
  s.phase = 'present';
  s.pseq++;
  s.speakers = Array.from({ length: n - 1 }, (_, k) => s.players[(sci + 1 + k) % n].id);
  s.speaker = 0;
  c.events.push(panel(s));
  speakerTurn(c);
}

function speakerTurn(c: Ctx) {
  const s = c.s;
  s.tseq++;
  c.events.push({
    type: 'prompt',
    kind: 'deception',
    audience: 'channel',
    text: say(s, 'speakTurn', { who: mention(s.speakers[s.speaker]), sec: SPEAK_MS / 1000 }),
    options: [
      { value: `done:${s.tseq}`, label: say(s, 'btnDone') },
      { value: 'solve', label: say(s, 'btnSolve') },
    ],
  });
  startTimer(c, SPEAK_MS);
}

// 換下一位發言；這一輪說完了就進入下一輪蒐證，第 3 輪結束兇手陣營贏
function nextSpeaker(c: Ctx) {
  const s = c.s;
  s.speaker++;
  if (s.speaker < s.speakers.length) {
    c.events.push(panel(s));
    speakerTurn(c);
  } else if (s.round < ROUNDS) {
    s.round++;
    startEvidence(c);
  } else endGame(c, 'evil', say(s, 'whyRounds', { rounds: ROUNDS }));
}

function done(c: Ctx, user: string, tseq: number): boolean {
  const s = c.s;
  if (!find(s, user)) return reply(c, user, say(s, 'notPlayer'));
  if (s.phase !== 'present' || tseq !== s.tseq) return reply(c, user, say(s, 'stale'));
  if (s.speakers[s.speaker] !== user) return reply(c, user, say(s, 'notYourTurn'));
  nextSpeaker(c);
  return true;
}

// ---------- 破案 ----------

// 能不能破案；回傳錯誤訊息或 null
function solveCheck(s: DState, user: string): string | null {
  const me = find(s, user);
  if (!me) return say(s, 'notPlayer');
  if (me.role === 'scientist') return say(s, 'scientistCantSolve');
  if (s.phase !== 'evidence' && s.phase !== 'present') return say(s, 'cantSolveNow');
  if (!me.badge) return say(s, 'badgeUsed');
  return null;
}

// 嫌犯：鑑識官和自己以外的玩家
const suspectOf = (s: DState, user: string, target: string) => (target !== user ? suspects(s).find((p) => p.id === target) : undefined);

function solveMenu(c: Ctx, user: string): boolean {
  const err = solveCheck(c.s, user);
  if (err) return deny(c, user, err);
  const options = suspects(c.s)
    .filter((p) => p.id !== user)
    .map((p) => ({ value: `sus:${p.id}`, label: p.id }));
  return menu(c, user, say(c.s, 'solveAsk'), options);
}

function suspect(c: Ctx, user: string, target: string): boolean {
  const err = solveCheck(c.s, user);
  if (err) return deny(c, user, err);
  const p = suspectOf(c.s, user, target);
  if (!p) return deny(c, user, say(c.s, 'stale'));
  const options = p.means.map((label, mi) => ({ value: `sm:${target}:${mi}`, label }));
  return menu(c, user, say(c.s, 'suspectAsk', { who: mention(target) }), [...options, { value: 'sback:', label: say(c.s, 'backSuspect') }]);
}

function solveMeans(c: Ctx, user: string, target: string, mi: number): boolean {
  const err = solveCheck(c.s, user);
  if (err) return deny(c, user, err);
  const p = suspectOf(c.s, user, target);
  if (!p?.means[mi]) return deny(c, user, say(c.s, 'stale'));
  const options = p.clues.map((label, ci) => ({ value: `sc:${target}:${mi}:${ci}`, label }));
  return menu(c, user, say(c.s, 'meansAsk', { who: mention(target), means: p.means[mi] }), [
    ...options,
    { value: `sback:${target}`, label: say(c.s, 'backMeans') },
  ]);
}

const guessText = (s: DState, g: DState['guesses'][number]) =>
  say(s, 'guess', { by: mention(g.by), who: mention(g.suspect), means: g.means, clue: g.clue });

// 送出破案：系統判定，錯了只說「不對」
function solve(c: Ctx, user: string, target: string, mi: number, ci: number): boolean {
  const s = c.s;
  const err = solveCheck(s, user);
  if (err) return deny(c, user, err);
  const p = suspectOf(s, user, target);
  if (!p?.means[mi] || !p.clues[ci]) return deny(c, user, say(s, 'stale'));
  const ok = p.role === 'murderer' && p.means[mi] === s.answer.means && p.clues[ci] === s.answer.clue;
  const g = { by: user, suspect: target, means: p.means[mi], clue: p.clues[ci], ok };
  s.guesses.push(g);
  find(s, user)!.badge = false;
  tell(c, user, say(s, 'solveSent'));
  c.events.push({ type: 'announce', text: say(s, 'solveAnnounce', { guess: guessText(s, g), verdict: say(s, ok ? 'right' : 'wrong') }) });
  if (ok) {
    if (withRole(s, 'witness')) startReversal(c);
    else endGame(c, 'good', say(s, 'whySolved', { who: mention(user) }));
  } else if (!s.players.some((x) => (x.role === 'investigator' || x.role === 'witness') && x.badge)) {
    endGame(c, 'evil', say(s, 'whyNoBadges'));
  } else c.events.push(panel(s));
  return true;
}

// ---------- 翻盤 ----------

function startReversal(c: Ctx) {
  const s = c.s;
  const m = withRole(s, 'murderer')!;
  s.phase = 'reversal';
  c.events.push({ type: 'announce', text: say(s, 'reversal', { m: mention(m.id), sec: REVERSAL_MS / 1000 }) });
  c.events.push({
    type: 'prompt',
    kind: 'deception',
    audience: 'user',
    user: m.id,
    text: say(s, 'reversalPick', { sec: REVERSAL_MS / 1000 }),
    options: s.players.filter((p) => p.role !== 'scientist' && p.role !== 'murderer' && p.role !== 'accomplice').map((p) => ({ value: `wit:${p.id}`, label: p.id })),
  });
  const acc = withRole(s, 'accomplice');
  if (acc) c.events.push({ type: 'dm', to: acc.id, text: say(s, 'reversalAccomplice', { m: mention(m.id) }) });
  startTimer(c, REVERSAL_MS);
}

function witness(c: Ctx, user: string, target: string): boolean {
  const s = c.s;
  if (find(s, user)?.role !== 'murderer') return reply(c, user, say(s, 'onlyMurdererWitness'));
  if (s.phase !== 'reversal') return reply(c, user, say(s, 'cantWitnessNow'));
  const p = find(s, target);
  if (!p || p.role === 'scientist' || p.role === 'murderer' || p.role === 'accomplice') return reply(c, user, say(s, 'stale'));
  if (p.role === 'witness') endGame(c, 'evil', say(s, 'whyWitnessHit', { who: mention(target) }));
  else endGame(c, 'good', say(s, 'whyWitnessMiss', { who: mention(target) }));
  return true;
}

// ---------- 結束 ----------

function endGame(c: Ctx, winner: 'good' | 'evil', why: string) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  s.winner = winner;
  const evil = (p: DPlayer) => p.role === 'murderer' || p.role === 'accomplice';
  const winners = s.players.filter((p) => evil(p) === (winner === 'evil')).map((p) => p.id);
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners });
  c.events.push(
    {
      type: 'announce',
      text: [
        say(s, winner === 'good' ? 'goodWins' : 'evilWins', { why }),
        say(s, 'endAnswer', { m: mention(withRole(s, 'murderer')!.id), answer: answerText(s) }),
        say(s, 'endRoles', { list: s.players.map((p) => say(s, 'rolePair', { who: mention(p.id), role: say(s, ROLE_NAME[p.role!]) })).join(say(s, 'listSep')) }),
        say(s, 'guessLog'),
        ...(s.guesses.length
          ? s.guesses.map((g) => say(s, 'guessResult', { guess: guessText(s, g), ok: say(s, g.ok ? 'resultRight' : 'resultWrong') }))
          : [say(s, 'noGuesses')]),
      ].join('\n'),
      gif: winner === 'good' ? 'goodWin' : 'wolvesWin',
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

// 我的身分：只讓自己看到角色和這個角色知道的事
function showMe(c: Ctx, user: string): boolean {
  const s = c.s;
  const me = find(s, user);
  if (!me?.role) return reply(c, user, say(s, 'notPlayer'));
  const info = s.answer.clue ? nightInfo(s, me) : '';
  return reply(c, user, [say(s, ROLE_INTRO[me.role]), ...(info ? [info] : [])].join('\n'));
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_DECEPTION_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, say(c.s, 'noBots'));
    case 'start':
      return start(c, action.user);
    case 'cancel': {
      const s = c.s;
      const answer = s.answer.clue ? say(s, 'cancelAnswer', { m: mention(withRole(s, 'murderer')!.id), answer: answerText(s) }) : '';
      return cancelGame(c, action.user, answer);
    }
    case 'me':
      return showMe(c, action.user);
    case 'nightMeans':
      return nightMeans(c, action.user, action.i);
    case 'nightClue':
      return nightClue(c, action.user, action.i);
    case 'fsMenu':
    case 'fsBack':
      return fsMenu(c, action.user, action.pseq);
    case 'fsBoard':
      return fsBoard(c, action.user, action.pseq, action.slot);
    case 'fsPlace':
      return fsPlace(c, action.user, action.pseq, action.slot, action.opt);
    case 'fsLocation':
      return fsLocation(c, action.user, action.pseq, action.board, action.opt);
    case 'fsSwap':
      return fsSwap(c, action.user, action.pseq, action.slot);
    case 'fsNew':
      return fsNew(c, action.user, action.pseq, action.slot, action.opt);
    case 'done':
      return done(c, action.user, action.tseq);
    case 'solveMenu':
      return solveMenu(c, action.user);
    case 'suspect':
      return suspect(c, action.user, action.target);
    case 'solveMeans':
      return solveMeans(c, action.user, action.target, action.mi);
    case 'solveBack':
      return action.target ? suspect(c, action.user, action.target) : solveMenu(c, action.user);
    case 'solve':
      return solve(c, action.user, action.target, action.mi, action.ci);
    case 'witness':
      return witness(c, action.user, action.target);
    case 'timeout':
      if (action.id !== c.s.timers.phase) return false;
      if (c.s.phase === 'night') nightTimeout(c);
      else if (c.s.phase === 'evidence') evidenceTimeout(c);
      else if (c.s.phase === 'present') nextSpeaker(c);
      else if (c.s.phase === 'reversal') endGame(c, 'good', say(c.s, 'whyNoReversal'));

      else return false;
      return true;
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
