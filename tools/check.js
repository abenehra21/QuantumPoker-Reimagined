/**
 * tools/check.js — the cheap static checks.
 *
 * Every module must parse and resolve its own imports, every CSS variable
 * used must be defined somewhere, and nothing may import across a layer it
 * should not. Runs in a second and catches the class of mistake a test
 * suite never sees because the file never loaded.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
let failures = 0;
const fail = (msg) => { console.error('  ✗ ' + msg); failures++; };

function walk(dir, ext, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (name.endsWith(ext)) out.push(p);
  }
  return out;
}

/* ---- 1. every module loads ---- */
console.log('modules');
const jsFiles = walk(join(ROOT, 'src'), '.js').concat(walk(join(ROOT, 'tests'), '.js'));
for (const f of jsFiles) {
  const src = readFileSync(f, 'utf8');
  // Resolve every relative import by hand: importing for real would need a DOM.
  for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const target = resolve(dirname(f), m[1]);
    try { statSync(target); }
    catch (e) { fail(`${relative(ROOT, f)} imports missing ${m[1]}`); }
  }
}
console.log(`  ${jsFiles.length} files, ${failures} broken imports`);

/* ---- 1b. every module actually parses as ESM ---- */
{
  const { execFileSync } = await import('node:child_process');
  let bad = 0;
  for (const f of jsFiles) {
    try {
      execFileSync(process.execPath, ['--input-type=module', '--check'], {
        input: readFileSync(f, 'utf8'), stdio: ['pipe', 'ignore', 'pipe']
      });
    } catch (e) {
      const msg = String(e.stderr || e.message).split('\n').find((l) => /Error/.test(l)) || 'parse error';
      fail(`${relative(ROOT, f)}: ${msg.trim()}`);
      bad++;
    }
  }
  console.log(`  ${jsFiles.length} files parse as ES modules, ${bad} failed`);
}

/* ---- 2. layering ---- */
console.log('layering');
const before = failures;
for (const f of jsFiles) {
  const rel = relative(ROOT, f);
  const src = readFileSync(f, 'utf8');
  const imports = Array.from(src.matchAll(/from\s+['"]([^'"]+)['"]/g)).map((m) => m[1]);
  // The engine must stay runnable in Node: no UI, no DOM modules.
  //
  // Trick or Treat keeps its own presentation inside its module rather than
  // scattering Halloween code through src/ui, so its `ui/` folder and its
  // sound set are the two deliberate exceptions. Everything else under
  // src/halloween/ is rules, and the rules stay headless — which is what
  // lets the tests play thousands of nights without a browser.
  const headless = /^src\/(quantum|gameplay|ai|save|tutorial|utils)\//.test(rel)
    || (/^src\/halloween\//.test(rel) && !/^src\/halloween\/(ui\/|sounds\.js)/.test(rel));
  if (headless) {
    for (const i of imports) {
      if (/\/ui\/|\/render\/|\/effects\/|\/audio\//.test(i)) {
        fail(`${rel} reaches into the presentation layer (${i})`);
      }
    }
    if (/\bdocument\.|\bwindow\.(?!AudioContext)/.test(src.replace(/typeof window/g, ''))) {
      fail(`${rel} touches the DOM; it must run headless`);
    }
  }
}
console.log(`  ${failures - before} layering violations`);

/* ---- 2b. unused imports ---- */
console.log('imports');
{
  const before = failures;
  for (const f of jsFiles) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/import\s+\{([^}]+)\}\s+from\s+['"][^'"]+['"]/g)) {
      for (const raw of m[1].split(',')) {
        const name = raw.trim().split(/\s+as\s+/).pop().trim();
        if (!name) continue;
        // Count uses outside the import statements themselves. `$` and `$$`
        // are not word characters, so \b would never match them.
        const body = src.replace(/import\s+[^;]+;/g, '');
        const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = /^[A-Za-z_]/.test(name) ? `\\b${esc}\\b` : `(?<![\\w$])${esc}(?![\\w$])`;
        if (!new RegExp(pattern).test(body)) {
          fail(`${relative(ROOT, f)} imports ${name} and never uses it`);
        }
      }
    }
  }
  console.log(`  ${failures - before} unused imports`);
}

/* ---- 3. CSS variables ---- */
console.log('css');
const cssBefore = failures;
const cssFiles = walk(join(ROOT, 'styles'), '.css');
const css = cssFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
// Declarations can share a line, so anchor on the separator, not the line start.
const defined = new Set(Array.from(css.matchAll(/(?:^|[;{\s])(--[\w-]+)\s*:/gm)).map((m) => m[1]));
// Variables the UI sets from JavaScript at runtime.
for (const v of ['--rarity', '--tone', '--seat-accent', '--mode-accent', '--tier-color', '--val',
                 '--pct', '--spin-time', '--ent', '--from-x', '--from-y', '--from-r', '--shimmer',
                 '--orb-size', '--ripple-color', '--ripple-size', '--rad', '--dur', '--delay',
                 // Trick or Treat sets these per element as it animates.
                 '--fx', '--fy', '--fr', '--sz', '--i', '--who', '--card-w']) defined.add(v);
const used = new Set(Array.from(css.matchAll(/var\((--[\w-]+)/g)).map((m) => m[1]));
for (const v of used) if (!defined.has(v)) fail(`css uses ${v}, which nothing defines`);
console.log(`  ${defined.size} variables defined, ${used.size} used, ${failures - cssBefore} undefined`);

/* ---- 4. index.html references ---- */
console.log('html');
const htmlBefore = failures;
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:href|src)="((?!http|data:|#)[^"]+)"/g)) {
  try { statSync(join(ROOT, m[1])); } catch (e) { fail(`index.html references missing ${m[1]}`); }
}
console.log(`  ${failures - htmlBefore} missing files`);

/* ---- 5. README references ---- */
console.log('docs');
{
  const before = failures;
  const md = readFileSync(join(ROOT, 'README.md'), 'utf8');
  let images = 0;
  for (const m of md.matchAll(/!\[[^\]]*\]\(((?!http)[^)]+)\)/g)) {
    images++;
    try { statSync(join(ROOT, m[1])); } catch (e) { fail(`README references missing image ${m[1]}`); }
  }
  for (const m of md.matchAll(/\]\((?!http|#|mailto)([^)]+\.(?:js|py|css|md|txt|html))\)/g)) {
    try { statSync(join(ROOT, m[1])); } catch (e) { fail(`README links missing file ${m[1]}`); }
  }
  console.log(`  ${images} screenshots referenced, ${failures - before} missing`);
}

console.log(failures ? `\n${failures} problems.` : '\nAll static checks passed.');
process.exit(failures ? 1 : 0);
