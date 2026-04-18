import type { Bench, Site } from '../shared/domain/models';
import type { SiteCreateInput } from '../shared/ipc';
import { canAttachSiteToBench } from '../shared/domain/site-lifecycle';

export type SiteCreationDependencies = {
  readonly benches: {
    findAll: () => Promise<Bench[]>;
  };
  readonly sites: {
    create: (input: {
      name: string;
      benchId: string;
      groupId: string | null;
      apps: string[];
      status: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
      path: string;
    }) => Promise<Site>;
    update: (id: string, input: {
      status?: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
    }) => Promise<Site | null>;
  };
};

const mapSiteCreationError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unable to create site due to an unknown error.';
};

export const orchestrateSiteCreation = async (
  dependencies: SiteCreationDependencies,
  input: SiteCreateInput
): Promise<Site> => {
  try {
    const benches = await dependencies.benches.findAll();
    const bench = benches.find((entry) => entry.id === input.benchId);

    if (!bench) {
      throw new Error('Cannot create site: parent bench was not found.');
    }

    if (!canAttachSiteToBench(bench.status)) {
      throw new Error('Cannot create site: parent bench is not ready.');
    }

    const queuedSite = await dependencies.sites.create({
      ...input,
      status: 'queued',
    });

    const finalizedSite = await dependencies.sites.update(queuedSite.id, {
      status: 'stopped',
    });

    if (!finalizedSite) {
      throw new Error('Cannot finalize site creation.');
    }

    return finalizedSite;
  } catch (error) {
    throw new Error(mapSiteCreationError(error));
  }
};
