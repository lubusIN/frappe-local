import net from 'node:net';

const MIN_PORT = 1024;
const MAX_PORT = 65535;

const normalizePort = (port: number): number => Math.trunc(port);

export const isTcpPortFree = async (port: number, host = '127.0.0.1'): Promise<boolean> => {
  const normalizedPort = normalizePort(port);
  if (normalizedPort < MIN_PORT || normalizedPort > MAX_PORT) {
    return false;
  }

  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(normalizedPort, host);
  });
};

export const findNextAvailableTcpPort = async (
  startPort: number,
  reservedPorts: Set<number> = new Set()
): Promise<number> => {
  let candidate = Math.max(MIN_PORT, normalizePort(startPort));

  while (candidate <= MAX_PORT) {
    if (!reservedPorts.has(candidate) && await isTcpPortFree(candidate)) {
      return candidate;
    }
    candidate += 1;
  }

  throw new Error(`Could not find an available TCP port starting from ${startPort}.`);
};
