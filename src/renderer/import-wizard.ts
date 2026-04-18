import type {
  BenchListItem,
  ImportConflictPolicy,
  ImportValidationResponse,
  SiteListItem,
} from '../shared/ipc';

export type ImportWizardStep = 1 | 2 | 3;

export type ImportWizardDraft = {
  readonly artifactDirectory: string;
  readonly benchId: string;
  readonly conflictPolicy: ImportConflictPolicy;
};

export type ImportConflictPreview = {
  readonly status: 'none' | 'warning';
  readonly message: string;
};

export const getImportWizardStepErrors = (
  step: ImportWizardStep,
  draft: ImportWizardDraft,
  validation: ImportValidationResponse | null
): string[] => {
  if (step === 1 && draft.artifactDirectory.trim().length === 0) {
    return ['Provide an export artifact directory before validation.'];
  }

  if (step === 2) {
    if (!validation) {
      return ['Validate an export package before reviewing compatibility.'];
    }

    if (!validation.canImport) {
      return ['Resolve import-blocking issues before continuing.'];
    }
  }

  if (step === 3) {
    if (!validation) {
      return ['Validate an export package before selecting a bench.'];
    }

    if (!draft.benchId) {
      return ['Select a target bench before confirming the import.'];
    }

    if (draft.conflictPolicy !== 'block' && draft.conflictPolicy !== 'rename') {
      return ['Select a conflict policy before confirming the import.'];
    }
  }

  return [];
};

export const buildImportConflictPreview = (
  benches: readonly BenchListItem[],
  sites: readonly SiteListItem[],
  selectedBenchId: string,
  validation: ImportValidationResponse | null
): ImportConflictPreview => {
  if (!selectedBenchId || !validation) {
    return {
      status: 'none',
      message: 'No conflicts detected yet.',
    };
  }

  const selectedBench = benches.find((bench) => bench.id === selectedBenchId);
  const conflictingSite = sites.find(
    (site) => site.benchId === selectedBenchId && site.name === validation.summary.siteName
  );

  if (!conflictingSite) {
    return {
      status: 'none',
      message: `Import will create ${validation.summary.siteName} on ${selectedBench?.name ?? selectedBenchId}.`,
    };
  }

  return {
    status: 'warning',
    message: `${conflictingSite.name} already exists on ${selectedBench?.name ?? selectedBenchId}. Phase 9 execution will need a conflict policy before import can proceed.`,
  };
};