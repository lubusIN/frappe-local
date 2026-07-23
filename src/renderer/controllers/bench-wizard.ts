import type { BenchCreateInput } from '@frappe-local/shared/core';
import { isValidSiteName, toSiteDomain } from './site-wizard';
export type BenchWizardStep = 1 | 2 | 3;

export type BenchWizardDraft = {
  readonly name: string;
  readonly path: string;
  readonly frappeVersion: string;
  readonly siteName: string;
};

export type BenchWizardBuildResult = {
  readonly payload: BenchCreateInput & { siteName?: string } | null;
  readonly errors: Record<string, string>;
};

const BENCH_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]*$/;

export const isValidBenchName = (benchName: string): boolean => BENCH_NAME_PATTERN.test(benchName.trim());

export const getBenchWizardStepErrors = (
  step: BenchWizardStep,
  draft: BenchWizardDraft,
  context?: { existingSites?: string[]; existingBenches?: string[] }
): Record<string, string> => {
  const errors: Record<string, string> = {};

  if (step === 1) {
    if (!draft.name.trim()) {
      errors.name = 'Enter a bench name.';
    } else if (!isValidBenchName(draft.name)) {
      errors.name = 'Bench name can include lowercase letters, numbers, dots, and hyphens only.';
    } else if (context?.existingBenches) {
      const isDuplicate = context.existingBenches.some(b => b.toLowerCase() === draft.name.toLowerCase());
      if (isDuplicate) {
        errors.name = `A bench named "${draft.name}" already exists. Please choose a unique bench name.`;
      }
    }

    if (!draft.frappeVersion.trim()) {
      errors.frappeVersion = 'Select a Frappe version.';
    }

    if (!draft.path.trim()) {
      errors.path = 'Enter a bench path.';
    }
  }

  if (step === 2) {
    if (!draft.siteName.trim()) {
      errors.siteName = 'Enter an initial site name.';
    } else if (!isValidSiteName(draft.siteName)) {
      errors.siteName = 'Site name must be a lowercase slug with letters, numbers, and hyphens only.';
    } else if (context?.existingSites) {
      const siteDomain = toSiteDomain(draft.siteName);
      const isDuplicate = context.existingSites.some(s => toSiteDomain(s) === siteDomain);
      if (isDuplicate) {
        errors.siteName = `A site named "${siteDomain}" already exists. Please choose a unique site name.`;
      }
    }
  }

  return errors;
};

export const buildBenchCreatePayload = (
  draft: BenchWizardDraft,
  context?: { existingSites?: string[]; existingBenches?: string[] }
): BenchWizardBuildResult => {
  const errors1 = getBenchWizardStepErrors(1, draft, context);
  const errors2 = getBenchWizardStepErrors(2, draft, context);
  const errors = { ...errors1, ...errors2 };

  if (Object.keys(errors).length > 0) {
    return {
      payload: null,
      errors,
    };
  }

  return {
    payload: {
      name: draft.name.trim(),
      path: draft.path.trim(),
      frappeVersion: draft.frappeVersion.trim(),
      apps: ['frappe'],
      siteName: toSiteDomain(draft.siteName),
    },
    errors: {},
  };
};
