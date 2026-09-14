import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import Icons from 'unplugin-icons/vite';
import { chromium } from 'playwright';
import { installScreenshotFixture } from './fixture.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const staging = path.join(root, 'output/playwright/docs');
const destination = path.join(root, 'docs/public/images');
await mkdir(staging, { recursive: true });
// Serve only the renderer: no Electron process, real IPC, or container operations.
const server = await createServer({
  configFile: false,
  root: path.join(root, 'src/renderer'),
  resolve: { alias: { '@frappe-local': path.join(root, 'src') } },
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [vue(), Icons({ compiler: 'vue3' })],
  optimizeDeps: {
    include: ['dayjs', 'debug', 'highlight.js', 'highlight.js/lib/core', 'xmlhttprequest-ssl'],
    exclude: ['frappe-ui'],
  },
  server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 4,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  await context.addInitScript(installScreenshotFixture, { version });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.clock.setFixedTime(new Date('2026-09-14T09:05:00.000Z'));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Keep fixtures independent of registry availability and third-party services.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.getByRole('button', { name: 'Browser', exact: true }).waitFor();
  const names = [];
  async function capture(name) {
    await page.evaluate(() => document.fonts.ready);
    // Always retain the full app window, including the backdrop behind dialogs.
    await page.screenshot({ path: path.join(staging, `${name}.png`), animations: 'disabled', scale: 'device' });
    names.push(name);
  }
  await capture('site-overview');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: /development/ }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('textbox', { name: /Site name/ }).fill('sandbox');
  await capture('new-site');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('link', { name: 'Benches', exact: true }).click();
  await page.getByRole('button', { name: 'Restart', exact: true }).waitFor();
  await capture('bench-overview');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name (required)', exact: true }).fill('my-bench');
  await page.getByRole('textbox', { name: '/path/to/bench', exact: true }).fill('/Users/demo/Frappe/my-bench');
  await capture('new-bench');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('link', { name: 'My Apps', exact: true }).click();
  await page.getByRole('button', { name: 'Add Custom App', exact: true }).click();
  await capture('custom-app');
  await page.getByRole('radio', { name: 'Local', exact: true }).click();
  await page.getByRole('textbox', { name: 'Local Folder Path', exact: true }).fill('/Users/demo/projects/my-app');
  await capture('local-app');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('textbox', { name: 'Storage Path', exact: true }).waitFor();
  await capture('settings');
  await page.getByRole('tab', { name: 'Advanced', exact: true }).click();
  await page.getByRole('button', { name: 'Use recommended', exact: true }).waitFor();
  await capture('settings-advanced');
  await page.getByRole('tab', { name: 'Updates', exact: true }).click();
  await page.getByRole('button', { name: 'Check Now', exact: true }).waitFor();
  await capture('settings-updates');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('link', { name: 'Diagnostics', exact: true }).click();
  await page.getByText('Storage directory', { exact: true }).waitFor();
  await capture('diagnostics');
  await page.getByRole('link', { name: 'Activity', exact: true }).click();
  await page.getByText('Migrate site demo.localhost', { exact: true }).waitFor();
  await capture('activity');
  await page.getByText('Migrate site demo.localhost', { exact: true }).click();
  await page.getByPlaceholder('Search logs…').waitFor();
  await page.getByRole('button', { name: 'Expand all', exact: true }).click();
  await page.getByText('Updating DocTypes for frappe', { exact: true }).waitFor();
  await capture('task-logs');
  await page.getByLabel('Close', { exact: true }).click();
  await page.getByRole('link', { name: 'Benches', exact: true }).click();
  await page.getByRole('tab', { name: 'Apps', exact: true }).click();
  await page.getByRole('heading', { name: 'erpnext', exact: true }).waitFor();
  await capture('bench-apps');
  errors.push(...await page.evaluate(() => window.__screenshotErrors));
  await page.goto(`${server.resolvedUrls.local[0]}?scenario=site-apps#/sites`);
  await page.getByRole('tab', { name: 'Apps', exact: true }).click();
  await page.getByRole('heading', { name: 'erpnext', exact: true }).waitFor();
  await capture('site-apps');
  errors.push(...await page.evaluate(() => window.__screenshotErrors));
  if (errors.length) throw new Error(`Screenshot capture failed: ${errors.join('\n')}`);
  // Publish only after every screen has captured successfully.
  await mkdir(destination, { recursive: true });
  for (const name of names) {
    await copyFile(path.join(staging, `${name}.png`), path.join(destination, `${name}.png`));
  }
  console.log(`Refreshed ${names.length} screenshots at 4× resolution in docs/public/images`);
} finally {
  await browser?.close();
  await server.close();
}
