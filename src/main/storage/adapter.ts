import fs from 'node:fs/promises';
import path from 'node:path';
import type { StorageSnapshot } from './schema';

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
    const contents = await fs.readFile(this.storageFilePath, 'utf8');
    return JSON.parse(contents) as StorageSnapshot;
  }

  async writeSnapshot(snapshot: StorageSnapshot): Promise<void> {
    this.assertConnected();
    await fs.writeFile(this.storageFilePath, JSON.stringify(snapshot, null, 2), 'utf8');
  }

  async transaction<T>(operation: (snapshot: StorageSnapshot) => Promise<{ snapshot: StorageSnapshot; result: T }>): Promise<T> {
    this.assertConnected();
    const snapshot = await this.readSnapshot();
    const { snapshot: updatedSnapshot, result } = await operation(snapshot);
    await this.writeSnapshot(updatedSnapshot);
    return result;
  }

  private assertConnected(): void {
    if (!this.isConnected) {
      throw new Error('Storage adapter is not connected. Call connect() before using the adapter.');
    }
  }
}