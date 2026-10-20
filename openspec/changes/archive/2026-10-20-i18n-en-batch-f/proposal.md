## Why

英文頻道開房時，心電感應、心電感應 (合作)、從眾心理、猜猜看、梗圖大亂鬥、Emoji 傳話、妙語說書人目前還是顯示中文並標示「(中文)」。這批 (批次 F) 依照 `i18n-game-kit` 的 design 把這 7 款遊戲翻成英文，英文頻道的玩家就能完整用英文玩。

## What Changes

- 每款遊戲新增字典檔 `src/i18n/games/<代號>.ts` (用 `gameText()`)，engine 裡玩家看得到的字串改用 `tx(s.lang, key, params)`；zh-TW 字串和原本一字不差
- 各遊戲的 state 加 `lang?: Lang`，開房和再來一局的 action 可以帶 `lang`
- GameDef 填 `locales.en`：Wavelength、Wavelength co-op、Herd Mentality、Wits & Wagers、Meme Battle、Emoji Telephone、Dixit
- 題庫依語系分開，英文版和中文版一對一翻譯、數量相同：光譜卡、從眾心理題目、猜猜看題目 (數字答案維持正確)、梗圖大亂鬥的文字卡和梗圖名稱、Emoji 傳話的題目；妙語說書人的圖卡沒有文字不用翻
- 每款遊戲新增英文測試
- wiki 每款遊戲 3 頁英文版

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `i18n`：新增 7 款遊戲的英文版 requirement

## Impact

- `src/wavelength.ts`、`src/wavecoop.ts`、`src/herd.ts`、`src/wager.ts`、`src/meme.ts`、`src/emoji.ts`、`src/dixit.ts` 和對應的 `src/games/<代號>.ts`
- 題庫：`src/wavelengthCards.ts`、`src/herdQuestions.ts`、`src/wagerQuestions.ts`、`src/memeCards.ts`、`src/memeImages.ts`、`src/emojiPrompts.ts`
- 新增 `src/i18n/games/{wavelength,wavecoop,herd,wager,meme,emoji,dixit}.ts`
- Tests：各遊戲的 `test/<代號>.test.ts` 新增英文 describe
- 不在範圍內：梗圖庫和投稿 (`src/memeLibrary.ts`、`src/memeStore.ts`) 的回覆沒有開房語系，要用頻道語系得改 `src/slack.ts`，另外處理；GameDef `modals` 的 `fallback` 由 `src/slack.ts` 直接使用，目前只有中文
