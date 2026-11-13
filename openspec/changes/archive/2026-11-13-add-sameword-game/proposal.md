## Why

🤝 合作分類目前只有一字千金、花火、心電感應 (合作)、星際探險隊，還沒有「全員一起把腦迴路對上」的輕量詞語聯想遊戲。同詞相遇 (Same Word Game) 規則只有一句話：大家各自寫一個詞、一起揭曉，再從上一輪的詞找共同聯想，直到所有人寫出同一個詞。不用題庫、3～10 人都能玩，很適合 Slack 頻道。私下寫詞沿用從眾心理的作答視窗和正規化比對。

## What Changes

- 新增遊戲「💞 同詞相遇」(代號 `sameword`，英文名 Same Word)，3～10 位真人，**不支援 bot** (`noBots: true`)，大廳分類「🤝 合作」
- 每輪所有人私下寫一個詞 (1～20 字，90 秒，揭曉前可以改)，全部送出或時間到就一起揭曉
  - 第 1 輪隨便寫；第 2 輪起，寫詞面板顯示上一輪每個人的詞，大家找它們之間的聯繫
  - 前面任何一輪揭曉過的詞 (正規化後相同) 不能再寫，送出時就擋下
- 揭曉時正規化 (同從眾心理：NFKC、英文小寫、去掉空白標點符號) 後所有人的詞都一樣 → 相遇成功
- 字不一樣但意思一樣時，房主有 30 秒可以按「🤝 算相同」直接判定相遇，或按「➡️ 下一輪」；30 秒到自動下一輪。有人沒寫詞的那輪不能算相遇
- 一局最多 10 輪；第 N 輪相遇成功記 11 − N 分 (第 1 輪 10 分、第 10 輪 1 分)；10 輪都沒相遇記 0 分
- 結束公告整局的聯想路線 (每輪每個人的詞)；送出 `result` (合作遊戲：`winners: []`、帶 `score`)；附「再來一局」；房主可取消
- 中英文兩種語系都翻譯好 (英文頻道顯示英文)

## Capabilities

### New Capabilities
- `sameword/setup`：房間 (3～10 位真人、不支援 bot)、開局公告、大廳資訊與指令說明、語系
- `sameword/rounds`：寫詞、不能重複的詞、揭曉與自動比對、房主判定、輪數上限、計分與結束、取消與再來一局

### Modified Capabilities
- `game-commands`：「遊戲大廳與分類」的 🤝 合作加上同詞相遇
- `player-stats`：「記錄各遊戲結果」的獲勝規則表加上同詞相遇

## Impact

- Code：新增 `src/sameword.ts` (engine，用 `src/common.ts` 的 `runGame`、`joinRoom`、`leaveRoom`、`cancelGame`、`reply`、`startTimer`、`lobbyEvent`)、`src/i18n/games/sameword.ts` (zh-TW／en 字典)、`src/games/sameword.ts` (`GameDef`，含寫詞 modal)；`src/games/index.ts` 的 `GAMES` 加一行。不需要新的 GameEvent 種類，不需要改 `src/slack.ts`
- Tests：新增 `test/sameword.test.ts`、`test/sameword.en.test.ts`；更新 `test/slack.test.ts` (KINDS、大廳合作分類)、`test/characterization.test.ts` (KINDS 與 snapshot)
- Docs：README (遊戲列表、manifest `usage_hint`)
