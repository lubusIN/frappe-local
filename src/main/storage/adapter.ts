import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { StorageSnapshot } from '@frappe-local/main/storage';

export type StorageAdapter = {
  connect: () => Promise<void>;
  close: () => Promise<void>;
  readSnapshot: () => Promise<StorageSnapshot>;
  writeSnapshot: (snapshot: StorageSnapshot) => Promise<void>;
  transaction: <T>(operation: (snapshot: StorageSnapshot) => Promise<{ snapshot: StorageSnapshot; result: T }>) => Promise<T>;
};

export class JsonStorageAdapter implements StorageAdapter {
  private readonly storageFilePath: string;

  private isConnected = false;

  private operationQueue: Promise<void> = Promise.resolve();

  constructor(storageFilePath: string) {
    this.storageFilePath = storageFilePath;
  }

  async connect(): Promise<void> {
    await fs.mkdir(path.dirname(this.storageFilePath), { recursive: true });
    this.isConnected = true;
  }

  async close(): Promise<void> {
    this.isConnected = false;
  }

  async readSnapshot(): Promise<StorageSnapshot> {
    this.assertConnected();
    return this.enqueue(() => this.readSnapshotFromDisk());
  }

  async writeSnapshot(snapshot: StorageSnapshot): Promise<void> {
    this.assertConnected();
    await this.enqueue(() => this.writeSnapshotToDisk(snapshot));
  }

  async transaction<T>(operation: (snapshot: StorageSnapshot) => Promise<{ snapshot: StorageSnapshot; result: T }>): Promise<T> {
    this.assertConnected();
    return this.enqueue(async () => {
      const snapshot = await this.readSnapshotFromDisk();
      const { snapshot: updatedSnapshot, result } = await operation(snapshot);
      await this.writeSnapshotToDisk(updatedSnapshot);
      return result;
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async readSnapshotFromDisk(): Promise<StorageSnapshot> {
    let lastError: unknown;

    // Reset replaces the storage directory outside this adapter. Give that brief
    // replacement window a chance to finish before surfacing a corrupt-file error.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const contents = await fs.readFile(this.storageFilePath, 'utf8');
        return JSON.parse(contents) as StorageSnapshot;
      } catch (error) {
        lastError = error;
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
    }

    throw lastError;
  }

  private async writeSnapshotToDisk(snapshot: StorageSnapshot): Promise<void> {
    const temporaryPath = path.join(
      path.dirname(this.storageFilePath),
      `.${path.basename(this.storageFilePath)}.${process.pid}.${randomUUID()}.tmp`
    );

    await fs.mkdir(path.dirname(this.storageFilePath), { recursive: true });
    try {
      await fs.writeFile(temporaryPath, JSON.stringify(snapshot, null, 2), 'utf8');
      await fs.rename(temporaryPath, this.storageFilePath);
    } finally {
      await fs.rm(temporaryPath, { force: true });
    }
  }

  private assertConnected(): void {
    if (!this.isConnected) {
      throw new Error('Storage adapter is not connected. Call connect() before using the adapter.');
    }
  }
}
