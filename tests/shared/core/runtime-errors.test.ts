import { describe, expect, it } from 'vitest';
import { humanizeCreateFailure } from '../../../src/shared/core/runtime-errors';

describe('runtime error messages', () => {
  it('preserves Podman setup timeout details during bench creation', () => {
    const message = humanizeCreateFailure(
      'bench',
      'Command timed out after 300000ms of no output: podman machine init --now\nLast output:\nDownloading VM image'
    );

    expect(message).toContain('Bench creation failed during Podman setup');
    expect(message).toContain('Downloading VM image');
  });
});
