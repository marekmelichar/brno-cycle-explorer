import { test, expect } from '@playwright/test';
import { collectConsoleErrors, waitForMapReady } from './helpers';

const SHARED = '/?wp=16.6,49.195;16.612,49.2&n=Start%20testu|C%C3%ADl%20testu&ride=sport&pref=shortest';

test.describe('share link + start from my location', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write', 'geolocation'], geolocation: { latitude: 49.2003, longitude: 16.6081 } });

  test('a shared link opens the plan, recalculates it, and sharing reproduces the link', async ({ page, context }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(SHARED);
    await waitForMapReady(page);
    const cfg = await page.evaluate(() => fetch('/api/config').then((r) => r.json()));

    // the plan is in the planner, the address bar is clean again
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Trasa načtena z odkazu' })).toBeVisible();
    await expect(page.getByTestId('waypoint-list').locator('li')).toHaveCount(2);
    await expect(page.getByLabel('Název bodu 1')).toHaveValue('Start testu');
    await expect(page.getByLabel('Název bodu 2')).toHaveValue('Cíl testu');
    await expect(page.getByLabel('Typ jízdy')).toContainText('Sportovní jízda');
    await expect(page.getByLabel('Preference trasy')).toContainText('Nejkratší trasa');
    expect(new URL(page.url()).search).toBe('');

    test.skip(!cfg.routing.available, 'routing not configured');
    // recalculated automatically, no button press
    await expect(page.getByTestId('planner-status')).toContainText(/\d+,\d km/, { timeout: 90_000 });

    // desktop: "Share link" copies the link
    await page.getByTestId('planner-share').click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'zkopírován' })).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    const q = new URL(link).searchParams;
    expect(q.get('wp')).toBe('16.6,49.195;16.612,49.2');
    expect(q.get('n')).toBe('Start testu|Cíl testu');
    expect(q.get('ride')).toBe('sport');
    expect(q.get('pref')).toBe('shortest');

    // the copied link works in a fresh tab
    const other = await context.newPage();
    await other.goto(link);
    await expect(other.getByTestId('waypoint-list').locator('li')).toHaveCount(2);
    await expect(other.getByTestId('planner-status')).toContainText(/\d+,\d km/, { timeout: 90_000 });
    expect(errors).toEqual([]);
  });

  test('an invalid link is ignored and the app starts normally', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/?wp=abc&ride=sport');
    await waitForMapReady(page);
    await expect(page.getByTestId('tab-map')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'z odkazu' })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('"start from my location" sets (and then replaces) the start point', async ({ page, context }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    await waitForMapReady(page);
    await page.getByTestId('tab-planner').click();
    await page.getByTestId('location-start').click();
    await expect(page.getByTestId('waypoint-list').locator('li')).toHaveCount(1);
    await expect(page.locator('.bce-waypoint').first()).toHaveText('S');

    // add a destination by clicking the map → route calculates from the location
    const box = (await page.getByTestId('map-container').boundingBox())!;
    // wait for the fly-to the location to finish, then click ~250 m east of it
    await page.waitForFunction(() => !(window as any).__bceMap.isMoving());
    const b = await page.evaluate(() => (window as any).__bceMap.project([16.6115, 49.2012]));
    await page.mouse.click(box.x + b.x, box.y + b.y);
    await expect(page.getByTestId('waypoint-list').locator('li')).toHaveCount(2);

    // a new location replaces the old location start instead of adding a point
    await context.setGeolocation({ latitude: 49.1975, longitude: 16.6035 });
    await page.getByTestId('location-start').click();
    await expect(page.getByTestId('waypoint-list').locator('li')).toHaveCount(2);
    // the location point gets a street name (Nominatim reverse) instead of "Moje poloha"
    await expect(page.getByLabel('Název bodu 1')).not.toHaveValue('Moje poloha', { timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test('blocked location access shows a clear message', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_ok, fail) => fail?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
    });
    await page.goto('/');
    await waitForMapReady(page);
    await page.getByTestId('tab-planner').click();
    await page.getByTestId('location-start').click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Přístup k poloze je zakázán' })).toBeVisible();
    await expect(page.getByTestId('waypoint-list').locator('li')).toHaveCount(0);
  });
});
