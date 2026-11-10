/**
 * # bump-core — move the product lock to a published @microspec/core
 *
 * Rewrites the four places `deno.lock` pins the core — the two `@1` range specifiers and the jsr + npm
 * version blocks (key, integrity and, for npm, the tarball URL) — then regenerates `preflight.map.json`
 * and the service worker. The integrities come straight from the registries, not from the local deno
 * cache, so a stale npm.jsr.io packument right after a publish cannot feed in the previous version's hash.
 *
 * ## Usage
 * ```sh
 * deno task bump-core             # move to the latest version on JSR
 * deno task bump-core 1.2.183     # move to an exact version
 * deno task bump-core --dry       # print what would change, write nothing
 * ```
 * The target version must already be live on JSR. After it runs, `deno task gates`.
 * @module
 */
const JSR = "@microspec/core";
const NPM = "@jsr/microspec__core";

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} — ${r.status}`);
  return await r.json();
}

async function jsrIntegrity(v) {
  const r = await fetch(`https://jsr.io/${JSR}/${v}_meta.json`);
  if (!r.ok) throw new Error(`jsr ${v}_meta.json — ${r.status}`);
  return hex(await crypto.subtle.digest("SHA-256", await r.arrayBuffer()));
}

function one(s, from, to) {
  const i = s.indexOf(from);
  if (i < 0) throw new Error(`lock has no: ${from}`);
  if (s.indexOf(from, i + from.length) >= 0) throw new Error(`lock is ambiguous for: ${from}`);
  return s.slice(0, i) + to + s.slice(i + from.length);
}

function integrityAfter(lock, key) {
  const at = lock.indexOf(`"${key}": {`);
  if (at < 0) throw new Error(`lock has no block: ${key}`);
  const m = lock.slice(at).match(/"integrity":\s*"([^"]+)"/);
  if (!m) throw new Error(`block has no integrity: ${key}`);
  return m[1];
}

const args = Deno.args.filter((a) => a !== "--dry");
const dry = Deno.args.includes("--dry");
const target = args[0] || (await json(`https://jsr.io/${JSR}/meta.json`)).latest;

let lock = await Deno.readTextFile("deno.lock");
const cur = lock.match(/"jsr:@microspec\/core@1":\s*"([^"]+)"/)?.[1];
if (!cur) throw new Error("lock has no jsr:@microspec/core@1 pin");
if (cur === target) {
  console.log(`bump-core: already at ${target}`);
  Deno.exit(0);
}

const npmVer = (await json(`https://npm.jsr.io/${NPM}`)).versions?.[target];
if (!npmVer) throw new Error(`npm.jsr.io has no ${NPM}@${target}`);
const newJsr = await jsrIntegrity(target);
const newNpm = npmVer.dist.integrity;
const oldJsr = integrityAfter(lock, `${JSR}@${cur}`);
const oldNpm = integrityAfter(lock, `${NPM}@${cur}`);

console.log(`bump-core: ${cur} -> ${target}`);
console.log(`  jsr ${newJsr}`);
console.log(`  npm ${newNpm}`);

lock = one(lock, `"jsr:@microspec/core@1": "${cur}"`, `"jsr:@microspec/core@1": "${target}"`);
lock = one(lock, `"npm:@jsr/microspec__core@1": "${cur}"`, `"npm:@jsr/microspec__core@1": "${target}"`);
const exact = `"npm:@jsr/microspec__core@${cur}": "${cur}"`;
if (lock.includes(exact)) lock = one(lock, exact, `"npm:@jsr/microspec__core@${target}": "${target}"`);
lock = one(lock, `"${JSR}@${cur}": {`, `"${JSR}@${target}": {`);
lock = one(lock, `"${NPM}@${cur}": {`, `"${NPM}@${target}": {`);
lock = one(lock, oldJsr, newJsr);
lock = one(lock, oldNpm, newNpm);
if (lock.includes(`/${cur}.tgz`)) lock = one(lock, `/${cur}.tgz`, `/${target}.tgz`);

if (dry) {
  console.log("bump-core: --dry, nothing written");
  Deno.exit(0);
}

await Deno.writeTextFile("deno.lock", lock);

for (const task of ["rtmap", "sw"]) {
  const r = await new Deno.Command("deno", { args: ["task", task] }).output();
  if (!r.success) throw new Error(`deno task ${task} failed`);
}
console.log("bump-core: lock, preflight.map.json and sw updated — now: deno task gates");
