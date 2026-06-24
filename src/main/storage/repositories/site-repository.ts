import { randomUUID } from 'node:crypto';
import type { StorageAdapter } from '@frappe-local/main/storage/adapter';
import {
  type Site,
  type CreateSiteInput,
  type UpdateSiteInput,
} from '@frappe-local/shared/domain/models';

export class SiteRepository {
  constructor(private readonly adapter: StorageAdapter) {}

  async findAll(): Promise<Site[]> {
    const snapshot = await this.adapter.readSnapshot();
    return [...snapshot.sites];
  }

  async findById(id: string): Promise<Site | null> {
    const snapshot = await this.adapter.readSnapshot();
    return snapshot.sites.find((s) => s.id === id) ?? null;
  }

  async findByBenchId(benchId: string): Promise<Site[]> {
    const snapshot = await this.adapter.readSnapshot();
    return snapshot.sites.filter((s) => s.benchId === benchId);
  }

  async create(input: CreateSiteInput): Promise<Site> {
    const now = new Date().toISOString();
    const site: Site = {
      id: randomUUID(),
      status: 'queued',
      ...input,
      timestamps: { createdAt: now, updatedAt: now },
    };

    await this.adapter.transaction(async (snapshot) => ({
      snapshot: { ...snapshot, sites: [...snapshot.sites, site] },
      result: undefined,
    }));

    return site;
  }

  async update(id: string, input: UpdateSiteInput): Promise<Site | null> {
    let updated: Site | null = null;

    await this.adapter.transaction(async (snapshot) => {
      const index = snapshot.sites.findIndex((s) => s.id === id);
      if (index === -1) {
        return { snapshot, result: undefined };
      }

      const existing = snapshot.sites[index]!;
      updated = {
        ...existing,
        ...input,
        timestamps: { ...existing.timestamps, updatedAt: new Date().toISOString() },
      };

      const sites = [...snapshot.sites];
      sites[index] = updated;
      return { snapshot: { ...snapshot, sites }, result: undefined };
    });

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    let deleted = false;

    await this.adapter.transaction(async (snapshot) => {
      const exists = snapshot.sites.some((s) => s.id === id);
      if (!exists) {
        return { snapshot, result: undefined };
      }
      deleted = true;
      return {
        snapshot: { ...snapshot, sites: snapshot.sites.filter((s) => s.id !== id) },
        result: undefined,
      };
    });

    return deleted;
  }
}
