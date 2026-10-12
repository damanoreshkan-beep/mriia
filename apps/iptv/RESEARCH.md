# iptv — the dead channels out, every channel through its own exit

2026-10-12. Owner: «давай iptv апкою займемось, видалимо мертві канали», then «а у нас наше iptv прямо в браузер
вантажить, не через сервер як проксі?» → «так давай через vps окрему поду створи … тільки з vpn нейтральної країни
де будуть працювати усі канали».

## What it was (VERIFIED, read in the code)
The app fetched `https://iptv-org.github.io/iptv/countries/<code>.m3u` from the browser and handed each stream URL
straight to the kit's `Player` (hls.js). So a channel played only if it was https (an http stream is mixed content on
https://mriia.si), sent CORS headers on its playlist and segments, and was not geo-locked for the VIEWER's country.

## The measurement (VERIFIED, `srv.ts` in the session scratchpad, run in throwaway containers on the VPS)
Each of the 20 lists the app offers, every channel checked as a proxy fetches it: the master is HLS → its first
variant is → the first segment's first bytes arrive (10 s per fetch, 96 at a time). 5 676 channels.

| exit | alive |
|---|---|
| a US ExpressVPN exit (`vpn-ext`, usa-boston) | **3 567** |
| the bare VPS (US datacenter address) | 3 566 — but **90 of 201 Ukrainian** against 146 through a VPN |
| the Netherlands (`vpn-reel`, rotterdam) | 3 475 |
| alive from at least one of the three | 3 766 |
| **dead from all three** | **1 910** (34 %) |

No country plays every channel: a geo-locked channel plays only from home (US lists 1 001 from the US against 872 from
the Netherlands; Polish, Dutch and German lists the other way round). One exit plays 95 % of everything that plays
anywhere, so the pod sits on the US — a region no other pod uses, `usa-washington-dc`. The Netherlands is one line in
edge `compose.yml` away and costs 92 channels.

## What was built
- **edge** (c4b7c24, 54923a9, 590ddfb): `vpn-tv` + `open-tv`, the `tv` egress group. hls.js fetches a proxied
  playlist's variants and segments itself, with no header and no envelope, so the group rides `eg` on the plain
  `/feed/frame` URL and `rewriteM3u8` writes it into every line — measured: all 6 segment lines of a live variant carry
  `eg=tv`. `/feed/tvlist?c=<code>` is served by the TV worker: the list without the channels that fail the same
  check from the TV exit, kept 12 h, swept at start and twice a day; an unchecked country is answered with the whole
  list at once (`checked: false`).
- **core 1.2.135**: `sealedFrameUrl(url, ref, egress)` puts the group in the envelope.
- **app**: the list from `/feed/tvlist` (iptv-org directly if the edge is down, and under the gate); a tap plays the
  sealed `/feed/frame` URL with the `tv` group, `type: "hls"` (a proxied URL has no extension).

## Proof on the live chain (VERIFIED)
- `/feed/egress` → `tv: US` on an address of its own; `/feed/tvlist?c=us` → `checked: true`, 987 of 1 481 alive.
- One channel end to end through mriia.si: master 200 in 0.64 s, variant 200 in 0.63 s, a 1 032 496 B MPEG-TS
  segment (`0x47` sync byte) in 1.23 s — 841 KB/s, five times the stream's 1.6 Mbit/s.
- The app on the VPS Chromium: 987 channels listed for the US, a tap opens the player and fetches master, variant and
  segment through `/feed/frame` (all 200), no page errors.

## UNVERIFIED / open
- **Playback in a real browser.** The VPS Chromium (Playwright's open-source build) has no H.264/AAC, so its `<video>`
  never left readyState 0 — the bytes are proven, the picture is not. The owner's phone is the test.
- Every viewer's video now crosses the VPS: bandwidth is the box's. Not measured under load.
- The first sweep ran while the tunnel was still connecting: the US list then counted 828 alive, the next 987. A
  sweep's numbers move with the exit's day; the 12 h refresh is the answer, not a fix.
- Channels that need their own User-Agent (`#EXTVLCOPT:http-user-agent`) cannot play through the proxy and are
  filtered out as dead from the TV exit.
