// 詭影神探 (Deception: Murder in Hong Kong) 遊戲引擎：純邏輯，不碰任何 I/O。鑑識官知道答案、只能用提示板上的子彈給暗示，大家從每人面前的手段卡和線索卡推敲兇手用了哪一組。
// 介面和其他遊戲一樣：applyDeception(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import { CAUSE_BOARD, CLUES, LOCATION_BOARDS, MEANS, SCENE_BOARDS, type Board } from './deceptionCards.js';

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
const STALE = '這個階段已經結束了。';
const NOT_PLAYER = '你不在這局遊戲裡。';

export type Role = 'scientist' | 'murderer' | 'accomplice' | 'witness' | 'investigator';
const ROLE_NAME: Record<Role, string> = {
  scientist: '🔬 鑑識官',
  murderer: '🔪 兇手',
  accomplice: '🤝 共犯',
  witness: '👀 目擊者',
  investigator: '🕵️ 調查員',
};
const ROLE_INTRO: Record<Role, string> = {
  scientist: '🔬 你是鑑識官 (好人陣營)。你只能用提示板上的子彈給提示，不能在頻道透露答案，也不發言、不能破案。天亮後會私下告訴你兇手、共犯和答案。',
  murderer: '🔪 你是兇手。馬上會私訊你，從自己面前選 1 張手段和 1 張線索當答案；之後混在調查員裡誤導大家。',
  accomplice: '🤝 你是共犯 (兇手陣營)。天亮後會私下告訴你兇手是誰和答案，幫兇手誤導大家。',
  witness: '👀 你是目擊者 (好人陣營)。天亮後會私下告訴你兇手和共犯是哪兩位 (不知道誰是誰)；小心別被兇手發現，破案後兇手可以指認你翻盤。',
  investigator: '🕵️ 你是調查員 (好人陣營)。目標：從大家面前的卡和鑑識官的子彈，找出兇手和他用的手段、線索。',
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

// 人數 → 角色 (鑑識官另外選)；6 人以上一律有共犯和目擊者
function roleDeck(n: number): Role[] {
  const extra: Role[] = n >= 6 ? ['accomplice', 'witness'] : [];
  return ['murderer', ...extra, ...Array<Role>(n - 2 - extra.length).fill('investigator')];
}

function rules(s: DState) {
  const extra = withRole(s, 'witness') ? '這局有共犯和目擊者' : '這局沒有共犯和目擊者';
  return [
    `🔎 詭影神探開始！玩家：${s.players.map((p) => mention(p.id)).join('、')}`,
    `${ROLE_NAME.scientist}：${mention(scientist(s).id)} (身分公開)｜${extra}｜共 ${ROUNDS} 輪`,
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
  startNight(c);
  return true;
}

// ---------- 夜晚 ----------

const answerText = (s: DState) => `手段「${s.answer.means}」、線索「${s.answer.clue}」`;

function startNight(c: Ctx) {
  const s = c.s;
  s.phase = 'night';
  const m = withRole(s, 'murderer')!;
  c.events.push({ type: 'announce', text: '🌙 天黑了，兇手正在選擇手段和線索。' });
  c.events.push({
    type: 'prompt',
    kind: 'deception',
    audience: 'user',
    user: m.id,
    text: `🔪 選一張你面前的手段卡當作行兇手段 (${NIGHT_MS / 1000} 秒)`,
    options: m.means.map((label, i) => ({ value: `nm:${i}`, label })),
  });
  startTimer(c, NIGHT_MS);
}

// 兇手選答案的共同檢查；回傳兇手或 null
function nightCheck(c: Ctx, user: string, done: boolean): DPlayer | null {
  const me = find(c.s, user);
  if (me?.role !== 'murderer') return (reply(c, user, '只有兇手可以選答案。'), null);
  if (c.s.phase !== 'night' || done) return (reply(c, user, '已經選好了。'), null);
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
    text: `🔪 手段是「${me.means[i]}」。再選一張你面前的線索卡當作關鍵證物`,
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
      return `兇手：${m}${acc ? `｜共犯：${mention(acc.id)}` : ''}｜答案：${answerText(s)}`;
    case 'accomplice':
      return `兇手：${m}｜答案：${answerText(s)}`;
    case 'witness':
      return `${s.seen.map(mention).join(' 和 ')} 是兇手和共犯 (不知道誰是誰)`;
    case 'murderer':
      return `你選的答案：${answerText(s)}`;
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
    if (info) c.events.push({ type: 'dm', to: p.id, text: `🌅 天亮了。${info}` });
  }
  c.events.push({ type: 'announce', text: '🌅 天亮了！鑑識官開始蒐證。' });
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
const boardLine = (title: string, x: Placed) => `${title}：${x.board.options.map((o, i) => (i === x.bullet ? `【${o}】` : o)).join('／')}`;

function boardLines(s: DState): string[] {
  const loc = s.location
    ? boardLine(`案發地點 (${s.location.board.title})`, s.location)
    : `案發地點：${s.round === 1 && s.phase === 'evidence' ? '(還沒選)' : '(沒有使用)'}`;
  return [
    boardLine(s.cause.board.title, s.cause),
    loc,
    ...s.scenes.map((x) => boardLine(x.board.title, x)),
    ...(s.fresh ? [`${boardLine(`新抽的板．${s.fresh.title}`, { board: s.fresh })} (還沒放子彈)`] : []),
  ];
}

// 回合面板：同一個階段帶同一個 ref，原地更新
function panel(s: DState): GameEvent {
  const sci = mention(scientist(s).id);
  const head =
    s.phase === 'evidence'
      ? `第 ${s.round}/${ROUNDS} 輪．蒐證｜輪到鑑識官 ${sci} 放子彈`
      : `第 ${s.round}/${ROUNDS} 輪．發言｜輪到 ${mention(s.speakers[s.speaker])} (鑑識官：${sci})`;
  const badges = suspects(s).filter((p) => p.badge);
  const lines = [
    head,
    ...boardLines(s),
    ...(s.last ? [s.last] : []),
    '',
    '場上一覽',
    ...tableLines(s),
    `還有徽章：${badges.length ? badges.map((p) => mention(p.id)).join(' ') : '(沒有)'}`,
  ];
  const options = [
    ...(s.phase === 'evidence' ? [{ value: `fs:${s.pseq}`, label: '🧪 鑑識官放子彈' }] : []),
    { value: 'solve', label: '🔍 破案' },
    { value: 'me', label: '🗂️ 我的身分' },
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
  if (!me) return NOT_PLAYER;
  if (me.role !== 'scientist') return '只有鑑識官可以放子彈。';
  if (s.phase !== 'evidence' || pseq !== s.pseq) return STALE;
  return null;
}

// 第 1 輪還沒放子彈的板：[slot, 按鈕文字]
function openSlots(s: DState): [string, string][] {
  const list: [string, string][] = [];
  if (s.cause.bullet === undefined) list.push(['cause', s.cause.board.title]);
  if (!s.location) list.push(['loc', '案發地點 (4 選 1)']);
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
    return menu(c, user, '🧪 選一張板放子彈 (放下就不能移動)', options);
  }
  if (!s.fresh) return deny(c, user, STALE);
  const options = s.scenes.map((x, i) => ({ value: `fx:${pseq}:s${i}`, label: x.board.title }));
  return menu(c, user, `🧪 新抽的板是「${s.fresh.title}」：${s.fresh.options.join('／')}\n要換掉哪一張場景板？`, options);
}

function fsBoard(c: Ctx, user: string, pseq: number, slot: string): boolean {
  const s = c.s;
  const err = fsCheck(s, user, pseq);
  if (err) return deny(c, user, err);
  if (s.round !== 1) return deny(c, user, STALE);
  const back = { value: `fback:${pseq}`, label: '↩️ 換一張' };
  if (slot === 'loc') {
    if (s.location) return deny(c, user, STALE);
    const text = ['🧪 選案發地點：每一列是一張地點板，按下的選項就是子彈位置', ...LOCATION_BOARDS.map((b, i) => `第 ${i + 1} 列 ${b.title}：${b.options.join('／')}`)];
    const options = LOCATION_BOARDS.flatMap((b, i) => b.options.map((label, o) => ({ value: `fl:${pseq}:${i}:${o}`, label })));
    return menu(c, user, text.join('\n'), [...options, back], 6);
  }
  const x = slotOf(s, slot);
  if (!x || x.bullet !== undefined) return deny(c, user, STALE);
  const options = x.board.options.map((label, o) => ({ value: `fp:${pseq}:${slot}:${o}`, label }));
  return menu(c, user, `🧪 「${x.board.title}」的子彈放在哪裡？`, [...options, back]);
}

// 放好一顆子彈：面板原地更新；6 顆都放好就進入發言，否則選單回到第 1 步
function placed(c: Ctx, user: string) {
  const s = c.s;
  c.events.push(panel(s));
  if (openSlots(s).length) fsMenu(c, user, s.pseq);
  else {
    tell(c, user, '✅ 6 顆子彈都放好了');
    startPresent(c);
  }
}

function fsPlace(c: Ctx, user: string, pseq: number, slot: string, opt: number): boolean {
  const s = c.s;
  const err = fsCheck(s, user, pseq);
  if (err) return deny(c, user, err);
  const x = slotOf(s, slot);
  if (s.round !== 1 || !x || x.bullet !== undefined || !x.board.options[opt]) return deny(c, user, STALE);
  x.bullet = opt;
  placed(c, user);
  return true;
}

function fsLocation(c: Ctx, user: string, pseq: number, board: number, opt: number): boolean {
  const s = c.s;
  const err = fsCheck(s, user, pseq);
  if (err) return deny(c, user, err);
  const b = LOCATION_BOARDS[board];
  if (s.round !== 1 || s.location || !b?.options[opt]) return deny(c, user, STALE);
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
  if (!s.fresh || !x) return deny(c, user, STALE);
  const options = s.fresh.options.map((label, o) => ({ value: `fn:${pseq}:${slot}:${o}`, label }));
  return menu(c, user, `🧪 換掉「${x.board.title}」，新板「${s.fresh.title}」的子彈放在哪裡？`, [...options, { value: `fs:${pseq}`, label: '↩️ 換一張' }]);
}

// 第 2、3 輪：新板取代舊板的位置，進入發言
function fsNew(c: Ctx, user: string, pseq: number, slot: string, opt: number): boolean {
  const s = c.s;
  const err = fsCheck(s, user, pseq);
  if (err) return deny(c, user, err);
  const x = sceneOf(s, slot);
  if (!s.fresh || !x || !s.fresh.options[opt]) return deny(c, user, STALE);
  s.last = `換掉了${x.board.title}`;
  s.scenes[Number(slot[1])] = { board: s.fresh, bullet: opt };
  s.fresh = undefined;
  c.events.push(panel(s));
  tell(c, user, `✅ ${s.last}`);
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
      c.events.push({ type: 'announce', text: `🛑 鑑識官沒有回應，遊戲中止。答案：兇手 ${mention(withRole(s, 'murderer')!.id)}，${answerText(s)}` });
      return;
    }
    c.events.push({ type: 'announce', text: '⏰ 鑑識官時間到，沒放子彈的板沒有提示。' });
  } else {
    s.fresh = undefined;
    c.events.push({ type: 'announce', text: '⏰ 鑑識官這輪沒有換板。' });
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
    text: `輪到 ${mention(s.speakers[s.speaker])} 發言 (${SPEAK_MS / 1000} 秒)`,
    options: [
      { value: `done:${s.tseq}`, label: '✅ 說完了' },
      { value: 'solve', label: '🔍 破案' },
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
  } else endGame(c, 'evil', `${ROUNDS} 輪結束，沒有人破案`);
}

function done(c: Ctx, user: string, tseq: number): boolean {
  const s = c.s;
  if (!find(s, user)) return reply(c, user, NOT_PLAYER);
  if (s.phase !== 'present' || tseq !== s.tseq) return reply(c, user, STALE);
  if (s.speakers[s.speaker] !== user) return reply(c, user, '還沒輪到你。');
  nextSpeaker(c);
  return true;
}

// ---------- 破案 ----------

// 能不能破案；回傳錯誤訊息或 null
function solveCheck(s: DState, user: string): string | null {
  const me = find(s, user);
  if (!me) return NOT_PLAYER;
  if (me.role === 'scientist') return '鑑識官不能破案。';
  if (s.phase !== 'evidence' && s.phase !== 'present') return '現在不能破案。';
  if (!me.badge) return '你已經用過破案機會了。';
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
  return menu(c, user, '🔍 破案 (整局只有一次機會)：嫌犯是誰？', options);
}

function suspect(c: Ctx, user: string, target: string): boolean {
  const err = solveCheck(c.s, user);
  if (err) return deny(c, user, err);
  const p = suspectOf(c.s, user, target);
  if (!p) return deny(c, user, STALE);
  const options = p.means.map((label, mi) => ({ value: `sm:${target}:${mi}`, label }));
  return menu(c, user, `🔍 嫌犯 ${mention(target)}：用了哪一張手段？`, [...options, { value: 'sback:', label: '↩️ 重選嫌犯' }]);
}

function solveMeans(c: Ctx, user: string, target: string, mi: number): boolean {
  const err = solveCheck(c.s, user);
  if (err) return deny(c, user, err);
  const p = suspectOf(c.s, user, target);
  if (!p?.means[mi]) return deny(c, user, STALE);
  const options = p.clues.map((label, ci) => ({ value: `sc:${target}:${mi}:${ci}`, label }));
  return menu(c, user, `🔍 嫌犯 ${mention(target)}，手段「${p.means[mi]}」：留下哪一張線索？按下就送出`, [
    ...options,
    { value: `sback:${target}`, label: '↩️ 重選手段' },
  ]);
}

const guessText = (g: DState['guesses'][number]) => `${mention(g.by)} 破案：嫌犯 ${mention(g.suspect)}，手段「${g.means}」，線索「${g.clue}」`;

// 送出破案：系統判定，錯了只說「不對」
function solve(c: Ctx, user: string, target: string, mi: number, ci: number): boolean {
  const s = c.s;
  const err = solveCheck(s, user);
  if (err) return deny(c, user, err);
  const p = suspectOf(s, user, target);
  if (!p?.means[mi] || !p.clues[ci]) return deny(c, user, STALE);
  const ok = p.role === 'murderer' && p.means[mi] === s.answer.means && p.clues[ci] === s.answer.clue;
  const g = { by: user, suspect: target, means: p.means[mi], clue: p.clues[ci], ok };
  s.guesses.push(g);
  find(s, user)!.badge = false;
  tell(c, user, '✅ 已送出破案');
  c.events.push({ type: 'announce', text: `🔍 ${guessText(g)}\n${ok ? '🎯 對了！' : '❌ 不對。'}` });
  if (ok) {
    if (withRole(s, 'witness')) startReversal(c);
    else endGame(c, 'good', `${mention(user)} 破案成功`);
  } else if (!s.players.some((x) => (x.role === 'investigator' || x.role === 'witness') && x.badge)) {
    endGame(c, 'evil', '調查員和目擊者的破案機會都用完了');
  } else c.events.push(panel(s));
  return true;
}

// ---------- 翻盤 ----------

function startReversal(c: Ctx) {
  const s = c.s;
  const m = withRole(s, 'murderer')!;
  s.phase = 'reversal';
  c.events.push({ type: 'announce', text: `🎯 破案成功！兇手是 ${mention(m.id)}，但兇手還有最後機會指認目擊者 (${REVERSAL_MS / 1000} 秒)。` });
  c.events.push({
    type: 'prompt',
    kind: 'deception',
    audience: 'user',
    user: m.id,
    text: `🔪 你被抓到了！指認一位玩家，指到目擊者你們就翻盤獲勝 (${REVERSAL_MS / 1000} 秒)`,
    options: s.players.filter((p) => p.role !== 'scientist' && p.role !== 'murderer' && p.role !== 'accomplice').map((p) => ({ value: `wit:${p.id}`, label: p.id })),
  });
  const acc = withRole(s, 'accomplice');
  if (acc) c.events.push({ type: 'dm', to: acc.id, text: `🤝 ${mention(m.id)} 被抓到了，兇手正在指認目擊者。` });
  startTimer(c, REVERSAL_MS);
}

function witness(c: Ctx, user: string, target: string): boolean {
  const s = c.s;
  if (find(s, user)?.role !== 'murderer') return reply(c, user, '只有兇手可以指認目擊者。');
  if (s.phase !== 'reversal') return reply(c, user, '現在不能指認目擊者。');
  const p = find(s, target);
  if (!p || p.role === 'scientist' || p.role === 'murderer' || p.role === 'accomplice') return reply(c, user, STALE);
  if (p.role === 'witness') endGame(c, 'evil', `兇手指認 ${mention(target)}，指到了目擊者`);
  else endGame(c, 'good', `兇手指認 ${mention(target)}，沒指到目擊者`);
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
        `${winner === 'good' ? '🎉 好人陣營獲勝！' : '🔪 兇手陣營獲勝！'}${why}。`,
        `答案：兇手 ${mention(withRole(s, 'murderer')!.id)}，${answerText(s)}`,
        `角色：${s.players.map((p) => `${mention(p.id)} ${ROLE_NAME[p.role!]}`).join('、')}`,
        '破案紀錄：',
        ...(s.guesses.length ? s.guesses.map((g) => `${guessText(g)} → ${g.ok ? '對' : '不對'}`) : ['(沒有人破案)']),
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
  if (!me?.role) return reply(c, user, NOT_PLAYER);
  const info = s.answer.clue ? nightInfo(s, me) : '';
  return reply(c, user, [ROLE_INTRO[me.role], ...(info ? [info] : [])].join('\n'));
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
    case 'cancel': {
      const s = c.s;
      const answer = s.answer.clue ? `\n答案：兇手 ${mention(withRole(s, 'murderer')!.id)}，${answerText(s)}` : '';
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
      else if (c.s.phase === 'reversal') endGame(c, 'good', '兇手沒有指認目擊者');
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
