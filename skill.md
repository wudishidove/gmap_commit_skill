---
name: gmap_commit
description: 抓取 Google 地圖指定店家的評分（星等）與總評論數。當使用者想查某家店在 Google 地圖上的評分或評論數時使用。
---

# Google 地圖評分／評論數抓取

評分與評論數不在初始 HTML，必須用會跑 JS 的真實瀏覽器渲染（WebFetch／純 curl 抓不到）。
本 skill 用 **puppeteer-core 連系統 Chrome、無頭載入 Google 地圖**，已封裝在同目錄的 `fetch_maps.js`。

## 用法

```powershell
cd <本 skill 目錄>             # 必須在含 node_modules 的目錄執行（fetch_maps.js 用相對 require）
npm install                    # 首次：安裝 puppeteer-core
node fetch_maps.js "店名 分店"
```

- Chrome 預設路徑 `C:\Program Files\Google\Chrome\Application\chrome.exe`；不同時改 `fetch_maps.js` 的 `CHROME` 變數。
- 輸出為 JSON（`rating`=平均評分、`reviewCount`=總評論數、`starDist`=各星等則數）：

```json
{ "rating": "4.4", "reviewCount": "6249",
  "starDist": { "1": 191, "2": 142, "3": 503, "4": 1541, "5": 3872 } }
```

## 排錯要點（`fetch_maps.js` 已處理；Google 改版抓不到時對照）

- **店名直接搜尋**即可：`/maps/search/<店名>?hl=zh-TW`，免先求短網址。
  （短網址 `maps.app.goo.gl/xxx` 可用 `curl -sL -o $null -w "%{url_effective}"` 展開。）
- **硬載入 place 頁**：搜尋單一結果時 SPA 只就地把網址換成 `/maps/place/`，面板是精簡版、沒有評論數；`page.goto(placeUrl)` 硬載入後才有完整資料。
- **反偵測**：UA 的 `HeadlessChrome`→`Chrome`、設正常視窗、隱藏 `navigator.webdriver`；否則 Google 只給星等、不給評論數。
- **語系**：務必帶 `--lang=zh-TW` 與 `Accept-Language`，才有繁中介面與對應 aria-label。
- **總評論數最可靠來源**：點「評論」分頁讀星等分布 aria-label「N 星級、X 則評論」並加總；**不要**直接用整頁 regex `N 則評論`（會抓到第一位評論者的個人評論數）。
