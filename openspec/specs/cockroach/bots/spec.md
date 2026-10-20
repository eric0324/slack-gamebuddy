# cockroach/bots Specification

## Purpose
TBD - created by archiving change add-cockroach-game. Update Purpose after archive.

## Requirements

### Requirement: bot 的出牌、回答與傳牌
bot 的名字和顯示方式 SHALL 和其他遊戲相同。輪到 bot 出牌、bot 收到牌、或 bot 要把偷看的牌傳下去時，bot SHALL 立刻行動，走和真人一樣的規則和公告。bot 只用它看得到的資訊：自己的手牌、所有人面前朝上的牌、偷看過的牌。
- 出牌：選自己手上張數最多的害蟲 (同張數隨機)；目標是其他玩家中面前「這種害蟲」張數最多的人 (同張數隨機)；50% 機率照實宣稱，否則隨機宣稱另一種
- 回答 (還沒偷看)：
  1. 「自己手上 + 所有人面前」的被宣稱害蟲已經有 8 張時，一定回答「不是」
  2. 否則，自己面前被宣稱的害蟲已經有 3 張而且可以偷看再傳時，一定偷看再傳
  3. 否則，可以偷看再傳時 30% 機率偷看再傳
  4. 否則 50% 機率回答「是」，其餘回答「不是」
- 偷看後傳牌：傳給還沒看過的玩家中面前這種害蟲張數最多的人 (同張數隨機)；50% 機率照實宣稱，否則沿用上一個人的宣稱 (兩者相同時就照實宣稱)

#### Scenario: 一定是假的
- **WHEN** 有人宣稱「🪳 蟑螂」傳給 bot，bot 手上有 5 張蟑螂、桌上面前共有 3 張蟑螂
- **THEN** bot 立刻回答「不是」

#### Scenario: 快輸了就傳走
- **WHEN** bot 面前已經有 3 張老鼠，有人宣稱「🐀 老鼠」傳給 bot，還有人沒看過這張牌
- **THEN** bot 立刻偷看再傳

#### Scenario: bot 出牌
- **WHEN** 輪到 bot，bot 手上蒼蠅最多，C 面前有 2 張蒼蠅、其他人沒有
- **THEN** bot 把一張蒼蠅傳給 C

### Requirement: 一個人也能玩完整局
1 位真人加上 bot 時，即使真人完全不操作，遊戲 SHALL 一定會結束。全部由 bot 連續行動時，系統 SHALL 用迴圈推進 (設上限)，SHALL NOT 無限遞迴。

#### Scenario: 真人不操作也會結束
- **WHEN** 1 位真人加 2 個 bot 開始一局，真人什麼都不做
- **THEN** 遊戲靠計時和 bot 的行動推進，最後有一位輸家
