export type BenchLifecycleOperation =
  | 'create'
  | 'update'
  | 'delete'
  | 'open-folder'
  | 'logs-read';

export type BenchLifecycleMetric = {
  readonly benchId: string;
  readonly operation: BenchLifecycleOperation;
  readonly timestamp: string;
};

export class InMemoryBenchAnalytics {
  private readonly events: BenchLifecycleMetric[] = [];

  track(benchId: string, operation: BenchLifecycleOperation): void {
    this.events.push({
      benchId,
      operation,
      timestamp: new Date().toISOString(),
    });
  }

  list(): BenchLifecycleMetric[] {
    return [...this.events];
  }
}