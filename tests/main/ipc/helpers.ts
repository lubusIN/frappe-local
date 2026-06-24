import type { CustomAppItem } from '../../../src/shared/domain/models';

export const stubCustomApp: CustomAppItem = {
  id: 'custom-app',
  name: 'custom_app',
  type: 'github',
  source: 'https://example.test/custom_app',
  timestamps: {
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
};

export const makeStubCustomAppsRepo = (items: CustomAppItem[] = []) => ({
  findAll: async () => items,
  findById: async (id: string) => items.find((app) => app.id === id) ?? null,
  create: async () => stubCustomApp,
  update: async (id: string) => items.find((app) => app.id === id) ?? null,
  delete: async () => false,
});
