import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { BenchRecord } from '../src/shared/domain/models';
import { JsonStorageAdapter } from '../src/main/storage/adapter';
import { createDefaultStorageSnapshot } from '../src/main/storage/schema';

const temporaryDirectories: string[] = [];

const createTemporaryStorageFilePath = async (): Promise<string> => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'frappe-cafe-storage-'));
  temporaryDirectories.push(temporaryDirectory);
  return path.join(temporaryDirectory, 'storage.json');
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directoryPath) => {
      await fs.rm(directoryPath, { recursive: true, force: true });
    })
  );
});

describe('json storage adapter', () => {
  it('writes and reads snapshot data after connection', async () => {
    const storageFilePath = await createTemporaryStorageFilePath();
    const adapter = new JsonStorageAdapter(storageFilePath);

    await adapter.connect();

    const snapshot = createDefaultStorageSnapshot([], 1);
    await adapter.writeSnapshot(snapshot);

    const loadedSnapshot = await adapter.readSnapshot();

    expect(loadedSnapshot.schemaVersion).toBe(snapshot.schemaVersion);
    expect(loadedSnapshot.metadata.appCatalogSeedVersion).toBe(1);

    await adapter.close();
  });

  it('supports transaction updates over snapshot state', async () => {
    const storageFilePath = await createTemporaryStorageFilePath();
    const adapter = new JsonStorageAdapter(storageFilePath);

    await adapter.connect();
    await adapter.writeSnapshot(createDefaultStorageSnapshot([], 1));

    const transactionResult = await adapter.transaction(async (snapshot) => {
      const benchRecord: BenchRecord = {
        id: 'bench-1',
        name: 'Bench One',
        path: '/tmp/bench-1',
        frappe_version: 'version-15',
        runtime: 'docker',
        status: 'queued',
        apps: ['frappe'],
        created_at: '2026-04-18T10:00:00.000Z',
        updated_at: '2026-04-18T10:00:00.000Z',
      };

      const updatedSnapshot = {
        ...snapshot,
        benches: [benchRecord],
      };

      return {
        snapshot: updatedSnapshot,
        result: updatedSnapshot.benches.length,
      };
    });

    const snapshotAfterTransaction = await adapter.readSnapshot();

    expect(transactionResult).toBe(1);
    expect(snapshotAfterTransaction.benches).toHaveLength(1);
    expect(snapshotAfterTransaction.benches[0]?.id).toBe('bench-1');

    await adapter.close();
  });
});