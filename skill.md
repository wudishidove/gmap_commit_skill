# Google 地圖評分／評論數 抓取方法

用 **puppeteer-core 連系統 Chrome,無頭渲染 Google 地圖頁面再讀 DOM**。
(評分／評論數不在初始 HTML,必須用會跑 JS 的真實瀏覽器,WebFetch / 純 curl 拿不到。)

---

## 完整腳本 `fetch_maps.js`

```js
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const QUERY = process.argv[2] || '刁民 逢甲店';
const URL = `https://www.google.com/maps/search/${encodeURIComponent(QUERY)}?hl=zh-TW`;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--lang=zh-TW', '--no-sandbox',
           '--disable-blink-features=AutomationControlled', '--window-size=1366,900'],
  });
  const page = await browser.newPage();
  // 反偵測:換掉 HeadlessChrome UA、設正常視窗、隱藏 webdriver
  await page.setUserAgent((await browser.userAgent()).replace(/HeadlessChrome/g, 'Chrome'));
  await page.setViewport({ width: 1366, height: 900 });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-TW', 'zh', 'en'] });
    window.chrome = { runtime: {} };
  });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-TW,zh;q=0.9' });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => /\/maps\/place\//.test(location.href) || document.querySelector('a.hfpxzc'),
    { timeout: 30000 }
  ).catch(() => {});

  // 取得 place 網址(SPA settle 後的,或搜尋列表第一個結果)
  let placeUrl = page.url();
  if (!/\/maps\/place\//.test(placeUrl)) {
    placeUrl = await page.evaluate(() => document.querySelector('a.hfpxzc')?.href) || placeUrl;
  }
  // 硬載入 place 頁,才會渲染含評論數與星等分布的完整店家頁
  await page.goto(placeUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(
    () => document.querySelector('div.F7nice span[aria-hidden="true"]'),
    { timeout: 30000 }
  ).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));

  // Phase 1:總覽面板讀 評分 + 總評論數(都在 div.F7nice)
  const data = await page.evaluate(() => {
    const fn = document.querySelector('div.F7nice');
    const rating = fn?.querySelector('span[aria-hidden="true"]')?.textContent.trim() || null;
    let reviewCount = null;
    const lbl = Array.from(fn?.querySelectorAll('[aria-label]') || [])
      .map(e => e.getAttribute('aria-label')).find(l => /則(?:Google)?評論/.test(l));
    if (lbl) reviewCount = (lbl.match(/([\d][\d,]*)/) || [])[1];
    if (!reviewCount) reviewCount = (fn?.innerText.match(/\(([\d,]+)\)/) || [])[1] || null;
    return { title: document.title, rating, reviewCount };
  });

  // Phase 2:點「評論」分頁,用星等分布加總(最可靠,並反算評分作交叉驗證)
  await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('button[role="tab"]'))
      .find(t => /評論|Reviews?/i.test(t.getAttribute('aria-label') || t.textContent || ''));
    t && t.click();
  });
  await new Promise(r => setTimeout(r, 2500));
  const hist = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[aria-label]'))
      .map(e => (e.getAttribute('aria-label') || '').match(/([1-5])\s*星級[、,]\s*([\d,]+)\s*則評論/))
      .filter(Boolean);
    let total = 0, weighted = 0; const dist = {};
    for (const m of rows) { const s = +m[1], n = +m[2].replace(/,/g, ''); dist[s] = n; total += n; weighted += s * n; }
    return { dist, total: total || null, ratingCalc: total ? (weighted / total).toFixed(1) : null };
  });
  if (hist.total) data.reviewCount = String(hist.total);
  if (!data.rating && hist.ratingCalc) data.rating = hist.ratingCalc;
  data.starDist = hist.dist;

  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
```

## 執行

```powershell
npm install puppeteer-core   # 首次
node fetch_maps.js "刁民 逢甲店"
```

輸出範例(刁民-酸菜魚 逢甲店):
```json
{ "rating": "4.5", "reviewCount": "6974",
  "starDist": { "1": 381, "2": 141, "3": 382, "4": 1034, "5": 5036 } }
```

---

## 要點

- **店名搜尋**即可,免先求短網址:`/maps/search/<店名>?hl=zh-TW`。
  (若有短網址 `maps.app.goo.gl/xxxx`,可用 `curl -sL -o $null -w "%{url_effective}"` 展開。)
- **務必硬載入 place 頁**(`page.goto(placeUrl)`):搜尋單一結果時,SPA 只會就地把網址換成
  `/maps/place/`,但面板是精簡版、沒有評論數;硬載入後才會出現完整資料。
- **務必反偵測**:UA 的 `HeadlessChrome` → `Chrome`、設正常視窗、隱藏 `navigator.webdriver`;
  否則 Google 只給星等、不給評論數。
- **務必帶** `--lang=zh-TW` 與 `Accept-Language`,才有繁中介面與 aria-label。
- **評分**:`div.F7nice span[aria-hidden="true"]`。
- **總評論數**(最可靠):點「評論」分頁,讀星等分布 aria-label `「N 星級、X 則評論」`,
  把 5 個星等加總。**不要**直接用整頁 regex `N 則評論`——會抓到第一位評論者的個人評論數。
