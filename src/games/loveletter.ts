// 情書的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyLoveLetter, type LAction as LLAction, type LState as LLState, type Role as LLRole } from '../loveletter.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*情書指令*',
  '• `/game loveletter new`：開房 (任何人)',
  '• `/game loveletter addbot [數量]`：加入 bot 補人數 (房主，開始前)',
  '• `/game loveletter removebot [數量]`：移除 bot (房主，開始前)',
  '• `/game loveletter start`：開始遊戲，需要 2～6 人 (房主)',
  '• `/game loveletter cancel`：取消遊戲 (房主)',
  '輪到你時按「🃏 出牌」選牌、目標和 (衛兵) 猜的角色；「👀 我的手牌」「📜 棄牌紀錄」隨時可以按 (只有你看得到)',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

// 情書只有房間指令，出牌都用按鈕
export function parseLoveLetterCommand(text: string, user: string, channel: string): LLAction | null {
  return parseRoomCommand(text, user, channel) as LLAction | null;
}

// value：menu、hand、log、pick:<seq>:<i>、tgt:<seq>:<i>:<目標>、guess:<seq>:<i>:<角色>:<目標>、keep:<seq>:<i> (bot 的 id 有冒號，目標放最後)
function loveLetterButton(kind: string, value: string, user: string, channel: string): LLAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'loveletter') return null;
  if (value === 'menu' || value === 'hand' || value === 'log') return { type: value, user };
  const [act, seqText, indexText, ...rest] = value.split(':');
  const seq = Number(seqText);
  const index = Number(indexText);
  if (act === 'pick' || act === 'keep') return { type: act, user, seq, index };
  if (act === 'tgt') return { type: 'target', user, seq, index, target: rest.join(':') };
  if (act === 'guess') return { type: 'play', user, seq, index, guess: rest[0] as LLRole, target: rest.slice(1).join(':') };
  return null;
}

export const loveLetter = {
  kind: 'loveletter' as const,
  emoji: '💌',
  name: '情書',
  players: '2～6 人',
  category: 'bluff',
  desc: '每人一張手牌，抽一張出一張，推理別人的牌、送出情書',
  help: HELP,
  apply: applyLoveLetter,
  parse: parseLoveLetterCommand,
  button: loveLetterButton,
} satisfies GameDef<LLState, LLAction>;
