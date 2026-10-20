## 1. 關卡表 (src/crewMissions.ts)

- [x] 1.1 先寫失敗的測試 (`test/crewMissions.test.ts`)：剛好 40 關；名稱、劇情不空白，名稱不重複；任務數 1～10；標記數 ≤ 任務數；數字標記從 1 連續、箭頭從 > 連續、Ω 最多一個；特殊規則只用允許的六種 (延遲 N ≥ 2)；🎯 單人任務不和 🎖️ 指揮官指派、🤒 隊員失能同時出現；每 10 關的平均任務數遞增
- [x] 1.2 新增 `src/crewMissions.ts` (照 design.md 第 7 點的自編關卡表)，讓 1.1 綠燈

## 2. 頻道進度 (src/crewStore.ts)

- [x] 2.1 先寫失敗的測試 (`test/crewStore.test.ts`，用暫存檔)：沒有資料時回傳 1；`set` 後 `get` 拿到新值；不同頻道各自一份；關掉再用同一個檔案開仍然存在
- [x] 2.2 實作 `CrewStore` (照 `src/memeStore.ts`：`better-sqlite3`、`CREATE TABLE IF NOT EXISTS crew_progress`)，讓 2.1 綠燈

## 3. Engine：房間、發牌、開局 (src/crew.ts)

- [x] 3.1 先寫失敗的測試 (`test/crew.test.ts`)：房間 (3～5 人、人數不足、房間已滿、不支援 bot、頻道已經有遊戲)；房間公告顯示關卡資訊；`new` 帶入 `unlocked` 決定預設關卡、全破時預設第 40 關
- [x] 3.2 先寫失敗的測試：40 張牌組；3／4／5 人發牌張數與墩數；手牌排序；火箭 4 的人是指揮官；開局公告 (關卡、劇情、指揮官、規則摘要、不要討論手牌)；手牌私訊；「🃏 手牌」只給自己看、非玩家被拒
- [x] 3.3 實作房間、發牌、開局，讓 3.1～3.2 綠燈

## 4. Engine：任務分配

- [x] 4.1 先寫失敗的測試：抽任務並依順序配標記；一般輪流挑 (指揮官起、依加入順序、不是輪到的人被拒、60 秒逾時挑第一張)；挑完公告每人任務並開始第一墩
- [x] 4.2 先寫失敗的測試：🎖️ 指揮官指派 (要／不要公開、只有指揮官能指定、不平均被拒、90 秒逾時給最少的人)；🎯 單人任務 (任務不公開、可以／不行、不能選自己、選定後翻開、逾時規則)；🤒 隊員失能 (指揮官指定、跳過挑任務、逾時指定下家)
- [x] 4.3 實作任務分配，讓 4.1～4.2 綠燈

## 5. Engine：出牌與吃墩

- [x] 5.1 先寫失敗的測試：牌桌訊息內容與 `ref` 更新同一則；📴 無線電靜默沒有通訊按鈕；指揮官領第一墩、贏家領下一墩；合法牌 (跟花色、沒有時任意、火箭領出跟火箭、領出任意)；不是輪到的人、不合法的牌、過期按鈕被拒
- [x] 5.2 先寫失敗的測試：吃墩判定 (領出顏色最大、其他顏色不會贏、火箭最大)；每墩開始前 10 秒是通訊時間 (出牌被拒、可以通訊、10 秒後才能出牌、出牌計時從 10 秒後開始)；出牌 2 分鐘逾時代出最小合法牌與公告；舊計時器被忽略
- [x] 5.3 實作出牌與吃墩，讓 5.1～5.2 綠燈

## 6. Engine：任務判定

- [x] 6.1 先寫失敗的測試：完成任務；同一墩完成多個；任務被別人吃走失敗；數字標記 (順序正確、同墩 1 和 2、跳號失敗)；Ω (最後完成成功、提前完成失敗)；箭頭 (> 在 >> 之前、同墩完成、順序錯失敗)；失能的人贏墩失敗；全部完成提前成功；牌打完還有任務失敗 (含 3 人局剩下的牌是任務牌)；失敗公告寫明原因
- [x] 6.2 實作任務判定，讓 6.1 綠燈

