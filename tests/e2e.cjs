const { chromium, devices } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2] || 'out/e2e';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch();
  for (const [name, opts] of [['mobile', devices['iPhone 13']], ['desktop', { viewport: { width: 1366, height: 900 } }]]) {
    const ctx = await b.newContext({ ...opts, acceptDownloads: true });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    const t0 = Date.now();
    await p.goto('http://localhost:8787/', { waitUntil: 'load' });
    const tLoad = Date.now() - t0;
    await p.waitForSelector('.sheet', { timeout: 30000 });
    const tFirst = Date.now() - t0;
    await p.waitForTimeout(500);
    console.log(name, 'load', tLoad, 'ms, first page', tFirst, 'ms', 'status:', await p.textContent('#status'));
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    console.log(name, 'scrollWidth', sw, 'viewport', p.viewportSize().width);
    await p.screenshot({ path: `${OUT}/${name}-msa.png`, fullPage: false });
    for (const [sel, ext] of [['#btnPptx', 'pptx'], ['#btnPdf', 'pdf']]) {
      const t = Date.now();
      const [d] = await Promise.all([p.waitForEvent('download'), p.click(sel)]);
      const f = `${OUT}/${name}-${d.suggestedFilename()}`; await d.saveAs(f);
      console.log(name, ext, d.suggestedFilename(), fs.statSync(f).size, 'bytes', Date.now() - t, 'ms');
    }
    await p.selectOption('#bookSel', '1');
    await p.waitForFunction(() => document.querySelector('#status').textContent.includes('Aperçu'));
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${OUT}/${name}-mh.png`, fullPage: true });
    for (const sel of ['#btnPptx', '#btnPdf']) {
      const t = Date.now();
      const [d] = await Promise.all([p.waitForEvent('download'), p.click(sel)]);
      const f = `${OUT}/${name}-${d.suggestedFilename()}`; await d.saveAs(f);
      console.log(name, d.suggestedFilename(), fs.statSync(f).size, 'bytes', Date.now() - t, 'ms');
    }
    console.log(name, 'errors:', errs.length ? errs : 'none');
    await ctx.close();
  }
  await b.close();
})();
