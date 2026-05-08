import type { BenchCreateInput } from '../shared/ipc';

export type BenchWizardStep = 1 | 2 | 3;

export type BenchWizardDraft = {
  readonly name: string;
  readonly path: string;
  readonly frappeVersion: string;
  readonly appsSelected?: string[];
};

export type BenchWizardBuildResult = {
  readonly payload: BenchCreateInput | null;
  readonly errors: string[];
};

const BENCH_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]*$/;

export const isValidBenchName = (benchName: string): boolean => BENCH_NAME_PATTERN.test(benchName.trim());

export const getBenchWizardStepErrors = (step: BenchWizardStep, draft: BenchWizardDraft): string[] => {
  const errors: string[] = [];

  if (step === 1) {
    if (!draft.name.trim()) {
      errors.push('Enter a bench name.');
    } else if (!isValidBenchName(draft.name)) {
      errors.push('Bench name can include lowercase letters, numbers, dots, and hyphens only.');
    }

    if (!draft.frappeVersion.trim()) {
      errors.push('Select a Frappe version.');
    }

    if (!draft.path.trim()) {
      errors.push('Enter a bench path.');
    }
  }

  return errors;
};

export const buildBenchCreatePayload = (draft: BenchWizardDraft): BenchWizardBuildResult => {
  const errors = getBenchWizardStepErrors(1, draft);

  if (errors.length > 0) {
    return {
      payload: null,
      errors,
    };
  }

  const selectedApps = (draft.appsSelected ?? []).map((item) => item.trim()).filter(Boolean);

  return {
    payload: {
      name: draft.name.trim(),
      path: draft.path.trim(),
      frappeVersion: draft.frappeVersion.trim(),
      apps: selectedApps.length > 0 ? selectedApps : ['frappe'],
    },
    errors: [],
  };
};
