// 詭影神探的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyDeception, type DAction, type DState } from '../deception.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*詭影神探指令*',
  '• `/game deception new`：開房 (任何人)',
  '• `/game deception start`：開始遊戲，需要 4～12 位真人 (房主)',
  '• `/game deception cancel`：取消遊戲 (房主)',
  '• 「🧪 鑑識官放子彈」：鑑識官在回合面板上按，選提示板和選項放子彈 (第 2、3 輪是換一張場景板)',
  '• 「✅ 說完了」：輪到你發言時，說完就按 (90 秒)',
  '• 「🔍 破案」：鑑識官以外每人整局一次，選嫌犯、手段和線索',
  '• 「🗂️ 我的身分」：隨時私下看自己的角色和知道的資訊',
  '討論直接在頻道打字；3 輪都沒人破案，兇手陣營獲勝',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const HELP_EN = [
  '*Deception commands*',
  '• `/game deception new`: open a room (anyone)',
  '• `/game deception start`: start the game, needs 4-12 human players (host)',
  '• `/game deception cancel`: cancel the game (host)',
  '• "🧪 Place bullet": the Forensic Scientist presses it on the round panel to pick a tile and an option for a bullet (in rounds 2 and 3 it replaces a scene tile)',
  '• "✅ Done": press it when you finish speaking on your turn (90 seconds)',
  '• "🔍 Solve": everyone except the Forensic Scientist gets one per game; pick a suspect, a Means and a Clue',
  '• "🗂️ My role": privately check your role and what you know anytime',
  "Discuss by typing in the channel; if nobody solves the case in 3 rounds, the Murderer's team wins",
  `📖 Full guide: <${WIKI}|wiki>`,
].join('\n');

// 詭影神探只有房間指令，遊戲中都用按鈕
export function parseDeceptionCommand(text: string, user: string, channel: string): DAction | null {
  return parseRoomCommand(text, user, channel) as DAction | null;
}

function deceptionButton(kind: string, value: string, user: string, channel: string): DAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'deception') return null;
  if (value === 'solve') return { type: 'solveMenu', user };
  if (value === 'me') return { type: 'me', user };
  const [act, a = '', b = '', c = ''] = value.split(':');
  switch (act) {
    case 'fs':
      return { type: 'fsMenu', user, pseq: Number(a) };
    case 'fback':
      return { type: 'fsBack', user, pseq: Number(a) };
    case 'fb':
      return { type: 'fsBoard', user, pseq: Number(a), slot: b };
    case 'fp':
      return { type: 'fsPlace', user, pseq: Number(a), slot: b, opt: Number(c) };
    case 'fl':
      return { type: 'fsLocation', user, pseq: Number(a), board: Number(b), opt: Number(c) };
    case 'fx':
      return { type: 'fsSwap', user, pseq: Number(a), slot: b };
    case 'fn':
      return { type: 'fsNew', user, pseq: Number(a), slot: b, opt: Number(c) };
    case 'done':
      return { type: 'done', user, tseq: Number(a) };
    case 'nm':
      return { type: 'nightMeans', user, i: Number(a) };
    case 'nc':
      return { type: 'nightClue', user, i: Number(a) };
    case 'sus':
      return { type: 'suspect', user, target: a };
    case 'sm':
      return { type: 'solveMeans', user, target: a, mi: Number(b) };
    case 'sc':
      return { type: 'solve', user, target: a, mi: Number(b), ci: Number(c) };
    case 'sback':
      return a ? { type: 'solveBack', user, target: a } : { type: 'solveBack', user };
    case 'wit':
      return { type: 'witness', user, target: a };
    default:
      return null;
  }
}

export const deception = {
  kind: 'deception' as const,
  emoji: '🔎',
  name: '詭影神探',
  players: '4～12 人',
  category: 'deduction',
  desc: '鑑識官知道答案卻只能用子彈給暗示，大家從每人面前的手段和線索找出兇手用了哪一組，兇手和共犯混在裡面誤導',
  noBots: true,
  help: HELP,
  locales: {
    en: {
      name: 'Deception',
      players: '4-12 players',
      desc: 'The Forensic Scientist knows the answer but can only hint with bullets; find which Means and Clue the Murderer used while the Murderer and Accomplice mislead you',
      help: HELP_EN,
    },
  },
  apply: applyDeception,
  parse: parseDeceptionCommand,
  button: deceptionButton,
} satisfies GameDef<DState, DAction>;
