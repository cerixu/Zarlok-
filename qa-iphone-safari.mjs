import { webkit, devices } from 'playwright';

const BASE_URL = process.env.ZARLOK_BASE_URL || 'http://127.0.0.1:4173/';
const TARGET = devices['iPhone 15 Pro'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getState(page) {
  return await page.evaluate(() => ({
    ready: !!window.__kucharzyna?.ready,
    bootGone: document.querySelector('#boot')?.classList.contains('gone') ?? false,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      vvWidth: window.visualViewport?.width ?? null,
      vvHeight: window.visualViewport?.height ?? null,
    },
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
    clientWidth: document.documentElement.clientWidth,
    routeText: document.querySelector('#view')?.innerText || '',
    bodyClass: document.body.className,
  }));
}

async function assertNoHorizontalOverflow(page, label) {
  const result = await page.evaluate(() => ({
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
    clientWidth: document.documentElement.clientWidth,
    overflowing: [...document.querySelectorAll('body *')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > document.documentElement.clientWidth + 1;
    }).slice(0, 8).map((el) => ({
      tag: el.tagName,
      cls: String(el.className || '').slice(0, 100),
      right: Math.round(el.getBoundingClientRect().right),
    })),
  }));
  if (result.scrollWidth > result.clientWidth + 1 || result.overflowing.length) {
    throw new Error(`Horizontal overflow on ${label}: ${JSON.stringify(result)}`);
  }
}

async function assertAccessibleControls(page, label) {
  const unnamed = await page.evaluate(() => [...document.querySelectorAll('button,a,input,textarea,select')]
    .filter((el) => {
      const style = getComputedStyle(el);
      const hidden = el.getAttribute('aria-hidden') === 'true' ||
        style.display === 'none' || style.visibility === 'hidden' || el.offsetParent === null;
      if (hidden) return false;
      const name = [
        el.getAttribute('aria-label'),
        el.getAttribute('title'),
        el.getAttribute('placeholder'),
        el.innerText,
        el.value,
      ].filter(Boolean).join(' ').trim();
      return !name;
    })
    .slice(0, 20)
    .map((el) => ({ tag: el.tagName, cls: String(el.className || '').slice(0, 120), html: el.outerHTML.slice(0, 220) })));
  if (unnamed.length) throw new Error(`Unnamed interactive controls on ${label}: ${JSON.stringify(unnamed)}`);
}

