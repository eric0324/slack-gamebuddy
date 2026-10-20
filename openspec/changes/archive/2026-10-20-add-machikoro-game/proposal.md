## Why

心理戰分類想要一款「純靠骰子和經營、規則一看就懂」的輕鬆遊戲。骰子街 (Machi Koro) 每回合擲骰、大家的建築一起收錢、再買一棟，誰先蓋好所有地標誰贏；不用打字、沒有隱藏資訊，2～5 人都能玩，回合面板、私人選單、bot 都能沿用富饒之城和矮人礦坑的做法。加上港口擴充後支援 5 人，而且「市場」每局只開 10 種建築，每局都不一樣。

## What Changes

- 新增遊戲「🏘️ 骰子街」(代號 `machikoro`)，2～5 人，支援 bot (`addbot`／`removebot`)，大廳分類「🎲 心理戰」(category `bluff`)。🎲 已被吹牛骰使用，所以改用 🏘️
- 照原版 (Machi Koro 基本版＋港口擴充 Harbor Expansion) 規則：
  - 每人起始 3 元、麥田、麵包店，以及已經蓋好的市政廳
  - 一般建築 25 種：藍色 (任何人擲到都收錢)、綠色 (自己擲到收錢)、紅色 (別人擲到時向他收錢)、紫色 (自己擲到時的大型效果，每人每種最多 1 張)
  - 地標 6 個：港口 2、火車站 4、購物中心 10、遊樂園 16、廣播塔 22、機場 30；先蓋好全部 6 個的人立刻獲勝
  - 回合：擲骰 (有火車站可選 1 或 2 顆)→ 結算 (紅 → 藍綠 → 紫)→ 從市場買 1 棟建築或蓋 1 個地標，或不買
  - 港口版「市場」：洗好所有一般建築，翻到出現 10 種不同建築為止，同名疊在一起；市場只賣這 10 種，買完某種就補到 10 種
  - 地標效果：火車站可擲 2 顆、購物中心讓杯子和麵包類建築多收 1 元、遊樂園擲出相同點數再一回合、廣播塔每回合可重擲一次、港口擲到 10 以上可 +2、機場這回合沒買東西拿 10 元、市政廳買東西前沒錢拿 1 元
- 介面只用按鈕：頻道回合面板 (原地更新) 附「🏘️ 行動」「📋 城鎮一覽」；輪到的人按「行動」看到目前這一步的按鈕 (擲 1 顆／擲 2 顆、保留／重擲、港口 +2／不加、電視台選人、商業中心換建築、買建築／不買)，私人選單原地換內容，按鈕 value 帶 `seq` 擋過期
- 骰子用 engine 傳入的 `rng`，方便測試
- 頻道訊息以文字為主：建築名、顏色 (藍／綠／紅／紫)、金額用文字，不用 emoji 代表物品
- 每個回合 60 秒；真人逾時時系統代為完成：照 bot 的規則擲骰、不重擲、港口照 bot 規則、電視台拿錢最多的對手、商業中心不換、不買建築
- 為了保證會結束：第 30 輪結束還沒有人蓋好全部地標就直接比「地標數，再比金錢」(原版沒有，需要使用者確認)
- bot 用簡單、可測試的固定規則：骰子顆數、重擲、港口 +2、電視台、買建築的順序
- 結束送出 `result` 事件；附「再來一局」；房主可取消；一個頻道一局

### 誰算贏 (戰績)

遊戲正常結束時送出 `{ type: 'result', players, winners }`：`players` 是所有玩家。
- 有人蓋好全部 6 個地標：`winners` 只有他一人
- 到第 30 輪上限：`winners` 是地標數最多的玩家，同數比現金，都一樣就並列

取消的遊戲不送 `result`；有 bot 的遊戲由戰績模組照既有規則不記錄。

## Capabilities

### New Capabilities
- `machikoro/setup`：房間、bot 加減、起始資源、建築與地標資料、市場、開局公告、遊戲清單與指令說明
- `machikoro/turns`：回合順序、回合面板與私人選單、擲骰 (1／2 顆、廣播塔重擲、港口 +2)、買建築、遊樂園再一回合、計時與逾時、輪數上限
- `machikoro/buildings`：結算順序 (紅 → 藍綠 → 紫) 與每種建築、地標的效果，包括電視台、商業中心的互動
- `machikoro/scoring`：勝利條件、輪數上限的判定、結束公告、`result`、再來一局、房主取消
- `machikoro/bots`：bot 的擲骰、重擲、港口、紫色建築、買建築策略，一個真人也能玩完

### Modified Capabilities
- 無。`game-commands` (大廳 🎲 心理戰分類加上骰子街)、`player-stats` (獲勝規則表加上骰子街) 由主控在 register change 統一寫

## Impact

- Code：新增 `src/machikoro.ts` (engine，用 `src/common.ts` 的 `runGame`、`joinRoom`、`leaveRoom`、`addBots`、`removeBots`、`cancelGame`、`shuffle`、`reply`、`startTimer`、`lobbyEvent`)；新增 `src/machikoroCards.ts` (建築與地標資料、結算的純函式)；新增 `src/games/machikoro.ts` (`GameDef`)；`src/games/index.ts` 的 `GAMES` 加一行 (主控整合時做)。不需要新的 GameEvent 種類、不需要 modal、不需要改 `src/slack.ts`
- Tests：新增 `test/machikoro.test.ts`；`test/slack.test.ts` (KINDS、大廳心理戰分類) 和 `test/characterization.test.ts` 的 KINDS 與 snapshot (主控整合時做)
- Docs：README (遊戲列表、wiki 連結、manifest description／usage_hint)、wiki 三頁 (骰子街、骰子街-遊戲規則、骰子街-指令)(主控整合時做)
