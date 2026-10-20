## Why

心理戰分類想要一款「同時決定、比膽量」的推坑遊戲。印加寶藏 (Incan Gold／Diamant) 規則一句話講完：一張一張翻探險卡，每一步大家同時決定要繼續挖寶還是帶著寶石回營地；貪心的人可能拿最多，也可能遇到第二張同種危險全部泡湯。3～8 人、一局約 15 分鐘，決定只要兩顆按鈕，和壽司派對「同時選、同時揭曉」的做法相同，不需要新的 Slack 功能。

## What Changes

- 新增遊戲「💎 印加寶藏」(代號 `incan`)，3～8 人，支援 bot (`addbot`／`removebot`)，大廳分類「🎲 心理戰」
- 照官方原版 (Incan Gold) 規則：
  - 探險卡 30 張：寶藏卡 15 張 (1、2、3、4、5、5、7、7、9、11、11、13、14、15、17 顆寶石)、危險卡 5 種各 3 張 (🕷️ 蜘蛛、🐍 毒蛇、🔥 火焰、🪨 落石、🧟 木乃伊)；神器 5 張，每座神殿開始時加 1 張進牌庫
  - 一局 5 座神殿 (5 回合)。每座神殿開始時所有人都在洞裡，每一步翻 1 張牌：
    - 寶藏：洞裡的人平分，餘數留在路上
    - 神器：放在路上
    - 危險：第一張沒事；**同種第二張**出現時探險失敗，洞裡的人失去這座神殿拿到的寶石，那張危險移出這局
  - 沒失敗時，洞裡的人**同時私下**選「🔦 繼續探險」或「⛺ 回營地」，全員選完 (或 30 秒到) 同時揭曉
  - 回營地的人平分路上剩下的寶石 (餘數留在路上)，連同這座神殿拿到的寶石放進帳篷 (安全)；**恰好一人**回營時才拿走路上全部神器
  - 全部人都回營或探險失敗，這座神殿結束；路上沒被拿走的神器移出這局，沒翻到的神器留在牌庫
  - 神器價值照原版：全局第 1～3 個被帶回營地的神器各 5 分，第 4、5 個各 10 分
- 5 座神殿後，帳篷寶石＋神器分數最高者獲勝；同分時神器多者勝；還是同分就並列
- 選擇用頻道步驟訊息上的兩顆按鈕，每位玩家私下看到自己的選擇，揭曉前可以改；頻道訊息用 `ref` 更新「已選 N/M」
- 30 秒到還沒選的真人一律視為回營地
- 帳篷總數只讓本人看到 (每座神殿結束時私下告知)，遊戲結束才公開
- 結束送出 `result` 事件；附「再來一局」；房主可取消；一個頻道一局

### 誰算贏 (戰績)

遊戲正常結束時送出 `{ type: 'result', players, winners }`：`players` 是所有玩家，`winners` 是總分最高的玩家；同分時只有其中神器最多的玩家算贏，神器數也一樣就**全部都算贏** (包括全員 0 分)。取消的遊戲不送 `result`；有 bot 的遊戲由戰績模組照既有規則不記錄。

## Capabilities

### New Capabilities
- `incan/setup`：房間、bot 加減、牌庫與神器、開局公告、遊戲清單與指令說明
- `incan/rounds`：神殿流程、翻牌 (寶藏／神器／危險)、同時選擇、揭曉與回營分寶、神器、神殿結束、計時、勝負與結束
- `incan/bots`：bot 的繼續／回營策略，一個真人也能玩完

### Modified Capabilities
- `game-commands`：「遊戲清單與使用說明」的 🎲 心理戰分類加上印加寶藏 (由主控統一寫 delta)
- `player-stats`：「記錄各遊戲結果」的獲勝規則表加上印加寶藏 (由主控統一寫 delta)

## Impact

- Code：新增 `src/incan.ts` (engine，用 `src/common.ts` 的 `runGame`、`joinRoom`、`leaveRoom`、`addBots`、`removeBots`、`cancelGame`、`shuffle`、`reply`、`startTimer`、`lobbyEvent`)；新增 `src/games/incan.ts` (`GameDef`)；`src/games/index.ts` 的 `GAMES` 加一行。不需要新的 GameEvent 種類、不需要 modal、不需要改 `src/slack.ts`
- Tests：新增 `test/incan.test.ts`；`test/slack.test.ts` (KINDS、大廳心理戰分類)；`test/characterization.test.ts` 的 KINDS 和 snapshot
- Docs：README (遊戲列表、wiki 連結、manifest description／usage_hint)、wiki 三頁 (印加寶藏、印加寶藏-遊戲規則、印加寶藏-指令)
