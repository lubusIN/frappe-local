import type { Settings } from '../shared/domain/models';
import type { DependencyHealth, DependencyType } from '../shared/domain/runtime-health';
import { detectAllDependencies, type CommandRunner, type DependencyAggregateHealth } from './runtime-detector';
import type { RuntimeHealthResponse, RuntimeRepairInput, RuntimeRepairResponse } from '../shared/ipc';
import type { TaskRunner } from './task-runner';

const runtimeDependencies: Record<'docker' | 'podman', readonly DependencyType[]> = {
  docker: ['docker-compose', 'git'],
  podman: ['podman', 'git'],
};

export type RuntimeRepairAdapter = {
  repair: (input: {
    readonly dependency: DependencyType;
    readonly runtime: 'docker' | 'podman';
    readonly dryRun: boolean;
  }) => Promise<{ readonly summary: string }>;
};

export type RuntimeServiceDependencies = {
  readonly settings: {
    get: () => Promise<Settings | null>;
  };
  readonly taskRunner: TaskRunner;
  readonly detectDependencies?: (runner?: CommandRunner) => Promise<DependencyAggregateHealth>;
  readonly commandRunner?: CommandRunner;
  readonly repairAdapters?: Partial<Record<DependencyType, RuntimeRepairAdapter>>;
  readonly checkDebounceMs?: number;
  readonly staleAfterMs?: number;
};

const fallbackRuntime = (runtime: 'docker' | 'podman'): 'docker' | 'podman' =>
  runtime === 'docker' ? 'podman' : 'docker';

const getBlockingDependencies = (
  runtime: 'docker' | 'podman',
  dependencies: readonly DependencyHealth[]
): DependencyType[] => {
  const required = runtimeDependencies[runtime];
  return required.filter((dependency) => {
    const entry = dependencies.find((health) => health.dependency === dependency);
    return !entry || entry.status !== 'ready';
  });
};

export const resolveRuntimeSelection = (
  preferredRuntime: 'docker' | 'podman',
  dependencies: readonly DependencyHealth[]
): Pick<RuntimeHealthResponse, 'preferredRuntime' | 'selectedRuntime' | 'fallbackRuntime' | 'fallbackApplied' | 'blockingDependencies' | 'hasBlockingIssues'> => {
  const preferredBlocking = getBlockingDependencies(preferredRuntime, dependencies);
  if (preferredBlocking.length === 0) {
    return {
      preferredRuntime,
      selectedRuntime: preferredRuntime,
      fallbackRuntime: null,
      fallbackApplied: false,
      blockingDependencies: [],
      hasBlockingIssues: false,
    };
  }

  const alternateRuntime = fallbackRuntime(preferredRuntime);
  const alternateBlocking = getBlockingDependencies(alternateRuntime, dependencies);
  if (alternateBlocking.length === 0) {
    return {
      preferredRuntime,
      selectedRuntime: alternateRuntime,
      fallbackRuntime: alternateRuntime,
      fallbackApplied: true,
      blockingDependencies: preferredBlocking,
      hasBlockingIssues: false,
    };
  }

  return {
    preferredRuntime,
    selectedRuntime: preferredRuntime,
    fallbackRuntime: null,
    fallbackApplied: false,
    blockingDependencies: preferredBlocking,
    hasBlockingIssues: true,
  };
};

const defaultRepairAdapter = async (input: {
  readonly dependency: DependencyType;
  readonly dryRun: boolean;
}): Promise<{ readonly summary: string }> => {
  if (!input.dryRun) {
    throw new Error(`No repair adapter is configured for ${input.dependency}.`);
  }

  return {
    summary: `${input.dependency} repair dry-run completed.`,
  };
};

export class RuntimeService {
  private readonly settings;
  private readonly taskRunner;
  private readonly detectDependencies;
  private readonly commandRunner;
  private readonly repairAdapters;
  private readonly checkDebounceMs;
  private readonly staleAfterMs;
  private cachedHealth: { readonly value: RuntimeHealthResponse; readonly checkedAt: number } | null = null;
  private inFlightHealthCheck: Promise<RuntimeHealthResponse> | null = null;
  private lastHealthCheckStartedAt = 0;

