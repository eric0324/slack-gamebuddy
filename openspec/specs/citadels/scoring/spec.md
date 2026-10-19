# citadels/scoring Specification

## Purpose
TBD - created by archiving change add-citadels-game. Update Purpose after archive.

## Requirements

### Requirement: 計分
遊戲結束時，每位玩家的分數 SHALL 是：
1. 城市裡所有建築的費用總和（大學、龍門各算 8）
2. 城市裡五種顏色（🟡🔵🟢🔴🟣）都至少有一棟：+3（鬼城、魔法學校的規則見 districts）
3. 第一個建滿 8 棟：+4
4. 其他在遊戲結束時城市有 8 棟以上的玩家：+2

#### Scenario: 分數明細
- **WHEN** A 第一個建滿 8 棟，建築費用總和 24，五色齊全
- **THEN** A 得 24 + 3 + 4 = 31 分

#### Scenario: 不是第一個建滿
- **WHEN** B 在同一輪稍後也建滿 8 棟，城市有大學，建築費用總和 28（大學算 8），沒有五色
- **THEN** B 得 28 + 2 = 30 分

#### Scenario: 沒建滿
- **WHEN** C 結束時只有 6 棟，費用總和 20
- **THEN** C 得 20 分

### Requirement: 勝負與同分
分數最高的玩家 SHALL 獲勝。同分時 SHALL 依序比較：(1) 建築費用總和（只算第 1 項，大學、龍門算 8）較高者；(2) 手上金幣較多者；仍然全部相同時 SHALL 並列獲勝。

#### Scenario: 最高分獲勝
- **WHEN** A 31 分、B 30 分、C 20 分
- **THEN** A 獲勝

#### Scenario: 同分比建築費用
- **WHEN** A、B 都是 30 分，A 的建築費用總和 23、B 26
- **THEN** B 獲勝

#### Scenario: 再比金幣
- **WHEN** A、B 分數和建築費用總和都相同，A 有 3 金、B 有 1 金
- **THEN** A 獲勝

#### Scenario: 完全相同
- **WHEN** A、B 分數、建築費用總和、金幣都相同而且最高
- **THEN** A、B 並列獲勝

### Requirement: 結束公告與再來一局
遊戲結束時，頻道 SHALL 公告每位玩家的分數明細（建築費用、五色、建滿加分、紫卡加分、總分）、名次和獲勝者，送出 `result` 事件（`players` 是所有玩家，`winners` 是獲勝的玩家），並貼「再來一局」按鈕；只有上一局的玩家可以按，按的人成為新房主。結束後舊的按鈕和計時器 SHALL 被忽略。

#### Scenario: 正常結束
- **WHEN** 最後一輪打完，A 分數最高
- **THEN** 頻道公告分數明細和名次，`result` 的 winners 是 A，貼「再來一局」

#### Scenario: 再來一局
- **WHEN** 上一局的玩家 B 按「再來一局」
- **THEN** 開一個新房間，B 是房主並自動加入

### Requirement: 取消
房主在遊戲中輸入 `/game citadels cancel` 時，遊戲 SHALL 結束，頻道公告已取消和目前每人的建築費用總和，SHALL NOT 送出 `result`，也 SHALL NOT 貼「再來一局」。非房主取消 SHALL 被拒絕。

#### Scenario: 房主取消
- **WHEN** 遊戲進行中房主輸入 `/game citadels cancel`
- **THEN** 遊戲結束，頻道公告已取消，沒有 `result`，沒有「再來一局」

#### Scenario: 非房主取消
- **WHEN** 不是房主的玩家輸入 `/game citadels cancel`
- **THEN** 系統拒絕，只讓他看到只有房主可以取消
