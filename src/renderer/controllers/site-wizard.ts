import type { SiteCreateInput } from '@frappe-local/shared/core';

export type SiteWizardStep = 1 | 2 | 3;

export type SiteWizardDraft = {
  readonly benchId: string;
  readonly name: string;
  readonly path: string;
};

export type SiteWizardBuildResult = {
  readonly payload: SiteCreateInput | null;
  readonly errors: string[];
};

const SITE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export const normalizeSiteSlug = (value: string): string => value.trim().toLowerCase();

export const toSiteDomain = (slugOrName: string): string => {
  const slug = normalizeSiteSlug(slugOrName);
  return slug.endsWith('.localhost') ? slug : `${slug}.localhost`;
};

export const isValidSiteName = (siteName: string): boolean => SITE_SLUG_PATTERN.test(normalizeSiteSlug(siteName));

export const suggestSitePath = (benchPath: string, siteName: string): string => {
  const base = benchPath.trim().replace(/\/$/, '');
  const safeSiteName = toSiteDomain(siteName);
  return `${base}/sites/${safeSiteName}`;
};

export const getSiteWizardStepErrors = (
  step: SiteWizardStep,
  draft: SiteWizardDraft,
  existingSites: readonly { readonly name: string; readonly status?: string }[] = []
): string[] => {
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
      errors.push('Site name must be a lowercase slug with letters, numbers, and hyphens only.');
    } else {
      const siteDomain = toSiteDomain(draft.name);
      const duplicate = existingSites.find((s) => toSiteDomain(s.name) === siteDomain);
      if (duplicate) {
        if (duplicate.status === 'queued') {
          errors.push(`Site "${siteDomain}" is currently being processed (e.g. deleted). Please wait a moment before recreating.`);
        } else {
          errors.push(`A site named "${siteDomain}" already exists. Please choose a unique site name.`);
        }
      }
    }

    if (!draft.path.trim()) {
      errors.push('Enter a site path.');
    }
  }

  return errors;
};

export const buildSiteCreatePayload = (
  draft: SiteWizardDraft,
  existingSites: readonly { readonly name: string; readonly status?: string }[] = []
): SiteWizardBuildResult => {
  const errors = [
    ...getSiteWizardStepErrors(1, draft, existingSites),
    ...getSiteWizardStepErrors(2, draft, existingSites),
  ];

  if (errors.length > 0) {
    return {
      payload: null,
      errors,
    };
  }

  const normalizedName = toSiteDomain(draft.name);
  const trimmedPath = draft.path.trim();
  const normalizedPath = trimmedPath.endsWith(`/${draft.name.trim()}`)
    ? `${trimmedPath.slice(0, -draft.name.trim().length)}${normalizedName}`
    : trimmedPath;

  return {
    payload: {
      benchId: draft.benchId.trim(),
      name: normalizedName,
      path: normalizedPath,

      apps: ['frappe'],
    },
    errors: [],
  };
};
