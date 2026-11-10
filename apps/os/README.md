<div align="center">

<img src="icon.svg" width="84" height="84" alt="microspec OS">

# microspec OS

**What this device lets an app do**

![](https://img.shields.io/badge/-tools-C13BFF?style=flat-square) ![](https://img.shields.io/badge/-offline-1F6B42?style=flat-square) ![](https://img.shields.io/badge/-installable-000000?style=flat-square)

</div>

---

**Screens** Device · Radar · Files · Alarms  ·  **Capabilities** —  ·  **Offline** yes  ·  **Installable** yes

---

## Control bridge — MCP

microspec OS turns the phone into something an agent can drive. It runs a local **MCP** server: a terminal, or Claude, speaks JSON-RPC to it and the phone answers. The server binds to `127.0.0.1`, every call carries a bearer token, and nothing leaves the device.

- **Endpoint** `http://127.0.0.1:8765/mcp`
- **Transport** JSON-RPC 2.0 over HTTP (also `GET /x/<action>` for a quick shot)
- **Auth** Bearer token — shown and copied on the Bridge screen

**Screen & feedback**

- `brightness` — read or set screen brightness
- `torch` — flashlight on or off
- `vibrate` — a haptic buzz
- `speak` — text-to-speech in the phone's own voice

**Sound**

- `volume` — read or set a stream's volume

**Apps & routes**

- `apps` — a manifest of every installed app and the deep-link protocols it answers
- `open` — open a URL or an app route; it reaches the screen even from the background
- `launch` — start an app by package name

**Device**

- `info` — device facts
- `battery` — charge and power state
- `wifi` — network state
- `settings` — jump to a system settings page
- `clip` — read or write the clipboard
- `audit` — what can watch the device: accessibility, device admins, VPN

**Example** — open a Telegram chat with the message already typed

```
open  https://t.me/share/url?text=Hello%20from%20the%20bridge
```

Part of the **[microspec farm](../../)** — an AI-authored, gated micro-PWA. Every screen is accessible,
responsive, installable and offline by construction. Browse the whole set from the **[store](../store/)**.

<sub>Generated from `spec.json` + `i18n/` by `deploy/readme.mjs` — edit the app, not this file.</sub>
