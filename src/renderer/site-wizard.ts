import type { SiteCreateInput } from '../shared/ipc';

export type SiteWizardStep = 1 | 2 | 3;

export type SiteWizardDraft = {
  readonly benchId: string;
  readonly name: string;
  readonly path: string;
  readonly groupId: string;
  readonly appsText: string;
  readonly appsSelected?: string[];
  readonly force: boolean;
};

export type SiteWizardBuildResult = {
  readonly payload: SiteCreateInput | null;
  readonly errors: string[];
};

const SITE_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]*$/;

export const parseAppsText = (appsText: string): string[] =>
  appsText
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const isValidSiteName = (siteName: string): boolean => SITE_NAME_PATTERN.test(siteName.trim());

export const suggestSitePath = (benchPath: string, siteName: string): string => {
  const base = benchPath.trim().replace(/\/$/, '');
  const safeSiteName = siteName.trim();
  return `${base}/sites/${safeSiteName}`;
};

export const getSiteWizardStepErrors = (step: SiteWizardStep, draft: SiteWizardDraft): string[] => {
  const errors: string[] = [];

  if (step === 1) {
    if (!draft.benchId.trim()) {
      errors.push('Select a bench to continue.');
    }
  }

  if (step === 2) {
    if (!draft.name.trim()) {
      errors.push('Enter a site name.');
    } else if (!isValidSiteName(draft.name)) {
      errors.push('Site name can include lowercase letters, numbers, dots, and hyphens only.');
    }

    if (!draft.path.trim()) {
      errors.push('Enter a site path.');
    }
  }

  return errors;
};

export const buildSiteCreatePayload = (draft: SiteWizardDraft): SiteWizardBuildResult => {
  const errors = [
    ...getSiteWizardStepErrors(1, draft),
    ...getSiteWizardStepErrors(2, draft),
  ];

  if (errors.length > 0) {
    return {
      payload: null,
      errors,
    };
  }

  const selectedApps = (draft.appsSelected ?? []).map((item) => item.trim()).filter(Boolean);

  return {
    payload: {
      benchId: draft.benchId.trim(),
      name: draft.name.trim(),
      path: draft.path.trim(),
      groupId: draft.groupId.trim() ? draft.groupId.trim() : null,
      apps: selectedApps.length > 0 ? selectedApps : parseAppsText(draft.appsText),
      force: draft.force,
    },
    errors: [],
  };
};
