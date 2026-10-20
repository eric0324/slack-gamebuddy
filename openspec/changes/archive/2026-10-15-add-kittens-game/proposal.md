## Why

心理戰分類想要一款節奏快、互相陷害的派對卡牌遊戲。炸彈貓 (Exploding Kittens) 規則簡單：輪流抽牌，抽到炸彈又沒有拆解就出局，最後活下來的人贏；手牌私下看、出牌用按鈕，很適合 Slack。2～5 人，可以加 bot，一個人也能玩。

## What Changes

- 新增遊戲「💣 炸彈貓」(代號 `kittens`)，2～5 人，支援 bot (`addbot`／`removebot`)，大廳分類「🎲 心理戰」
- 照官方原版 (Exploding Kittens 基本版) 規則，牌組 56 張：💣 炸彈貓 4、🧯 拆解 6、🚫 反對 5、⚔️ 攻擊 4、⏭️ 跳過 4、🙏 索取 4、🔀 洗牌 4、🔮 預見未來 5、貓咪卡 5 種各 4 張 (🌮 塔可貓、🍉 西瓜貓、🥔 馬鈴薯貓、🧔 鬍子貓、🌈 彩虹貓)
- 開局：先拿掉炸彈和拆解，洗牌後每人發 7 張，再每人發 1 張拆解；多的拆解放回牌堆 (2～3 人只放回 2 張，4～5 人全部放回)，再放入「人數 − 1」張炸彈，洗牌
- 輪到你時可以出任意張功能牌，最後**抽一張牌**結束回合；跳過和攻擊可以不抽牌就結束
- 抽到炸彈：有拆解就自動用掉，然後私下選擇把炸彈放回牌堆的位置 (最上面、第 2 張、第 3 張、最底下、隨機)；沒有拆解就出局
- 攻擊照原版：出攻擊的人不抽牌直接結束，下一位要連續進行 2 回合；被攻擊的人再出攻擊，會結束他剩下的所有回合，換下一位進行 2 回合 (不會累加)
- 一對相同的貓咪卡：指定一位玩家，隨機偷他一張手牌 (**不做三張組合**，見 design)
- 🚫 反對 (使用者決定)：每次打出可以被反對的牌 (攻擊、跳過、索取、洗牌、預見未來、一對貓咪)，頻道公告並等 **5 秒**，任何還活著、手上有反對的玩家都可以按「🚫 反對」；反對也可以被反對 (重新等 5 秒)；5 秒內沒人再按就結算。按鈕對所有人顯示，沒有反對卡的人按了只會私下看到提示，不會洩漏誰有反對
- 頻道牌桌訊息 (同一回合用 `ref` 更新)：輪到誰、這位還要進行幾回合、牌堆剩幾張、每人手牌數、出局的人、這回合出過的牌；按鈕「🃏 我的手牌」「🂠 抽牌」
- 計時：出牌 60 秒 (超時自動抽牌)、反對等待 5 秒、選擇炸彈位置 30 秒 (超時隨機放)、被索取的人選牌 30 秒 (超時隨機給)
- 最後存活的人獲勝；結束公告名次 (出局順序)、送出 `result`、貼「再來一局」
- 再來一局、取消、一個頻道一局、遊戲清單／大廳／help 和其他遊戲相同

### 誰算贏 (戰績)

遊戲正常結束時送出 `{ type: 'result', players, winners }`：`players` 是所有玩家，`winners` 只有最後存活的那一位。取消的遊戲不送 `result`；有 bot 的遊戲由戰績模組照既有規則不記錄。

## Capabilities

### New Capabilities
- `kittens/setup`：房間、bot 加減、牌組與發牌、開局、遊戲清單與說明
- `kittens/rounds`：牌桌訊息、手牌選單、出牌、各功能牌效果、反對、抽牌與炸彈、拆解放置、攻擊回合、計時、出局、勝負與結束
- `kittens/bots`：bot 的出牌、反對、給牌和放炸彈策略，一個真人也能玩完

### Modified Capabilities
- `game-commands`：「遊戲清單與使用說明」的 🎲 心理戰分類加上炸彈貓 (由主控統一寫 delta)
- `player-stats`：「記錄各遊戲結果」的獲勝規則表加上炸彈貓 (由主控統一寫 delta)

## Impact

- Code：新增 `src/kittens.ts` (engine，用 `src/common.ts` 的 `joinRoom`、`leaveRoom`、`addBots`、`removeBots`、`cancelGame`、`runGame`、`shuffle`、`reply`、`startTimer`、`lobbyEvent`)；新增 `src/games/kittens.ts` (`GameDef`)；`src/games/index.ts` 的 `GAMES` 加一行。不需要新的 GameEvent 種類，不需要改 `src/slack.ts`
- Tests：新增 `test/kittens.test.ts`；`test/slack.test.ts` (KINDS、大廳心理戰分類)；`test/characterization.test.ts` 的 KINDS 和 snapshot
- Docs：README (遊戲列表、wiki 連結、manifest description／usage_hint)、wiki 新增「炸彈貓」「炸彈貓-遊戲規則」「炸彈貓-指令」三頁
