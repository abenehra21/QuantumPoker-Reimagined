/**
 * tools/shots.js — capture the README screenshots.
 *
 * Drives headless Chrome over the DevTools protocol (no puppeteer, no
 * node_modules). Each shot navigates, waits for the game to settle, runs a
 * small setup script, and writes a PNG into docs/.
 *
 *   node tools/serve.py 8124 &
 *   node tools/shots.js
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = process.env.CHROME ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.BASE || 'http://localhost:8124';
const OUT = new URL('../docs/', import.meta.url).pathname;
const PROFILE = '/tmp/qp-shot-profile';
const PORT = 9333;
const W = 1440, H = 900;
const SCALE = 1.4;      // sharper than 1x, a third the bytes of 2x

/**
 * Helpers injected before every shot script. They drive the table through
 * its own controller and wait for its animation queue to drain, so the view
 * always shows the state the script asked for.
 */
const SETTLE = `
  const settle = async () => {
    for (let i = 0; i < 400; i++) {
      if (QP.table && !QP.table.busy) return;
      await new Promise(r => setTimeout(r, 50));
    }
  };
  const toStreet = async (round) => {
    for (let i = 0; i < 80; i++) {
      await settle();
      const g = QP.game;
      if (!g || g.round >= round || g.phase !== 'betting') return;
      if (g.actor === g.hero().seat) QP.table.act('call');
      else await new Promise(r => setTimeout(r, 120));
    }
  };
  const toGates = async () => {
    for (let i = 0; i < 160; i++) {
      await settle();
      const g = QP.game;
      if (!g || g.phase === 'gates' || g.phase === 'over') return;
      if (g.phase === 'betting' && g.actor === g.hero().seat) QP.table.act('call');
      else await new Promise(r => setTimeout(r, 120));
    }
  };
`;

const SHOTS = [
  { name: 'menu', url: '/index.html', wait: 2600 },
  { name: 'modes', url: '/index.html', wait: 1400,
    script: `QP.router.go('modes'); await new Promise(r=>setTimeout(r,900));` },
  { name: 'table', url: '/index.html?mode=student&seed=99', wait: 2200,
    script: `${SETTLE} await toStreet(2); await new Promise(r=>setTimeout(r,1600));` },
  { name: 'cards', url: '/index.html?mode=chaos&seed=4', wait: 2200,
    script: `${SETTLE} await toGates(); await new Promise(r=>setTimeout(r,2000));` },
  { name: 'circuit', url: '/index.html?mode=student&seed=12', wait: 2000,
    script: `${SETTLE}
      await toGates();
      const t = QP.table, g = QP.game, hero = g.hero();
      hero.hand = ['CX','H','X','GROVER'];
      t.renderHand();
      t.selectCard('CX', document.querySelector('.hand-row .card'));
      t.pickCoin(0); t.pickCoin(1);
      await settle();
      t.selectCard('H', [...document.querySelectorAll('.hand-row .card')].find(c=>c.dataset.card==='H'));
      t.pickCoin(2);
      await settle();
      const insp = await import('/src/ui/screens/inspector.js');
      insp.openInspector(QP, g, 'circuit');
      await new Promise(r=>setTimeout(r,1800));` },
  { name: 'sandbox', url: '/index.html', wait: 1400,
    script: `QP.router.go('sandbox'); await new Promise(r=>setTimeout(r,1600));` },
  { name: 'codex', url: '/index.html', wait: 1400,
    script: `QP.router.go('codex'); await new Promise(r=>setTimeout(r,1600));` },
  { name: 'shop', url: '/index.html?mode=endless&seed=7', wait: 2200,
    script: `
      QP.run.bank = 940;
      QP.router.push('shop', { run: QP.run });
      await new Promise(r=>setTimeout(r,1400));` },
  { name: 'tutorial', url: '/index.html', wait: 1400,
    script: `QP.router.go('tutorial'); await new Promise(r=>setTimeout(r,1600));` },
  { name: 'credits', url: '/index.html', wait: 1400,
    script: `QP.router.go('credits'); await new Promise(r=>setTimeout(r,1200));` },
  { name: 'stats', url: '/index.html', wait: 1400,
    script: `
      const p = QP.profile;
      p.totals = Object.assign(p.totals, { hands: 214, handsWon: 97, folds: 62, raises: 88,
        calls: 140, gates: 503, collapses: 121, links: 58, coherences: 7, chipsWon: 41200 });
      p.best = Object.assign(p.best, { round: 11, pot: 3840, entropy: 4.32, score: 5 });
      p.gateCounts = { X: 74, H: 66, Z: 41, CX: 58, M: 37, Y: 21, SWAP: 18, CCX: 12,
        GROVER: 5, BELL: 14, RY: 9, FREEZE: 7 };
      p.bosses = ['schrodinger','grover'];
      p.achievements = ['first_hand','first_win','first_gate','coherence','interference',
        'bell_collector','collapse_master','round_5','hands_100','boss_1','allin','kicker'];
      p.daily = Object.assign(p.daily, { played: 9, streak: 4, bestStreak: 6 });
      QP.router.invalidate('stats');
      QP.router.go('stats');
      await new Promise(r=>setTimeout(r,1400));` }
];

