// 梗圖庫指令 (/game meme add|list|remove) 的字典：zh-TW 和原本的字串一字不差
import { gameText } from '../index.js';

export const tx = gameText({
  'zh-TW': {
    defaultName: '自家梗',
    usage: '用法：`/game meme add <圖片網址> [名稱]` (名稱最多 20 字)',
    empty: '這個頻道還沒有投稿的梗圖。\n{usage}',
    listTitle: '🖼️ 這個頻道的投稿梗圖 ({n} 張)：',
    notFound: '找不到這張梗圖，用 `/game meme list` 看編號。',
    removed: '🗑️ {user} 刪掉了 #{id} {name} ({by} 投稿)',
    needHttps: '要用 https 開頭的圖片網址。\n{usage}',
    nameTooLong: '名稱最多 {max} 個字。',
    duplicate: '這張已經投稿過了 (#{id} {name})。',
    unreachable: '連不到圖片，請用公開的圖片網址 (例如 Imgur)；Slack 上傳的圖片連結是私人的，不能用。',
    added: '🖼️ {user} 投稿了一張梗圖：#{id} {name}',
    notConfigured: '這個 bot 沒有設定梗圖庫。',
  },
  en: {
    defaultName: 'My meme',
    usage: 'Usage: `/game meme add <image URL> [name]` (name up to 20 characters)',
    empty: 'No memes have been submitted in this channel yet.\n{usage}',
    listTitle: '🖼️ Memes submitted in this channel ({n}):',
    notFound: "Couldn't find that meme. Use `/game meme list` to see the numbers.",
    removed: '🗑️ {user} removed #{id} {name} (submitted by {by})',
    needHttps: 'Please use an image URL that starts with https.\n{usage}',
    nameTooLong: 'The name can be at most {max} characters.',
    duplicate: 'That one has already been submitted (#{id} {name}).',
    unreachable: "Couldn't load the image. Please use a public image URL (e.g. Imgur); links to images uploaded to Slack are private and won't work.",
    added: '🖼️ {user} submitted a meme: #{id} {name}',
    notConfigured: "This bot doesn't have a meme library set up.",
  },
});
