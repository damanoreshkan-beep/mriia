/**
 * # rt/backend.js — the Mriia farm's backend, as this product tells the core (core ≥ 1.2.137)
 *
 * The core names no product: its runtime/backend.js holds a default this file shadows by name — the same
 * overlay that carries rt/theme.css (the build copies rt/ over the core's runtime, the dev and gate servers
 * serve rt/ first, rtmap maps the core's URL for this name to ./rt/backend.js for preflight).
 *
 * - ORIGINS — the farm's own origins, canonical first: a page on one of them talks to its own origin's /feed;
 *   any other page (localhost dev, a test, an embedder) to mriia.si. microspec-edge allows the same set
 *   (edge/util.js ALLOW_ORIGIN).
 * - SEALED_KEY — microspec-edge's pinned long-term public key (base64url) for the sealed tunnel. Pinned in
 *   source, never fetched; check it after a rotation against GET /feed/pubkey by hand.
 * @module
 */

/** The farm's origins, the canonical one first. */
export const ORIGINS = ["https://mriia.si", "https://dreamstudio.mooo.com"];

/** microspec-edge's pinned long-term public key (base64url) for the sealed tunnel. */
export const SEALED_KEY = "BLP-06vCYzSiakKos1Sk7Yqzneb0MrbBjozH3EQ_YRgvzqc_0hcZeeFXoDzMhHlXL3awFtjOMFg08dzcKUmbNOM";
