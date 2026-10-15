// 圈內人的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyInsider, type IAction, type IState } from '../insider.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*圈內人指令*',
  '• `/game insider new`：開房（任何人）',
  '• `/game insider start`：開始遊戲，需要 4～8 位真人（房主）',
  '• 發問：問答期間直接在頻道打字；也可以打 `/game insider ask <問題>`',
  '• 主持人用自己看得到的按鈕回答是／否／不知道，有人說出答案時按「🎯 猜中了」',
  '• `/game insider vote`：討論中提早開始投票（房主）',
  '• `/game insider cancel`：取消遊戲（房主）',
  '投票找圈內人用頻道按鈕',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

// 圈內人的子指令：ask <問題>（問題可以有空白）、vote（房主提早投票）
export function parseInsiderCommand(text: string, user: string, channel: string): IAction | null {
  const [sub, ...rest] = text.trim().split(/\s+/);
  if (sub === 'ask') return rest.length ? { type: 'ask', user, text: rest.join(' ') } : null;
  if (sub === 'vote') return { type: 'skip', user };
  return parseRoomCommand(text, user, channel) as IAction | null;
}

function insiderButton(kind: string, value: string, user: string, channel: string): IAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'insider') return null;
  if (value === 'skip') return { type: 'skip', user };
  const [act, arg, ans] = value.split(':');
  if (act === 'vote' && arg) return { type: 'vote', user, target: arg };
  if (act === 'answer' && (ans === 'yes' || ans === 'no' || ans === 'unknown' || ans === 'correct')) return { type: 'answer', user, question: Number(arg), answer: ans };
  return null;
}

export const insider = {
  kind: 'insider' as const,
  emoji: '🕴️',
  name: '圈內人',
  players: '4～8 人',
  category: 'deduction',
  desc: '是非題合力猜出答案，再找出知道答案卻裝不知道的圈內人',
  noBots: true,
  help: HELP,
  apply: applyInsider,
  parse: parseInsiderCommand,
  button: insiderButton,
  chat: (user: string, text: string): IAction => ({ type: 'chat', user, text }),
} satisfies GameDef<IState, IAction>;
