import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type {
  AppCatalogItem,
  Bench,
  Group,
  Settings,
  Site,
} from '../shared/domain/models';
import type {
  ImportConflictPolicy,
  ImportExecuteInput,
  ImportExecutionResponse,
  ImportExecutionStep,
} from '../shared/ipc';
import { parseImportPackage, validateImportCompatibility } from './import-package-validator';

type ImportExecutionDependencies = {
  readonly benches: {
    findById: (id: string) => Promise<Bench | null>;
  };
  readonly sites: {
    findAll: () => Promise<Site[]>;
    create: (input: {
      name: string;
      benchId: string;
      groupId: string | null;
      apps: string[];
      status: 'queued' | 'running' | 'stopped' | 'success' | 'failure';
      path: string;
    }) => Promise<Site>;
    delete: (id: string) => Promise<boolean>;
  };
  readonly groups: {
    findAll: () => Promise<Group[]>;
    update: (id: string, input: {
      name?: string;
      description?: string;
      tags?: string[];
      siteIds?: string[];
    }) => Promise<Group | null>;
  };
  readonly settings: {
    get: () => Promise<Settings | null>;
  };
  readonly appCatalog: {
    findAll: () => Promise<AppCatalogItem[]>;
  };
};

type ImportExecutionOptions = {
  readonly now?: () => string;
  readonly persistImportOperation?: (baseDirectory: string, entry: Record<string, unknown>) => Promise<void>;
};

const buildUniqueSiteName = (
  baseName: string,
  existingSiteNames: ReadonlySet<string>
): string => {
  if (!existingSiteNames.has(baseName)) {
    return baseName;
  }

  for (let suffix = 2; suffix <= 1000; suffix += 1) {
    const candidate = `${baseName}-import-${suffix}`;
    if (!existingSiteNames.has(candidate)) {
      return candidate;
    }
  }

  return `${baseName}-import-${Date.now()}`;
};

const persistImportOperation = async (
  baseDirectory: string,
  entry: Record<string, unknown>
): Promise<void> => {
  await mkdir(baseDirectory, { recursive: true });
  const logFilePath = path.join(baseDirectory, 'import-operations.jsonl');
  await appendFile(logFilePath, `${JSON.stringify(entry)}\n`, 'utf8');
};

