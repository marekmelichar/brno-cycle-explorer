# Cookbook: running the app in a Claude Code cloud session

How to run, preview, test and screenshot Brno Cycle Explorer inside a Claude Code cloud
session (claude.ai/code or the Claude app). On your own machine none of this applies. There,
follow the [Quick start](../README.md#quick-start-development).

## Why a cloud session differs from your laptop

| Topic | Laptop | Cloud session |
|---|---|---|
| Internet | Open | Only the hosts the **environment** allows. Everything else gets `403` from the proxy. |
| Outbound HTTPS | Direct | Goes through a proxy set in `HTTPS_PROXY`. |
| Node's built-in `fetch` | Works | **Ignores `HTTPS_PROXY`** unless `NODE_USE_ENV_PROXY=1` is set. The API uses `fetch`, so without it every external call fails with `fetch failed`. |
| Browser for Playwright | `npx playwright install` | Chromium is pre-installed at `/opt/pw-browsers/chromium`. Downloading another one is blocked. |
| Seeing the app | http://localhost:5173 | The container's localhost is not your localhost. Use the app's **preview pane** (port 5173) or screenshots. |

## Recipe 1: choose the right environment (one-off setup)

When you start a new cloud session, select the environment **`brno-cycle-explorer`**, not
`Default`. It allows exactly the hosts the app needs:

| Host | Used by | What breaks without it |
|---|---|---|
| `services6.arcgis.com` | API | No cycling data. `/api/health` reports `degraded` with `featureCount: 0`. |
| `brouter.de` | API | The default engine (BRouter) fails; only Valhalla routes. |
| `valhalla1.openstreetmap.de` | API | Valhalla routes fail. |
| `overpass-api.de`, `overpass.private.coffee` | API | Stairs tab falls back to stairs from the map tiles (no step counts). **Note:** on 2026-11-16 both refused connections from the cloud session even when allowed (TLS reset / timeout), so in a cloud session the tab normally shows the fallback. |
| `nominatim.openstreetmap.org` | API | Address search returns nothing. |
| `tiles.openfreemap.org` | Browser | Grey map with the message "Mapový podklad se nepodařilo načíst" (cycling layers still render). |

npm and the other package registries are allowed by default.

> If you change a hard-coded URL or add a provider (for example `BASEMAP_STYLES`), add its host
> to the environment under claude.ai → environment settings, or ask Claude to do it.

## Recipe 2: start the app

```bash
npm install
```

```bash
NODE_USE_ENV_PROXY=1 npm run dev
```

Check that it works:

```bash
curl -s localhost:5173/api/health
```

Expected: `"status":"ok"` with `featureCount` around 700. If you get `degraded` with
`fetch failed`, see [Troubleshooting](#troubleshooting).

## Recipe 3: see it

- **Preview pane:** Claude reports port 5173 to the app and the page opens in the side panel.
  Your own browser fetches the basemap tiles, so it works even without `tiles.openfreemap.org`.
- **Screenshot:** ask Claude for "a screenshot of the app". It renders the page with the
  pre-installed Chromium. It can send you the PNG only in sessions that support sending files
  (e.g. project threads); otherwise it can look at the screenshot and describe it.

## Recipe 4: tests

Unit and integration tests (no network needed):

```bash
npm test
```

Browser tests. Start the dev server first (Recipe 2) so Playwright reuses it with the proxy
setting, and point Playwright at the pre-installed Chromium:

```bash
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e
```

Tested in a cloud session on 2026-11-16: 101/101 unit tests and 21/21 e2e tests passed.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `/api/health` → `degraded`, `lastError: "Služba ArcGIS není dostupná: fetch failed"` | Started without `NODE_USE_ENV_PROXY=1`, **or** the host is not allowed | Restart with Recipe 2. If it persists, run `curl -sS https://services6.arcgis.com` and look for `CONNECT tunnel failed, response 403`, which means the host is not allowed (Recipe 1). |
| `curl: (56) CONNECT tunnel failed, response 403` | Host is not in the environment's allowlist | Add the host to the environment. |
| Grey map + "Mapový podklad se nepodařilo načíst" in a screenshot | `tiles.openfreemap.org` not allowed | Add the host. This doesn't affect the preview pane. |
| Playwright: `Executable doesn't exist … npx playwright install` | Downloading browsers is blocked | Set `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`. Don't run `playwright install`. |
| Port 5173 already in use (`strictPort`) | An earlier dev server is still running | `pkill -f "[v]ite"; pkill -f "[t]sx watch"`, then start again. The brackets matter: a plain `pkill -f vite` run by Claude also matches and kills its own shell. |
| Everything was fine, now it's gone | The container is recycled after inactivity | Run Recipe 2 again. Data re-downloads in about 2 s. |

## Quick reference

```bash
npm install
NODE_USE_ENV_PROXY=1 npm run dev
curl -s localhost:5173/api/health
npm test
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e
```
