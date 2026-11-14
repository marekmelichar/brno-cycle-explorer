import { expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

export function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

export function trackRequests(page: Page) {
  const requests: Array<{ url: string; status: number | null }> = [];
  page.on('response', (r) => requests.push({ url: r.url(), status: r.status() }));
  page.on('requestfailed', (r) => requests.push({ url: r.url(), status: null }));
  return requests;
}

/** Waits until MapLibre has a loaded style, our overlays exist, and all tiles are idle. */
export async function waitForMapReady(page: Page) {
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { __bceMap?: any }).__bceMap;
      return !!m && m.isStyleLoaded() && !!m.getLayer('bce-infra-separated_path') && !!m.getSource('openmaptiles') && m.areTilesLoaded();
    },
    null,
    { timeout: 60_000 },
  );
  // wait for an idle frame
  await page.evaluate(
    () =>
      new Promise<void>((res) => {
        const m = (window as unknown as { __bceMap: any }).__bceMap;
        if (m.loaded()) res();
        else m.once('idle', () => res());
        setTimeout(res, 10_000);
      }),
  );
}

export async function renderedCounts(page: Page) {
  return page.evaluate(() => {
    const m = (window as unknown as { __bceMap: any }).__bceMap;
    const out: Record<string, number> = {};
    for (const f of m.queryRenderedFeatures()) {
      const k = f.source === 'openmaptiles' ? `omt:${f.sourceLayer}` : f.source;
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  });
}

/** Analyses the pixels of a PNG screenshot of the map. */
export function analysePixels(buf: Buffer) {
  const png = PNG.sync.read(buf);
  const counts = new Map<number, number>();
  const total = png.width * png.height;
  for (let i = 0; i < png.data.length; i += 4 * 7) {
    // quantize to 5 bits/channel
    const key = ((png.data[i] >> 3) << 10) | ((png.data[i + 1] >> 3) << 5) | (png.data[i + 2] >> 3);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sampled = Math.ceil(png.data.length / (4 * 7));
  const dominant = Math.max(...counts.values()) / sampled;
  return { width: png.width, height: png.height, total, uniqueColors: counts.size, dominantShare: dominant };
}

export async function expectNoAccessBlocked(page: Page, requests: Array<{ url: string }>) {
  expect(requests.filter((r) => r.url.includes('tile.openstreetmap.org')), 'no OSM standard tile requests').toHaveLength(0);
  await expect(page.getByText(/Access blocked/i)).toHaveCount(0);
}
