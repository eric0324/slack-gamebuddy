// 四葉草的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applySoclover, type SCAction, type SCState } from '../soclover.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*四葉草指令*',
  '• `/game soclover new`：開房（任何人）',
  '• `/game soclover start`：開始遊戲，需要 3～6 位真人（房主）',
  '• 寫提示：按「✍️ 寫提示」為 4 片葉子各寫一個提示；也可以打 `/game soclover clue 夏天 / 速度 / 童年 / 冰冷`（用 / 分開，依上、右、下、左葉）',
  '• `/game soclover cancel`：取消遊戲（房主）',
  '排卡用頻道按鈕：選格 → 選卡 → 🔄 旋轉 → ✅ 送出；擺放者以外的人可以按「🙋 換我排」接手',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

// 四葉草的子指令：clue <提示1> / <提示2> / <提示3> / <提示4>（提示可以有空白）
export function parseSocloverCommand(text: string, user: string, channel: string): SCAction | null {
  const [sub, ...rest] = text.trim().split(/\s+/);
  if (sub === 'clue') {
    const texts = rest.join(' ').split('/').map((x) => x.trim());
    return texts.length === 4 && texts.every(Boolean) ? { type: 'clue', user, texts } : null;
  }
  return parseRoomCommand(text, user, channel) as SCAction | null;
}

const OPS = ['slot', 'card', 'rotate', 'back', 'submit', 'take'] as const;

// 盤面按鈕的 value：<seq>:<op>[:<n>]
function socloverButton(kind: string, value: string, user: string, channel: string): SCAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'soclover') return null;
  if (value === 'clue') return { type: 'openClue', user };
  const [seq, op, n] = value.split(':');
  const found = OPS.find((o) => o === op);
  if (!found) return null;
  return { type: 'board', user, seq: Number(seq), op: found, ...(n === undefined ? {} : { n: Number(n) }) };
}

export const soclover = {
  kind: 'soclover' as const,
  emoji: '🍀',
  name: '四葉草',
  players: '3～6 人',
  category: 'coop',
  desc: '全員合作，為自己的四葉草寫提示，大家一起把詞卡排回原位',
  noBots: true,
  help: HELP,
  apply: applySoclover,
  parse: parseSocloverCommand,
  button: socloverButton,
  modals: {
    socloverClue: {
      action: (user: string, texts: string[]): SCAction => ({ type: 'clue', user, texts }),
      fallback: '視窗打不開，請改用 `/game soclover clue <提示1> / <提示2> / <提示3> / <提示4>` 送出提示。',
    },
  },
} satisfies GameDef<SCState, SCAction>;
