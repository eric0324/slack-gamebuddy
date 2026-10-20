// 阿瓦隆遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyAvalon(state, action, rng) → { state, events }。
import { isBot, mention, type GameEvent, type GifKey, type Rng } from './engine.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/avalon.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';

export const MIN_AVALON_PLAYERS = 5;
export const MAX_AVALON_PLAYERS = 10;
const TITLE = '阿瓦隆';
const SPEECH_MS = 40_000;
const PICK_MS = 90_000;
const VOTE_MS = 60_000;
const QUEST_MS = 60_000;
const ASSASSIN_MS = 60_000;
const MAX_REJECTS = 5;

// 人數 → 5 個任務的隊伍人數；7 人以上第 4 個任務要 2 張失敗票
const QUESTS: Record<number, number[]> = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
};

export type APhase = 'lobby' | 'speech' | 'pick' | 'teamVote' | 'quest' | 'assassinate' | 'ended';

export type ARole = 'merlin' | 'percival' | 'loyal' | 'assassin' | 'morgana' | 'minion';

export interface APlayer {
  id: string;
  role?: ARole;
}

// bot 發言用的通用台詞
export const AVALON_BOT_LINES = [
  '我是好人，請相信我。',
  '我覺得上一隊怪怪的，大家多注意一下。',
  '這輪我想看隊長怎麼選人。',
  '投票結果很有參考價值，大家回頭看看。',
  '我沒有什麼特別的資訊，先聽大家說。',
  '如果任務失敗，隊伍裡一定有壞人。',
  '有人一直在反對，我覺得有點可疑。',
  '我願意出任務，選我就對了。',
  '先不要急著下結論。',
  '這局好人要團結一點。',
];

export const AVALON_BOT_LINES_EN = [
  "I'm good, trust me.",
  'The last team felt off. Keep an eye on it.',
  'I want to see who the leader picks this round.',
  'The vote results tell us a lot. Look back at them.',
  "I don't have any special info. I'll listen first.",
  'If the quest fails, there must be evil on the team.',
  'Someone keeps rejecting. That seems a bit suspicious.',
  "I'm happy to go on the quest. Pick me.",
  "Let's not jump to conclusions.",
  'The good team needs to stick together this game.',
];
const botLines = (lang?: Lang) => (lang === 'en' ? AVALON_BOT_LINES_EN : AVALON_BOT_LINES);

// 人數 → [好人, 壞人]
const TEAM_SIZES: Record<number, [number, number]> = { 5: [3, 2], 6: [4, 2], 7: [4, 3], 8: [5, 3], 9: [6, 3], 10: [6, 4] };
const EVIL: ARole[] = ['assassin', 'morgana', 'minion'];
export const isEvil = (role?: ARole) => EVIL.includes(role!);

export interface AState {
  game: 'avalon';
  channel: string;
  host: string;
  phase: APhase;
  players: APlayer[];
  leader: number; // 隊長在 players 裡的位置
  quest: number; // 目前是第幾個任務 (0 起算)
  results: ('success' | 'fail')[];
  rejects: number; // 這個任務連續被否決幾次
  team: string[];
  votes: Record<string, 'approve' | 'reject'>;
  cards: Record<string, 'success' | 'fail'>;
  speakers: string[];
  speaker?: string;
  winner?: 'good' | 'evil';
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang;
}

export type AAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'endSpeech'; user: string }
  | { type: 'skipSpeaker'; user: string }
  | { type: 'pickMember'; user: string; target: string }
  | { type: 'confirmTeam'; user: string }
  | { type: 'teamVote'; user: string; vote: 'approve' | 'reject' }
  | { type: 'quest'; user: string; card: 'success' | 'fail' }
  | { type: 'assassinate'; user: string; target: string }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<AAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: AState;
  events: GameEvent[];
}

interface Ctx {
  s: AState;
  events: GameEvent[];
  rng: Rng;
}

const pick = <T>(items: T[], rng: Rng): T => items[Math.floor(rng() * items.length)];

const list = (s: AState, ids: string[]) => ids.map(mention).join(tx(s.lang, 'sep'));

