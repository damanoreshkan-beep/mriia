
const FILES = ["dist/lite/index.html", "dist/lite/app-fallback.html"];

const BANNED = [
  [/var\(--/, "CSS custom property var(--...) — unsupported, Safari 9.1+/2016"],
  [/--[a-zA-Z-]+\s*:/, "a CSS custom property declaration (--name:) — unsupported"],
  [/`/, "a template-literal backtick — ES2015+, unparseable on BB10"],
  [/=>/, "an arrow function — ES2015+, unparseable on BB10"],
  [/\btype\s*=\s*["']module["']/, '<script type="module"> — silently never executes on BB10'],
  [/\bfetch\(/, "fetch() — unsupported on BB10 (XHR-only), and this page needs zero JS anyway"],
  [/@container/, "CSS @container query — unsupported, 2022-era"],
  [/color-mix\(/, "CSS color-mix() — unsupported, 2022-era"],
  [/\bdisplay\s*:\s*(flex|grid)\b/, "flexbox/grid layout — sidestepped per the plan (block/inline-block only)"],
  [/\bconst\s|\blet\s/, "const/let — ES2015+ keyword"],
  [/<script\b/i, "a <script> tag — the lite page must run with zero JS"],
];

let failed = false;
for (const f of FILES) {
  let text;
  try {
    text = await Deno.readTextFile(f);
  } catch {
    console.error(`FAIL ${f}: missing — run tools/build-lite.mjs first`);
    failed = true;
    continue;
  }
  let fileFailed = false;
  for (const [re, why] of BANNED) {
    if (re.test(text)) {
      console.error(`FAIL ${f}: matches ${re} — ${why}`);
      failed = true;
      fileFailed = true;
    }
  }
  if (!fileFailed) console.log(`ok   ${f}`);
}

if (failed) {
  console.error("\nlite-check: BB10/WebKit-537 compat check failed — see above");
  Deno.exit(1);
}
console.log("lite-check: all clear — ES5/WebKit-537-safe");
