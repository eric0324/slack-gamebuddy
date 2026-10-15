## ADDED Requirements

### Requirement: 投稿梗圖
任何人 SHALL 可以在頻道輸入 `/game meme add <圖片網址> [名稱]`，把梗圖加進這個頻道的梗圖庫，不需要在遊戲中，頻道有其他遊戲進行中也可以。網址 SHALL 是 `https://` 開頭；系統 SHALL 先連到網址確認回應成功而且內容是圖片（5 秒內），否則拒絕並只讓投稿者看到原因（提醒要用公開的圖片網址，Slack 上傳的圖片連結不能用）。名稱 SHALL 是 1～20 字，沒寫時是「自家梗」。同一個頻道 SHALL NOT 有重複的網址。投稿成功時，頻道 SHALL 公告投稿者、編號、名稱，並顯示這張圖。梗圖庫 SHALL 保存在檔案中，bot 重新啟動後仍然存在；每個頻道各自一份。

#### Scenario: 投稿成功
- **WHEN** A 輸入 `/game meme add https://example.com/boss.png 老闆的眼神`，網址是一張圖片
- **THEN** 頻道公告「@A 投稿了一張梗圖：#1 老闆的眼神」並顯示圖片

#### Scenario: 沒寫名稱
- **WHEN** A 輸入 `/game meme add https://example.com/x.jpg`
- **THEN** 這張梗圖的名稱是「自家梗」

#### Scenario: 不是圖片
- **WHEN** 網址連不到、回應失敗，或內容不是圖片
- **THEN** 系統拒絕，只讓 A 看到要用公開的圖片網址

#### Scenario: Slack 跳脫過的網址
- **WHEN** Slack 把網址送成 `<https://x.com/a.png?w=1&amp;h=2>` 或 `<https://x.com/b.png|x.com/b.png>`
- **THEN** 系統還原成 `https://x.com/a.png?w=1&h=2`、`https://x.com/b.png` 再處理

#### Scenario: 不是 https
- **WHEN** A 輸入 `/game meme add http://example.com/x.jpg`
- **THEN** 系統拒絕，只讓 A 看到要用 https 網址，不會連過去檢查

#### Scenario: 重複投稿
- **WHEN** 這個頻道已經有同一個網址
- **THEN** 系統拒絕，只讓 A 看到這張已經投稿過（附編號）

#### Scenario: 名稱太長
- **WHEN** 名稱超過 20 字
- **THEN** 系統拒絕，只讓 A 看到字數限制

#### Scenario: 頻道各自一份
- **WHEN** A 在頻道 X 投稿
- **THEN** 頻道 Y 的梗圖庫和遊戲都不會出現這張

### Requirement: 投稿清單
任何人 SHALL 可以輸入 `/game meme list`，只讓自己看到這個頻道梗圖庫的所有投稿（編號、名稱、投稿者），依編號排序；沒有投稿時顯示「還沒有投稿」和投稿方式。

#### Scenario: 查看清單
- **WHEN** 頻道有 #1、#3 兩張投稿，B 輸入 `/game meme list`
- **THEN** 只有 B 看到 #1、#3 的名稱和投稿者

#### Scenario: 沒有投稿
- **WHEN** 頻道沒有投稿，B 輸入 `/game meme list`
- **THEN** 只有 B 看到還沒有投稿，以及 `/game meme add` 的用法

### Requirement: 刪除投稿
任何人 SHALL 可以輸入 `/game meme remove <編號>` 刪掉這個頻道梗圖庫的一張投稿（不限投稿者本人）。刪除後頻道 SHALL 公告誰刪了哪一張、原本是誰投稿的。編號 SHALL NOT 因為刪除而改變。編號不存在時 SHALL 拒絕並只讓這個人看到。正在進行的遊戲已經選好的梗圖 SHALL NOT 受影響。

#### Scenario: 刪除
- **WHEN** B 輸入 `/game meme remove 1`，#1 是 A 投稿的「老闆的眼神」
- **THEN** 頻道公告「🗑️ @B 刪掉了 #1 老闆的眼神（@A 投稿）」，清單裡不再有 #1

#### Scenario: 編號不存在
- **WHEN** B 輸入 `/game meme remove 99`
- **THEN** 系統拒絕，只讓 B 看到找不到這張

### Requirement: 圖片壞掉時的備案
帶圖片的公告如果因為圖片無法顯示而發送失敗，系統 SHALL 改發只有文字的公告，並附上圖片網址，遊戲 SHALL 照常進行。

#### Scenario: 圖片失效
- **WHEN** 這一輪的梗圖網址已經失效，Slack 拒絕帶圖片的訊息
- **THEN** 頻道仍然收到這一輪的公告文字和圖片網址，配圖訊息照常出現
