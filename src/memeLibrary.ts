// 梗圖大亂鬥的頻道梗圖庫指令：/game meme add|list|remove。不進遊戲 engine，由 adapter 直接處理，回傳要送出的事件
import { mention, type GameEvent } from './engine.js';
import type { MemeStore } from './memeStore.js';

const MAX_NAME = 20;
const DEFAULT_NAME = '自家梗';
const ADD_USAGE = '用法：`/game meme add <圖片網址> [名稱]` (名稱最多 20 字)';

export const LIBRARY_COMMANDS = ['add', 'list', 'remove'];

// 網址要回應成功、而且內容是圖片；5 秒逾時
export async function checkImage(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    await res.body?.cancel();
    return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/');
  } catch {
    return false;
  }
}

// Slack 會把網址包成 <網址> 或 <網址|顯示文字>，& 變成 &amp;
const unescapeUrl = (s: string) => s.replace(/^<([^|>]+)(\|[^>]*)?>$/, '$1').replace(/&amp;/g, '&');

const eph = (to: string, text: string): GameEvent[] => [{ type: 'ephemeral', to, text }];

export async function memeLibraryCommand(store: MemeStore, check: (url: string) => Promise<boolean>, channel: string, user: string, text: string): Promise<GameEvent[]> {
  const [sub, raw, ...rest] = text.trim().split(/\s+/);
  const url = raw && unescapeUrl(raw);
  if (sub === 'list') {
    const memes = store.list(channel);
    if (!memes.length) return eph(user, `這個頻道還沒有投稿的梗圖。\n${ADD_USAGE}`);
    return eph(user, [`🖼️ 這個頻道的投稿梗圖 (${memes.length} 張)：`, ...memes.map((m) => `#${m.id} ${m.name} — ${mention(m.by)}`)].join('\n'));
  }
  if (sub === 'remove') {
    const id = Number(raw);
    const meme = Number.isInteger(id) ? store.get(channel, id) : undefined;
    if (!meme) return eph(user, `找不到這張梗圖，用 \`/game meme list\` 看編號。`);
    store.remove(channel, id);
    return [{ type: 'announce', text: `🗑️ ${mention(user)} 刪掉了 #${id} ${meme.name} (${mention(meme.by)} 投稿)` }];
  }
  // add
  if (!url) return eph(user, ADD_USAGE);
  if (!/^https:\/\/\S+$/.test(url)) return eph(user, `要用 https 開頭的圖片網址。\n${ADD_USAGE}`);
  const name = rest.join(' ') || DEFAULT_NAME;
  if ([...name].length > MAX_NAME) return eph(user, `名稱最多 ${MAX_NAME} 個字。`);
  const dup = store.findByUrl(channel, url);
  if (dup) return eph(user, `這張已經投稿過了 (#${dup.id} ${dup.name})。`);
  if (!(await check(url))) return eph(user, '連不到圖片，請用公開的圖片網址 (例如 Imgur)；Slack 上傳的圖片連結是私人的，不能用。');
  const id = store.add(channel, url, name, user);
  return [{ type: 'announce', text: `🖼️ ${mention(user)} 投稿了一張梗圖：#${id} ${name}`, image: { url, alt: name } }];
}
