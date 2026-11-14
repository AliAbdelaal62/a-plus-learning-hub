// Builds the A+ Hub experimental preview from the ORIGINAL source in aplus-preview/original.
//   bun aplus-preview/build.ts           -> public/aplus/runtime.js (+ wasm, vendor libs)
//   bun aplus-preview/build.ts --node    -> /tmp/aplus-node-core.cjs (same code, for parity tests in Node)
// Original files are never edited on disk; the few runtime adaptations are applied in memory below and listed in README.md.
import { readdirSync, readFileSync, statSync, mkdirSync, copyFileSync, existsSync } from "fs";
import { join, relative, dirname } from "path";
import { tmpdir } from "os";
import type { BunPlugin } from "bun";

const HERE = import.meta.dir;
const ORIG = join(HERE, "original");
const SHIMS = join(HERE, "runtime", "shims");
const ROOT = join(HERE, "..");
const TEST = process.argv.includes("--test") ? process.argv[process.argv.indexOf("--test") + 1] : null;
const SECURE=process.argv.includes('--secure');
const NODE = process.argv.includes("--node") || !!TEST || SECURE;
const temp = process.env.APLUS_BUILD_TEMP || tmpdir();

function walk(dir: string, out: string[] = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

// Files the original server reads from disk at runtime: its own sources, migrations, fixture, and served pages.
function embedded() {
  const files: Record<string, string> = {};
  const add = (p: string) => { files["/app/" + relative(ORIG, p).split("\\").join("/")] = readFileSync(p, "utf8"); };
  if (TEST) { for (const p of walk(ORIG)) add(p); return files; }
  for (const p of walk(join(ORIG, "src"))) add(p);
  for (const p of walk(join(ORIG, "db"))) add(p);
  for (const n of ["index.html", "team-login.html", "team-login.js"]) add(join(ORIG, "public", n));
  for (const p of walk(join(ORIG, "fixtures"))) add(p);
  add(join(ORIG, "package.json"));
  for (const p of walk(join(HERE, "extensions"))) {
    if (p.endsWith('.sql') || p.endsWith('.css')) files['/app/preview/' + relative(join(HERE, 'extensions'), p)] = readFileSync(p, 'utf8');
  }
  return files;
}

function replaceExact(src: string, from: string, to: string, file: string, expected?: number) {
  const n = src.split(from).length - 1;
  if (n === 0 || (expected !== undefined && n !== expected)) throw new Error(`adaptation for ${file} expected ${expected ?? ">0"} of ${JSON.stringify(from)}, found ${n}`);
  return src.split(from).join(to);
}

const plugin: BunPlugin = {
  name: "aplus-preview",
  setup(build) {
    const map: Record<string, string> = {
      "node:sqlite": join(SHIMS, "sqlite.js"), fs: join(SHIMS, "fs.js"), "node:fs": join(SHIMS, "fs.js"),
      crypto: join(SHIMS, "crypto.js"), "node:crypto": join(SHIMS, "crypto.js"), os: join(SHIMS, "os.js"),
      http: join(SHIMS, "http.js"), path: require.resolve("path-browserify"), "node:path": require.resolve("path-browserify"),
      buffer: require.resolve("buffer/"),
    };
    build.onResolve({ filter: /^aplus-shim:/ }, (a) => NODE && a.path === "aplus-shim:buffer" ? ({ path: "node:buffer", external: true }) : ({ path: map[a.path.slice(11)] }));
    build.onResolve({ filter: /^aplus-embedded$/ }, () => ({ path: "aplus-embedded", namespace: "aplus" }));
    build.onLoad({ filter: /.*/, namespace: "aplus" }, () => ({ contents: "module.exports=" + JSON.stringify(embedded()), loader: "js" }));
    build.onLoad({ filter: /sql-wasm-debug\.js$/ }, (a) => {
      let s = readFileSync(a.path, "utf8");
      // open SQLite databases at a real path on the in-memory file system instead of a random temporary name
      s = replaceExact(s, 'this.filename = "dbfile_" + (0xffffffff * Math.random() >>> 0);', 'this.filename = Module.__p || ("dbfile_" + (0xffffffff * Math.random() >>> 0));', "sql.js", 1);
      s = replaceExact(s, 'FS.unlink("/" + this.filename);', 'if (!this.filename.startsWith("/")) FS.unlink("/" + this.filename);', "sql.js", 1);
      s = replaceExact(s, "FS.createPreloadedFile = FS_createPreloadedFile;", "FS.createPreloadedFile = FS_createPreloadedFile; Module.FS = FS;", "sql.js", 1);
      return { contents: s, loader: "js" };
    });
    build.onLoad({ filter: /aplus-preview[\\/]original[\\/].*\.js$/ }, (a) => {
      const rel = relative(ORIG, a.path).split("\\").join("/");
      let s = readFileSync(a.path, "utf8");
      s = s.split("__dirname").join(JSON.stringify("/app/" + dirname(rel)));
      s = s.replace(/require\((['"])(node:sqlite|node:fs|fs|crypto|node:crypto|os|http|path|node:path|buffer)\1\)/g, (_m, _q, n) => `require("aplus-shim:${n}")`);
      if (rel === "src/server.js") {
        s=replaceExact(s,"authSetupCode } = {})", "authSetupCode, csrfToken } = {})",rel,1);
        s=replaceExact(s,"const token = crypto.randomBytes(24).toString('hex');", "const token = csrfToken||crypto.randomBytes(24).toString('hex');",rel,1);
        // the page uses synchronous XMLHttpRequest, so the handler must finish synchronously (body is already in memory)
        s = replaceExact(s, "async function api(req, res, url)", "function api(req, res, url)", rel, 1);
        s = replaceExact(s, "await readBody(req)", "req.__json()", rel);
        s = replaceExact(s, "return await api(req, res, url);", "return api(req, res, url);", rel, 1);
        s = replaceExact(s, "http.createServer(async (req, res) =>", "http.createServer((req, res) =>", rel, 1);
        s = replaceExact(s, "require.main === module", "false", rel, 1);
        const body = s.slice(s.indexOf("function api("), s.indexOf("function serveStatic("));
        if (/\bawait\b/.test(body)) throw new Error("server.js api() still awaits");
      }
      if (rel === "src/state.js") s = replaceExact(s.replace(/\r\n/g,"\n"), "  return st;\n}\nmodule.exports", "  return require('../../extensions/course-projection').project(db,st);\n}\nmodule.exports", rel, 1);
      if (rel === "src/store.js") s = replaceExact(s, "['__nullify', '__dropLinks']", "['__nullify', '__dropLinks', 'withdrawalReduction', 'withdrawalOriginalPrice', 'withdrawalClosedOn', 'withdrawalRefund', 'withdrawalNetPaid']", rel, 1);
      if (rel === "src/finance.js") s = replaceExact(s, "const rev=Math.round(c.price*c.n),", "const rev=Math.round(c.price*c.n)-(c.withdrawalReduction||0),", rel, 1);
      if (rel === "src/ledger.js") {
        s = replaceExact(s, "a.ok === 'cp' ? g(db.cp, a.oid) : null", "a.ok === 'cp' ? g(db.cp, a.oid) : a.ok === 're' ? (()=>{const e=g(db.re,a.oid);return e?{amt:e.paid-arr(db,'cp').filter(p=>p.re===e.id).reduce((s,p)=>s+p.amt,0)}:null})() : null", rel, 1);
        s = replaceExact(s, "add(r.charged, 'Recorded', e.price);", "add(r.charged, 'Recorded', E&&e.withdrawalClosedOn&&E<e.withdrawalClosedOn?e.withdrawalOriginalPrice:e.price);", rel, 1);
      }
      if (rel === "src/ledger.js") s = replaceExact(s, "collected: paid, opening:", "collected: en.reduce((q,e)=>q+(e.withdrawalClosedOn?e.withdrawalNetPaid:e.paid||0),0), grossCollected:paid, refunded:en.reduce((q,e)=>q+(e.withdrawalRefund||0),0), opening:", rel, 1);
      if (rel === "src/management.js") {
        s = replaceExact(s, "received,remaining:c.total-received,", "received,remaining:c.status==='Cancelled'&&c.source_kind==='Recorded'&&st.re.some(e=>e.id===c.target_id&&e.withdrawalClosedOn)?0:c.total-received,", rel, 1);
        s = replaceExact(s, "a.ok==='cp'&&ids.includes(a.oid)&&a.kind==='refund'", "(a.ok==='cp'&&ids.includes(a.oid)||a.ok==='re'&&a.oid===c.target_id)&&a.kind==='refund'", rel, 1);
      }
      if (rel === "src/scheduler.js") s = replaceExact(s, "timer.unref();", "timer.unref && timer.unref();", rel, 1);
      return { contents: s, loader: "js" };
    });
  },
};

let entry: string;
if (TEST) {
  entry = join(temp,"aplus-test-entry-" + TEST + ".js");
  await Bun.write(entry, `require(${JSON.stringify(join(HERE, "runtime", "test-harness.js"))}).boot(${JSON.stringify(join(ROOT, "node_modules/sql.js/dist/"))}).then(() => { process.chdir && 0; require(${JSON.stringify(join(ORIG, "tests", TEST + ".test.js"))}); });`);
} else entry = NODE ? join(HERE, "runtime", "core.js") : join(HERE, "runtime", "browser.js");
const result = await Bun.build({
  entrypoints: [entry], target: NODE ? "node" : "browser", format: NODE ? "cjs" : "iife", plugins: [plugin], minify: false,
  define: NODE ? {} : { "process.env.NODE_ENV": '"production"' },
});
if (!result.success) { for (const l of result.logs) console.error(l); process.exit(1); }
const code = await result.outputs[0].text();
if (TEST) {
  await Bun.write(join(temp,"aplus-test-" + TEST + ".cjs"), code);
  console.log("test bundle -> " + join(temp,"aplus-test-" + TEST + ".cjs"));
} else if (SECURE) {
  const out=join(ROOT,'secure-server','generated');mkdirSync(out,{recursive:true});await Bun.write(join(out,'engine.cjs'),code);
  copyFileSync(join(ROOT,'node_modules','sql.js','dist','sql-wasm-debug.wasm'),join(out,'engine.wasm'));
  console.log('server-only engine -> secure-server/generated/engine.cjs');
} else if (NODE) {
  await Bun.write(join(temp,"aplus-node-core.cjs"), code);
  console.log("node core -> " + join(temp,"aplus-node-core.cjs"));
} else {
  const out = join(ROOT, "public", "aplus"); mkdirSync(out, { recursive: true });
  await Bun.write(join(out, "runtime.js"), "/* A+ Hub experimental preview runtime. Generated by aplus-preview/build.ts from the original source; do not edit. */\n" + code);
  copyFileSync(join(ROOT, "node_modules", "sql.js", "dist", "sql-wasm-debug.wasm"), join(out, "sql-wasm-debug.wasm"));
  // static files the original page loads by absolute path
  copyFileSync(join(ORIG, "public", "team-login.js"), join(ROOT, "public", "team-login.js"));
  const vend = join(ROOT, "public", "vendor"); mkdirSync(vend, { recursive: true });
  for (const n of readdirSync(join(ORIG, "public", "vendor"))) copyFileSync(join(ORIG, "public", "vendor", n), join(vend, n));
  console.log("browser runtime -> public/aplus/runtime.js", (code.length / 1024).toFixed(0) + " KB", existsSync(join(out, "index.html")) ? "" : "(stub page missing)");
}
