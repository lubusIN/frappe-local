export const dependencyTypes = ['podman', 'docker-compose', 'git'] as const;

export type DependencyType = (typeof dependencyTypes)[number];

export const dependencyStatuses = ['ready', 'missing', 'incompatible', 'unknown'] as const;

export type DependencyStatus = (typeof dependencyStatuses)[number];

export const dependencyErrorCodes = [
  'not-found',
  'permission-denied',
  'unsupported-version',
  'execution-timeout',
  'execution-failed',
  'unparseable-version',
  'unknown-error',
] as const;

export type DependencyErrorCode = (typeof dependencyErrorCodes)[number];

export type DependencyVersion = {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly raw: string;
};

export type DependencyGuidance = {
  readonly title: string;
  readonly steps: readonly string[];
};

export type DependencyHealth = {
  readonly dependency: DependencyType;
  readonly status: DependencyStatus;
  readonly detectedVersion: string | null;
  readonly requiredVersion: string | null;
  readonly summary: string;
  readonly guidance: DependencyGuidance;
};

export type DependencyProbeResult = {
  readonly dependency: DependencyType;
  readonly installed: boolean;
  readonly version: string | null;
  readonly minimumVersion: string | null;
  readonly status: DependencyStatus;
};

const dependencyDisplayNames: Record<DependencyType, string> = {
  podman: 'Podman',
  'docker-compose': 'Docker Compose',
  git: 'Git',
};

export const minimumDependencyVersions: Record<DependencyType, string> = {
  podman: '4.0.0',
  'docker-compose': '2.20.0',
  git: '2.39.0',
};

export const parseDependencyVersion = (rawOutput: string): DependencyVersion | null => {
  const match = rawOutput.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) {
    return null;
  }

  return {
    major: Number.parseInt(match[1] ?? '0', 10),
    minor: Number.parseInt(match[2] ?? '0', 10),
    patch: Number.parseInt(match[3] ?? '0', 10),
    raw: match[0],
  };
};

export const compareDependencyVersions = (
  left: DependencyVersion | null,
  right: DependencyVersion | null
): -1 | 0 | 1 => {
  if (!left || !right) {
    return 0;
  }

  if (left.major !== right.major) {
    return left.major > right.major ? 1 : -1;
  }

  if (left.minor !== right.minor) {
    return left.minor > right.minor ? 1 : -1;
  }

  if (left.patch !== right.patch) {
    return left.patch > right.patch ? 1 : -1;
  }

  return 0;
};

export const buildDependencyGuidance = (
  dependency: DependencyType,
  status: DependencyStatus,
  minimumVersion = minimumDependencyVersions[dependency]
): DependencyGuidance => {
  const name = dependencyDisplayNames[dependency];

  if (status === 'ready') {
    return {
      title: `${name} is ready`,
      steps: ['No action required.'],
    };
  }

  if (status === 'missing') {
    return {
      title: `Install ${name}`,
      steps: [
        `Install ${name} on this machine.`,
        'Reload the dependency health check after installation.',
      ],
    };
  }

  if (status === 'incompatible') {
    return {
      title: `Upgrade ${name}`,
      steps: [
        `Upgrade ${name} to at least ${minimumVersion}.`,
        'Re-run the dependency check to confirm the updated version.',
      ],
    };
  }

  return {
    title: `Review ${name}`,
    steps: [
      `Verify that ${name} can be executed from the current shell environment.`,
      'Review logs for the underlying command output and retry the check.',
    ],
  };
};

export const toDependencyHealth = (probe: DependencyProbeResult): DependencyHealth => {
  const name = dependencyDisplayNames[probe.dependency];
  const guidance = buildDependencyGuidance(probe.dependency, probe.status, probe.minimumVersion ?? undefined);

  const summary = probe.status === 'ready'
    ? `${name} is installed and compatible.`
    : probe.status === 'missing'
      ? `${name} was not detected on this machine.`
      : probe.status === 'incompatible'
        ? `${name} is installed but below the required version.`
        : `${name} could not be classified confidently.`;

  return {
    dependency: probe.dependency,
    status: probe.status,
    detectedVersion: probe.version,
    requiredVersion: probe.minimumVersion,
    summary,
    guidance,
  };
};