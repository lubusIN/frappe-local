export type LifecycleOperation = 'create' | 'update' | 'delete' | 'logs-read' | 'open-folder';

export type LifecycleMetric = {
  readonly entityId: string;
  readonly operation: LifecycleOperation;
  readonly timestamp: string;
};

export class InMemoryAnalytics {
  private readonly events: LifecycleMetric[] = [];

  trackOperation(entityId: string, operation: LifecycleOperation): void {
    this.events.push({
      entityId,
      operation,
      timestamp: new Date().toISOString(),
    });
  }

  list(): LifecycleMetric[] {
    return [...this.events];
  }
}

export const analytics = new InMemoryAnalytics();
