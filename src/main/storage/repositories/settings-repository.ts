import type { StorageAdapter } from '../adapter';
import {
  type Settings,
  type UpdateSettingsInput,
  SettingsSchema,
} from '../../../shared/domain/models';

export class SettingsRepository {
  constructor(private readonly adapter: StorageAdapter) {}

  async get(): Promise<Settings | null> {
    const snapshot = await this.adapter.readSnapshot();
    return snapshot.settings;
  }

  async set(input: UpdateSettingsInput): Promise<Settings> {
    let result: Settings | null = null;

    await this.adapter.transaction(async (snapshot) => {
      const existing = snapshot.settings ?? {};
      const merged = SettingsSchema.parse({ ...existing, ...input });
      result = merged;
      return { snapshot: { ...snapshot, settings: merged }, result: undefined };
    });

    // result is always assigned by the transaction above
    return result!;
  }

  async findAll(): Promise<Settings[]> {
    const s = await this.get();
    return s ? [s] : [];
  }

  async update(input: UpdateSettingsInput): Promise<Settings> {
    return this.set(input);
  }

  async patch(input: UpdateSettingsInput): Promise<Settings | null> {
    const existing = await this.get();
    if (!existing) {
      return null;
    }

    return this.set(input);
  }
}