  constructor(dependencies: RuntimeServiceDependencies) {
    this.settings = dependencies.settings;
    this.taskRunner = dependencies.taskRunner;
    this.detectDependencies = dependencies.detectDependencies ?? detectAllDependencies;
    this.commandRunner = dependencies.commandRunner;
    this.repairAdapters = dependencies.repairAdapters ?? {};
    this.checkDebounceMs = dependencies.checkDebounceMs ?? 1000;
    this.staleAfterMs = dependencies.staleAfterMs ?? 30_000;
  }

  public async getHealth(): Promise<RuntimeHealthResponse> {
    const now = Date.now();
    if (this.cachedHealth && now - this.cachedHealth.checkedAt <= this.staleAfterMs) {
      return this.cachedHealth.value;
    }

    if (
      this.inFlightHealthCheck &&
      now - this.lastHealthCheckStartedAt <= this.checkDebounceMs
    ) {
      return this.inFlightHealthCheck;
    }

    this.lastHealthCheckStartedAt = now;
    this.inFlightHealthCheck = this.getFreshHealth();

    try {
      const value = await this.inFlightHealthCheck;
      this.cachedHealth = { value, checkedAt: Date.now() };
      return value;
    } finally {
      this.inFlightHealthCheck = null;
    }
  }

  public invalidateHealthCache(): void {
    this.cachedHealth = null;
  }

  public async getHealthForStartup(): Promise<RuntimeHealthResponse> {
    const health = await this.getHealth();
    this.invalidateHealthCache();
    return health;
  }

  private async getFreshHealth(): Promise<RuntimeHealthResponse> {
    const settings = await this.settings.get();
    const preferredRuntime = settings?.runtimePreference ?? 'docker';
    const aggregate = await this.detectDependencies(this.commandRunner);
    const selection = resolveRuntimeSelection(
      preferredRuntime,
      aggregate.dependencies.map((entry) => entry.health)
    );

    return {
      ...selection,
      dependencies: aggregate.dependencies.map((entry) => entry.health),
    };
  }

  public async startRepair(input: RuntimeRepairInput = {}): Promise<RuntimeRepairResponse> {
    const settings = await this.settings.get();
    const preferredRuntime = input.runtimePreference ?? settings?.runtimePreference ?? 'docker';
    const dryRun = input.dryRun ?? true;
    const health = await this.getHealthForRuntime(preferredRuntime);
    const repairDependencies = [...health.blockingDependencies];

    const taskId = this.taskRunner.enqueue({
      name: `Repair ${preferredRuntime} runtime`,
      resource: { type: 'runtime', id: preferredRuntime },
      run: async (context) => {
        context.log('info', `Preparing repair plan for ${preferredRuntime}.`);

        for (const dependency of repairDependencies) {
          context.startStep(`repair-${dependency}`, `Repair ${dependency}`, `Repairing ${dependency}.`);
          const adapter = this.repairAdapters[dependency]?.repair ?? defaultRepairAdapter;

          try {
            const result = await adapter({ dependency, runtime: preferredRuntime, dryRun });
            context.log('info', result.summary, `repair-${dependency}`, `Repair ${dependency}`);
            context.completeStep(`repair-${dependency}`, `Repair ${dependency}`, result.summary);
          } catch (error) {
            context.log(
              'warning',
              'Rollback is not available for dependency repair operations.',
              `repair-${dependency}`,
              `Repair ${dependency}`
            );
            throw error instanceof Error ? error : new Error(String(error));
          }
        }

        context.startStep('verify-runtime', 'Verify runtime readiness');
        const postRepairHealth = await this.getHealthForRuntime(preferredRuntime);
        if (postRepairHealth.blockingDependencies.length > 0) {
          throw new Error(`Runtime remains blocked by: ${postRepairHealth.blockingDependencies.join(', ')}.`);
        }

        context.completeStep('verify-runtime', 'Verify runtime readiness', 'Runtime dependencies are ready.');
      },
    });

    return {
      taskId,
      preferredRuntime,
      selectedRuntime: health.selectedRuntime,
      fallbackApplied: health.fallbackApplied,
      dryRun,
      repairDependencies,
    };
  }

  private async getHealthForRuntime(runtimePreference: 'docker' | 'podman'): Promise<RuntimeHealthResponse> {
    const aggregate = await this.detectDependencies(this.commandRunner);
    const selection = resolveRuntimeSelection(
      runtimePreference,
      aggregate.dependencies.map((entry) => entry.health)
    );

    return {
      ...selection,
      dependencies: aggregate.dependencies.map((entry) => entry.health),
    };
  }
}