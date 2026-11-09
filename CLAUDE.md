# How to work in this repository

## Ship

- Work on branch `dev`. `git push` there ships the tree to the VPS dev pod; look at it with
  `deno run -A /root/microspec-edge/vps/rchrome.mjs <app> --vps [--light] [--gate] [steps]`, both themes, and read the PNG.
- `main` is production: fast-forward `dev` into it, then `git push origin main`. The push runs `verify`; `deploy` chains
  off it. A red main never deploys — fix forward.
- Before any push: `deno task gates`. A core change ships first (`/root/microspec`: bump `deno.json`, push, wait for
  `https://jsr.io/@microspec/core/meta.json` to list the version), then this repo's `deno.lock` moves to it by hand
  (`integrity` = sha256 of `<version>_meta.json`), then `deno task install && deno task rtmap && deno task sw`.
- Never start a dev server or a browser on this phone. The phone edits and pushes; the VPS and CI run everything else.
- `deno run -A .microspec/verify.mjs "$PWD/apps/<app>"` runs one app's e2e in a real browser; without a live backend
  it reports failures that are not yours — compare against the unmodified HEAD before believing one.

## Rules this repo got wrong before

- Code carries no comments. The one exception is JSDoc on an exported symbol, because JSR renders it. Nothing in a
  repo quotes or paraphrases a conversation, a person, a date or a decision.
- A honeycomb cell has two states: itself, and itself grown on the canvas. Never a bottom sheet, dialog or pinned
  island as a state of a comb host.
- An e2e step waits for the page's state (`h.until(expr)`), never for milliseconds (`h.wait(ms)`).
- Chrome geometry (`--dock-h`, `--hdr-h`, safe areas) is never written in an app; fixed layers use `.ms-stage`.
- A one-off check never runs inside a repo with a package import; `deno.lock` changes only when the product needs the
  package. `git status --short deno.lock` is empty before a commit.
- Public copy promises only what the farm keeps. Slogans are one image, no mechanics, no numbers.

## For the product owner

The product owner is not a programmer. Do the whole task and report in a sentence or two: what changed, whether it
is live, what the number says. Before a visible state is built, say in one sentence what the user will see.
Diagnostics and reasoning go to the commit message, not to chat.
