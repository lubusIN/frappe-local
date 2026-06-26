import { describe, expect, it } from 'vitest';
import net from 'node:net';
import { findNextAvailableTcpPort, isTcpPortFree } from '../../../src/main/utils/ports';

describe('ports utility', () => {
  it('blocks ports outside valid ranges', async () => {
    expect(await isTcpPortFree(80)).toBe(false); // below 1024
    expect(await isTcpPortFree(99999)).toBe(false); // above 65535
  });

  it('detects free ports and busy ports accurately', async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const addr = server.address() as net.AddressInfo;
    const busyPort = addr.port;

    expect(await isTcpPortFree(busyPort)).toBe(false);

    server.close();
    await new Promise<void>((resolve) => server.once('close', () => resolve()));

    expect(await isTcpPortFree(busyPort)).toBe(true);
  });

  it('findNextAvailableTcpPort skips reserved ports and returns free port', async () => {
    const freePort = await findNextAvailableTcpPort(25000, new Set([25000, 25001]));
    expect(freePort).toBeGreaterThanOrEqual(25002);
    expect(await isTcpPortFree(freePort)).toBe(true);
  });
});
