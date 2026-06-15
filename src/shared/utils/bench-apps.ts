export const CORE_BENCH_APPS = ['frappe'] as const;

export const CORE_BENCH_APPS_SET = new Set<string>(CORE_BENCH_APPS);

export const CORE_BENCH_APPS_LABEL = CORE_BENCH_APPS.join(', ');

export const withCoreBenchApps = (apps: readonly string[]): string[] => {
  return Array.from(new Set<string>([...CORE_BENCH_APPS, ...apps]));
};