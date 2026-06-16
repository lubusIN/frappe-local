import { describe, expect, it } from 'vitest';
import { getRecommendedPodmanMemoryMb } from '../../../src/shared/core/system-resources';

describe('system resource recommendations', () => {
  it('recommends 75 percent of host memory rounded down to whole GiB', () => {
    expect(getRecommendedPodmanMemoryMb(16 * 1024)).toBe(12 * 1024);
    expect(getRecommendedPodmanMemoryMb(18 * 1024)).toBe(13 * 1024);
  });

  it('keeps the recommendation within supported host limits', () => {
    expect(getRecommendedPodmanMemoryMb(4096)).toBe(4096);
    expect(getRecommendedPodmanMemoryMb(2048)).toBe(4096);
  });
});
