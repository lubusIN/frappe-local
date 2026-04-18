import { AppSchema, type AppCatalogItem } from '../shared/domain/models';

type Runtime = 'docker' | 'podman';

type RawCatalogProviderItem = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly source: string;
  readonly version: string;
  readonly compatibility?: {
    readonly minimumFrappeVersion?: string;
    readonly maximumFrappeVersion?: string;
    readonly supportedRuntimes?: string[];
  };
};

const normalizeRuntime = (value: string): Runtime | null => {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'docker' || normalized === 'podman') {
    return normalized;
  }

  return null;
};

export const normalizeCatalogProviderItem = (item: RawCatalogProviderItem): AppCatalogItem => {
  const supportedRuntimes = (item.compatibility?.supportedRuntimes ?? ['docker', 'podman'])
    .map(normalizeRuntime)
    .filter((entry): entry is Runtime => entry !== null);

  return AppSchema.parse({
    id: item.id.trim().toLowerCase(),
    name: item.name.trim(),
    description: item.description.trim(),
    source: item.source.trim(),
    version: item.version.trim(),
    compatibility: {
      minimumFrappeVersion: item.compatibility?.minimumFrappeVersion?.trim(),
      maximumFrappeVersion: item.compatibility?.maximumFrappeVersion?.trim(),
      supportedRuntimes: supportedRuntimes.length > 0 ? supportedRuntimes : ['docker', 'podman'],
    },
  });
};

const DEFAULT_PROVIDER_ITEMS: RawCatalogProviderItem[] = [
  {
    id: ' Frappe ',
    name: 'Frappe Framework',
    description: 'Core framework and services for the stack.',
    source: 'https://github.com/frappe/frappe',
    version: '15.0.0',
    compatibility: {
      minimumFrappeVersion: '15.0.0',
      supportedRuntimes: ['docker', 'podman'],
    },
  },
  {
    id: 'ERPNext',
    name: 'ERPNext',
    description: 'Open-source ERP suite for operations, finance, and inventory.',
    source: 'https://github.com/frappe/erpnext',
    version: '15.0.0',
    compatibility: {
      minimumFrappeVersion: '15.0.0',
      supportedRuntimes: ['docker', 'podman', 'unknown'],
    },
  },
  {
    id: 'payments',
    name: 'Payments',
    description: 'Payments and gateway integrations for Frappe apps.',
    source: 'https://github.com/frappe/payments',
    version: '15.0.0',
    compatibility: {
      supportedRuntimes: ['docker'],
    },
  },
];

export const getDefaultAppCatalogSeed = (): AppCatalogItem[] =>
  DEFAULT_PROVIDER_ITEMS.map(normalizeCatalogProviderItem);
