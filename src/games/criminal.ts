// 犯人在跳舞的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyCriminal, type CAction, type CState } from '../criminal.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*犯人在跳舞指令*',
  '• `/game criminal new`：開房 (任何人)',
  '• `/game criminal addbot [數量]`：加入 bot 補人數 (房主，開始前)',
  '• `/game criminal removebot [數量]`：移除 bot (房主，開始前)',
  '• `/game criminal start`：開始遊戲，需要 3～8 人 (房主)',
  '• `/game criminal cancel`：取消遊戲 (房主)',
  '輪到你時按牌桌上的「🃏 我的手牌」選牌和對象；情報交換、交易、神犬也從這裡私下選 (只有你看得到)',
  '🔪 犯人：手上只剩這張時打出就逃跑成功｜🕵️ 偵探：第 2 圈起指認犯人｜🛡️ 不在場證明：擋偵探｜🤝 共犯：加入犯人陣營',
  '👀 目擊者：偷看一人手牌｜👦 少年：知道誰拿犯人｜🔄 情報交換：各傳一張給下一位｜🗣️ 謠言：從上一位抽一張｜💱 交易：和一人換一張｜🐕 神犬：盲抽一人一張',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

// 犯人在跳舞只有房間指令，出牌都用按鈕
export function parseCriminalCommand(text: string, user: string, channel: string): CAction | null {
  return parseRoomCommand(text, user, channel) as CAction | null;
}

// value：hand、play:<seq>:<i>、target:<seq>:<對象>、give:<seq>:<i>、draw:<seq>:<第幾張> (bot 的 id 有冒號，對象放最後)
function criminalButton(kind: string, value: string, user: string, channel: string): CAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'criminal') return null;
  if (value === 'hand') return { type: 'hand', user };
  const [act, seqText, ...rest] = value.split(':');
  const seq = Number(seqText);
  if (act === 'play' || act === 'give') return { type: act, user, seq, index: Number(rest[0]) };
  if (act === 'target') return { type: 'target', user, seq, target: rest.join(':') };
  if (act === 'draw') return { type: 'draw', user, seq, slot: Number(rest[0]) };
  return null;
}

export const criminal = {
  kind: 'criminal' as const,
  emoji: '🕺',
  name: '犯人在跳舞',
  players: '3～8 人',
  category: 'bluff',
  desc: '每人 4 張牌輪流出，犯人想撐到最後一張逃走，偵探要把他抓出來',
  help: HELP,
  apply: applyCriminal,
  parse: parseCriminalCommand,
  button: criminalButton,
} satisfies GameDef<CState, CAction>;