// 發身分：依人數組出身分清單後洗牌，私訊每個人自己的身分和能看到的資訊
function deal(c: Ctx) {
  const s = c.s;
  const [good, evil] = TEAM_SIZES[s.players.length];
  const deck: ARole[] = [
    'merlin',
    'percival',
    ...Array<ARole>(good - 2).fill('loyal'),
    'assassin',
    'morgana',
    ...Array<ARole>(evil - 2).fill('minion'),
  ];
  const dealt = shuffle(deck, c.rng);
  s.players.forEach((p, i) => (p.role = dealt[i]));
  const evilIds = s.players.filter((p) => isEvil(p.role)).map((p) => p.id);
  const idsOf = (...rs: ARole[]) => s.players.filter((p) => rs.includes(p.role!)).map((p) => p.id);
  c.events.push({
    type: 'announce',
    text: tx(s.lang, 'start', { players: list(s, s.players.map((p) => p.id)), good, evil }),
    gif: 'start',
  });
  for (const p of s.players) {
    const others = evilIds.filter((id) => id !== p.id);
    let extra = '';
    if (p.role === 'merlin') extra = tx(s.lang, 'merlinInfo', { evil: list(s, evilIds) });
    else if (p.role === 'percival') extra = tx(s.lang, 'percivalInfo', { pair: list(s, idsOf('merlin', 'morgana')) });
    else if (isEvil(p.role)) extra = tx(s.lang, 'evilInfo', { others: list(s, others) });
    if (p.role === 'assassin') extra += tx(s.lang, 'assassinInfo');
    if (p.role === 'morgana') extra += tx(s.lang, 'morganaInfo');
    c.events.push({ type: 'dm', to: p.id, text: tx(s.lang, `intro.${p.role!}`) + extra });
  }
  c.events.push({ type: 'wolfChat', wolves: evilIds, text: tx(s.lang, 'evilChat', { evil: list(s, evilIds) }) });
}

const teamSize = (s: AState) => QUESTS[s.players.length][s.quest];
const progress = (s: AState) =>
  Array.from({ length: 5 }, (_, i) => (s.results[i] === 'success' ? '✅' : s.results[i] === 'fail' ? '❌' : '⬜')).join('');

// 開始一次組隊：公告任務資訊，從隊長的下一位開始輪流發言，隊長最後
function startRound(c: Ctx) {
  const s = c.s;
  const n = s.players.length;
  const leader = s.players[s.leader].id;
  const twoFails = n >= 7 && s.quest === 3 ? tx(s.lang, 'twoFails') : '';
  c.events.push({
    type: 'announce',
    text: tx(s.lang, 'round', { quest: s.quest + 1, size: teamSize(s), twoFails, leader: mention(leader), progress: progress(s), rejects: s.rejects, max: MAX_REJECTS }),
  });
  s.phase = 'speech';
  s.speakers = Array.from({ length: n }, (_, i) => s.players[(s.leader + 1 + i) % n].id);
  nextSpeaker(c);
}

function nextSpeaker(c: Ctx) {
  const s = c.s;
  let id = s.speakers.shift();
  while (id && isBot(id)) {
    c.events.push({ type: 'announce', text: tx(s.lang, 'botSays', { who: mention(id), line: pick(botLines(s.lang), c.rng) }) });
    id = s.speakers.shift();
  }
  s.speaker = id;
  if (!id) {
    startPick(c);
    return;
  }
  c.events.push({
    type: 'prompt',
    kind: 'endSpeech',
    audience: 'channel',
    text: tx(s.lang, 'speech', { who: mention(id), sec: SPEECH_MS / 1000 }),
    options: [{ value: id, label: tx(s.lang, 'endSpeech') }],
  });
  startTimer(c, SPEECH_MS);
}

const leaderOf = (s: AState) => s.players[s.leader].id;

function startPick(c: Ctx) {
  const s = c.s;
  s.phase = 'pick';
  s.team = [];
  c.events.push(
    {
      type: 'prompt',
      kind: 'pickMember',
      audience: 'channel',
      text: tx(s.lang, 'pick', { leader: mention(leaderOf(s)), size: teamSize(s), sec: PICK_MS / 1000 }),
      options: s.players.map((p) => ({ value: p.id, label: p.id })),
    },
    { type: 'prompt', kind: 'confirmTeam', audience: 'channel', text: tx(s.lang, 'confirmHint'), options: [{ value: 'confirm', label: tx(s.lang, 'confirmTeam') }] },
  );
  startTimer(c, PICK_MS);
}

