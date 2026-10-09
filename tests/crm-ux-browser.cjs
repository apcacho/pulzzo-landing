'use strict';
// OPTIONAL, NOT EXECUTED HERE. Excluded from tests/run.cjs.
// Run only in an environment explicitly permitted to launch a sandboxed browser.
// Uses a new isolated browser context, a loopback-only demo server and fictional
// fixtures. External requests are aborted. A launch denial is a hard stop.
// No deployed Site, real account, outbound link, sandbox flag or launch fallback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const widths = [320, 390, 768, 1280, 1440];
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) return res.writeHead(405).end();
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); } catch (_) { return res.writeHead(400).end(); }
  const file = path.resolve(root, '.' + pathname), relative = path.relative(root, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some(part => part.startsWith('.'))) return res.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

async function noPageOverflow(page, label) {
  const result = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(result.document <= result.viewport + 1 && result.body <= result.viewport + 1, label + ': ' + JSON.stringify(result));
}

async function selectedTextRoom(locator, label) {
  const result = await locator.evaluate(select => {
    const css = getComputedStyle(select), canvas = document.createElement('canvas'), context = canvas.getContext('2d');
    context.font = css.font;
    const text = select.selectedOptions[0]?.textContent || '', spacing = parseFloat(css.letterSpacing) || 0;
    return { text, needed: context.measureText(text).width + Math.max(0, text.length - 1) * spacing, available: select.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight), height: select.getBoundingClientRect().height };
  });
  assert.ok(result.available + 1 >= result.needed, label + ': clipped selected label ' + JSON.stringify(result));
  return result;
}

