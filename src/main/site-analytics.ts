export type SiteLifecycleOperation =
  | 'create'
  | 'update'
  | 'delete'
  | 'open-folder'
  | 'logs-read';

export type SiteLifecycleMetric = {
  readonly siteId: string;
  readonly operation: SiteLifecycleOperation;
  readonly timestamp: string;
};

export class InMemorySiteAnalytics {
  private readonly events: SiteLifecycleMetric[] = [];

  track(siteId: string, operation: SiteLifecycleOperation): void {
    this.events.push({
      siteId,
      operation,
      timestamp: new Date().toISOString(),
    });
  }

  list(): SiteLifecycleMetric[] {
    return [...this.events];
  }
}