function submitTeam(c: Ctx) {
  const s = c.s;
  s.team = s.players.map((p) => p.id).filter((id) => s.team.includes(id));
  c.events.push({ type: 'announce', text: tx(s.lang, 'proposed', { leader: mention(leaderOf(s)), team: list(s, s.team) }) });
  s.phase = 'teamVote';
  s.votes = {};
  c.events.push({
    type: 'prompt',
    kind: 'teamVote',
    audience: 'channel',
    text: tx(s.lang, 'voteAsk', { sec: VOTE_MS / 1000 }),
    options: [
      { value: 'approve', label: tx(s.lang, 'approve') },
      { value: 'reject', label: tx(s.lang, 'reject') },
    ],
  });
  startTimer(c, VOTE_MS);
}

// 組隊投票結束：公開每個人的票，過半通過就出任務，否則換下一位隊長
function endTeamVote(c: Ctx) {
  const s = c.s;
  const votes = s.players.map((p) => [p.id, s.votes[p.id] ?? 'approve'] as const);
  const lines = votes.map(([id, v]) => tx(s.lang, 'voteLine', { who: mention(id), vote: tx(s.lang, v) }));
  const approvals = votes.filter(([, v]) => v === 'approve').length;
  c.events.push({ type: 'announce', text: tx(s.lang, 'voteResult', { lines: lines.join('\n') }) });
  if (approvals * 2 > s.players.length) {
    s.rejects = 0;
    c.events.push({
      type: 'announce',
      text: tx(s.lang, 'approved', { n: approvals, team: list(s, s.team) }),
      gif: 'teamApproved',
    });
    startQuest(c);
    return;
  }
  s.rejects++;
  const ending = s.rejects >= MAX_REJECTS;
  c.events.push({
    type: 'announce',
    text: tx(s.lang, 'rejected', { n: approvals, rejects: s.rejects, max: MAX_REJECTS }),
    ...(ending ? {} : { gif: 'teamRejected' as const }),
  });
  if (ending) {
    c.events.push({ type: 'announce', text: tx(s.lang, 'chaos', { max: MAX_REJECTS }) });
    endGame(c, 'evil', 'teamRejected');
    return;
  }
  nextLeader(c);
}

// 出任務：私訊每位隊員，好人只能出成功
function startQuest(c: Ctx) {
  const s = c.s;
  s.phase = 'quest';
  s.cards = {};
  for (const id of s.team) {
    const evil = isEvil(s.players.find((p) => p.id === id)!.role);
    c.events.push({
      type: 'prompt',
      kind: 'quest',
      audience: 'user',
      user: id,
      text: tx(s.lang, 'questAsk', { quest: s.quest + 1, sec: QUEST_MS / 1000 }),
      options: [{ value: 'success', label: tx(s.lang, 'success') }, ...(evil ? [{ value: 'fail', label: tx(s.lang, 'fail') }] : [])],
    });
  }
  startTimer(c, QUEST_MS);
}

// 任務結束：只公開失敗票數；7 人以上第 4 個任務要 2 張失敗票才失敗
function endQuest(c: Ctx) {
  const s = c.s;
  const fails = s.team.filter((id) => s.cards[id] === 'fail').length;
  const needed = s.players.length >= 7 && s.quest === 3 ? 2 : 1;
  const result = fails >= needed ? 'fail' : 'success';
  s.results.push(result);
  const count = (r: string) => s.results.filter((x) => x === r).length;
  // 第 3 個成功 (接著進入刺殺) 或第 3 個失敗 (遊戲結束) 時，GIF 留給下一則公告
  const decisive = count(result) >= 3;
  c.events.push({
    type: 'announce',
    text: tx(s.lang, result === 'success' ? 'questSuccess' : 'questFail', { quest: s.quest + 1, fails }),
    ...(decisive ? {} : { gif: result === 'success' ? ('questSuccess' as const) : ('questFail' as const) }),
  });
  s.quest++;
  if (count('fail') >= 3) endGame(c, 'evil', 'questFail');
  else if (count('success') >= 3) startAssassination(c);
  else nextLeader(c);
}

