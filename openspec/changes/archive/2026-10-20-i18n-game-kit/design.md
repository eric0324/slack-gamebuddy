## Context

`i18n-foundation` 已經有頻道語系、`t()` 共用字典、開房時把 `lang` 存進 state (`runGame`)、GameDef 的 `locales`。接下來 36 款遊戲要分批平行翻譯，這份 design 定下各批共同遵守的寫法。

## Goals / Non-Goals

**Goals:**
- 每款遊戲的翻譯只動自己的檔案 (engine、GameDef、字典檔、測試)，各批不互相衝突
- 中文頻道的輸出完全不變：既有測試是安全網，不准改既有測試的預期值
- 加新語言時，每款遊戲只要在字典檔多一個語系

**Non-Goals:**
- 不改共用房間邏輯 (已在 `i18n-foundation` 完成)

## Decisions

1. **每款遊戲一個字典檔**：`src/i18n/games/<代號>.ts`，用 `gameText()` 定義：
   ```ts
   import { gameText } from '../index.js';
   export const tx = gameText({
     'zh-TW': { yourTurn: '👉 輪到 {who} 了', ... },
     en: { yourTurn: "👉 It's {who}'s turn", ... },
   });
   // engine 裡：tx(s.lang, 'yourTurn', { who: mention(id) })
   ```
   `gameText()` 的型別要求 `en` 的 key 和 `zh-TW` 完全相同 (翻譯好的遊戲不能缺字)，缺字 typecheck 會擋。之後加語言就在同一個檔案多一個語系。
2. **engine 改法**：所有玩家看得到的字串 (公告、prompt、按鈕、私下訊息、DM、說明) 改成 `tx(s.lang, key, params)`；註解和 log 不用翻。state interface 加 `lang?: Lang` (runGame 會填)。字串裡的動態部分一律用 `{參數}`，不要在 engine 裡拼接中英文句子。
3. **中文輸出不變**：`zh-TW` 字典的字串必須和原本的字串一字不差 (包括標點、空白、emoji)。既有測試不准改預期值；跑全部測試確認中文行為完全沒變。
4. **詞庫和題庫**：使用者決定直接翻譯中文詞庫。資料改成依語系分開，例如 `WORDS: Record<Lang, string[]>` 或在原本的資料檔加 `en` 版本；engine 開局時依 `s.lang` 取。英文版數量和中文版相同 (一對一翻譯)，翻不通的詞可以換成意思接近的英文常用詞。
5. **GameDef**：填 `locales.en = { name, players, desc, help }`。`name` 用遊戲的官方英文名 (例如 Liar's Dice、Coup)；`players` 寫成「3-6 players」；`help` 是英文版指令說明 (指令本身本來就是英文)。
6. **玩家輸入**：解析玩家輸入的遊戲 (例如頻道打字猜詞) 依這局語系比對；指令關鍵字本來就是英文，不用改。
7. **測試**：每款遊戲新增英文測試 (放在 `test/<代號>.test.ts` 新的 describe，或新檔 `test/<代號>.en.test.ts`)，至少涵蓋：英文房間開局後主要訊息是英文、主要按鈕是英文、help 英文、詞庫取英文版 (有詞庫的遊戲)。建立英文局的方法：action `{ type: 'new', user, channel, lang: 'en' }`。
8. **spec**：每批一個 change，對 `i18n` capability ADDED 一個 requirement「<遊戲> 的英文版」(只用 ADDED，各批不會互相覆蓋)，情境寫主要訊息和詞庫。各遊戲原本的 spec 不動 (`i18n` 規定英文頻道顯示對應英文)。
9. **wiki**：每款遊戲 3 頁英文版，資料夾和檔名用英文名：`<English Name>/<English-Name>.md`、`<English-Name>-Rules.md`、`<English-Name>-Commands.md` (空白換成 `-`)，內容對應中文版。首頁和側邊欄由主控統一更新。
10. **規則連結**：英文房間的規則連結是 `<英文名稱>-Rules` (空白換成 `-`)，和 wiki 檔名一致。

## Risks / Trade-offs

- [直接翻譯詞庫，部分台灣在地的詞翻成英文會不好玩] → 使用者已決定直接翻譯；翻不通的換成意思接近的英文常用詞
- [各批 agent 寫法不一致] → 這份 design 是各批唯一的依據，主控合併前檢查
- [中文輸出不小心被改到] → 既有測試不准改預期值，全部測試綠燈才能合併