async function waitForReady(page) {
  await page.waitForFunction(() => window.__kucharzyna?.ready === true, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const state = await getState(page);
  if (!state.bootGone) throw new Error('Boot overlay did not finish');
  if (!state.ready) throw new Error('Application never reported ready');
  return state;
}

async function main() {
  const browser = await webkit.launch({ headless: true });
  const context = await browser.newContext({
    ...TARGET,
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
  });
  const page = await context.newPage();
  const errors = [];

  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('requestfailed', (req) => errors.push('requestfailed: ' + req.url() + ' :: ' + (req.failure()?.errorText || 'unknown')));

  console.log('WEBKIT_TARGET', JSON.stringify({
    userAgent: await page.evaluate(() => navigator.userAgent),
    viewport: page.viewportSize(),
  }));

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await waitForReady(page);

  const meta = await page.evaluate(() => ({
    viewport: document.querySelector('meta[name="viewport"]')?.content || '',
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href') || '',
    appleStandalone: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content || '',
    appleTitle: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.content || '',
    touchIcon: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') || '',
    swSupported: 'serviceWorker' in navigator,
  }));
  console.log('IPHONE_META', JSON.stringify(meta));
  if (!meta.viewport.includes('viewport-fit=cover')) throw new Error('viewport-fit=cover missing');
  if (!meta.manifest) throw new Error('manifest link missing');
  if (meta.appleStandalone.toLowerCase() !== 'yes') throw new Error('Apple standalone meta missing');
  if (meta.appleTitle !== 'Żarłok') throw new Error('Apple PWA title mismatch');
  if (!meta.touchIcon) throw new Error('Apple touch icon missing');
  if (!meta.swSupported) throw new Error('Service Worker API missing');

  const routes = [
    ['#/', 'Żarłok'],
    ['#/recipes', 'Receptury'],
    ['#/calc', 'Kalkulatory'],
    ['#/shopping', 'Zakupy'],
    ['#/inventory', 'Magazyn'],
    ['#/history', 'Historia gotowania'],
    ['#/pro', 'Żarłok PRO'],
    ['#/settings', 'Ustawienia'],
  ];

  for (const [hash, expected] of routes) {
    await page.goto(BASE_URL + hash, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(250);
    const state = await getState(page);
    console.log('ROUTE', hash, JSON.stringify({
      text: state.routeText.slice(0, 100),
      viewport: state.viewport,
      bodyClass: state.bodyClass,
    }));
    if (!state.routeText.includes(expected)) throw new Error(`Route ${hash} missing "${expected}"`);
    await assertNoHorizontalOverflow(page, hash);
    await assertAccessibleControls(page, hash);
  }

  // Receptury UX: catalog is intentionally capped, cards show category/origin, and full details open separately.
  await page.goto(BASE_URL + '#/recipes', { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(250);
  const catalogState = await page.evaluate(() => ({
    cards: document.querySelectorAll('.recipe-catalog-card').length,
    sources: document.querySelectorAll('.recipe-catalog-card .catalog-origin').length,
    categories: document.querySelectorAll('.recipe-catalog-card .catalog-category').length,
  }));
  console.log('RECIPE_CATALOG_CHECK', JSON.stringify(catalogState));
  if (catalogState.cards > 30) throw new Error('Recipe catalog rendered more than 30 cards at once');
  if (catalogState.cards > 0 && (!catalogState.categories || !catalogState.sources)) throw new Error('Recipe cards lost category/origin labels');

  const firstRecipeHref = await page.locator('.recipe-catalog-card .rcard-main').first().getAttribute('href');
  if (firstRecipeHref) {
    await page.goto(BASE_URL + firstRecipeHref.replace(/^#/, ''), { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(250);
    if (await page.locator('.recipe-fullscreen').count()) throw new Error('Recipe opened in full details too early');
    const plus = page.locator('.ref-ingredient-more').first();
    if (await plus.count()) {
      await plus.click();
      await sleep(250);
      if (!(await page.locator('.recipe-fullscreen').count())) throw new Error('Ingredient +N did not open full recipe');
      if (!document.body.classList.contains('no-tabs')) throw new Error('Full recipe did not use fullscreen mode');
      if (!(await page.locator('.ref-details .ingredients').count())) throw new Error('Full recipe is missing ingredients');
      if (!(await page.getByText('Przygotowanie', { exact: true }).count())) throw new Error('Full recipe is missing preparation section');
    } else {
      const idFromHref = firstRecipeHref.match(/recipe\/([^?]+)/)?.[1];
      if (idFromHref) {
        await page.goto(BASE_URL + '#/recipe/' + idFromHref + '?details=1', { waitUntil: 'networkidle', timeout: 30000 });
        await sleep(250);
        if (!(await page.locator('.recipe-fullscreen').count())) throw new Error('Direct full recipe route did not open fullscreen');
      }
    }
  }

  // Vertical scrolling regression: the app shell must scroll inside .scroll on iPhone.
  await page.goto(BASE_URL + '#/recipes', { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(250);
  const scrollState = await page.locator('.scroll').evaluate((el) => {
    const before = el.scrollTop;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTo(0, Math.min(600, max));
    return { before, after: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
  });
  console.log('SCROLL_CHECK', JSON.stringify(scrollState));
  if (scrollState.scrollHeight > scrollState.clientHeight + 2 && scrollState.after <= scrollState.before) {
    throw new Error('App content did not scroll vertically inside .scroll');
  }

  

  // Keyboard/focus regression: focus should remain visible inside the iPhone viewport.
  await page.goto(BASE_URL + '#/inventory', { waitUntil: 'networkidle', timeout: 30000 });
  await page.getByRole('button', { name: /Dodaj produkt/i }).first().click();
  await page.getByLabel('Nazwa produktu').focus();
  await page.waitForTimeout(350);
  const focusState = await page.evaluate(() => {
    const el = document.activeElement;
    const r = el?.getBoundingClientRect();
    return {
      tag: el?.tagName || '',
      label: el?.getAttribute('aria-label') || '',
      top: r ? Math.round(r.top) : null,
      bottom: r ? Math.round(r.bottom) : null,
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      kbClass: document.body.classList.contains('kb-open'),
    };
  });
  console.log('FOCUS_CHECK', JSON.stringify(focusState));
  if (focusState.tag !== 'INPUT' || !focusState.label) throw new Error('Inventory input could not be focused');
  if (focusState.top == null || focusState.bottom == null ||
      focusState.top < -1 || focusState.bottom > focusState.viewportHeight + 1) {
    throw new Error('Focused inventory input is outside the viewport');
  }

  // Persistence regression: write a test item, reload the PWA, and require it to survive.
  await page.getByLabel('Nazwa produktu').fill('QA Safari Pamięć');
  await page.getByLabel('Ilość').fill('7');
  await page.getByRole('button', { name: /^Zapisz$/ }).click();
  await sleep(250);
  await page.reload({ waitUntil: 'networkidle' });
  await waitForReady(page);
  await page.goto(BASE_URL + '#/inventory', { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(250);
  if (!(await page.getByText('QA Safari Pamięć').count())) {
    throw new Error('IndexedDB persistence failed across reload');
  }

  // Orientation regression: switch to a compact landscape viewport and back.
  await page.setViewportSize({ width: 844, height: 390 });
  await sleep(250);
  const landscape = await page.evaluate(() => ({
    matches: matchMedia('(orientation: landscape)').matches,
    bodyOverflow: getComputedStyle(document.body).overflow,
    tabbarDisplay: getComputedStyle(document.querySelector('#tabbar')).display,
  }));
  console.log('LANDSCAPE_CHECK', JSON.stringify(landscape));
  if (!landscape.matches) throw new Error('Landscape media query did not activate');
  if (landscape.bodyOverflow !== 'hidden') throw new Error('Body overflow changed in landscape');
  await assertNoHorizontalOverflow(page, 'landscape');

  await page.setViewportSize({ width: 393, height: 852 });
  await sleep(250);
  const portrait = await page.evaluate(() => ({
    matches: matchMedia('(orientation: portrait)').matches,
    appHeight: getComputedStyle(document.querySelector('#app')).height,
  }));
  console.log('PORTRAIT_CHECK', JSON.stringify(portrait));
  if (!portrait.matches) throw new Error('Portrait media query did not reactivate');

  // Service worker must control the page before the offline reload check.
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await waitForReady(page);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
  const swState = await page.evaluate(async () => {
    const c = navigator.serviceWorker.controller;
    let version = null;
    try {
      version = await new Promise((resolve) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (e) => resolve(e.data?.version || null);
        c.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
        setTimeout(() => resolve(null), 1500);
      });
    } catch (_) {}
    return { controlled: !!c, version };
  });
  console.log('SW_CHECK', JSON.stringify(swState));
  if (!swState.controlled) throw new Error('Page is not controlled by Service Worker');
  if (swState.version !== 'zarlok-2.2.0') throw new Error('Unexpected Service Worker version: ' + swState.version);

  // Offline reload: cached app must still boot and render the home route.
  errors.length = 0;
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await waitForReady(page);
  const offlineState = await getState(page);
  console.log('OFFLINE_CHECK', JSON.stringify(offlineState));
  if (!offlineState.routeText.includes('Żarłok')) throw new Error('Offline reload did not render Żarłok');
  await context.setOffline(false);

  if (errors.some((e) => e.startsWith('console:') || e.startsWith('pageerror:'))) {
    throw new Error('WebKit runtime errors: ' + JSON.stringify(errors));
  }
  console.log('IPHONE_SAFARI_QA_OK');
  await browser.close();
}

main().catch(async (err) => {
  console.error(err?.stack || err);
  process.exitCode = 1;
});
