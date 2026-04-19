import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  ExportSitePackageInput,
  ExportSitePackageResponse,
} from '../src/shared/ipc';
import { ipcChannels } from '../src/shared/ipc';
import { registerIpcHandlers } from '../src/main/ipc';
import type { AppRepositories } from '../src/main/ipc';
import type { Settings } from '../src/shared/domain/models';
import * as exportModule from '../src/main/export-package-writer';

describe('IPC Export Handlers', () => {
  let mockIpcMain: { handle: (channel: string, listener: (...args: unknown[]) => unknown) => void };
  let exportHandler: ((event: unknown, input: unknown) => Promise<ExportSitePackageResponse>) | null = null;
  let mockRepositories: AppRepositories;

  beforeEach(() => {
    exportHandler = null;
    mockIpcMain = {
      handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
        if (channel === ipcChannels.exportSitePackage) {
          exportHandler = listener as ((event: unknown, input: unknown) => Promise<ExportSitePackageResponse>);
        }
      },
    };

    mockRepositories = {
      sites: {
        findAll: vi.fn(async () => []),
        findById: vi.fn(async () => null),
        create: vi.fn(async () => {
          throw new Error('not implemented');
        }),
        update: vi.fn(async () => null),
        delete: vi.fn(async () => false),
      },
      benches: {
        findAll: vi.fn(async () => []),
        findById: vi.fn(async () => null),
        create: vi.fn(async () => {
          throw new Error('not implemented');
        }),
        update: vi.fn(async () => null),
        delete: vi.fn(async () => false),
      },
      groups: {
        findAll: vi.fn(async () => []),
        create: vi.fn(async () => ({ id: 'group-stub', name: 'workspace', description: '', tags: [], siteIds: [] })),
        update: vi.fn(async () => null),
        delete: vi.fn(async () => false),
      },
      settings: {
        get: vi.fn(async () => null),
        set: vi.fn(async (input: Settings) => input),
      },
      appCatalog: {
        findAll: vi.fn(async () => []),
        findById: vi.fn(async () => null),
        search: vi.fn(async () => []),
      },
    };

    // Mock the exportSitePackage function
    vi.spyOn(exportModule, 'exportSitePackage').mockResolvedValue({
      artifactDirectory: '/tmp/site-export-v1',
      manifestPath: '/tmp/site-export-v1/manifest.json',
      payloadPath: '/tmp/site-export-v1/payload.json',
      manifest: {
        packageVersion: 1,
        exportedAt: '2024-01-01T00:00:00Z',
        site: { id: 'site-1', name: 'test-site', path: '/test/site' },
        bench: {
          id: 'bench-1',
          name: 'test-bench',
          path: '/test/bench',
          runtime: 'docker',
          frappeVersion: '14.0.0',
        },
        requiredApps: [],
        checksum: 'mock-checksum',
      },
    } as any);
  });

  it('should register export handler', () => {
    registerIpcHandlers(mockIpcMain as any, mockRepositories);
    expect(exportHandler).toBeDefined();
  });

  it('should export site package successfully', async () => {
    registerIpcHandlers(mockIpcMain as any, mockRepositories);

    if (!exportHandler) {
      throw new Error('Export handler not registered');
    }

    const input: ExportSitePackageInput = {
      siteId: 'site-1',
      outputDirectory: '/tmp/export',
    };

    const result = await exportHandler(undefined, input);

    expect(result).toBeDefined();
    expect(result.artifactDirectory).toBe('/tmp/site-export-v1');
    expect(result.manifestPath).toBe('/tmp/site-export-v1/manifest.json');
    expect(result.payloadPath).toBe('/tmp/site-export-v1/payload.json');
  });

  it('should throw error when output directory missing', async () => {
    registerIpcHandlers(mockIpcMain as any, mockRepositories);

    if (!exportHandler) {
      throw new Error('Export handler not registered');
    }

    const input: ExportSitePackageInput = {
      siteId: 'site-1',
      outputDirectory: '',
    };

    await expect(exportHandler(undefined, input)).rejects.toThrow('Output directory is required');
  });

  it('should throw error when site ID missing', async () => {
    registerIpcHandlers(mockIpcMain as any, mockRepositories);

    if (!exportHandler) {
      throw new Error('Export handler not registered');
    }

    const input: ExportSitePackageInput = {
      siteId: '',
      outputDirectory: '/tmp/export',
    };

    await expect(exportHandler(undefined, input)).rejects.toThrow('Site ID is required');
  });
});
