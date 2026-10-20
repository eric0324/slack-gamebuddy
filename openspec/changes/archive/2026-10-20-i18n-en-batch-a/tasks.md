## 1. 吹牛骰 (liarsdice)

- [x] 1.1 先寫失敗的英文測試 `test/liarsdice.en.test.ts`：英文局的回合公告、骰子 DM、喊數、開、「Liar!」按鈕、錯誤回覆、GameDef `locales.en`
- [x] 1.2 新增 `src/i18n/games/liarsdice.ts`，engine 改用 `tx`，state 加 `lang`，GameDef 加 `locales.en`
- [x] 1.3 吹牛骰的測試全部綠燈

## 2. 政變 (coup)

- [x] 2.1 先寫失敗的英文測試 `test/coup.en.test.ts`：開局公告、手牌 DM、行動按鈕、宣稱與質疑、阻擋、錯誤回覆、GameDef `locales.en`
- [x] 2.2 新增 `src/i18n/games/coup.ts`，角色名稱和行動按鈕依語系，engine 改用 `tx`，GameDef 加 `locales.en`
- [x] 2.3 政變的測試全部綠燈

## 3. 骷髏與玫瑰 (skull)

- [x] 3.1 先寫失敗的英文測試 `test/skull.en.test.ts`：開局公告、規則 DM、蓋牌按鈕、喊數、挑戰、失去一張牌、錯誤回覆、GameDef `locales.en`
- [x] 3.2 新增 `src/i18n/games/skull.ts`，engine 改用 `tx`，GameDef 加 `locales.en`
- [x] 3.3 骷髏與玫瑰的測試全部綠燈

## 4. 誰是牛頭王 (nimmt)

- [x] 4.1 先寫失敗的英文測試 `test/nimmt.en.test.ts`：開局公告、牌桌、手牌 DM、選牌按鈕、揭曉、選列按鈕、收牌公告、GameDef `locales.en`
- [x] 4.2 新增 `src/i18n/games/nimmt.ts`，engine 改用 `tx`，GameDef 加 `locales.en`
- [x] 4.3 誰是牛頭王的測試全部綠燈

## 5. 不要謝謝 (nothanks)

- [x] 5.1 先寫失敗的英文測試 `test/nothanks.en.test.ts`：開場公告、規則 DM、牌桌與三個按鈕、不要謝謝／收下、我的籌碼、結算、GameDef `locales.en`
- [x] 5.2 新增 `src/i18n/games/nothanks.ts`，engine 改用 `tx`，GameDef 加 `locales.en`
- [x] 5.3 不要謝謝的測試全部綠燈

## 6. 情書 (loveletter)

- [x] 6.1 先寫失敗的英文測試 `test/loveletter.en.test.ts`：開局公告、手牌 DM (含卡牌說明)、出牌按鈕、出牌選單、衛兵猜牌、我的手牌、棄牌紀錄、錯誤回覆、GameDef `locales.en`
- [x] 6.2 新增 `src/i18n/games/loveletter.ts`，卡牌名稱和說明依語系，engine 改用 `tx`，GameDef 加 `locales.en`
- [x] 6.3 情書的測試全部綠燈

## 7. 收尾

- [x] 7.1 `test/i18n.test.ts` 拿政變、骷髏與玫瑰當「還沒翻譯」例子的測試，改成暫時拿掉它們的 `locales`
- [x] 7.2 寫 6 款遊戲的英文 wiki (每款 3 頁)
- [x] 7.3 跑 `npm test` 和 `npm run typecheck`，確認全部綠燈、既有測試的預期值沒改
