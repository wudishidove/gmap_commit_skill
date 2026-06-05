// Google 地圖：抓店家評分(等級)與總評論數
// 用法：node fetch_maps.js "店名 分店"   或修改下方 QUERY
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const QUERY = process.argv[2] || '刁民 逢甲店';
const URL = `https://www.google.com/maps/search/${encodeURIComponent(QUERY)}?hl=zh-TW`;

const t0 = Date.now();
const log = (m) => console.error('[' + (Date.now() - t0) + 'ms] ' + m);

(async () => {
  log('launch');
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: [
      '--lang=zh-TW', '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1366,900',
    ],
  });
  const page = await browser.newPage();
  // 反偵測:換掉 HeadlessChrome UA、正常視窗、隱藏 webdriver
  await page.setUserAgent((await browser.userAgent()).replace(/HeadlessChrome/g, 'Chrome'));
  await page.setViewport({ width: 1366, height: 900 });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-TW', 'zh', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    window.chrome = { runtime: {} };
  });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-TW,zh;q=0.9' });

  log('goto search');
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // 單一結果會由 SPA 就地把 URL settle 成 /maps/place/(但此時面板是精簡版,沒有評論數)
  await page.waitForFunction(
    () => /\/maps\/place\//.test(location.href) || document.querySelector('a.hfpxzc'),
    { timeout: 30000 }
  ).catch(() => {});

  // 若仍是搜尋列表,取第一個結果連結
  let placeUrl = page.url();
  if (!/\/maps\/place\//.test(placeUrl)) {
    const href = await page.evaluate(() => document.querySelector('a.hfpxzc')?.href || null);
    if (href) placeUrl = href;
  }

  // ★關鍵:對 place 網址做一次完整硬載入,Google 才會渲染含「評論數/星等分布」的完整店家頁
  if (/\/maps\/place\//.test(placeUrl)) {
    log('hard reload place');
    await page.goto(placeUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForFunction(
      () => document.querySelector('div.F7nice span[aria-hidden="true"]'),
      { timeout: 30000 }
    ).catch(() => {});
  }
  await new Promise(r => setTimeout(r, 1500));

  // ── Phase 1:總覽面板讀「評分」與「總評論數」(都在 div.F7nice 內) ──
  const data = await page.evaluate(() => {
    const fn = document.querySelector('div.F7nice');
    const rating = fn?.querySelector('span[aria-hidden="true"]')?.textContent.trim() || null;
    let reviewCount = null;
    if (fn) {
      const lbl = Array.from(fn.querySelectorAll('[aria-label]'))
        .map(e => e.getAttribute('aria-label'))
        .find(l => /則(?:Google)?評論|reviews?/i.test(l));
      if (lbl) reviewCount = (lbl.match(/([\d][\d,]*)/) || [])[1] || null;
      if (!reviewCount) {
        const m = fn.innerText.match(/\(([\d,]+)\)/) || fn.innerText.match(/([\d,]+)\s*則/);
        if (m) reviewCount = m[1];
      }
    }
    return { title: document.title, url: location.href, rating, reviewCount };
  });
  log('overview => rating=' + data.rating + ' count=' + data.reviewCount);

  // ── Phase 2:點「評論」分頁,用「星等分布」加總當權威來源(並反算評分,作交叉驗證) ──
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button[role="tab"]'));
    const t = tabs.find(t => /評論|Reviews?/i.test(t.getAttribute('aria-label') || t.textContent || ''));
    t && t.click();
  });
  await new Promise(r => setTimeout(r, 2500));
  const hist = await page.evaluate(() => {
    // 星等分布 aria-label:「N 星級、X 則評論」
    const rows = Array.from(document.querySelectorAll('[aria-label]'))
      .map(e => (e.getAttribute('aria-label') || '').match(/([1-5])\s*星級[、,]\s*([\d,]+)\s*則評論/))
      .filter(Boolean);
    const dist = {}; let total = 0, weighted = 0;
    for (const m of rows) {
      const star = +m[1], n = +m[2].replace(/,/g, '');
      dist[star] = n; total += n; weighted += star * n;
    }
    return { dist, total: total || null, ratingCalc: total ? (weighted / total).toFixed(1) : null };
  });
  data.starDist = hist.dist;
  data.totalFromDist = hist.total;
  data.ratingFromDist = hist.ratingCalc;
  // 以星等分布加總為準(最可靠,不會被評論者個人 N 則評論干擾)
  if (hist.total) data.reviewCount = String(hist.total);
  if (!data.rating && hist.ratingCalc) data.rating = hist.ratingCalc;

  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
