import { randomUUID } from 'node:crypto';
import type { StorageAdapter } from '../adapter';
import {
  type Bench,
  type CreateBenchInput,
  type UpdateBenchInput,
  mapBenchRecordToDomain,
  mapBenchDomainToRecord,
} from '../../../shared/domain/models';

export class BenchRepository {
  constructor(private readonly adapter: StorageAdapter) {}

  async findAll(): Promise<Bench[]> {
    const snapshot = await this.adapter.readSnapshot();
    return snapshot.benches.map(mapBenchRecordToDomain);
  }

  async findById(id: string): Promise<Bench | null> {
    const snapshot = await this.adapter.readSnapshot();
    const record = snapshot.benches.find((b) => b.id === id) ?? null;
    return record ? mapBenchRecordToDomain(record) : null;
  }

  async create(input: CreateBenchInput): Promise<Bench> {
    const now = new Date().toISOString();
    const bench: Bench = {
      id: randomUUID(),
      ...input,
      timestamps: { createdAt: now, updatedAt: now },
    };
    const record = mapBenchDomainToRecord(bench);

    await this.adapter.transaction(async (snapshot) => ({
      snapshot: { ...snapshot, benches: [...snapshot.benches, record] },
      result: undefined,
    }));

    return bench;
  }

  async update(id: string, input: UpdateBenchInput): Promise<Bench | null> {
    let updated: Bench | null = null;

    await this.adapter.transaction(async (snapshot) => {
      const index = snapshot.benches.findIndex((b) => b.id === id);
      if (index === -1) {
        return { snapshot, result: undefined };
      }

      const existing = mapBenchRecordToDomain(snapshot.benches[index]!);
      updated = {
        ...existing,
        ...input,
        timestamps: { ...existing.timestamps, updatedAt: new Date().toISOString() },
      };

      const updatedRecord = mapBenchDomainToRecord(updated);
      const benches = [...snapshot.benches];
      benches[index] = updatedRecord;
      return { snapshot: { ...snapshot, benches }, result: undefined };
    });

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    let deleted = false;

    await this.adapter.transaction(async (snapshot) => {
      const exists = snapshot.benches.some((b) => b.id === id);
      if (!exists) {
        return { snapshot, result: undefined };
      }
      deleted = true;
      return {
        snapshot: { ...snapshot, benches: snapshot.benches.filter((b) => b.id !== id) },
        result: undefined,
      };
    });

    return deleted;
  }
}
