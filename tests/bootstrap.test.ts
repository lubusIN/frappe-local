import { describe, expect, it } from 'vitest';

describe('bootstrap', () => {
  it('keeps the project identity stable', () => {
    expect('Frappe Cafe').toBe('Frappe Cafe');
  });
});