// 好人完成 3 個任務：公開壞人，刺客可以刺殺梅林
function startAssassination(c: Ctx) {
  const s = c.s;
  s.phase = 'assassinate';
  s.timers = {};
  const evilIds = s.players.filter((p) => isEvil(p.role)).map((p) => p.id);
  c.events.push({
    type: 'announce',
    text: tx(s.lang, 'assassination', { evil: list(s, evilIds) }),
    gif: 'assassination',
  });
  c.events.push({
    type: 'prompt',
    kind: 'assassinate',
    audience: 'wolves',
    text: tx(s.lang, 'assassinAsk', { assassin: mention(roleHolder(s, 'assassin')), sec: ASSASSIN_MS / 1000 }),
    options: goodIds(s).map((id) => ({ value: id, label: id })),
  });
  startTimer(c, ASSASSIN_MS);
}

const roleHolder = (s: AState, role: ARole) => s.players.find((p) => p.role === role)!.id;
const goodIds = (s: AState) => s.players.filter((p) => !isEvil(p.role)).map((p) => p.id);

function assassinate(c: Ctx, target: string) {
  const s = c.s;
  const assassin = mention(roleHolder(s, 'assassin'));
  if (target === roleHolder(s, 'merlin')) {
    c.events.push({ type: 'announce', text: tx(s.lang, 'hitMerlin', { assassin, target: mention(target) }) });
    endGame(c, 'evil', 'duelWin');
  } else {
    c.events.push({ type: 'announce', text: tx(s.lang, 'missMerlin', { assassin, target: mention(target) }) });
    endGame(c, 'good', 'duelLose');
  }
}

