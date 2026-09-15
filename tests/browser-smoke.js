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
    await sleep(1000);
    const edit = await evaluate(`(() => {
      const stack = document.querySelector('#programStack');
      const library = document.querySelector('#blockBank');
      const trash = document.querySelector('#trashZone');
      const drag = (source, target) => {
        const dataTransfer = new DataTransfer();
        source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
        target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
        target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
        source.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
      };
      const initial = stack.children.length;
      drag(library.querySelector('[data-type="SHOOT"]'), stack);
      const copied = stack.children.length;
      const gapBody = stack.querySelectorAll('.program-body')[1];
      drag(stack.lastElementChild, gapBody);
      const refreshedGap = stack.querySelectorAll('.program-body')[1];
      const nested = refreshedGap.children.length;
      drag(refreshedGap.lastElementChild, trash);
      const deleted = stack.querySelectorAll('.program-body')[1].children.length;
      const footerVisible = document.querySelector('#runBtn').getBoundingClientRect().bottom <= innerHeight;
      return { initial, copied, nested, deleted, footerVisible };
    })()`);
    assert.equal(edit.initial, 5);
    assert.equal(edit.copied, 6);
    assert.equal(edit.nested, 2);
    assert.equal(edit.deleted, 1);
    assert.equal(edit.footerVisible, true);
    await evaluate(`document.querySelector('#runBtn').click()`);
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
    console.log('Browser smoke OK:', edit, result, consequence, { stopped });
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
