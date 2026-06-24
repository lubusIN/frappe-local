import { randomUUID } from 'node:crypto';
import type { StorageAdapter } from '@frappe-local/main/storage';
import { mapCustomAppDomainToRecord, mapCustomAppRecordToDomain, type CreateCustomAppInput, type CustomAppItem, type UpdateCustomAppInput } from '@frappe-local/shared/domain';

export class CustomAppsRepository {
  constructor(private readonly adapter: StorageAdapter) {}

  async findAll(): Promise<CustomAppItem[]> {
    const snapshot = await this.adapter.readSnapshot();
    return (snapshot.customApps || []).map(mapCustomAppRecordToDomain);
  }

  async findById(id: string): Promise<CustomAppItem | null> {
    const snapshot = await this.adapter.readSnapshot();
    const record = (snapshot.customApps || []).find((a) => a.id === id) ?? null;
    return record ? mapCustomAppRecordToDomain(record) : null;
  }

  async create(input: CreateCustomAppInput): Promise<CustomAppItem> {
    const now = new Date().toISOString();
    const app: CustomAppItem = {
      id: input.id || randomUUID(),
      ...input,
      timestamps: { createdAt: now, updatedAt: now },
    };
    const record = mapCustomAppDomainToRecord(app);

    await this.adapter.transaction(async (snapshot) => ({
      snapshot: { ...snapshot, customApps: [...(snapshot.customApps || []), record] },
      result: undefined,
    }));

    return app;
  }

  async update(id: string, input: UpdateCustomAppInput): Promise<CustomAppItem | null> {
    let updated: CustomAppItem | null = null;

    await this.adapter.transaction(async (snapshot) => {
      const customApps = snapshot.customApps || [];
      const index = customApps.findIndex((a) => a.id === id);
      if (index === -1) {
        return { snapshot, result: undefined };
      }

      const existing = mapCustomAppRecordToDomain(customApps[index]!);
      updated = {
        ...existing,
        ...input,
        timestamps: { ...existing.timestamps, updatedAt: new Date().toISOString() },
      };

      const updatedRecord = mapCustomAppDomainToRecord(updated);
      const newCustomApps = [...customApps];
      newCustomApps[index] = updatedRecord;
      return { snapshot: { ...snapshot, customApps: newCustomApps }, result: undefined };
    });

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    let deleted = false;

    await this.adapter.transaction(async (snapshot) => {
      const customApps = snapshot.customApps || [];
      const exists = customApps.some((a) => a.id === id);
      if (!exists) {
        return { snapshot, result: undefined };
      }
      deleted = true;
      return {
        snapshot: { ...snapshot, customApps: customApps.filter((a) => a.id !== id) },
        result: undefined,
      };
    });

    return deleted;
  }
}
