## 1. 共用正規化

- [x] 1.1 `src/herd.ts` 的 `normalize` 改成 export，不改行為；`npx vitest run test/herd.test.ts` 維持綠燈

## 2. Engine：房間與開局 (src/sameword.ts、src/i18n/games/sameword.ts)

- [x] 2.1 先寫失敗的測試 (`test/sameword.test.ts`)：房間 (3～10 人、加入、離開、房主離開取消、房間已滿、人數不足「至少需要 3 人」、非房主開始被拒、頻道已經有遊戲)；`addbot`／`removebot` 回「同詞相遇不支援 bot」且名單不變；房間公告標題是同詞相遇
- [x] 2.2 先寫失敗的測試：開局公告 (玩家名單、規則摘要含最多 10 輪) 接著出第 1 輪寫詞面板 (1/10、「先隨便想一個詞」、「✍️ 寫詞」按鈕、`ref` 帶 seq、90 秒計時)
- [x] 2.3 實作 engine 和 zh-TW 字典，讓 2.1～2.2 綠燈

## 3. Engine：寫詞、揭曉、判定

- [x] 3.1 先寫失敗的測試：寫詞 (指令與視窗 action、已收到／已更新、21 字被拒、正規化後空白被拒、局外人被拒、面板原地更新已寫 N/M 和還沒寫的人且不洩漏詞、全部寫完立刻揭曉、90 秒逾時用已寫的詞揭曉、舊計時器被忽略)
- [x] 3.2 先寫失敗的測試：出現過的詞 (上一輪別人寫過的被拒並顯示「「X」前面出現過了，換一個詞」、全形／大小寫不同也被拒、被拒後原本的詞不變、同一輪彼此相同可以)；第 2 輪面板列出上一輪每個人的詞
- [x] 3.3 先寫失敗的測試：揭曉 (依玩家順序、沒寫標示「(沒寫)」)；正規化後全部相同 → 相遇成功；子字串不算；有人沒寫 → 不能相遇、不給判定、直接下一輪
- [x] 3.4 先寫失敗的測試：房主判定 (揭曉訊息附「🤝 算相同」「➡️ 下一輪」；算相同 → 相遇成功；下一輪 → 立刻開始下一輪；30 秒逾時 → 下一輪；`same`／`next` 指令；非房主被拒「只有房主可以判定」；舊 seq 的按鈕被忽略且 state 不變)
- [x] 3.5 實作，讓 3.1～3.4 綠燈

## 4. Engine：結束、計分、取消、再來一局

- [x] 4.1 先寫失敗的測試：第 N 輪相遇 → 分數 11 − N，`result` 是 `{ players: 全部, winners: [], score }`；第 10 輪沒相遇 (下一輪或逾時) → 分數 0；結束公告含相遇的詞、輪數、分數和聯想路線 (每輪一行、只列詞、沒寫是「—」)；10 人 10 輪 20 字的結束訊息少於 3000 字；附「再來一局」
- [x] 4.2 先寫失敗的測試：房主取消 (公告取消、沒有 `result`、沒有再來一局)；非房主取消被拒；再來一局只有上一局玩家能按、開新的空房間、按的人當房主；結束後舊的寫詞與判定按鈕被忽略
- [x] 4.3 實作，讓 4.1～4.2 綠燈 (`npx vitest run test/sameword.test.ts`)

## 5. 英文版

- [x] 5.1 先寫失敗的測試 (`test/sameword.en.test.ts`)：英文頻道開局公告、寫詞面板、揭曉、判定按鈕、被拒訊息、結束公告都是英文；字典 zh-TW 和 en 的 key 一致
- [x] 5.2 補上 en 字典，讓 5.1 綠燈

## 6. Slack 設定 (src/games/sameword.ts)

- [x] 6.1 先寫失敗的測試 (放在 `test/sameword.test.ts`，直接測 GameDef)：指令解析 (new、start、cancel、addbot、removebot、`word <有空白的詞>`、same、next、help 與不認識的子指令回 null 讓說明顯示)；按鈕路由 (join、leave、start、rematch、`write`、`same:<seq>`、`next:<seq>`)；modal `samewordWord` 轉成寫詞 action，fallback 有中英文
- [x] 6.2 實作 `GameDef` (`kind: 'sameword'`、`emoji: '💞'`、`name: '同詞相遇'`、`players: '3～10 人'`、`category: 'coop'`、`noBots: true`、desc、help (含 word／same／next)、`locales.en`)，`src/games/index.ts` 的 `GAMES` 最後加一行，讓 6.1 綠燈
- [x] 6.3 `test/slack.test.ts`：`KINDS` 加 `sameword`；大廳 🤝 合作分類列出一字千金、花火、心電感應 (合作)、星際探險隊、同詞相遇 (3～10 人、不支援 bot、開房按鈕)；英文頻道顯示 Same Word 不帶「(中文)」；`/game sameword help` 列出指令
- [x] 6.4 `test/characterization.test.ts` 的 KINDS 加 `'sameword'`，更新 snapshot，確認差異只有多一款遊戲
- [x] 6.5 戰績：在 stats 測試補一個 case，同詞相遇 `result` 帶 score 7 記成合作遊戲 (場數 1、最高分 7、不算勝負)
- [x] 6.6 README：遊戲列表加 Same Word 一行、manifest `usage_hint` 加 `sameword new`

## 7. 整合驗證

- [x] 7.1 跑 `npm test` 和 `npm run typecheck`，全部綠燈
- [x] 7.2 印出一則 4 人局的寫詞面板、揭曉、結束公告範例貼到 PR 說明，請使用者在真的 Slack 確認 (不用真 token 啟動 bot)
