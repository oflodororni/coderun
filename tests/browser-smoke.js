/* Prueba opcional de UI en Microsoft Edge, sin paquetes de automatización. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');

const edgePaths = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const edgePath = edgePaths.find(candidate => fs.existsSync(candidate));
if (!edgePath) { console.log('Edge no está disponible; omitiendo prueba de navegador.'); process.exit(0); }

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'coderun-smoke-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const pageUrl = `${pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href}?skip-intro`;
  const edge = spawn(edgePath, ['--headless=new', '--disable-gpu', '--window-size=1440,900', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, pageUrl], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    let pages;
    for (let i = 0; i < 80; i++) {
      try { pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (pages.some(page => page.type === 'page')) break; } catch { /* arranque */ }
      await sleep(100);
    }
    const page = pages?.find(item => item.type === 'page');
    assert.ok(page, 'Edge abrió index.html localmente');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0;
    const pending = new Map();
    socket.onmessage = event => { const message = JSON.parse(event.data); if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); } };
    function send(method, params = {}) {
      return new Promise(resolve => { const key = ++id; pending.set(key, resolve); socket.send(JSON.stringify({ id: key, method, params })); });
    }
    async function evaluate(expression) {
      const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.text);
      return response.result?.result?.value;
    }
    async function point(expression, vertical = .5) {
      return evaluate(`(() => { const el = ${expression}; el.scrollIntoView({ block: 'center', behavior: 'instant' }); const rect = el.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height * ${vertical} }; })()`);
    }
    async function mouse(type, x, y, pressed = false) {
      await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: pressed ? 1 : 0, clickCount: type === 'mousePressed' ? 1 : 0 });
    }
    async function drag(sourceExpression, targetExpression, vertical = .5, inspect = false) {
      const source = await point(sourceExpression);
      const target = await point(targetExpression, vertical);
      await mouse('mouseMoved', source.x, source.y);
      await mouse('mousePressed', source.x, source.y, true);
      await mouse('mouseMoved', source.x + 9, source.y + 9, true);
      await mouse('mouseMoved', target.x, target.y, true);
      await sleep(45);
      const during = inspect ? await evaluate(`({ floating: !!document.querySelector('.drag-float'), placeholder: !!document.querySelector('.drag-placeholder'), slot: document.querySelector('.drag-placeholder')?.dataset.slot || null, samePiece: document.querySelector('.drag-float') === window.__draggedPiece, copyNotSource: document.querySelector('.drag-float') !== window.__libraryPiece, cavity: !!document.querySelector('.program-body.is-target') })`) : null;
      if (during?.cavity && process.env.CODERUN_DRAG_SCREENSHOT) {
        const captured = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(process.env.CODERUN_DRAG_SCREENSHOT, Buffer.from(captured.result.data, 'base64'));
      }
      await mouse('mouseReleased', target.x, target.y);
      await sleep(70);
      return during;
    }
    await sleep(1000);
    await evaluate(`document.querySelector('#intro').style.display = 'none'`);
    const initial = await evaluate(`document.querySelector('#programStack').children.length`);
    assert.equal(initial, 0, 'el programa arranca vacío');
    await evaluate(`(() => {
      for (const selector of ['[data-type="SPEED"]','[data-type="RUN"]','[data-condition="OBSTACLE_AHEAD"]','[data-condition="GAP_AHEAD"]','[data-condition="ENEMY_NEAR"]']) document.querySelector('#blockBank ' + selector).click();
    })()`);
    await evaluate(`window.__libraryPiece = document.querySelector('#blockBank [data-type="JUMP"]')`);
    const obstacleCavity = await drag(`window.__libraryPiece`, `document.querySelectorAll('.program-body')[0]`, .5, true);
    assert.equal(obstacleCavity.floating, true);
    assert.equal(obstacleCavity.placeholder, true);
    assert.equal(obstacleCavity.slot, 'DENTRO');
    assert.equal(obstacleCavity.cavity, true);
    assert.equal(obstacleCavity.copyNotSource, true, 'la biblioteca conserva la plantilla y flota una copia');
    await drag(`document.querySelector('#blockBank [data-type="JUMP"]')`, `document.querySelectorAll('.program-body')[1]`);
    await drag(`document.querySelector('#blockBank [data-type="SHOOT"]')`, `document.querySelectorAll('.program-body')[2]`);
    const built = await evaluate(`({ root: document.querySelector('#programStack').children.length, bodies: [...document.querySelectorAll('.program-body')].map(body => body.children.length) })`);
    assert.deepEqual(built, { root: 5, bodies: [1, 1, 1] });
    await evaluate(`window.__draggedPiece = document.querySelector('#programStack').children[0]`);
    const after = await drag(`window.__draggedPiece`, `document.querySelector('#programStack').children[1]`, .9, true);
    assert.equal(after.samePiece, true, 'la pieza existente, no un clon, flota con el cursor');
    assert.equal(after.slot, 'DESPUÉS');
    const orderAfter = await evaluate(`document.querySelector('#programStack').firstElementChild.textContent.includes('CORRE')`);
    assert.equal(orderAfter, true);
    await evaluate(`window.__draggedPiece = document.querySelector('#programStack').children[1]`);
    const before = await drag(`window.__draggedPiece`, `document.querySelector('#programStack').children[0]`, .3, true);
    assert.equal(before.slot, 'ANTES');
    assert.equal(before.samePiece, true);
    const orderBefore = await evaluate(`document.querySelector('#programStack').firstElementChild.textContent.includes('VELOCIDAD')`);
    assert.equal(orderBefore, true);
    const rootCopy = await drag(`document.querySelector('#blockBank [data-type="CROUCH"]')`, `document.querySelector('.program-canvas')`, .9, true);
    const copied = await evaluate(`document.querySelector('#programStack').children.length`);
    assert.equal(rootCopy.slot, 'AL FINAL');
    assert.equal(copied, 6);
    await drag(`document.querySelector('#programStack').lastElementChild`, `document.querySelector('#trashZone')`);
    const deleted = await evaluate(`document.querySelector('#programStack').children.length`);
    assert.equal(deleted, 5);
    const edit = { initial, built, copied, deleted, footerVisible: await evaluate(`document.querySelector('#runBtn').getBoundingClientRect().bottom <= innerHeight`) };
    assert.equal(edit.footerVisible, true);
    await evaluate(`document.querySelector('#runBtn').click()`);
    const locked = await drag(`document.querySelector('#blockBank [data-type="JUMP"]')`, `document.querySelector('.program-canvas')`, .9, true);
    assert.equal(locked.floating, false, 'durante EJECUTAR no aparece ninguna pieza flotante');
    assert.equal(await evaluate(`document.querySelector('#programStack').children.length`), 5, 'durante EJECUTAR no se edita el programa');
    await sleep(6500);
    const result = await evaluate(`({ state: document.querySelector('#hudState').textContent, feedback: document.querySelector('#runFeedback').textContent, bugCleaned: document.querySelector('#bug').classList.contains('hit') })`);
    assert.equal(result.state, 'META');
    assert.match(result.feedback, /hizo exactamente lo que le programaste/);
    assert.equal(result.bugCleaned, true);
    const badProgram = await evaluate(`(() => {
      document.querySelector('#resetBtn').click();
      document.querySelector('#clearBtn').click();
      document.querySelector('#blockBank [data-type="RUN"]').click();
      const blocks = document.querySelector('#programStack').children.length;
      document.querySelector('#runBtn').click();
      return blocks;
    })()`);
    assert.equal(badProgram, 1);
    await sleep(1800);
    const consequence = await evaluate(`({ state: document.querySelector('#hudState').textContent, feedback: document.querySelector('#runFeedback').textContent })`);
    assert.equal(consequence.state, 'TERMINADO');
    assert.match(consequence.feedback, /Chocó con el obstáculo/);
    await evaluate(`document.querySelector('#resetBtn').click(); document.querySelector('#runBtn').click()`);
    await sleep(150);
    await evaluate(`document.querySelector('#stopBtn').click()`);
    const stopped = await evaluate(`document.querySelector('#hudState').textContent`);
    assert.equal(stopped, 'DETENIDO');
    console.log('Browser smoke OK:', edit, { obstacleCavity, after, before, rootCopy, locked }, result, consequence, { stopped });
  } finally {
    if (socket?.readyState === WebSocket.OPEN) socket.close();
    edge.kill();
    await sleep(300);
    const tempRoot = path.resolve(os.tmpdir());
    if (path.resolve(profile).startsWith(tempRoot + path.sep)) {
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Edge puede tardar en cerrar */ }
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
