## Why

心理戰分類想再多一款「大家同時出牌、不用等人」的輕鬆遊戲。壽司派對 (Sushi Go!) 一局約 15 分鐘、2～5 人，每回合只要從手牌選一張再傳給下一位，全部用按鈕就能玩，節奏和誰是牛頭王很像 (同時選牌、牌桌訊息用 `ref` 更新)，可以沿用同一套做法；計分規則明確，也容易寫成簡單的 bot，一個人加 bot 也能玩。

## What Changes

- 新增遊戲「🍣 壽司派對」(代號 `sushigo`)，2～5 人，支援 bot (`addbot`／`removebot`)，大廳分類「🎲 心理戰」
- 照官方 Sushi Go!(原版) 規則：108 張牌 (天婦羅 14、生魚片 14、煎餃 14、壽司捲 ①×6／②×12／③×8、鮭魚握壽司 10、魷魚握壽司 5、玉子握壽司 5、布丁 10、芥末 6、筷子 4)；每輪手牌 2 人 10 張、3 人 9 張、4 人 8 張、5 人 7 張；共 3 輪
- 每回合大家**同時**選一張牌：
  - 頻道一則牌桌訊息 (同一回合用 `ref` 更新) 顯示「已選 N/M」、還沒選的人、每人這輪已經出的牌、布丁數和累積分數，附「🍣 我的手牌」按鈕
  - 按「🍣 我的手牌」只有自己看到手牌按鈕選單 (相同的牌合併成一顆按鈕並顯示張數)，按一顆就是選這張，揭曉前可以改選
  - 桌上有筷子時，選完第一張會再出現「🥢 用筷子再出一張」選單 (或「不用筷子」)；揭曉時兩張都出，筷子回到手牌
  - 全部選好立刻揭曉；每回合 60 秒，超時沒選的人由系統依 bot 的估分替他出一張 (不使用筷子)
  - 揭曉後把剩下的手牌傳給座位順序的下一位，直到手牌出完
- 每輪結束計分：天婦羅 2 張 5 分、生魚片 3 張 10 分、煎餃 1/3/6/10/15、壽司捲最多 6 分次多 3 分 (平分、無條件捨去)、握壽司 1/2/3、芥末讓之後的一張握壽司 ×3；布丁保留到 3 輪結束才算：最多 +6、最少 −6 (平分、2 人局不扣分)
- 總分最高者勝，同分比布丁多；還是同分就並列獲勝
- 結束公告每人每輪分數、布丁分數、總分和名次，送出 `result` 事件，貼「再來一局」
- 再來一局、取消、一個頻道一局、遊戲清單／大廳／help 和其他遊戲相同

### 誰算贏 (戰績)

遊戲正常結束時送出 `{ type: 'result', players, winners }`：`players` 是所有玩家，`winners` 是總分最高的玩家；同分時只留布丁最多的；還是同分就**全部都算贏**。取消的遊戲不送 `result`；有 bot 的遊戲由戰績模組照既有規則不記錄。

## Capabilities

### New Capabilities
- `sushigo/setup`：房間、bot 加減、牌組與發牌、開局、遊戲清單與說明
- `sushigo/rounds`：同時選牌、手牌選單、筷子、牌桌訊息、揭曉與傳牌、超時、每輪計分、布丁、勝負與結束
- `sushigo/bots`：bot 選牌策略，一個真人也能玩完

### Modified Capabilities
- `game-commands`：「遊戲清單與使用說明」的 🎲 心理戰分類加上壽司派對
- `player-stats`：「記錄各遊戲結果」的獲勝規則表加上壽司派對

## Impact

- Code：新增 `src/sushigo.ts` (engine，用 `src/common.ts` 的 `joinRoom`、`leaveRoom`、`addBots`、`removeBots`、`cancelGame`、`runGame`、`shuffle`、`reply`、`startTimer`、`lobbyEvent`)；新增 `src/games/sushigo.ts` (`GameDef`)；`src/games/index.ts` 的 `GAMES` 最後加一行。不需要新的 GameEvent 種類，不需要改 `src/slack.ts`
- Tests：新增 `test/sushigo.test.ts`；`test/slack.test.ts` (KINDS、大廳心理戰分類)；`test/characterization.test.ts` 的 KINDS；`test/__snapshots__/characterization.test.ts.snap` 預期多一款遊戲的文字
- Docs：README (遊戲列表、wiki 連結、manifest description／usage_hint)、wiki 新增「壽司派對」「壽司派對-遊戲規則」「壽司派對-指令」三頁
