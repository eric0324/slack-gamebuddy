// 變色龍的 Slack 設定：大廳資訊、指令說明、指令解析、按鈕對應
import { applyChameleon, type CAction as ChAction, type CState as ChState } from '../chameleon.js';
import { WIKI, type GameDef } from './types.js';
import { parseRoomCommand } from './undercover.js';

const HELP = [
  '*變色龍指令*',
  '• `/game chameleon new`：開房 (任何人)',
  '• `/game chameleon start`：開始遊戲，需要 3～8 位真人 (房主)',
  '• 說詞：輪到你時按「✍️ 說詞」輸入一個和祕密詞有關的詞 (不能是主題卡上的詞)；也可以打 `/game chameleon say <詞>`',
  '• `/game chameleon next`：跳過目前的說詞者 (房主)',
  '• `/game chameleon vote`：討論中提早開始投票 (房主)',
  '• `/game chameleon guess <詞或座標>`：被抓到的變色龍猜祕密詞，例如 `B3`；也可以按頻道按鈕',
  '• `/game chameleon cancel`：取消遊戲 (房主)',
  '投票抓變色龍用頻道按鈕；每一步都是 2 分鐘',
  `📖 完整說明：<${WIKI}|wiki>`,
].join('\n');

const HELP_EN = [
  '*The Chameleon commands*',
  '• `/game chameleon new`: open a room (anyone)',
  '• `/game chameleon start`: start the game, needs 3-8 human players (host)',
  '• Saying a word: on your turn press "✍️ Say a word" and enter a word related to the secret word (not a word on the topic card); or type `/game chameleon say <word>`',
  '• `/game chameleon next`: skip the current speaker (host)',
  '• `/game chameleon vote`: start the vote early during discussion (host)',
  '• `/game chameleon guess <word or coordinate>`: the caught chameleon guesses the secret word, e.g. `B3`; or press a channel button',
  '• `/game chameleon cancel`: cancel the game (host)',
  'Vote for the chameleon with the channel buttons; every step is 2 minutes',
  `📖 Full guide: <${WIKI}|wiki>`,
].join('\n');

// 變色龍的子指令：say <詞>、next (房主跳過)、vote (房主提早投票)、guess <詞或座標>
export function parseChameleonCommand(text: string, user: string, channel: string): ChAction | null {
  const [sub, ...rest] = text.trim().split(/\s+/);
  if (sub === 'say') return rest.length ? { type: 'say', user, text: rest.join(' ') } : null;
  if (sub === 'guess') return rest.length ? { type: 'guess', user, text: rest.join(' ') } : null;
  if (sub === 'next') return { type: 'next', user };
  if (sub === 'vote') return { type: 'startVote', user };
  return parseRoomCommand(text, user, channel) as ChAction | null;
}

// value：say、startVote、vote:<userId>、guess:<格子編號>
function chameleonButton(kind: string, value: string, user: string, channel: string): ChAction | null {
  if (kind === 'join' || kind === 'leave' || kind === 'start') return { type: kind, user };
  if (kind === 'rematch') return { type: 'rematch', user, channel };
  if (kind !== 'chameleon') return null;
  if (value === 'say') return { type: 'openSay', user };
  if (value === 'startVote') return { type: 'startVote', user };
  const [act, arg] = value.split(':');
  if (act === 'vote' && arg) return { type: 'vote', user, target: value.slice(5) };
  if (act === 'guess' && /^\d+$/.test(arg ?? '')) return { type: 'guess', user, cell: Number(arg) };
  return null;
}

export const chameleon = {
  kind: 'chameleon' as const,
  emoji: '🦎',
  name: '變色龍',
  players: '3～8 人',
  category: 'deduction',
  desc: '大家各說一個和祕密詞有關的詞，找出不知道祕密詞的變色龍',
  noBots: true,
  locales: { en: { name: 'The Chameleon', players: '3-8 players', desc: "Everyone says a word related to the secret word; find the chameleon who doesn't know it", help: HELP_EN } },
  help: HELP,
  apply: applyChameleon,
  parse: parseChameleonCommand,
  button: chameleonButton,
  modals: {
    chameleonWord: { action: (user: string, texts: string[]): ChAction => ({ type: 'say', user, text: texts[0] ?? '' }), fallback: '視窗打不開，請改用 `/game chameleon say <詞>` 送出。' },
  },
} satisfies GameDef<ChState, ChAction>;
