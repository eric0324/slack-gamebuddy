// 語系清單和翻譯函式：加新語言時新增一個字典檔，並加進 LANGS 和 DICTS
import { en } from './en.js';
import { zhTW } from './zh-TW.js';

export const LANGS = [
  { code: 'zh-TW', name: '繁體中文' },
  { code: 'en', name: 'English' },
] as const;

export type Lang = (typeof LANGS)[number]['code'];
export type Key = keyof typeof zhTW;
type Params = Record<string, string | number>;
type Dicts<K extends string> = { 'zh-TW': Record<K, string> } & Record<string, Partial<Record<K, string>>>;

const DICTS: Dicts<Key> = { 'zh-TW': zhTW, en };

// 查字典並代入 {參數}；指定語系缺這個 key 時退回 zh-TW
export function lookup<K extends string>(dicts: Dicts<K>, lang: string, key: K, params: Params = {}): string {
  const text = dicts[lang]?.[key] ?? dicts['zh-TW'][key];
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

export const t = (lang: Lang | undefined, key: Key, params?: Params) => lookup(DICTS, lang ?? 'zh-TW', key, params);

export const parseLang = (code: string): Lang | undefined => LANGS.find((l) => l.code.toLowerCase() === code.toLowerCase())?.code;

export const langName = (lang: Lang) => LANGS.find((l) => l.code === lang)!.name;
