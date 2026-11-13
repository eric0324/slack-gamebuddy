## Why

同詞相遇要大家自己想詞，門檻比較高；默契問答 (In Sync) 換成「每題 2～4 個選項選一個最像你的」，按一下就能玩，結束還能回顧誰跟誰最有默契。題目分 13 個主題，朋友、情侶、同事、家人都有適合的題目，很適合 Slack 頻道。私下作答沿用從眾心理和同詞相遇的「一起揭曉」做法，選項直接用按鈕。

## What Changes

- 新增遊戲「🎯 默契問答」(代號 `sync`，英文名 In Sync)，2～8 位真人，**不支援 bot** (`noBots: true`)，大廳分類「🤝 合作」
- 房主按開始後，頻道出現 13 個主題按鈕讓房主選 (30 秒沒選就是「通用隨機」)：通用隨機、日常偏好、朋友日常、吃喝美食、旅行出遊、電影、音樂、遊戲、足球、原神、心動與戀愛、家人之間、同事同學
  - 「通用隨機」從日常偏好、朋友日常、吃喝美食、旅行出遊四個主題混著抽；其他 8 個是定向題，只有選了那個主題才會出現
- 每局 10 題，每題 2～4 個選項，用按鈕作答，60 秒；**選了就不能改**
- 全員作答或 60 秒到就一起揭曉：每個選項列出選它的人；全員都有作答且選同一個 → 🎯 全員同選。逾時沒作答的人這題不算同選
- 選到相同答案也繼續，一定玩完 10 題
- 結束時公告：全員同選幾題 (分數)、每一對玩家選到一起幾次、10 題的答題記錄；送出 `result` (合作遊戲：`winners: []`、`score` = 全員同選題數)；附「再來一局」；房主可取消
- 題庫自己寫 (不抄原網站)：12 個實際主題各至少 30 題；同一頻道同一主題跨局不重複，抽完才重新洗牌
- 中英文兩種語系都翻好，英文題庫和中文一對一翻譯

## Capabilities

### New Capabilities
- `sync/setup`：房間 (2～8 位真人、不支援 bot)、選主題、題庫、開局公告、大廳與指令說明、語系
- `sync/rounds`：作答 (不能改)、揭曉與全員同選、10 題、結算與答題記錄、取消與再來一局

### Modified Capabilities
- `game-commands`：「遊戲大廳與分類」的 🤝 合作加上默契問答
- `player-stats`：「記錄各遊戲結果」的獲勝規則表加上默契問答

## Impact

- 這個 change 疊在 `add-sameword-game` 上面：兩份 MODIFIED delta 都已經包含同詞相遇，**必須在 `add-sameword-game` 之後歸檔**
- Code：新增 `src/sync.ts` (engine)、`src/syncQuestions.ts` (中文題庫與主題)、`src/syncQuestionsEn.ts` (英文題庫)、`src/i18n/games/sync.ts` (字典)、`src/games/sync.ts` (`GameDef`)；`src/games/index.ts` 加一行。不需要新的 GameEvent 種類、modal 或改 `src/slack.ts`
- Tests：新增 `test/sync.test.ts`、`test/sync.en.test.ts`、`test/syncQuestions.test.ts`；更新 `test/slack.test.ts`、`test/i18n.test.ts`、`test/characterization.test.ts`
- Docs：README (遊戲列表、manifest)
