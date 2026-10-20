## Why

合作分類目前有一字千金、花火、心電感應 (合作)，都是「猜字／給提示」類型，還沒有合作的吃墩遊戲。星際探險隊 (The Crew: The Quest for Planet Nine) 是合作吃墩：大家不能討論手牌，只靠出牌和每關一次的「通訊」默契合作，讓指定的人吃下指定的牌。它天生是**戰役制**——一關一關變難——很適合固定班底在同一個頻道慢慢打。手牌用私下按鈕選單 (誰是牛頭王的做法)、牌桌用 `ref` 更新同一則訊息 (壽司派對的做法)，進度存在 SQLite (梗圖庫的做法)，不需要新的 Slack 功能。

## What Changes

- 新增遊戲「🚀 星際探險隊」(代號 `crew`)，3～5 位真人，不支援 bot，大廳分類 🤝 合作
- 牌組照原版：40 張牌 (藍、綠、黃、紫 4 色 1～9，加上火箭 1～4)，全部發完 (3 人時有一人多 1 張，最後那張不打)；持有火箭 4 的人是指揮官，先挑任務、先出第一墩
- 吃墩規則照原版：要跟出領出的顏色，沒有才能墊其他顏色或出火箭；有火箭時最大的火箭贏，否則領出顏色最大的贏；贏的人領下一墩
- 任務：每關翻開指定數量的任務牌，從指揮官開始輪流挑；擁有任務的人要親自吃下那張牌。部分關卡有順序標記 (1～5、>～>>>>、Ω)。任務被別人吃走、順序錯了就**立刻失敗**；全部任務完成就**立刻成功**
- 通訊：每人每關一次，在每一墩的第一張牌打出前，公開一張手牌 (不能是火箭) 並標示它是自己該色「最大／唯一／最小」
- 特殊規則 (關卡表決定)：🔇 通訊干擾 (不標示位置)、⏳ 通訊延遲 (第 N 墩起才能通訊)、📴 無線電靜默 (整關不能通訊)、🎖️ 指揮官指派 (指揮官分配任務)、🎯 單人任務 (指揮官選一個人包辦全部任務)、🤒 隊員失能 (指揮官指定一人整關不能贏任何墩)；5 人局另有原版的「轉交任務」規則
- **頻道戰役進度**：自編 40 關 (關卡名稱、劇情全部自編，只沿用通用機制)，難度遞增。頻道記住已解鎖到第幾關，成功解鎖下一關、失敗重打同一關；進度存在 SQLite，bot 重啟後仍在
- 房主在房間階段可以 `/game crew level <n>` 選已解鎖的關卡、`/game crew reset` 重設進度 (要再按一次確認)；任何人可以 `/game crew level` 看已解鎖的關卡
- 不能聊天的規則 Slack 無法強制：開局公告和說明提醒「不要在頻道討論手牌」
- 結束送出 `result` 事件；附「下一關」或「重打」按鈕 (就是再來一局)；房主可取消

### 戰績怎麼記

星際探險隊是合作遊戲，照花火、一字千金、心電感應 (合作) 的做法：**只記場數和全隊分數，不算勝負**。每一關正常結束 (成功或失敗) 時送出 `{ type: 'result', players, winners: [], score }`：
- 成功：`score` 是這一關的關卡編號 (例如通過第 12 關記 12)
- 失敗：`score` 是 0

所以 `/game stats` 的「最高 N 分」就是這個人在這個頻道**最高通過的關卡**，`/game rank crew` 依最高通過關卡排。取消的遊戲不送 `result`。(顯示文字是否改成「最高通過第 N 關」由主控在 `player-stats` delta 決定。)

## Capabilities

### New Capabilities
- `crew/setup`：房間、牌組與發牌、指揮官、看手牌、遊戲清單與指令說明
- `crew/tricks`：出牌、跟牌規則、吃墩判定、出牌計時
- `crew/missions`：任務分配、任務完成與順序標記、成功與失敗、通訊、特殊規則、關卡表、頻道戰役進度、選關與重設、結束

### Modified Capabilities
- `game-commands`：「遊戲清單與使用說明」的 🤝 合作分類加上星際探險隊 (由主控統一寫 delta)
- `player-stats`：「記錄各遊戲結果」的獲勝規則表合作遊戲那一列加上星際探險隊 (score 是通過的關卡編號，失敗記 0)(由主控統一寫 delta)

## Impact

- Code：新增 `src/crew.ts` (engine，用 `src/common.ts` 的 `runGame`、`joinRoom`、`leaveRoom`、`cancelGame`、`shuffle`、`reply`、`startTimer`、`lobbyEvent`)、`src/crewMissions.ts` (自編關卡表)、`src/crewStore.ts` (頻道進度，SQLite，和戰績同一個檔案)、`src/games/crew.ts` (`GameDef`)；`src/games/index.ts` 的 `GAMES` 加一行
- 新增一個 GameEvent：`{ type: 'crewProgress'; unlocked: number }` (engine 要求 adapter 把頻道進度寫進檔案)
- `src/slack.ts`：`HostOptions` 加 `crew?: CrewStore`；`crew` 的 `new` action 由 adapter 帶入頻道目前解鎖的關卡；收到 `crewProgress` 時寫進 `CrewStore`。`src/index.ts` 建立 `CrewStore(statsFile)`
- Tests：新增 `test/crew.test.ts`、`test/crewMissions.test.ts`、`test/crewStore.test.ts`；`test/slack.test.ts` (KINDS、大廳合作分類、進度帶入與寫入)；`test/characterization.test.ts` 的 KINDS 和 snapshot
- Docs：README (遊戲列表、wiki 連結、manifest description／usage_hint)、wiki 三頁 (星際探險隊、星際探險隊-遊戲規則、星際探險隊-指令)