async function seed(page) {
  return page.evaluate(() => {
    const store = window.crmDemoStore, rev = () => store.snapshot().revision;
    const good = result => { if (!result.ok) throw new Error(result.error); return result.value; };
    const first = good(store.createContact({ type: 'patient', name: 'María de los Ángeles Hernández de la Cruz · DEMO', email: 'maria.larga@example.test', phone: '+12025550101', assignedKam: 'kam_ana', originalSource: 'manual' }, rev()));
    const second = good(store.createContact({ type: 'patient', name: 'José Antonio Martínez Villaseñor · DEMO', email: 'jose.demo@example.test', phone: '+12025550102', assignedKam: 'kam_ana', originalSource: 'organic' }, rev()));
    const doctor = good(store.createContact({ type: 'doctor', name: 'Clínica de Especialidades y Rehabilitación Integral · DEMO', email: 'clinica.demo@example.test', phone: '+12025550103', assignedKam: 'kam_ana', originalSource: 'manual' }, rev()));
    const now = new Date(), due = new Date(now.getTime() + 86400000).toISOString();
    good(store.addActivity({ contactId: first.id, type: 'call', outcome: 'reached', summary: 'Conversación completamente ficticia', note: 'Conversación completamente ficticia', contactAt: now.toISOString() }, rev()));
    good(store.createTask({ contactId: first.id, title: 'Confirmar disponibilidad de la persona ficticia', dueAt: due }, rev()));
    const app = window.PulzzoCRMBackoffice.getApp(document.getElementById('crmWorkspace'));
    app.navigate('patient', 'contacts', first.id);
    return { first: first.id, second: second.id, doctor: doctor.id, year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  });
}

async function verifyDashboard(page, crm, fixtures, width) {
  await crm.locator('[data-view="dashboard"]').click();
  await crm.locator('#dashboardYear').fill(String(fixtures.year));
  await crm.locator('#dashboardYear').dispatchEvent('change');
  await crm.locator('#dashboardMonth').selectOption(String(fixtures.month));
  await crm.locator('#dashboardKam').selectOption('');
  await selectedTextRoom(crm.locator('#dashboardKam'), 'Dashboard owner @' + width);
  const cards = await crm.locator('.analytics-metrics .metric strong').allTextContents();
  assert.deepEqual(cards.map(Number), [2, 1, 0, 0], 'Known fictional patient fixtures drive exact KPIs');
  const stageFigure = crm.locator('figure:has(#crm-dashboard-stage)');
  await stageFigure.locator('summary').click();
  const stageRows = await stageFigure.locator('tbody tr').evaluateAll(rows => rows.map(row => [row.querySelector('th').textContent.trim(), Number(row.querySelector('td').textContent)]));
  const chartRows = await stageFigure.locator('.analytics-bar-row').evaluateAll(rows => rows.map(row => [row.querySelector('.analytics-bar-label span').textContent.trim(), Number(row.querySelector('strong').textContent)]));
  assert.deepEqual(chartRows, stageRows, 'Chart and accessible table use identical stage data');
  assert.equal(stageRows.reduce((sum, row) => sum + row[1], 0), 2);
  assert.equal(stageRows.find(row => row[0] === 'Contactado')[1], 1);
  const originFigure = crm.locator('figure:has(#crm-dashboard-origin)');
  await originFigure.locator('summary').click();
  assert.deepEqual((await originFigure.locator('tbody tr td:first-of-type').allTextContents()).map(Number).sort(), [1, 1]);
  const conversion = crm.locator('figure:has(#crm-dashboard-conversion)');
  assert.match(await conversion.locator('svg title').textContent(), /0\s*%/);
  assert.match(await conversion.locator('svg desc').textContent(), /0 de 2/);
  const activity = crm.locator('figure:has(#crm-dashboard-activity)');
  assert.equal(Number(await activity.locator('.analytics-bar-label strong').textContent()), 1, 'Stage changes are not counted as contact outreach');
  await noPageOverflow(page, 'Dashboard charts/tables @' + width);
}

(async () => {
  let browser;
  const errors = [], blocked = [];
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = 'http://127.0.0.1:' + server.address().port;
    // Keep Chromium's OS sandbox enabled. No retries, flags or alternate route.
    const launch = { headless: true, chromiumSandbox: true };
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    browser = await chromium.launch(launch);
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'UTC', locale: 'es-MX', serviceWorkers: 'block', reducedMotion: 'reduce' });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === origin && ['GET', 'HEAD'].includes(route.request().method())) return route.continue();
        blocked.push(url.href); return route.abort('blockedbyclient');
      });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      page.on('popup', popup => popup.close());
      await page.goto(origin + '/backoffice.html#crm', { waitUntil: 'domcontentloaded' });
      await page.locator('.demo-user[data-email="admin@pulzzo.mx"]').click();
      await page.locator('#loginBtn').click();
      const crm = page.locator('#crmWorkspace'); await crm.locator('#contactList').waitFor();
      await crm.locator('#actorSelect').selectOption('admin_demo');
      const fixtures = await seed(page);
      await noPageOverflow(page, 'List @' + width);
      await selectedTextRoom(crm.locator('#actorSelect'), 'Administration role @' + width);
      await selectedTextRoom(crm.locator('#ownerFilter'), 'All owners @' + width);
      for (const stage of ['new', 'application_started', 'submitted']) {
        await crm.locator('#stageFilter').selectOption(stage);
        await selectedTextRoom(crm.locator('#stageFilter'), stage + ' @' + width);
      }
      await crm.locator('#stageFilter').selectOption('');
      const name = crm.locator('.contact-row[data-id="' + fixtures.first + '"]');
      await name.focus(); await page.keyboard.press('Enter');
      assert.equal(await crm.locator('#contactDetail').evaluate(node => node.getRootNode().activeElement === node), true);
      const geometry = await crm.locator('.contact-action-group').evaluate(group => {
        const buttons = [...group.querySelectorAll('.contact-primary-actions > *')], caption = group.querySelector('.action-caption').getBoundingClientRect();
        const boxes = buttons.map(button => button.getBoundingClientRect());
        return { heights: boxes.map(box => box.height), gap: caption.top - Math.max(...boxes.map(box => box.bottom)), clippedText: buttons.some(button => button.scrollWidth > button.clientWidth + 1) };
      });
      assert.ok(geometry.heights.every(height => height >= (width <= 820 ? 44 : 38)), JSON.stringify(geometry));
      assert.ok(Math.max(...geometry.heights) - Math.min(...geometry.heights) <= 1, 'Aligned contact action heights');
      assert.ok(geometry.gap >= 10 && geometry.gap <= 18, 'Caption has deliberate breathing room');
      assert.equal(geometry.clippedText, false);
      const register = crm.locator('[data-action="activity"]'); await register.focus(); await page.keyboard.press('Enter');
      const dialog = crm.locator('#editorDialog'); await dialog.waitFor({ state: 'visible' });
      assert.equal(await dialog.evaluate(node => node.matches(':modal')), true);
      assert.deepEqual(await dialog.locator('.form-section legend').allTextContents(), ['1. Contacto realizado', '2. Siguiente paso', '3. Evidencia']);
      assert.equal(await dialog.locator('.linked-records').getAttribute('open'), null);
      const dialogBox = await dialog.boundingBox(); assert.ok(dialogBox.x >= 0 && dialogBox.y >= 0 && dialogBox.x + dialogBox.width <= width + 1 && dialogBox.height <= 900);
      await dialog.locator('button[type="submit"]').scrollIntoViewIfNeeded();
      assert.ok(await dialog.locator('button[type="submit"]').isVisible());
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      assert.equal(await register.evaluate(node => node.getRootNode().activeElement === node), true, 'Escape returns focus');
      await register.click(); await page.goBack(); await dialog.waitFor({ state: 'hidden' });
      await page.goForward(); await crm.locator('#contactDetail').waitFor();
      await crm.locator('[data-contact-layout="kanban"]').focus(); await page.keyboard.press('Enter');
      await crm.locator('#commercialBoard').waitFor({ state: 'visible' });
      const columns = crm.locator('.kanban-columns');
      const pipeline = await columns.evaluate(node => ({ client: node.clientWidth, scroll: node.scrollWidth, flow: getComputedStyle(node).gridAutoFlow, tabindex: node.getAttribute('tabindex') }));
      if (width > 820) {
        assert.ok(pipeline.scroll > pipeline.client + 1, 'Desktop pipeline scrolls inside its own region');
        assert.equal(pipeline.tabindex, '0', 'Desktop pipeline is keyboard-focusable');
        assert.equal(pipeline.flow, 'column');
        await columns.focus(); await page.keyboard.press('ArrowRight');
        await page.waitForFunction(() => document.getElementById('crmWorkspace').shadowRoot.querySelector('.kanban-columns').scrollLeft > 0);
      } else {
        assert.ok(pipeline.scroll <= pipeline.client + 1, 'Mobile pipeline stacks without horizontal scrolling');
        assert.equal(pipeline.flow, 'row');
      }
      const firstCard = crm.locator('.kanban-card[data-drag-id="' + fixtures.first + '"]');
      const move = firstCard.locator('[data-action="move-card"]'); await move.focus(); await page.keyboard.press('Enter');
      assert.equal(await dialog.locator('[name="stage"] option[value="submitted"]').count(), 0, 'Holder submission is not a manual stage choice');
      await dialog.locator('[name="stage"]').selectOption('contacted');
      await dialog.locator('button[type="submit"]').focus(); await page.keyboard.press('Enter');
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await crm.locator('[data-drop-stage="contacted"] .kanban-card').count(), 1);
      assert.equal(await firstCard.locator('[data-action="move-card"]').evaluate(node => node.getRootNode().activeElement === node), true);
      assert.match(await crm.locator('#notice').textContent(), /actualizada/);
      // Keyboard negative stages must retain the card until a reason is provided.
      await firstCard.locator('[data-action="move-card"]').click(); await dialog.locator('[name="stage"]').selectOption('no_response');
      await dialog.locator('button[type="submit"]').click(); assert.equal(await dialog.isVisible(), true);
      assert.ok((await dialog.locator('[data-form-error]').textContent()).trim().length > 0);
      await page.keyboard.press('Escape');
      if (width >= 1280) {
        // A keyboard move to the far end must reveal the replacement focus target.
        await firstCard.locator('[data-action="move-card"]').click();
        await dialog.locator('[name="stage"]').selectOption('not_interested');
        await dialog.locator('[name="reason"]').fill('Motivo ficticio de la prueba de teclado');
        await dialog.locator('button[type="submit"]').click(); await dialog.waitFor({ state: 'hidden' });
        const focusBox = await firstCard.locator('[data-action="move-card"]').boundingBox(), pipelineBox = await columns.boundingBox();
        assert.ok(focusBox.x >= pipelineBox.x - 1 && focusBox.x + focusBox.width <= pipelineBox.x + pipelineBox.width + 1, 'Far-right moved card focus is actually visible inside the pipeline');
        await firstCard.locator('[data-action="move-card"]').press('Enter');
        await dialog.locator('[name="stage"]').selectOption('contacted');
        await dialog.locator('button[type="submit"]').click(); await dialog.waitFor({ state: 'hidden' });
        // Native pointer drag is separately checked where cards are side by side.
        const secondCard = crm.locator('.kanban-card[data-drag-id="' + fixtures.second + '"]');
        await secondCard.dragTo(crm.locator('[data-drop-stage="interested"]'));
        await crm.locator('[data-drop-stage="interested"] .kanban-card[data-drag-id="' + fixtures.second + '"]').waitFor();
        assert.match(await crm.locator('#boardAnnouncement').textContent(), /Interesado/);
      }
      await noPageOverflow(page, 'Kanban with long Spanish names @' + width);
      await verifyDashboard(page, crm, fixtures, width);
      if (process.env.CRM_UX_SCREENSHOT_DIR) {
        fs.mkdirSync(process.env.CRM_UX_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.CRM_UX_SCREENSHOT_DIR, 'crm-dashboard-' + width + '.png'), fullPage: true });
        await crm.locator('[data-view="contacts"]').click();
        await page.screenshot({ path: path.join(process.env.CRM_UX_SCREENSHOT_DIR, 'crm-kanban-' + width + '.png'), fullPage: true });
      }
      await crm.locator('[data-context-switch="doctor"]').click();
      await crm.locator('[data-view="contacts"]').click();
      await crm.locator('[data-contact-layout="kanban"]').click();
      assert.equal(await crm.locator('[data-drop-stage="meeting_scheduled"]').count(), 1);
      assert.match(await crm.locator('.kanban-card[data-drag-id="' + fixtures.doctor + '"]').textContent(), /Rehabilitación Integral/);
      await crm.locator('#stageFilter').selectOption('meeting_scheduled');
      await selectedTextRoom(crm.locator('#stageFilter'), 'Provider meeting label @' + width);
      await noPageOverflow(page, 'Provider board @' + width);
      await context.close();
    }
    assert.deepEqual(errors, [], 'No page runtime errors');
    console.log('PASS browser: native CRM at ' + widths.join('/') + ', dropdown text room, action/caption geometry, grouped modal, keyboard focus/moves, negative-stage reason, desktop drag, chart/table fixture agreement, history and overflow. External requests blocked: ' + blocked.length + '.');
  } finally {
    await browser?.close();
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