## 7. Engine：通訊與轉交

- [x] 7.1 先寫失敗的測試：通訊窗口 (墩開始前可以、已有人出牌被拒、領出的人可以先通訊)；選單只列最大／唯一／最小、沒有火箭、只有一張標唯一；公告與牌桌顯示；每關一次；🔇 通訊干擾不公開位置；⏳ 通訊延遲第 N 墩前被拒；📴 無線電靜默不能通訊
- [x] 7.2 先寫失敗的測試：5 人局轉交任務 (第 15 關以後且沒有 🎯／🎖️ 才有按鈕、第一墩出牌前、不能給失能的人、每關一次、公告)；3、4 人局沒有按鈕
- [x] 7.3 實作通訊與轉交，讓 7.1～7.2 綠燈

## 8. Engine：進度、選關、重設、結束

- [x] 8.1 先寫失敗的測試：成功送 `crewProgress { unlocked: max(unlocked, L+1) }` (最多 41)、重打舊關卡不倒退、失敗不送；選關 (房主、已解鎖範圍內、超出範圍被拒、非房主被拒、遊戲開始後被拒、房間公告更新)；`level` 不帶數字列出已解鎖關卡；重設 (確認訊息、按確認才重設、送 `crewProgress { unlocked: 1 }`、房間改第 1 關、公告、非房主被拒)
- [x] 8.2 先寫失敗的測試：結束公告 (結果、原因、剩下的手牌、進度)；`result` (winners 空、成功 score 是關卡編號、失敗 0)；成功貼「🚀 下一關」、第 40 關成功公告全破、失敗貼「🔁 重打」；按鈕開的新房間是對應關卡、只有上一局玩家可以按；房主取消 (沒有 `result`、沒有 `crewProgress`、沒有按鈕)、非房主取消被拒
- [x] 8.3 實作，讓 8.1～8.2 綠燈

## 9. Slack 設定 (src/games/crew.ts 與 adapter)

- [x] 9.1 先寫失敗的測試 (放在 `test/crew.test.ts`，直接測 GameDef 的 parse／button)：指令解析 (new、start、cancel、addbot、level、level <n>、reset、help 與不認識的子指令)；按鈕路由 (hand、play、comm、commCard、pick、assign、answer、solo、sick、transfer、transferTo、resetConfirm、join／leave／start／rematch)
- [x] 9.2 先寫失敗的測試 (`test/slack.test.ts`)：`crew` 的 `new` 帶入 `CrewStore` 的 `unlocked` (沒有 store 時是 1)；收到 `crewProgress` 時寫進 `CrewStore`；`result` 照合作遊戲記錄 score
- [x] 9.3 實作 `src/games/crew.ts` (`GameDef`：kind `crew`、emoji 🚀、name 星際探險隊、players 3～5 人、category `coop`、`noBots`、help、apply、parse、button)；`src/engine.ts` 加 `crewProgress` GameEvent；`src/slack.ts` 的 `HostOptions.crew`、`dispatchGame` 帶入、`send` 寫入；`src/index.ts` 建立 `CrewStore(statsFile)`，讓 9.1～9.2 綠燈
- [x] 9.4 (主控整合時做) 先寫失敗的測試：`KINDS` 加 `crew`；遊戲清單和大廳 🤝 合作分類有 🚀 星際探險隊 (`crew`) 3～5 人 (不支援 bot)；`GAMES` 加一行讓它綠燈
- [x] 9.5 (主控整合時做)`test/characterization.test.ts` 的 KINDS 加 `crew`，確認 snapshot 只多出星際探險隊的文字後更新

## 10. 文件與驗證

- [x] 10.1 README：遊戲列表、wiki 連結、manifest description／usage_hint
- [x] 10.2 wiki 三頁草稿：星際探險隊、星際探險隊-遊戲規則 (含關卡表、不要討論手牌的提醒)、星際探險隊-指令 (由主控 push)
- [x] 10.3 跑全部測試和 typecheck
