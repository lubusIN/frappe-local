import { randomUUID } from 'node:crypto';
import type { StorageAdapter } from '../adapter';
import {
  type Group,
  type CreateGroupInput,
  type UpdateGroupInput,
} from '../../../shared/domain/models';

export class GroupRepository {
  constructor(private readonly adapter: StorageAdapter) {}

  async findAll(): Promise<Group[]> {
    const snapshot = await this.adapter.readSnapshot();
    return [...snapshot.groups];
  }

  async findById(id: string): Promise<Group | null> {
    const snapshot = await this.adapter.readSnapshot();
    return snapshot.groups.find((g) => g.id === id) ?? null;
  }

  async create(input: CreateGroupInput): Promise<Group> {
    const group: Group = {
      id: randomUUID(),
      ...input,
    };

    await this.adapter.transaction(async (snapshot) => ({
      snapshot: { ...snapshot, groups: [...snapshot.groups, group] },
      result: undefined,
    }));

    return group;
  }

  async update(id: string, input: UpdateGroupInput): Promise<Group | null> {
    let updated: Group | null = null;

    await this.adapter.transaction(async (snapshot) => {
      const index = snapshot.groups.findIndex((g) => g.id === id);
      if (index === -1) {
        return { snapshot, result: undefined };
      }

      updated = { ...snapshot.groups[index]!, ...input };
      const groups = [...snapshot.groups];
      groups[index] = updated;
      return { snapshot: { ...snapshot, groups }, result: undefined };
    });

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    let deleted = false;

    await this.adapter.transaction(async (snapshot) => {
      const exists = snapshot.groups.some((g) => g.id === id);
      if (!exists) {
        return { snapshot, result: undefined };
      }
      deleted = true;
      return {
        snapshot: { ...snapshot, groups: snapshot.groups.filter((g) => g.id !== id) },
        result: undefined,
      };
    });

    return deleted;
  }

  async addSiteToGroup(groupId: string, siteId: string): Promise<Group | null> {
    return this.update(groupId, {
      siteIds: await this.findById(groupId).then((g) =>
        g && !g.siteIds.includes(siteId) ? [...g.siteIds, siteId] : (g?.siteIds ?? [])
      ),
    });
  }

  async removeSiteFromGroup(groupId: string, siteId: string): Promise<Group | null> {
    const group = await this.findById(groupId);
    if (!group) return null;
    return this.update(groupId, { siteIds: group.siteIds.filter((id) => id !== siteId) });
  }
}