// 結束：公開獲勝陣營、每個人的身分和任務結果；gif 是造成結束的時刻的 GIF，取代勝利 GIF
function endGame(c: Ctx, winner: 'good' | 'evil', gif?: GifKey) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  s.winner = winner;
  const title = tx(s.lang, winner === 'good' ? 'goodWin' : 'evilWin');
  const roster = s.players.map((p) => tx(s.lang, 'rosterLine', { who: mention(p.id), role: tx(s.lang, `role.${p.role!}`) })).join('\n');
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.players.filter((p) => isEvil(p.role) === (winner === 'evil')).map((p) => p.id) });
  c.events.push(
    { type: 'announce', text: tx(s.lang, 'end', { title, progress: progress(s), roster }), gif: gif ?? (winner === 'good' ? 'goodWin' : 'wolvesWin') },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

function nextLeader(c: Ctx) {
  c.s.leader = (c.s.leader + 1) % c.s.players.length;
  startRound(c);
}

// 找出下一個輪到 bot 的行動
function nextBotAction(s: AState, rng: Rng): GameAction | null {
  const roleOf = (id: string) => s.players.find((p) => p.id === id)!.role;
  if (s.phase === 'pick') {
    const leader = leaderOf(s);
    if (!isBot(leader)) return null;
    if (s.team.length >= teamSize(s)) return { type: 'confirmTeam', user: leader };
    if (isEvil(roleOf(leader)) && !s.team.includes(leader)) return { type: 'pickMember', user: leader, target: leader };
    const rest = s.players.map((p) => p.id).filter((id) => !s.team.includes(id));
    return { type: 'pickMember', user: leader, target: pick(rest, rng) };
  }
  if (s.phase === 'teamVote') {
    const voter = s.players.find((p) => isBot(p.id) && !s.votes[p.id]);
    if (voter) return { type: 'teamVote', user: voter.id, vote: s.team.includes(voter.id) || rng() < 0.5 ? 'approve' : 'reject' };
  }
  if (s.phase === 'quest') {
    const member = s.team.find((id) => isBot(id) && !s.cards[id]);
    if (member) return { type: 'quest', user: member, card: isEvil(roleOf(member)) ? 'fail' : 'success' };
  }
  if (s.phase === 'assassinate') {
    const assassin = roleHolder(s, 'assassin');
    if (isBot(assassin)) return { type: 'assassinate', user: assassin, target: pick(goodIds(s), rng) };
  }
  return null;
}

function runBots(c: Ctx) {
  for (let i = 0; i < 1000; i++) {
    const action = nextBotAction(c.s, c.rng);
    if (!action || !handle(c, action)) return;
  }
}

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_AVALON_PLAYERS, (id) => ({ id }));
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_AVALON_PLAYERS, (id) => ({ id }));
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostStart'));
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_AVALON_PLAYERS) return reply(c, action.user, tx(s.lang, 'notEnough', { n, min: MIN_AVALON_PLAYERS }));
      c.events.push(lobbyEvent(TITLE, { ...s, phase: 'speech' }));
      deal(c);
      s.leader = Math.floor(c.rng() * n);
      startRound(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user);
    case 'endSpeech': {
      if (s.phase !== 'speech') return false;
      if (action.user !== s.speaker) return reply(c, action.user, tx(s.lang, 'notYourSpeech'));
      nextSpeaker(c);
      return true;
    }
    case 'skipSpeaker': {
      if (s.phase !== 'speech') return false;
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostSkip'));
      nextSpeaker(c);
      return true;
    }
    case 'pickMember': {
      if (s.phase !== 'pick') return false;
      if (action.user !== leaderOf(s)) return reply(c, action.user, tx(s.lang, 'onlyLeaderPick'));
      if (!s.players.some((p) => p.id === action.target)) return false;
      if (s.team.includes(action.target)) s.team = s.team.filter((id) => id !== action.target);
      else if (s.team.length >= teamSize(s)) return reply(c, action.user, tx(s.lang, 'teamFull', { size: teamSize(s) }));
      else s.team.push(action.target);
      reply(c, action.user, tx(s.lang, 'currentTeam', { n: s.team.length, size: teamSize(s), team: s.team.length ? list(s, s.team) : tx(s.lang, 'nobody') }));
      return true;
    }
    case 'confirmTeam': {
      if (s.phase !== 'pick') return false;
      if (action.user !== leaderOf(s)) return reply(c, action.user, tx(s.lang, 'onlyLeaderConfirm'));
      const missing = teamSize(s) - s.team.length;
      if (missing > 0) return reply(c, action.user, tx(s.lang, 'missing', { n: missing }));
      submitTeam(c);
      return true;
    }
    case 'teamVote': {
      if (s.phase !== 'teamVote' || !s.players.some((p) => p.id === action.user)) return false;
      s.votes[action.user] = action.vote;
      reply(c, action.user, tx(s.lang, action.vote === 'approve' ? 'votedApprove' : 'votedReject'));
      if (s.players.every((p) => s.votes[p.id])) endTeamVote(c);
      return true;
    }
    case 'quest': {
      if (s.phase !== 'quest') return false;
      if (!s.team.includes(action.user)) return reply(c, action.user, tx(s.lang, 'notOnTeam'));
      if (s.cards[action.user]) return reply(c, action.user, tx(s.lang, 'alreadyQuested'));
      if (action.card === 'fail' && !isEvil(s.players.find((p) => p.id === action.user)!.role)) return false;
      s.cards[action.user] = action.card;
      reply(c, action.user, tx(s.lang, action.card === 'success' ? 'playedSuccess' : 'playedFail'));
      if (s.team.every((id) => s.cards[id])) endQuest(c);
      return true;
    }
    case 'assassinate': {
      if (s.phase !== 'assassinate') return false;
      if (action.user !== roleHolder(s, 'assassin')) return reply(c, action.user, tx(s.lang, 'onlyAssassin'));
      if (!goodIds(s).includes(action.target)) return false;
      assassinate(c, action.target);
      return true;
    }
    case 'timeout': {
      if (action.id !== s.timers.phase) return false;
      if (s.phase === 'assassinate') {
        assassinate(c, goodIds(s)[Math.floor(c.rng() * goodIds(s).length)]);
        return true;
      }
      if (s.phase === 'quest') {
        endQuest(c);
        return true;
      }
      if (s.phase === 'teamVote') {
        endTeamVote(c);
        return true;
      }
      if (s.phase === 'speech') nextSpeaker(c);
      else if (s.phase === 'pick') {
        const rest = shuffle(s.players.map((p) => p.id).filter((id) => !s.team.includes(id)), c.rng);
        s.team.push(...rest.slice(0, teamSize(s) - s.team.length));
        submitTeam(c);
      }
      else return false;
      return true;
    }
  }
}

export function applyAvalon(state: AState | undefined, action: AAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winner,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
    afterChange: runBots,
  });
}

function createLobby(prev: AState | undefined, host: string, channel: string): Result {
  const created: AState = {
    game: 'avalon',
    channel,
    host,
    phase: 'lobby',
    players: [{ id: host }],
    leader: 0,
    quest: 0,
    results: [],
    rejects: 0,
    team: [],
    votes: {},
    cards: {},
    speakers: [],
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
