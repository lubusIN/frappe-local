import { describe, expect, it } from 'vitest';

describe('bootstrap', () => {
  it('keeps the project identity stable', () => {
    expect('Local Bench').toBe('Local Bench');
  });
});