# gmap_commit_skill — Google 地圖評分／評論數抓取

一個 Claude Code skill，用 **puppeteer-core 連系統 Chrome、無頭渲染 Google 地圖**，
讀取指定店家的 **評分（星等）** 與 **總評論數**。

> 評分／評論數不在初始 HTML 裡，必須用會跑 JS 的真實瀏覽器渲染，
> 純 `curl` / `WebFetch` 抓不到，因此採用 Puppeteer。

---

## 功能

- 以**店名**直接搜尋（免先求短網址）：`/maps/search/<店名>?hl=zh-TW`
- 自動硬載入 place 頁，渲染含評論數與星等分布的完整店家頁
- 內建**反偵測**（改 UA、隱藏 `navigator.webdriver`、設正常視窗），否則 Google 只給星等、不給評論數
- 以**星等分布加總**作為總評論數的權威來源，並反算評分做交叉驗證

## 環境需求

- Node.js
- 已安裝 Google Chrome（預設路徑 `C:\Program Files\Google\Chrome\Application\chrome.exe`）
  - 路徑不同時，請修改 `fetch_maps.js` 中的 `CHROME` 變數

## 安裝

```powershell
npm install
```

## 使用

```powershell
node fetch_maps.js "刁民 逢甲店"
```

未帶參數時會使用內建預設店名。

### 輸出範例

```json
{
  "rating": "4.5",
  "reviewCount": "6974",
  "starDist": { "1": 381, "2": 141, "3": 382, "4": 1034, "5": 5036 }
}
```

| 欄位 | 說明 |
| --- | --- |
| `rating` | 店家平均評分（星等） |
| `reviewCount` | 總評論數（以星等分布加總為準） |
| `starDist` | 1～5 星各自的評論數 |

---

## 運作原理（重點）

1. **店名搜尋**：用 `/maps/search/<店名>?hl=zh-TW` 即可，
   若只有短網址 `maps.app.goo.gl/xxxx`，可用 `curl -sL -o $null -w "%{url_effective}"` 展開。
2. **務必硬載入 place 頁**：搜尋單一結果時，SPA 只會就地把網址換成 `/maps/place/`，
   但面板是精簡版、沒有評論數；硬載入（`page.goto(placeUrl)`）後才會出現完整資料。
3. **務必反偵測**：把 UA 的 `HeadlessChrome` 改成 `Chrome`、設正常視窗、隱藏 `navigator.webdriver`。
4. **務必帶語系**：`--lang=zh-TW` 與 `Accept-Language`，才有繁中介面與對應 aria-label。
5. **總評論數最可靠來源**：點「評論」分頁，讀星等分布 aria-label「N 星級、X 則評論」並加總；
   **不要**直接用整頁 regex `N 則評論`——會抓到第一位評論者的個人評論數。

## 檔案說明

| 檔案 | 說明 |
| --- | --- |
| `fetch_maps.js` | 主腳本 |
| `skill.md` | skill 說明文件（方法與要點） |
| `package.json` | 相依套件（`puppeteer-core`） |
