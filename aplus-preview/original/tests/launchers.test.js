'use strict';
// Windows launchers (statically) + the pre-flight script (behaviourally). Does NOT prove they run on Windows.
const assert = require('node:assert/strict'); const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'); const { start } = require('../src/server');
const root = path.join(__dirname, '..'); let n = 0; const ok = () => n++;
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
for (const f of ['start-aplus.cmd', 'start-synthetic.cmd', 'run-tests.cmd', 'windows-validate.cmd', 'migrate-dry-run.cmd', 'backup-now.cmd', 'restore-backup.cmd', 'verify-db.cmd']) {
  const t = rd(f); assert.ok(/\r\n/.test(t) && !/[^\r]\n/.test(t), f + ' must use CRLF'); assert.ok(!/--apply/.test(t), f + ' must not pass --apply');
  assert.ok(!/^\s*(del|erase|rmdir|rd)\b.*(data|aplus\.sqlite)/im.test(t), f + ' must not delete data'); ok(); }
for (const f of ['start-aplus.cmd', 'start-synthetic.cmd']) { const t = rd(f); assert.match(t, /where node/); assert.match(t, /launch-check\.js/); assert.match(t, /exit \/b %RC%/); ok(); }
assert.match(rd('start-synthetic.cmd'), /synthetic\.sqlite/); assert.doesNotMatch(rd('start-synthetic.cmd'), /aplus\.sqlite/); ok();
assert.match(rd('run-tests.cmd'), /exit \/b %RC%/); ok();
const { spawn } = require('child_process'); // async on purpose: the in-process server must keep answering while the check runs
const chk = port => new Promise(r => { const c = spawn(process.execPath, ['--no-warnings', path.join(root, 'scripts', 'launch-check.js'), String(port)]); c.on('close', code => r({ status: code })); });
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-lc-'));
  const s = await start({authRequired:false, port: 0, dbFile: path.join(dir, 'a.sqlite'), backupDir: path.join(dir, 'b') });
  assert.equal((await chk(s.port)).status, 10, 'A+ already running on that port'); ok(); await s.close();
  assert.equal((await chk(s.port)).status, 0, 'free port -> go'); ok();
  const other = http.createServer((q, r) => r.end('hi')); await new Promise(r => other.listen(0, '127.0.0.1', r)); assert.equal((await chk(other.address().port)).status, 11, 'foreign program on the port'); other.close(); ok();
  const dd = path.join(root, 'data'), snap = () => (fs.existsSync(dd) ? fs.readdirSync(dd).join() : '-'), before = snap(); await chk(s.port); assert.equal(snap(), before, 'pre-flight creates nothing'); ok();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('LAUNCHERS TEST OK: ' + n + ' checks (CRLF, Node check, port/instance pre-flight 0/10/11, no --apply, no data deletion, synthetic launcher never names the real database). Static + Linux only; not a Windows run.');
})().catch(e => { console.error(e); process.exit(1); });