export const executeImportPackage = async (
  dependencies: ImportExecutionDependencies,
  input: ImportExecuteInput,
  options: ImportExecutionOptions = {}
): Promise<ImportExecutionResponse> => {
  const now = options.now ?? (() => new Date().toISOString());
  const persistOperation = options.persistImportOperation ?? persistImportOperation;
  const steps: ImportExecutionStep[] = [];

  const parsedPackage = await parseImportPackage(input.artifactDirectory);
  steps.push({
    name: 'parse-package',
    status: 'success',
    message: 'Import package parsed and verified.',
  });

  const targetBench = await dependencies.benches.findById(input.benchId);
  if (!targetBench) {
    steps.push({
      name: 'resolve-target-bench',
      status: 'failed',
      message: 'Target bench was not found.',
    });

    return {
      success: false,
      createdSiteId: null,
      siteName: parsedPackage.manifest.site.name,
      conflictPolicyApplied: input.conflictPolicy,
      steps,
    };
  }

  steps.push({
    name: 'resolve-target-bench',
    status: 'success',
    message: `Target bench resolved: ${targetBench.name}.`,
  });

  const [settings, appCatalog, allSites, allGroups] = await Promise.all([
    dependencies.settings.get(),
    dependencies.appCatalog.findAll(),
    dependencies.sites.findAll(),
    dependencies.groups.findAll(),
  ]);

  const compatibility = validateImportCompatibility(parsedPackage, {
    targetRuntime: targetBench.runtime,
    targetFrappeVersion: targetBench.frappeVersion,
    availableAppIds: appCatalog.map((item) => item.id),
  });

  if (!compatibility.canImport) {
    compatibility.issues.forEach((issue) => {
      steps.push({
        name: 'compatibility-check',
        status: issue.severity === 'error' ? 'failed' : 'warning',
        message: issue.message,
      });
    });

    return {
      success: false,
      createdSiteId: null,
      siteName: parsedPackage.manifest.site.name,
      conflictPolicyApplied: input.conflictPolicy,
      steps,
    };
  }

  compatibility.issues.forEach((issue) => {
    steps.push({
      name: 'compatibility-check',
      status: issue.severity === 'error' ? 'failed' : 'warning',
      message: issue.message,
    });
  });

  if (compatibility.issues.length === 0) {
    steps.push({
      name: 'compatibility-check',
      status: 'success',
      message: 'Package compatibility checks passed.',
    });
  }

  const targetBenchSites = allSites.filter((site) => site.benchId === targetBench.id);
  const existingSiteNames = new Set(targetBenchSites.map((site) => site.name));

  const sourceSiteName = parsedPackage.payload.data.site.name;
  const hasConflict = existingSiteNames.has(sourceSiteName);
  let importedSiteName = sourceSiteName;
  let conflictPolicyApplied: ImportConflictPolicy = input.conflictPolicy;

  if (hasConflict && input.conflictPolicy === 'block') {
    steps.push({
      name: 'conflict-policy',
      status: 'failed',
      message: `${sourceSiteName} already exists on ${targetBench.name}. Import blocked by policy.`,
    });

    return {
      success: false,
      createdSiteId: null,
      siteName: sourceSiteName,
      conflictPolicyApplied,
      steps,
    };
  }

  if (hasConflict && input.conflictPolicy === 'rename') {
    importedSiteName = buildUniqueSiteName(sourceSiteName, existingSiteNames);
    steps.push({
      name: 'conflict-policy',
      status: 'warning',
      message: `${sourceSiteName} exists on ${targetBench.name}; import renamed to ${importedSiteName}.`,
    });
  } else {
    steps.push({
      name: 'conflict-policy',
      status: 'success',
      message: 'No naming conflicts detected for the selected bench.',
    });
  }

  const sourceGroup = parsedPackage.payload.data.group;
  const matchingGroup = sourceGroup
    ? allGroups.find((group) => group.name.toLowerCase() === sourceGroup.name.toLowerCase()) ?? null
    : null;

  const logDirectory = settings?.storagePath ?? path.join(process.cwd(), 'var');
  let createdSite: Site | null = null;
  let groupLinked = false;

  try {
    createdSite = await dependencies.sites.create({
      name: importedSiteName,
      benchId: targetBench.id,
      groupId: matchingGroup?.id ?? null,
      apps: [...parsedPackage.payload.data.site.apps],
      status: 'stopped',
      path: path.join(targetBench.path, 'sites', importedSiteName),
    });

    if (matchingGroup && !matchingGroup.siteIds.includes(createdSite.id)) {
      const updatedGroup = await dependencies.groups.update(matchingGroup.id, {
        siteIds: [...matchingGroup.siteIds, createdSite.id],
      });

      if (!updatedGroup) {
        throw new Error('Unable to assign imported site to the matching group.');
      }
      groupLinked = true;
    }

    steps.push({
      name: 'create-site-record',
      status: 'success',
      message: `Imported site ${createdSite.name} into ${targetBench.name}.`,
    });

    await persistOperation(logDirectory, {
      timestamp: now(),
      status: 'success',
      sourceSiteName,
      importedSiteName: createdSite.name,
      targetBenchId: targetBench.id,
      conflictPolicyApplied,
      packageVersion: parsedPackage.manifest.packageVersion,
      artifactDirectory: input.artifactDirectory,
    });

    steps.push({
      name: 'persist-operation-log',
      status: 'success',
      message: `Import operation recorded under ${logDirectory}.`,
    });

    return {
      success: true,
      createdSiteId: createdSite.id,
      siteName: createdSite.name,
      conflictPolicyApplied,
      steps,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    steps.push({
      name: 'execute-import',
      status: 'failed',
      message: errorMessage,
    });

    if (groupLinked && matchingGroup && createdSite) {
      const revertedGroup = await dependencies.groups.update(matchingGroup.id, {
        siteIds: matchingGroup.siteIds.filter((id) => id !== createdSite.id),
      });

      steps.push({
        name: 'rollback-group-assignment',
        status: revertedGroup ? 'success' : 'warning',
        message: revertedGroup
          ? `Removed ${createdSite.id} from group ${matchingGroup.name} during rollback.`
          : `Group rollback for ${matchingGroup.name} was already reconciled or unavailable.`,
      });
    }

    if (createdSite) {
      const deletedSite = await dependencies.sites.delete(createdSite.id);
      steps.push({
        name: 'rollback-site-record',
        status: deletedSite ? 'success' : 'warning',
        message: deletedSite
          ? `Removed partial site ${createdSite.name} during rollback.`
          : `Site ${createdSite.name} was already removed before rollback completed.`,
      });
    }

    try {
      await persistOperation(logDirectory, {
        timestamp: now(),
        status: 'failed',
        sourceSiteName,
        importedSiteName: createdSite?.name ?? importedSiteName,
        targetBenchId: targetBench.id,
        conflictPolicyApplied,
        packageVersion: parsedPackage.manifest.packageVersion,
        artifactDirectory: input.artifactDirectory,
        error: errorMessage,
      });

      steps.push({
        name: 'persist-operation-log',
        status: 'warning',
        message: `Import failure was recorded under ${logDirectory}.`,
      });
    } catch (logError) {
      steps.push({
        name: 'persist-operation-log',
        status: 'warning',
        message: `Import failure log could not be written: ${logError instanceof Error ? logError.message : String(logError)}`,
      });
    }

    return {
      success: false,
      createdSiteId: null,
      siteName: importedSiteName,
      conflictPolicyApplied,
      steps,
    };
  }
};
