// 梗圖大亂鬥的頻道梗圖庫指令：/game meme add|list|remove。不進遊戲 engine，由 adapter 直接處理，回傳要送出的事件
import { mention, type GameEvent } from './engine.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/memeLibrary.js';
import type { MemeStore } from './memeStore.js';

const MAX_NAME = 20;

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

// lang：頻道目前的語系 (梗圖庫和進行中的遊戲無關)
export async function memeLibraryCommand(store: MemeStore, check: (url: string) => Promise<boolean>, channel: string, user: string, text: string, lang?: Lang): Promise<GameEvent[]> {
  const [sub, raw, ...rest] = text.trim().split(/\s+/);
  const url = raw && unescapeUrl(raw);
  const usage = tx(lang, 'usage');
  if (sub === 'list') {
    const memes = store.list(channel);
    if (!memes.length) return eph(user, tx(lang, 'empty', { usage }));
    return eph(user, [tx(lang, 'listTitle', { n: memes.length }), ...memes.map((m) => `#${m.id} ${m.name} — ${mention(m.by)}`)].join('\n'));
  }
  if (sub === 'remove') {
    const id = Number(raw);
    const meme = Number.isInteger(id) ? store.get(channel, id) : undefined;
    if (!meme) return eph(user, tx(lang, 'notFound'));
    store.remove(channel, id);
    return [{ type: 'announce', text: tx(lang, 'removed', { user: mention(user), id, name: meme.name, by: mention(meme.by) }) }];
  }
  // add
  if (!url) return eph(user, usage);
  if (!/^https:\/\/\S+$/.test(url)) return eph(user, tx(lang, 'needHttps', { usage }));
  const name = rest.join(' ') || tx(lang, 'defaultName');
  if ([...name].length > MAX_NAME) return eph(user, tx(lang, 'nameTooLong', { max: MAX_NAME }));
  const dup = store.findByUrl(channel, url);
  if (dup) return eph(user, tx(lang, 'duplicate', { id: dup.id, name: dup.name }));
  if (!(await check(url))) return eph(user, tx(lang, 'unreachable'));
  const id = store.add(channel, url, name, user);
  return [{ type: 'announce', text: tx(lang, 'added', { user: mention(user), id, name }), image: { url, alt: name } }];
}
