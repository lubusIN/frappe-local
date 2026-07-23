import type { SiteCreateInput } from '@frappe-local/shared/core';

export type SiteWizardStep = 1 | 2 | 3;

export type SiteWizardDraft = {
  readonly benchId: string;
  readonly name: string;
  readonly path: string;
};

export type SiteWizardBuildResult = {
  readonly payload: SiteCreateInput | null;
  readonly errors: Record<string, string>;
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
): Record<string, string> => {
  const errors: Record<string, string> = {};

  if (step === 1) {
    if (!draft.benchId.trim()) {
      errors.benchId = 'Select a bench to continue.';
    }
  }

  if (step === 2) {
    if (!draft.name.trim()) {
      errors.name = 'Enter a site name.';
    } else if (!isValidSiteName(draft.name)) {
      errors.name = 'Site name must be a lowercase slug with letters, numbers, and hyphens only.';
    } else {
      const siteDomain = toSiteDomain(draft.name);
      const duplicate = existingSites.find((s) => toSiteDomain(s.name) === siteDomain);
      if (duplicate) {
        if (duplicate.status === 'queued') {
          errors.name = `Site "${siteDomain}" is currently being processed (e.g. deleted). Please wait a moment before recreating.`;
        } else {
          errors.name = `A site named "${siteDomain}" already exists. Please choose a unique site name.`;
        }
      }
    }

    if (!draft.path.trim()) {
      errors.path = 'Enter a site path.';
    }
  }

  return errors;
};

export const buildSiteCreatePayload = (
  draft: SiteWizardDraft,
  existingSites: readonly { readonly name: string; readonly status?: string }[] = []
): SiteWizardBuildResult => {
  const errors1 = getSiteWizardStepErrors(1, draft, existingSites);
  const errors2 = getSiteWizardStepErrors(2, draft, existingSites);
  const errors = { ...errors1, ...errors2 };

  if (Object.keys(errors).length > 0) {
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
    errors: {},
  };
};
