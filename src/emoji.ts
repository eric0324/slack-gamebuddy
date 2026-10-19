// Emoji 傳話（傳情畫意的 emoji 版）遊戲引擎：純邏輯，不碰任何 I/O。
export const MAX_EMOJI = 20;

// 一個 emoji：Slack shortcode、RGI emoji（ZWJ 組合、膚色、國旗、keycap），或單一 pictographic 字元（可接 U+FE0F）
const TOKEN = new RegExp(String.raw`:[a-z0-9_+'\-]+:|\p{RGI_Emoji}|\p{Extended_Pictographic}️?`, 'yv');

// 去掉所有空白後全部是 emoji 時回傳個數，否則回傳 null
export function emojiCount(text: string): number | null {
  const t = text.replace(/\s/g, '');
  if (!t) return null;
  let n = 0;
  for (let i = 0; i < t.length; n++) {
    TOKEN.lastIndex = i;
    const m = TOKEN.exec(t);
    if (!m) return null;
    i += m[0].length;
  }
  return n;
}

export function isEmojiOnly(text: string): boolean {
  const n = emojiCount(text);
  return n !== null && n <= MAX_EMOJI;
}
