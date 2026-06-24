import type { StorageAdapter } from '@frappe-local/main/storage/adapter';
import type { AppCatalogItem } from '@frappe-local/shared/domain/models';

export class AppCatalogRepository {
  constructor(private readonly adapter: StorageAdapter) {}

  async findAll(): Promise<AppCatalogItem[]> {
    const snapshot = await this.adapter.readSnapshot();
    return [...snapshot.appCatalog];
  }

  async sync(apps: AppCatalogItem[]): Promise<void> {
    await this.adapter.transaction(async (snapshot) => ({
      snapshot: {
        ...snapshot,
        appCatalog: [...apps],
      },
      result: undefined,
    }));
  }

  async findById(id: string): Promise<AppCatalogItem | null> {
    const snapshot = await this.adapter.readSnapshot();
    return snapshot.appCatalog.find((item) => item.id === id) ?? null;
  }

  async search(query: string): Promise<AppCatalogItem[]> {
    const snapshot = await this.adapter.readSnapshot();
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [...snapshot.appCatalog];
    return snapshot.appCatalog.filter(
      (item) =>
        item.name.toLowerCase().includes(normalized) ||
        item.description.toLowerCase().includes(normalized)
    );
  }
}
