// Slack adapter：把 slash command 和按鈕轉成 engine action，再把 engine event 轉成 Slack API 呼叫。
import { applyAction, isBot, MAX_PLAYERS, mention, RULES_URL, type Action, type GameEvent, type GameState, type GifKey, type Rng } from './engine.js';
import { GIFS } from './gifs.js';
import { formatStats, type StatsStore } from './stats.js';
import { applyAvalon, type AAction, type AState } from './avalon.js';
import { applyCodenames, type CAction, type CState } from './codenames.js';
import { applyCoup, type KAction, type KState } from './coup.js';
import { applyHanabi, COLOR_NAME, type Color, type HAction, type HState } from './hanabi.js';
import { applyJustOne, type JAction, type JState } from './justone.js';
import { applyLiarsDice, type LAction, type LState } from './liarsdice.js';
import { applySpyfall, type SAction, type SState } from './spyfall.js';
import { applyUndercover, type UAction, type UState } from './undercover.js';
import { applyWavelength, type WAction, type WState } from './wavelength.js';
import { applyDecrypto, type DAction, type DState } from './decrypto.js';
import { applyNimmt, type NAction, type NState } from './nimmt.js';

type Kind = 'werewolf' | 'undercover' | 'spyfall' | 'avalon' | 'codenames' | 'liarsdice' | 'justone' | 'coup' | 'hanabi' | 'wavelength' | 'decrypto' | 'nimmt';
type OtherKind = Exclude<Kind, 'werewolf'>;

// 狼人殺以外的遊戲都用同一套方式接上 adapter：engine、指令解析、按鈕對應、說明
interface GameDef {
  states: Map<string, { phase: string }>;
  apply(state: any, action: any, rng: Rng): { state: any; events: GameEvent[] };
  parse(text: string, user: string, channel: string): { type: string } | null;
  button(kind: string, value: string, user: string, channel: string): { type: string } | null;
  help: string;
}

// 只列出用到的 WebClient 方法，測試時可以換成假的 client
export interface SlackClient {
  chat: {
    postMessage(args: any): Promise<any>;
    update(args: any): Promise<any>;
    postEphemeral(args: any): Promise<any>;
  };
  conversations: {
    open(args: any): Promise<any>;
  };
  views: {
    open(args: any): Promise<any>;
  };
}

export interface HostOptions {
  rng?: Rng;
  gifs?: Partial<Record<GifKey, string[]>>;
  stats?: StatsStore;
  setTimer?: (fn: () => void, ms: number) => void;
  respond?: (url: string, payload: object) => Promise<void>; // 用按鈕的 response_url 換掉 ephemeral 訊息
}

const postJson = async (url: string, payload: object) => {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`response_url ${res.status}`);
};

const HELP = [
  '*狼人殺指令*',
  '• `/werewolf new`：開房（任何人）',
  '• `/werewolf addbot [數量]`：加入 bot 補人數（房主，開始前）',
  '• `/werewolf removebot [數量]`：移除 bot（房主，開始前）',
  '• `/werewolf start`：開始遊戲，需要 6～12 人（房主）',
  '• `/werewolf next`：跳過目前的發言者或遺言（房主）',
  '• `/werewolf vote`：結束輪流發言，直接投票（房主）',
  '• `/werewolf cancel`：取消遊戲（房主）',
  '• `/werewolf stats [@某人]`：查詢自己或別人在這個頻道的戰績（任何人）',
  `📖 完整說明：<${encodeURI('https://github.com/eric0324/slack-gamebuddy/wiki/狼人殺-指令')}|指令>、<${RULES_URL}|遊戲規則>`,
].join('\n');

const WIKI = 'https://github.com/eric0324/slack-gamebuddy/wiki';