/* ---- a two-hundred-line CDP client, so there is nothing to install ---- */

function ws(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const key = Buffer.from(String(Math.random())).toString('base64');
    const sock = createConnection(Number(u.port), u.hostname, () => {
      sock.write(
        `GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\n` +
        `Upgrade: websocket\r\nConnection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
      );
    });
    let buf = Buffer.alloc(0), open = false;
    const handlers = new Map();
    let nextId = 1;
    const api = {
      send(method, params = {}, sessionId) {
        const id = nextId++;
        const msg = JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params });
        sock.write(frame(msg));
        return new Promise((res) => handlers.set(id, res));
      },
      close() { sock.destroy(); }
    };
    sock.on('error', reject);
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (!open) {
        const end = buf.indexOf('\r\n\r\n');
        if (end < 0) return;
        buf = buf.subarray(end + 4);
        open = true;
        resolve(api);
      }
      let msg;
      while ((msg = unframe())) {
        try {
          const json = JSON.parse(msg);
          if (json.id && handlers.has(json.id)) { handlers.get(json.id)(json.result || json.error); handlers.delete(json.id); }
        } catch (e) { /* a partial frame; wait for more */ }
      }
    });

    function unframe() {
      if (buf.length < 2) return null;
      const len0 = buf[1] & 0x7f;
      let offset = 2, len = len0;
      if (len0 === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); offset = 4; }
      else if (len0 === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); offset = 10; }
      if (buf.length < offset + len) return null;
      const payload = buf.subarray(offset, offset + len).toString('utf8');
      buf = buf.subarray(offset + len);
      return payload;
    }
  });
}

function frame(text) {
  const payload = Buffer.from(text, 'utf8');
  const mask = Buffer.from([0, 0, 0, 0]);
  let header;
  if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
  else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  return Buffer.concat([header, mask, payload]);
}

async function main() {
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    `--window-size=${W},${H}`, '--hide-scrollbars', `--force-device-scale-factor=${SCALE}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--autoplay-policy=no-user-gesture-required', 'about:blank'
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
    } catch (e) { /* not up yet */ }
  }
  if (!target) { chrome.kill(); throw new Error('Chrome never answered on the debugging port'); }

  const cdp = await ws(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride',
    { width: W, height: H, deviceScaleFactor: SCALE, mobile: false });

  for (const shot of SHOTS) {
    process.stdout.write(`  ${shot.name} … `);
    await cdp.send('Page.navigate', { url: BASE + shot.url });
    await sleep(shot.wait);
    if (shot.script) {
      const r = await cdp.send('Runtime.evaluate', {
        expression: `(async () => { ${shot.script} })()`,
        awaitPromise: true, returnByValue: true
      });
      if (r && r.exceptionDetails) console.log('script error:', JSON.stringify(r.exceptionDetails).slice(0, 200));
    }
    await sleep(700);
    // JPEG, not PNG: these are dark gradient-heavy screenshots, and at
    // quality 88 they are six times smaller with no visible difference.
    const res = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 88, captureBeyondViewport: false });
    if (!res || !res.data) { console.log('failed'); continue; }
    writeFileSync(OUT + shot.name + '.jpg', Buffer.from(res.data, 'base64'));
    console.log('ok');
  }

  cdp.close();
  chrome.kill();
  // Chrome keeps writing to its profile for a moment after the kill signal.
  await sleep(600);
  try { rmSync(PROFILE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
  catch (e) { /* a leftover temp profile is not worth failing over */ }
  console.log(`\nWrote ${SHOTS.length} screenshots to docs/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
