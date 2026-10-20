// 用固定句型比對真人在頻道打的字，讓 bot 參考。只負責拆解訊息，要怎麼用由 engine 決定。
// 句型依這局的語系：中文局比對中文，英文局比對英文
import type { Lang } from './i18n/index.js';

export interface ChatInfo {
  seerClaim: boolean; // 自稱預言家
  godClaim?: 'witch' | 'knight'; // 自稱神職
  wolf: string[]; // 被說是狼人的玩家
  good: string[]; // 被說是好人的玩家
  suspect: string[]; // 被懷疑的玩家
}

const GOD_CLAIMS = { 女巫: 'witch', 騎士: 'knight' } as const;

// 找出這一段提到的玩家：Slack mention (<@U123> 或 <@U123|名字>) 或 bot 的名字 (不分大小寫、要完整比對)
function mentioned(segment: string, players: string[]): string[] {
  const found = new Set<string>();
  for (const m of segment.matchAll(/<@([A-Z0-9]+)(?:\|[^>]*)?>/g)) if (players.includes(m[1])) found.add(m[1]);
  for (const id of players) {
    const name = id.startsWith('bot:') ? id.split(':')[2] : undefined;
    if (name && new RegExp(`(?<![A-Za-z])${name}(?![A-Za-z])`, 'i').test(segment)) found.add(id);
  }
  return [...found];
}

function classify(segment: string): 'wolf' | 'good' | 'suspect' | null {
  if (/金水/.test(segment)) return 'good';
  if (/查殺|是狼|狼人|壞人/.test(segment)) return 'wolf';
  if (/好人/.test(segment)) return 'good';
  if (/可疑|懷疑|投|有問題|狼/.test(segment)) return 'suspect';
  return null;
}

// 英文句型：「not a wolf」算好人，要先比對
function classifyEn(segment: string): 'wolf' | 'good' | 'suspect' | null {
  if (/\bnot (a )?(were)?wolf\b|\b(good|innocent|clear|cleared)\b/i.test(segment)) return 'good';
  if (/\b(were)?wolf\b|\bbad\b/i.test(segment)) return 'wolf';
  if (/\b(sus|suspicious|suspect|shady|vote)\b/i.test(segment)) return 'suspect';
  return null;
}

export function parseChat(text: string, players: string[], lang?: Lang): ChatInfo {
  const en = lang === 'en';
  const info: ChatInfo = { seerClaim: en ? /\bI(?:'m| am)(?: the| a)? seer\b/i.test(text) : /我(是)?預言家/.test(text), wolf: [], good: [], suspect: [] };
  if (en) {
    const god = /\bI(?:'m| am)(?: the| a)? (witch|knight)\b/i.exec(text)?.[1].toLowerCase() as 'witch' | 'knight' | undefined;
    if (god) info.godClaim = god;
  } else {
    const god = /我是(女巫|騎士)/.exec(text)?.[1] as keyof typeof GOD_CLAIMS | undefined;
    if (god) info.godClaim = GOD_CLAIMS[god];
  }
  for (const segment of text.split(/[，。、；！？,.;!?\n]+/)) {
    const targets = mentioned(segment, players);
    const kind = en ? classifyEn(segment) : classify(segment);
    if (targets.length === 1 && kind) info[kind].push(targets[0]);
  }
  return info;
}