const GAME_LIST = [
  '*可以玩的遊戲*',
  '• 🐺 *狼人殺*（`werewolf`）：6～12 人，開房 `/game werewolf new`（或 `/werewolf new`）',
  '• 🕵️ *誰是臥底*（`undercover`）：4～12 人，開房 `/game undercover new`',
  '• 📍 *間諜危機*（`spyfall`）：4～10 人，開房 `/game spyfall new`',
  '• 🏰 *阿瓦隆*（`avalon`）：5～10 人，開房 `/game avalon new`',
  '• 🟥 *機密代號*（`codenames`）：4～12 人（不支援 bot），開房 `/game codenames new`',
  '• 🎲 *吹牛骰*（`liarsdice`）：2～8 人，開房 `/game liarsdice new`',
  '• 💡 *一字千金*（`justone`）：3～7 人（不支援 bot），開房 `/game justone new`',
  '• 👑 *政變*（`coup`）：3～6 人，開房 `/game coup new`',
  '• 🎆 *花火*（`hanabi`）：2～5 人（不支援 bot），開房 `/game hanabi new`',
  '• 📡 *心電感應*（`wavelength`）：4～12 人（不支援 bot），開房 `/game wavelength new`',
  '• 🔐 *截碼戰*（`decrypto`）：4～12 人（不支援 bot），開房 `/game decrypto new`',
  '• 🐮 *誰是牛頭王*（`nimmt`）：2～10 人，開房 `/game nimmt new`',
  '各遊戲的指令：`/game <遊戲代號> help`，例如 `/game liarsdice help`',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const DECRYPTO_HELP = [
  '*截碼戰指令*',
  '• `/game decrypto new`：開房（任何人）',
  '• `/game decrypto start`：開始遊戲，需要 4～12 位真人（房主）',
  '• 加密：輪到你時按「✍️ 寫提示」依序寫 3 個提示；也可以打 `/game decrypto clue 海 / 火 / 鐘`（用 / 分開）',
  '• `/game decrypto cancel`：取消遊戲（房主）',
  '解碼、攔截、提示紀錄都用頻道按鈕',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const NIMMT_HELP = [
  '*誰是牛頭王指令*',
  '• `/game nimmt new`：開房（任何人）',
  '• `/game nimmt addbot [數量]`：加入 bot 補人數（房主，開始前）',
  '• `/game nimmt removebot [數量]`：移除 bot（房主，開始前）',
  '• `/game nimmt start`：開始遊戲，需要 2～10 人（房主）',
  '• 選牌：每回合按「🃏 選牌」從手牌選一張（只有你看得到，揭曉前可以改）；也可以打 `/game nimmt play <牌號>`',
  '• `/game nimmt cancel`：取消遊戲（房主）',
  '出的牌比四列都小時，用頻道按鈕選一列收走；有人累積 66 個牛頭時，打完這一輪就結束，最少的人獲勝',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const WAVELENGTH_HELP = [
  '*心電感應指令*',
  '• `/game wavelength new`：開房（任何人）',
  '• `/game wavelength start`：開始遊戲，需要 4～12 位真人（房主）',
  '• 出題：輪到你時按「✍️ 寫提示」輸入提示詞；也可以打 `/game wavelength clue <提示>`',
  '• `/game wavelength cancel`：取消遊戲（房主）',
  '猜位置、猜左右都用頻道按鈕',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const UNDERCOVER_HELP = [
  '*誰是臥底指令*',
  '• `/game undercover new`：開房（任何人）',
  '• `/game undercover addbot [數量]`：加入 bot 補人數（房主，開始前）',
  '• `/game undercover removebot [數量]`：移除 bot（房主，開始前）',
  '• `/game undercover start`：開始遊戲，需要 4～12 人（房主）',
  '• `/game undercover next`：跳過目前的描述者（房主）',
  '• `/game undercover vote`：結束描述，直接投票（房主）',
  '• `/game undercover cancel`：取消遊戲（房主）',
  '• `/game undercover guess <詞>`：被投出去的白板猜平民詞（60 秒內）',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const SPYFALL_HELP = [
  '*間諜危機指令*',
  '• `/game spyfall new`：開房（任何人）',
  '• `/game spyfall addbot [數量]`：加入 bot 補人數（房主，開始前）',
  '• `/game spyfall removebot [數量]`：移除 bot（房主，開始前）',
  '• `/game spyfall start`：開始遊戲，需要 4～10 人（房主）',
  '• `/game spyfall next`：跳過目前卡住的提問或回答（房主）',
  '• `/game spyfall vote`：結束提問，直接投票（房主）',
  '• `/game spyfall cancel`：取消遊戲（房主）',
  '• `/game spyfall guess <地點>`：間諜猜地點（提問期間一次，或被指控後 60 秒內）',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const AVALON_HELP = [
  '*阿瓦隆指令*',
  '• `/game avalon new`：開房（任何人）',
  '• `/game avalon addbot [數量]`：加入 bot 補人數（房主，開始前）',
  '• `/game avalon removebot [數量]`：移除 bot（房主，開始前）',
  '• `/game avalon start`：開始遊戲，需要 5～10 人（房主）',
  '• `/game avalon next`：跳過目前的發言者（房主）',
  '• `/game avalon cancel`：取消遊戲（房主）',
  '選隊員、投票、出任務、刺殺都用按鈕',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const CODENAMES_HELP = [
  '*機密代號指令*',
  '• `/game codenames new`：開房（任何人）',
  '• `/game codenames start`：開始遊戲，需要 4～12 位真人（房主）',
  '• `/game codenames clue <詞> <數字>`：隊長給提示，數字 1～9',
  '• `/game codenames next`：直接結束目前隊伍的回合（房主）',
  '• `/game codenames cancel`：取消遊戲（房主）',
  '翻牌、結束猜牌都用按鈕',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const LIARSDICE_HELP = [
  '*吹牛骰指令*',
  '• `/game liarsdice new`：開房（任何人）',
  '• `/game liarsdice addbot [數量]`：加入 bot 補人數（房主，開始前）',
  '• `/game liarsdice removebot [數量]`：移除 bot（房主，開始前）',
  '• `/game liarsdice start`：開始遊戲，需要 2～8 人（房主）',
  '• `/game liarsdice bid <數量> <點數>`：喊「全場至少有 N 個 X 點」（輪到你時）',
  '• `/game liarsdice cancel`：取消遊戲（房主）',
  '覺得上一個喊數是吹牛就按「開！」；1 點是萬用，這一輪有人喊過 1 點就不再萬用',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const JUSTONE_HELP = [
  '*一字千金指令*',
  '• `/game justone new`：開房（任何人）',
  '• `/game justone start`：開始遊戲，需要 3～7 位真人（房主）',
  '• `/game justone clue <詞>`：給一個提示（猜詞以外的人，其他人看不到你打的字）',
  '• `/game justone guess <詞>`：猜詞（猜詞的人），沒把握可以按「跳過」',
  '• `/game justone next`：跳過卡住的步驟（房主）',
  '• `/game justone cancel`：取消遊戲（房主）',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const COUP_HELP = [
  '*政變指令*',
  '• `/game coup new`：開房（任何人）',
  '• `/game coup addbot [數量]`：加入 bot 補人數（房主，開始前）',
  '• `/game coup removebot [數量]`：移除 bot（房主，開始前）',
  '• `/game coup start`：開始遊戲，需要 3～6 人（房主）',
  '• `/game coup cancel`：取消遊戲（房主）',
  '行動、選目標、質疑、阻擋都用頻道按鈕；翻牌和大使交換用私訊按鈕',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const HANABI_HELP = [
  '*花火指令*',
  '• `/game hanabi new`：開房（任何人）',
  '• `/game hanabi start`：開始遊戲，需要 2～5 位真人（房主）',
  '• 棄牌堆：隨時按「🗑️ 棄牌堆」查看已經棄掉和失誤的牌（只有你看得到）',
  '• 給提示：輪到你時按「💡 給提示」選人和顏色或數字（花 1 個提示標記）；也可以打 `/game hanabi hint @某人 紅` 或 `/game hanabi hint @某人 3`',
  '• `/game hanabi cancel`：取消遊戲（房主）',
  '看牌、出牌、棄牌都用頻道按鈕',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

// Slack 的 *粗體* 和 `程式碼` 標記外側不能緊貼文字；中文沒有空格，緊貼中文或全形標點時補一個空格
const SAFE_EDGE = /[\s!-/:-@[-`{-~]/;
export function slackText(text: string): string {
  return text.replace(/`[^`\n]+`|\*[^*\n]+\*/g, (m: string, offset: number, all: string) => {
    const before = all[offset - 1];
    const after = all[offset + m.length];
    return `${before && !SAFE_EDGE.test(before) ? ' ' : ''}${m}${after && !SAFE_EDGE.test(after) ? ' ' : ''}`;
  });
}

// 遊戲大廳：每款遊戲一列，附「開房」按鈕
const CATALOG: { kind: Kind; category: string; emoji: string; name: string; players: string; desc: string }[] = [
  { kind: 'werewolf', category: 'deduction', emoji: '🐺', name: '狼人殺', players: '6～12 人', desc: '陣營推理，夜晚私訊行動、白天輪流發言投票' },
  { kind: 'undercover', category: 'deduction', emoji: '🕵️', name: '誰是臥底', players: '4～12 人', desc: '每人一個詞，輪流描述、投票找出拿到不同詞的臥底' },
  { kind: 'spyfall', category: 'deduction', emoji: '📍', name: '間諜危機', players: '4～10 人', desc: '只有間諜不知道地點，接力提問、投票抓間諜' },
  { kind: 'avalon', category: 'deduction', emoji: '🏰', name: '阿瓦隆', players: '5～10 人', desc: '好人對壞人，隊長組隊出任務，沒有人會出局' },
  { kind: 'codenames', category: 'team', emoji: '🟥', name: '機密代號', players: '4～12 人', desc: '紅藍兩隊比賽，隊長用一個詞當提示翻字卡' },
  { kind: 'liarsdice', category: 'bluff', emoji: '🎲', name: '吹牛骰', players: '2～8 人', desc: '偷偷擲骰子，輪流喊數或開，輸的人少一顆骰子' },
  { kind: 'justone', category: 'coop', emoji: '💡', name: '一字千金', players: '3～7 人', desc: '合作猜詞，大家各給一個提示，重複的會被刪掉' },
  { kind: 'coup', category: 'bluff', emoji: '👑', name: '政變', players: '3～6 人', desc: '虛張聲勢，宣稱任何角色的能力，質疑或阻擋' },
  { kind: 'hanabi', category: 'coop', emoji: '🎆', name: '花火', players: '2～5 人', desc: '合作遊戲，看得到別人的牌、看不到自己的' },
  { kind: 'wavelength', category: 'team', emoji: '📡', name: '心電感應', players: '4～12 人', desc: '兩隊對抗，出題者用一個詞讓隊友猜光譜上的位置' },
  { kind: 'decrypto', category: 'team', emoji: '🔐', name: '截碼戰', players: '4～12 人', desc: '兩隊對抗，用提示傳 3 碼密碼給隊友，也試著攔截對方' },
  { kind: 'nimmt', category: 'bluff', emoji: '🐮', name: '誰是牛頭王', players: '2～10 人', desc: '大家同時出牌，第 6 張和最小的牌要收走整列牛頭' },
];

// 大廳的分類：一次只顯示一類，按上面的分類按鈕切換
const CATEGORIES = [
  { key: 'deduction', label: '🔍 推理' },
  { key: 'team', label: '⚔️ 團隊對抗' },
  { key: 'coop', label: '🤝 合作' },
  { key: 'bluff', label: '🎲 心理戰' },
];

function lobbyBlocks(channel: string, category = CATEGORIES[0].key) {
  return [
    { type: 'section', text: { type: 'mrkdwn', text: slackText('*🎮 遊戲大廳*：選分類，點「開房」就能開一局，你會是房主') } },
    {
      type: 'actions',
      elements: CATEGORIES.map((c, i) => ({ ...button('lobbyTab', i, c.label, channel, c.key), ...(c.key === category ? { style: 'primary' } : {}) })),
    },
    ...CATALOG.map((g, i) => ({ g, i })).filter(({ g }) => g.category === category).map(({ g, i }) => ({
      type: 'section',
      text: { type: 'mrkdwn', text: slackText(`${g.emoji} *${g.name}*（\`${g.kind}\`）${g.players}\n${g.desc}`) },
      accessory: button('lobbyOpen', i, '開房', channel, g.kind),
    })),
    { type: 'context', elements: [{ type: 'mrkdwn', text: slackText(`看指令：\`/game <代號> help\`｜📖 <${WIKI}|wiki>`) }] },
  ];
}

// 只有開房和再來一局會改變頻道目前的遊戲；舊遊戲留下的計時器之後才觸發時不能把按鈕搶回去
const isCreation = (action: { type: string }) => action.type === 'new' || action.type === 'rematch';

const NOT_APPLICABLE = '這個指令不適用於目前的遊戲。';
const BUSY = '這個頻道已經有遊戲了。';

export function parseUndercoverCommand(text: string, user: string, channel: string): UAction | null {
  const [sub, ...rest] = text.trim().split(/\s+/);
  switch (sub) {
    case 'new':
      return { type: 'new', user, channel };
    case 'start':
      return { type: 'start', user };
    case 'cancel':
      return { type: 'cancel', user };
    case 'next':
      return { type: 'skipSpeaker', user };
    case 'vote':
      return { type: 'endDiscussion', user };
    case 'guess':
      return rest.length ? { type: 'guess', user, word: rest.join(' ') } : null;
    case 'addbot':
    case 'removebot': {
      const count = rest[0] === undefined ? 1 : Number(rest[0]);
      if (rest.length > 1 || !Number.isInteger(count) || count < 1) return null;
      return { type: sub === 'addbot' ? 'addBot' : 'removeBot', user, count };
    }
    default:
      return null;
  }
}

// 誰是臥底的按鈕和狼人殺共用 action_id 的種類
function undercoverButton(kind: string, value: string, user: string, channel: string): UAction | null {
  switch (kind) {
    case 'join':
    case 'leave':
    case 'start':
    case 'endSpeech':
      return { type: kind, user };
    case 'dayVote':
    case 'pkVote':
      return { type: 'dayVote', user, target: value };
    case 'rematch':
      return { type: 'rematch', user, channel };
    default:
      return null;
  }
}

// 間諜危機的子指令和誰是臥底一樣，只有 guess 猜的是地點
export function parseSpyfallCommand(text: string, user: string, channel: string): SAction | null {
  const action = parseUndercoverCommand(text, user, channel);
  if (action?.type === 'guess') return { type: 'guess', user, location: action.word };
  return action as SAction | null;
}

// 阿瓦隆的子指令：沒有 vote（組隊投票用按鈕）和 guess
export function parseAvalonCommand(text: string, user: string, channel: string): AAction | null {
  const action = parseUndercoverCommand(text, user, channel);
  if (!action || action.type === 'guess' || action.type === 'endDiscussion') return null;
  return action as AAction;
}

// 機密代號的子指令：clue <詞> <數字>，next 是跳過目前隊伍的回合
export function parseCodenamesCommand(text: string, user: string, channel: string): CAction | null {
  const [sub, ...rest] = text.trim().split(/\s+/);
  if (sub === 'clue') {
    if (rest.length < 2) return null;
    return { type: 'clue', user, word: rest.slice(0, -1).join(' '), count: Number(rest.at(-1)) };
  }
  if (sub === 'next') return { type: 'skipTurn', user };
  const action = parseUndercoverCommand(text, user, channel);
  if (!action || action.type === 'guess' || action.type === 'endDiscussion' || action.type === 'skipSpeaker') return null;
  return action as CAction;
}

// 吹牛骰的子指令：bid <數量> <點數>
export function parseLiarsDiceCommand(text: string, user: string, channel: string): LAction | null {
  const [sub, ...rest] = text.trim().split(/\s+/);
  if (sub === 'bid') return rest.length === 2 ? { type: 'bid', user, quantity: Number(rest[0]), face: Number(rest[1]) } : null;
  const action = parseUndercoverCommand(text, user, channel);
  if (!action || !['new', 'start', 'cancel', 'addBot', 'removeBot'].includes(action.type)) return null;
  return action as LAction;
}

function liarsDiceButton(kind: string, _value: string, user: string, channel: string): LAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start' || kind === 'challenge') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  return null;
}

// 一字千金的子指令：clue <詞>、guess <詞>，next 是跳過卡住的步驟
export function parseJustOneCommand(text: string, user: string, channel: string): JAction | null {
  const [sub, ...rest] = text.trim().split(/\s+/);
  if (sub === 'clue' || sub === 'guess') return rest.length ? { type: sub, user, word: rest.join(' ') } : null;
  if (sub === 'next') return { type: 'skipStep', user };
  const action = parseUndercoverCommand(text, user, channel);
  if (!action || !['new', 'start', 'cancel', 'addBot', 'removeBot'].includes(action.type)) return null;
  return action as JAction;
}

function justOneButton(kind: string, _value: string, user: string, channel: string): JAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start' || kind === 'skipGuess') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  return null;
}

// 政變只有房間指令，遊戲中都用按鈕
export function parseCoupCommand(text: string, user: string, channel: string): KAction | null {
  const action = parseUndercoverCommand(text, user, channel);
  if (!action || !['new', 'start', 'cancel', 'addBot', 'removeBot'].includes(action.type)) return null;
  return action as KAction;
}

function coupButton(kind: string, value: string, user: string, channel: string): KAction | null {
  switch (kind) {
    case 'join':
    case 'leave':
    case 'start':
    case 'challenge':
      return { type: kind, user };
    case 'coupAction':
      return { type: 'act', user, kind: value as Extract<KAction, { type: 'act' }>['kind'] };
    case 'coupTarget':
      return { type: 'target', user, target: value };
    case 'block':
      return { type: 'block', user, role: value as Extract<KAction, { type: 'block' }>['role'] };
    case 'loseCard':
      return { type: 'reveal', user, index: Number(value) };
    case 'keepCard':
      return { type: 'keep', user, index: Number(value) };
    case 'rematch':
      return { type: 'rematch', user, channel };
    default:
      return null;
  }
}

const HANABI_COLORS: Record<string, Color> = { 紅: 'red', 黃: 'yellow', 綠: 'green', 藍: 'blue', 白: 'white' };

// 花火的子指令：hint @某人 <顏色或數字>（開啟 should_escape 後 mention 是 <@U123> 或 <@U123|名字>）
export function parseHanabiCommand(text: string, user: string, channel: string): HAction | null {
  const [sub, ...rest] = text.trim().split(/\s+/);
  if (sub === 'hint') {
    const target = /^<@([A-Z0-9]+)(\|[^>]*)?>$/.exec(rest[0] ?? '')?.[1];
    const value = rest[1] ?? '';
    if (!target || rest.length !== 2) return null;
    if (HANABI_COLORS[value]) return { type: 'hint', user, target, color: HANABI_COLORS[value] };
    if (/^[1-5]$/.test(value)) return { type: 'hint', user, target, number: Number(value) };
    return null;
  }
  const action = parseUndercoverCommand(text, user, channel);
  if (!action || !['new', 'start', 'cancel', 'addBot', 'removeBot'].includes(action.type)) return null;
  return action as HAction;
}

function hanabiButton(kind: string, value: string, user: string, channel: string): HAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'hanabiTurn') return null;
  if (value === 'peek') return { type: 'peek', user };
  if (value === 'discards') return { type: 'discards', user };
  if (value === 'hint') return { type: 'hintMenu', user };
  const [act, arg, hint] = value.split(':');
  if (act === 'hintTarget') return { type: 'hintTarget', user, target: arg };
  if (act === 'hint' && /^[1-5]$/.test(hint)) return { type: 'hint', user, target: arg, number: Number(hint) };
  if (act === 'hint' && hint in COLOR_NAME) return { type: 'hint', user, target: arg, color: hint as Color };
  return act === 'play' || act === 'discard' ? { type: act, user, index: Number(arg) } : null;
}

// 心電感應的子指令：clue <提示>（提示可以有空白）
export function parseWavelengthCommand(text: string, user: string, channel: string): WAction | null {
  const [sub, ...rest] = text.trim().split(/\s+/);
  if (sub === 'clue') return rest.length ? { type: 'clue', user, text: rest.join(' ') } : null;
  const action = parseUndercoverCommand(text, user, channel);
  if (!action || !['new', 'start', 'cancel', 'addBot', 'removeBot'].includes(action.type)) return null;
  return action as WAction;
}

function wavelengthButton(kind: string, value: string, user: string, channel: string): WAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'wavelength') return null;
  if (value === 'clue') return { type: 'openClue', user };
  const [act, arg] = value.split(':');
  if (act === 'guess') return { type: 'guess', user, value: Number(arg) };
  if (act === 'side' && (arg === 'left' || arg === 'right')) return { type: 'side', user, value: arg };
  return null;
}

// 截碼戰的子指令：clue <提示1> / <提示2> / <提示3>（提示可以有空白）
export function parseDecryptoCommand(text: string, user: string, channel: string): DAction | null {
  const [sub, ...rest] = text.trim().split(/\s+/);
  if (sub === 'clue') {
    const texts = rest.join(' ').split('/').map((x) => x.trim());
    return texts.length === 3 && texts.every(Boolean) ? { type: 'clue', user, texts } : null;
  }
  const action = parseUndercoverCommand(text, user, channel);
  if (!action || !['new', 'start', 'cancel', 'addBot', 'removeBot'].includes(action.type)) return null;
  return action as DAction;
}

function decryptoButton(kind: string, value: string, user: string, channel: string): DAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'decrypto') return null;
  if (value === 'clue') return { type: 'openClue', user };
  if (value === 'history') return { type: 'history', user };
  if (value === 'decode' || value === 'intercept') return { type: 'voteMenu', user, mode: value };
  const [act, mode, round, code] = value.split(':');
  if (act === 'vote' && (mode === 'decode' || mode === 'intercept')) return { type: 'vote', user, mode, round: Number(round), code };
  return null;
}

// 誰是牛頭王的子指令：play <牌號>
export function parseNimmtCommand(text: string, user: string, channel: string): NAction | null {
  const [sub, arg] = text.trim().split(/\s+/);
  if (sub === 'play') return /^\d+$/.test(arg ?? '') ? { type: 'pick', user, card: Number(arg) } : null;
  const action = parseUndercoverCommand(text, user, channel);
  if (!action || !['new', 'start', 'cancel', 'addBot', 'removeBot'].includes(action.type)) return null;
  return action as NAction;
}

function nimmtButton(kind: string, value: string, user: string, channel: string): NAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'nimmt') return null;
  if (value === 'hand') return { type: 'hand', user };
  const [act, seq, arg] = value.split(':');
  if (act === 'pick') return { type: 'pick', user, seq: Number(seq), card: Number(arg) };
  if (act === 'row') return { type: 'row', user, seq: Number(seq), row: Number(arg) };
  return null;
}

function codenamesButton(kind: string, value: string, user: string, channel: string): CAction | null {
  switch (kind) {
    case 'join':
    case 'leave':
    case 'start':
    case 'endGuess':
      return { type: kind, user };
    case 'guess':
      return { type: 'guess', user, index: Number(value) };
    case 'rematch':
      return { type: 'rematch', user, channel };
    default:
      return null;
  }
}

function avalonButton(kind: string, value: string, user: string, channel: string): AAction | null {
  switch (kind) {
    case 'join':
    case 'leave':
    case 'start':
    case 'endSpeech':
    case 'confirmTeam':
      return { type: kind, user };
    case 'pickMember':
    case 'assassinate':
      return { type: kind, user, target: value };
    case 'teamVote':
      return value === 'approve' || value === 'reject' ? { type: 'teamVote', user, vote: value } : null;
    case 'quest':
      return value === 'success' || value === 'fail' ? { type: 'quest', user, card: value } : null;
    case 'rematch':
      return { type: 'rematch', user, channel };
    default:
      return null;
  }
}

function spyfallButton(kind: string, value: string, user: string, channel: string): SAction | null {
  switch (kind) {
    case 'join':
    case 'leave':
    case 'start':
    case 'endSpeech':
    case 'endAnswer':
      return { type: kind, user };
    case 'askTarget':
      return { type: 'askTarget', user, target: value };
    case 'dayVote':
    case 'pkVote':
      return { type: 'dayVote', user, target: value };
    case 'rematch':
      return { type: 'rematch', user, channel };
    default:
      return null;
  }
}

export function parseCommand(text: string, user: string, channel: string): Action | null {
  const [sub, arg, ...rest] = text.trim().split(/\s+/);
  if (sub === 'addbot' || sub === 'removebot') {
    const count = arg === undefined ? 1 : Number(arg);
    if (rest.length || !Number.isInteger(count) || count < 1) return null;
    return { type: sub === 'addbot' ? 'addBot' : 'removeBot', user, count };
  }
  switch (text.trim()) {
    case 'new':
      return { type: 'new', user, channel };
    case 'start':
      return { type: 'start', user };
    case 'cancel':
      return { type: 'cancel', user };
    case 'vote':
      return { type: 'endDiscussion', user };
    case 'next':
      return { type: 'skipSpeaker', user };
    default:
      return null;
  }
}

export function buttonAction(kind: string, value: string, user: string, channel = ''): Action | null {
  switch (kind) {
    case 'join':
    case 'leave':
    case 'start':
      return { type: kind, user };
    case 'wolfKill':
      return { type: 'wolfVote', user, target: value };
    case 'seerCheck':
      return { type: 'seerCheck', user, target: value };
    case 'witch':
      return { type: 'witchAct', user, choice: value };
    case 'dayVote':
    case 'pkVote':
      return { type: 'dayVote', user, target: value };
    case 'shoot':
      return { type: 'shoot', user, target: value };
    case 'endSpeech':
      return { type: 'endSpeech', user };
    case 'rematch':
      return { type: 'rematch', user, channel };
    case 'duel':
      return { type: 'duel', user, target: value };
    default:
      return null;
  }
}

// 每個按鈕的 action_id 是 `ww:<kind>:<index>`（同一則訊息裡不能重複），value 是 `<遊戲頻道>|<選項值>`
const button = (kind: string, i: number, label: string, channel: string, value: string) => ({
  type: 'button',
  action_id: `ww:${kind}:${i}`,
  text: { type: 'plain_text', text: label },
  value: `${channel}|${value}`,
});

export class GameHost {
  games = new Map<string, GameState>();
  undercoverGames = new Map<string, UState>();
  spyfallGames = new Map<string, SState>();
  avalonGames = new Map<string, AState>();
  codenamesGames = new Map<string, CState>();
  liarsDiceGames = new Map<string, LState>();
  justOneGames = new Map<string, JState>();
  coupGames = new Map<string, KState>();
  hanabiGames = new Map<string, HState>();
  wavelengthGames = new Map<string, WState>();
  decryptoGames = new Map<string, DState>();
  nimmtGames = new Map<string, NState>();
  private lastKind = new Map<string, Kind>(); // 每個頻道最近一局是哪款遊戲
  private lobbyTs = new Map<string, string>();
  private boardTs = new Map<string, string>(); // 機密代號的牌桌訊息
  private promptTs = new Map<string, { ref: string; ts: string }>(); // 帶 ref 的頻道 prompt：同一個 ref 就更新同一則
  private names = new Map<string, string>();
  private dms = new Map<string, string>(); // user → 私訊頻道
  private wolfChats = new Map<string, { users: string; id: string }>(); // 遊戲頻道 → 狼人多人私訊
  private queue: Promise<void> = Promise.resolve();
  private rng: Rng;
  private gifs: Partial<Record<GifKey, string[]>>;
  private stats?: StatsStore;
  private setTimer: (fn: () => void, ms: number) => void;
  private respond: (url: string, payload: object) => Promise<void>;
  private defs: Record<OtherKind, GameDef>;

  constructor(
    private client: SlackClient,
    opts: HostOptions = {},
  ) {
    this.rng = opts.rng ?? Math.random;
    this.gifs = opts.gifs ?? GIFS;
    this.stats = opts.stats;
    this.setTimer = opts.setTimer ?? ((fn, ms) => void setTimeout(fn, ms));
    this.respond = opts.respond ?? postJson;
    this.defs = {
      undercover: { states: this.undercoverGames, apply: applyUndercover, parse: parseUndercoverCommand, button: undercoverButton, help: UNDERCOVER_HELP },
      spyfall: { states: this.spyfallGames, apply: applySpyfall, parse: parseSpyfallCommand, button: spyfallButton, help: SPYFALL_HELP },
      avalon: { states: this.avalonGames, apply: applyAvalon, parse: parseAvalonCommand, button: avalonButton, help: AVALON_HELP },
      codenames: { states: this.codenamesGames, apply: applyCodenames, parse: parseCodenamesCommand, button: codenamesButton, help: CODENAMES_HELP },
      liarsdice: { states: this.liarsDiceGames, apply: applyLiarsDice, parse: parseLiarsDiceCommand, button: liarsDiceButton, help: LIARSDICE_HELP },
      justone: { states: this.justOneGames, apply: applyJustOne, parse: parseJustOneCommand, button: justOneButton, help: JUSTONE_HELP },
      coup: { states: this.coupGames, apply: applyCoup, parse: parseCoupCommand, button: coupButton, help: COUP_HELP },
      hanabi: { states: this.hanabiGames, apply: applyHanabi, parse: parseHanabiCommand, button: hanabiButton, help: HANABI_HELP },
      wavelength: { states: this.wavelengthGames, apply: applyWavelength, parse: parseWavelengthCommand, button: wavelengthButton, help: WAVELENGTH_HELP },
      decrypto: { states: this.decryptoGames, apply: applyDecrypto, parse: parseDecryptoCommand, button: decryptoButton, help: DECRYPTO_HELP },
      nimmt: { states: this.nimmtGames, apply: applyNimmt, parse: parseNimmtCommand, button: nimmtButton, help: NIMMT_HELP },
    };
  }

  private isOther(kind: string | undefined): kind is OtherKind {
    return kind !== undefined && kind in this.defs;
  }

  // 等目前排隊中的訊息都送完（測試用）
  idle(): Promise<void> {
    return this.queue;
  }

  // 頻道裡正在進行（還沒結束）的是哪款遊戲
  private active(channel: string): Kind | null {
    const w = this.games.get(channel);
    if (w && w.phase !== 'ended') return 'werewolf';
    for (const [kind, def] of Object.entries(this.defs) as [OtherKind, GameDef][]) {
      const st = def.states.get(channel);
      if (st && st.phase !== 'ended') return kind;
    }
    return null;
  }

  // 頻道裡有別款遊戲正在進行
  private blocked(channel: string, kind: Kind): boolean {
    const a = this.active(channel);
    return a !== null && a !== kind;
  }

  private reply(channel: string, user: string, text: string): Promise<void> {
    return this.deliver(channel, [{ type: 'ephemeral', to: user, text }]);
  }

  // `/game <遊戲> <子指令>`
  game(channel: string, user: string, userName: string, text: string): Promise<void> {
    this.names.set(user, userName);
    const [g, ...rest] = text.trim().split(/\s+/);
    const restText = rest.join(' ');
    if (g === 'werewolf') return this.command(channel, user, userName, restText);
    if (this.isOther(g)) return this.play(g, channel, user, restText);
    if (g === 'stats') return this.showStats(channel, user, restText);
    return this.showLobby(channel, user);
  }

  // `/werewolf <子指令>`（也是 `/game werewolf <子指令>`）
  command(channel: string, user: string, userName: string, text: string): Promise<void> {
    this.names.set(user, userName);
    const [sub, ...args] = text.trim().split(/\s+/);
    if (sub === 'stats') return this.showStats(channel, user, args.join(' '));
    const action = parseCommand(text, user, channel);
    if (!action) return this.reply(channel, user, HELP);
    if (this.blocked(channel, 'werewolf')) return this.reply(channel, user, action.type === 'new' ? BUSY : NOT_APPLICABLE);
    return this.dispatch(channel, action);
  }





  // `/game`：只讓輸入的人看到遊戲大廳
  private showLobby(channel: string, user: string, category?: string): Promise<void> {
    this.queue = this.queue
      .then(() => this.client.chat.postEphemeral({ channel, user, text: slackText(GAME_LIST), blocks: lobbyBlocks(channel, category) }))
      .catch((err) => console.error('[werewolf] Slack API error', err));
    return this.queue;
  }

  // `/game <遊戲> <子指令>`（狼人殺以外的遊戲）
  private play(kind: OtherKind, channel: string, user: string, text: string): Promise<void> {
    const def = this.defs[kind];
    const action = def.parse(text, user, channel);
    if (!action) return this.reply(channel, user, def.help);
    if (this.blocked(channel, kind)) return this.reply(channel, user, action.type === 'new' ? BUSY : NOT_APPLICABLE);
    return this.dispatchGame(kind, channel, action);
  }

  dispatchGame(kind: OtherKind, channel: string, action: { type: string }, triggerId?: string): Promise<void> {
    const def = this.defs[kind];
    const prev = def.states.get(channel);
    const { state, events } = def.apply(prev, action, this.rng);
    if (state) {
      def.states.set(channel, state);
      if (state !== prev && isCreation(action)) this.lastKind.set(channel, kind);
    }
    return this.deliver(channel, events, kind, triggerId);
  }

  // 切換大廳分類：用 response_url 換掉原本那則大廳；失敗或沒有時改發一則新的
  private switchLobby(channel: string, user: string, category: string, responseUrl?: string): Promise<void> {
    if (!CATEGORIES.some((c) => c.key === category)) return Promise.resolve();
    const payload = { replace_original: true, text: slackText(GAME_LIST), blocks: lobbyBlocks(channel, category) };
    const replaced = responseUrl ? this.respond(responseUrl, payload).then(() => true) : Promise.resolve(false);
    return replaced
      .catch((err) => (console.error('[werewolf] response_url failed', err), false))
      .then((ok) => (ok ? undefined : this.showLobby(channel, user, category)));
  }

  // triggerId：這次按鈕點擊的 trigger_id，engine 要開視窗時用（3 秒內有效）；responseUrl：換掉 ephemeral 訊息用
  button(actionId: string, value: string, user: string, userName: string, triggerId?: string, responseUrl?: string): Promise<void> {
    this.names.set(user, userName);
    const kind = actionId.split(':')[1];
    const sep = value.indexOf('|');
    const channel = value.slice(0, sep);
    if (kind === 'lobbyTab') return this.switchLobby(channel, user, value.slice(sep + 1), responseUrl);
    if (kind === 'lobbyOpen') {
      const game = value.slice(sep + 1);
      if (game === 'werewolf') return this.command(channel, user, userName, 'new');
      return this.isOther(game) ? this.play(game, channel, user, 'new') : Promise.resolve();
    }
    const last = this.lastKind.get(channel);
    if (this.isOther(last)) {
      const action = this.defs[last].button(kind, value.slice(sep + 1), user, channel);
      return action ? this.dispatchGame(last, channel, action, triggerId) : Promise.resolve();
    }
    const action = buttonAction(kind, value.slice(sep + 1), user, channel);
    return action ? this.dispatch(channel, action) : Promise.resolve();
  }

  // Slack 視窗送出：callback_id 是 `ww:<視窗種類>`，private_metadata 是遊戲頻道，texts 是各欄位依序的內容
  modal(callbackId: string, channel: string, user: string, userName: string, texts: string[]): Promise<void> {
    this.names.set(user, userName);
    if (callbackId === 'ww:wavelengthClue') return this.dispatchGame('wavelength', channel, { type: 'clue', user, text: texts[0] ?? '' } as WAction);
    if (callbackId === 'ww:decryptoClue') return this.dispatchGame('decrypto', channel, { type: 'clue', user, texts } as DAction);
    return Promise.resolve();
  }

  // `/werewolf stats [@某人]`：開啟 should_escape 後，mention 會是 <@U123> 或 <@U123|名字>
  private showStats(channel: string, user: string, arg: string): Promise<void> {
    const target = arg ? /^<@([A-Z0-9]+)(\|[^>]*)?>$/.exec(arg)?.[1] : user;
    const text = target
      ? formatStats(mention(target), this.stats?.stats(channel, target) ?? null)
      : '請用 @ 選擇要查詢的玩家，例如 `/werewolf stats @某人`。';
    return this.deliver(channel, [{ type: 'ephemeral', to: user, text }]);
  }

  // 頻道裡的一般訊息：只在有遊戲進行時交給 engine，engine 只讀不回應
  chat(channel: string, user: string, text: string): Promise<void> {
    if (this.active(channel) !== 'werewolf') return Promise.resolve();
    return this.dispatch(channel, { type: 'chat', user, text });
  }

  dispatch(channel: string, action: Action): Promise<void> {
    const prev = this.games.get(channel);
    const { state, events } = applyAction(prev, action, this.rng);
    if (state) {
      this.games.set(channel, state);
      if (state !== prev && isCreation(action)) this.lastKind.set(channel, 'werewolf');
    }
    return this.deliver(channel, events);
  }





  // 依序送出，避免同一局的訊息順序錯亂
  private deliver(channel: string, events: GameEvent[], kind: Kind = 'werewolf', triggerId?: string): Promise<void> {
    this.queue = this.queue
      .then(async () => {
        for (const e of events) await this.send(channel, e, kind, triggerId);
      })
      .catch((err) => console.error('[werewolf] Slack API error', err));
    return this.queue;
  }

  private async dm(user: string): Promise<string> {
    let id = this.dms.get(user);
    if (!id) {
      id = (await this.client.conversations.open({ users: user })).channel.id as string;
      this.dms.set(user, id);
    }
    return id;
  }

  // 只拉真人狼人；狼人全是 bot 時回傳 null
  private async wolfChat(channel: string, wolves: string[]): Promise<string | null> {
    const users = wolves.filter((w) => !isBot(w)).join(',');
    if (!users) {
      this.wolfChats.delete(channel);
      return null;
    }
    const cached = this.wolfChats.get(channel);
    if (cached?.users === users) return cached.id;
    const id = (await this.client.conversations.open({ users })).channel.id as string;
    this.wolfChats.set(channel, { users, id });
    return id;
  }

  // 把選項文字裡的玩家 id 換成名字（按鈕只能放純文字，不能用 <@id>）
  private label(text: string) {
    return text
      .split(' ')
      .map((t) => this.names.get(t) ?? (isBot(t) ? mention(t) : t))
      .join(' ');
  }

  private async send(channel: string, event: GameEvent, kind: Kind, triggerId?: string) {
    const e = 'text' in event && typeof event.text === 'string' ? ({ ...event, text: slackText(event.text) } as GameEvent) : event;
    const chat = this.client.chat;
    switch (e.type) {
      case 'gameRecord':
        this.stats?.record(channel, e.winner, e.players);
        return;
      case 'startTimer':
        this.setTimer(() => {
          const timeout = { type: 'timeout' as const, id: e.id };
          if (this.isOther(kind)) void this.dispatchGame(kind, channel, timeout);
          else void this.dispatch(channel, timeout);
        }, e.ms);
        return;
      case 'dm':
        if (isBot(e.to)) return;
        await chat.postMessage({ channel: await this.dm(e.to), text: e.text });
        return;
      case 'wolfChat': {
        const id = await this.wolfChat(channel, e.wolves);
        if (id) await chat.postMessage({ channel: id, text: e.text });
        return;
      }
      case 'prompt': {
        if ((e.audience === 'user' || e.audience === 'ephemeral') && isBot(e.user!)) return;
        const elements = e.options.map((o, i) => button(e.kind, i, this.label(o.label), channel, o.value));
        const size = e.perRow ?? elements.length;
        const rows = Array.from({ length: Math.ceil(elements.length / size) }, (_, r) => elements.slice(r * size, r * size + size));
        const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: e.text } }, ...rows.map((row) => ({ type: 'actions', elements: row }))];
        // 只讓某人看到的按鈕選單（例如花火的給提示）
        if (e.audience === 'ephemeral') {
          await chat.postEphemeral({ channel, user: e.user!, text: e.text, blocks });
          return;
        }
        const target =
          e.audience === 'channel' ? channel : e.audience === 'wolves' ? this.wolfChats.get(channel)?.id : await this.dm(e.user!);
        if (!target) return;
        const saved = e.audience === 'channel' && e.ref ? this.promptTs.get(channel) : undefined;
        if (saved && saved.ref === e.ref) {
          await chat.update({ channel, ts: saved.ts, text: e.text, blocks });
          return;
        }
        const res = await chat.postMessage({ channel: target, text: e.text, blocks });
        if (e.audience === 'channel' && e.ref) this.promptTs.set(channel, { ref: e.ref, ts: res.ts });
        return;
      }
      case 'announce': {
        const urls = (e.gif && this.gifs[e.gif]) || [];
        if (!urls.length) {
          await chat.postMessage({ channel, text: e.text });
          return;
        }
        const url = urls[Math.floor(this.rng() * urls.length)];
        const blocks = [
          { type: 'section', text: { type: 'mrkdwn', text: e.text } },
          { type: 'image', image_url: url, alt_text: e.gif },
        ];
        await chat.postMessage({ channel, text: e.text, blocks });
        return;
      }
      case 'modal':
        try {
          if (!triggerId) throw new Error('missing trigger_id');
          await this.client.views.open({
            trigger_id: triggerId,
            view: {
              type: 'modal',
              callback_id: `ww:${e.kind}`,
              private_metadata: channel,
              title: { type: 'plain_text', text: e.title },
              submit: { type: 'plain_text', text: '送出' },
              close: { type: 'plain_text', text: '取消' },
              blocks: (e.fields ?? [e.label]).map((label, i) => ({
                type: 'input',
                block_id: e.fields ? `f${i}` : 'text',
                label: { type: 'plain_text', text: label },
                element: { type: 'plain_text_input', action_id: 'text' },
              })),
            },
          });
        } catch (err) {
          console.error('[werewolf] views.open failed', err);
          const cmd = e.kind === 'decryptoClue' ? '/game decrypto clue <提示1> / <提示2> / <提示3>' : '/game wavelength clue <提示>';
          await chat.postEphemeral({ channel, user: e.to, text: slackText(`視窗打不開，請改用 \`${cmd}\` 送出提示。`) });
        }
        return;
      case 'ephemeral':
        if (isBot(e.to)) return;
        await chat.postEphemeral({ channel, user: e.to, text: e.text });
        return;
      case 'lobby': {
        const title = e.title ?? '狼人殺';
        const rules = `${WIKI}/${encodeURI(`${title}-遊戲規則`)}`;
        const text = `${title}房間（房主 ${mention(e.host)}）\n玩家（${e.players.length}/${MAX_PLAYERS}）：${e.players.map(mention).join(' ')}\n📖 第一次玩？先看 <${rules}|${title}遊戲規則>`;
        const blocks: unknown[] = [{ type: 'section', text: { type: 'mrkdwn', text } }];
        if (e.open) {
          const elements = [
            button('join', 0, '加入', channel, 'join'),
            button('leave', 1, '離開', channel, 'leave'),
            { ...button('start', 2, '開始遊戲', channel, 'start'), style: 'primary' },
          ];
          blocks.push({ type: 'actions', elements });
        }
        const ts = this.lobbyTs.get(channel);
        if (ts) {
          await chat.update({ channel, ts, text, blocks });
        } else {
          const res = await chat.postMessage({ channel, text, blocks });
          this.lobbyTs.set(channel, res.ts);
        }
        if (!e.open) {
          this.lobbyTs.delete(channel);
          this.boardTs.delete(channel); // 新的一局開始，牌桌要重新貼
        }
        return;
      }
      case 'board': {
        const blocks = [
          { type: 'section', text: { type: 'mrkdwn', text: e.text } },
          ...e.rows.map((row) => ({
            type: 'actions',
            elements: row.map((b) => ({ ...button('guess', Number(b.value), b.label, channel, b.value), ...(b.style ? { style: b.style } : {}) })),
          })),
        ];
        const ts = this.boardTs.get(channel);
        if (ts) {
          await chat.update({ channel, ts, text: e.text, blocks });
        } else {
          const res = await chat.postMessage({ channel, text: e.text, blocks });
          this.boardTs.set(channel, res.ts);
        }
        return;
      }
    }
  }
}
