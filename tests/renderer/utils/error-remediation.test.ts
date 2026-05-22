import { describe, expect, it } from 'vitest';
import { buildErrorRemediationNotice } from '../../../src/renderer/utils/error-remediation';

describe('error-remediation', () => {
  it('maps runtime blocked errors to settings and retry actions', () => {
    const notice = buildErrorRemediationNotice(
      'runtime',
      'Runtime remains blocked by: docker-compose.'
    );

    expect(notice.title).toBe('Runtime repair did not clear all blockers');
    expect(notice.actions.map((action) => action.id)).toEqual(['retry', 'settings']);
  });

  it('maps progress failures to retry subscription guidance', () => {
    const notice = buildErrorRemediationNotice(
      'progress',
      'IPC bridge is unavailable. Ensure the preload script is loaded.'
    );

    expect(notice.title).toBe('Renderer bridge unavailable');
    expect(notice.actions[0]?.id).toBe('retry');
  });
});
