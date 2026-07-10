import https from 'node:https';
import http from 'node:http';
import { Buffer } from 'node:buffer';

export async function fetchRemoteIconAsDataUrl(url, timeoutMs = 5000) {
  if (!url || typeof url !== 'string' || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return undefined;
  }

  if (typeof globalThis.fetch === 'function') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const res = await globalThis.fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        const contentType = (res.headers.get('content-type') || '').split(';')[0].trim() ||
          (url.endsWith('.svg') ? 'image/svg+xml' : 'image/png');
        return `data:${contentType};base64,${base64}`;
      }
    } catch {
      // Fall through to http/https fallback
    }
  }

  return new Promise((resolve) => {
    const download = (targetUrl, redirectsLeft = 3) => {
      if (redirectsLeft <= 0) {
        resolve(undefined);
        return;
      }

      const client = targetUrl.startsWith('https://') ? https : http;
      const req = client.get(targetUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          req.destroy();
          download(res.headers.location, redirectsLeft - 1);
          return;
        }

        if (res.statusCode !== 200) {
          req.destroy();
          resolve(undefined);
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const buffer = Buffer.concat(chunks);
            const base64 = buffer.toString('base64');
            const contentType = (res.headers['content-type'] || '').split(';')[0].trim() ||
              (targetUrl.endsWith('.svg') ? 'image/svg+xml' : 'image/png');
            resolve(`data:${contentType};base64,${base64}`);
          } catch {
            resolve(undefined);
          }
        });
        res.on('error', () => resolve(undefined));
      });

      req.on('error', () => resolve(undefined));
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        resolve(undefined);
      });
    };

    download(url);
  });
}
