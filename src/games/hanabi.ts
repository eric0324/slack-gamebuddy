// 花火的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyHanabi, COLOR_NAME, type Color, type HAction, type HState } from '../hanabi.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*花火指令*',
  '• `/game hanabi new`：開房（任何人）',
  '• `/game hanabi start`：開始遊戲，需要 2～5 位真人（房主）',
  '• 棄牌堆：隨時按「🗑️ 棄牌堆」查看已經棄掉和失誤的牌（只有你看得到）',
  '• 給提示：輪到你時按「💡 給提示」選人和顏色或數字（花 1 個提示標記）；也可以打 `/game hanabi hint @某人 紅` 或 `/game hanabi hint @某人 3`',
  '• `/game hanabi cancel`：取消遊戲（房主）',
  '看牌、出牌、棄牌都用頻道按鈕',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

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
  return parseRoomCommand(text, user, channel) as HAction | null;
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

export const hanabi = {
  kind: 'hanabi' as const,
  emoji: '🎆',
  name: '花火',
  players: '2～5 人',
  category: 'coop',
  desc: '合作遊戲，看得到別人的牌、看不到自己的',
  noBots: true,
  help: HELP,
  apply: applyHanabi,
  parse: parseHanabiCommand,
  button: hanabiButton,
} satisfies GameDef<HState, HAction>;
