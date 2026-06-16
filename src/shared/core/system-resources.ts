import { MIN_PODMAN_MEMORY_MB } from '../domain/models';

export const getRecommendedPodmanMemoryMb = (totalMemoryMb: number): number => {
  const normalizedTotalMemoryMb = Math.max(MIN_PODMAN_MEMORY_MB, Math.floor(totalMemoryMb));
  const recommendedMemoryMb = Math.max(
    MIN_PODMAN_MEMORY_MB,
    Math.floor((normalizedTotalMemoryMb * 0.75) / 1024) * 1024
  );

  return Math.min(recommendedMemoryMb, normalizedTotalMemoryMb);
};
