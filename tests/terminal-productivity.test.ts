import { describe, expect, it } from 'vitest';
import {
  appendCommandHistory,
  moveHistoryCursor,
  readHistoryEntry,
} from '../src/renderer/terminal-productivity';

describe('terminal productivity helpers', () => {
  it('appends trimmed commands to history', () => {
    expect(appendCommandHistory([], '  bench start  ')).toEqual(['bench start']);
  });

  it('ignores empty commands', () => {
    expect(appendCommandHistory(['bench start'], '   ')).toEqual(['bench start']);
  });

  it('moves repeated commands to the latest slot', () => {
    expect(appendCommandHistory(['bench start', 'bench stop'], 'bench start')).toEqual([
      'bench stop',
      'bench start',
    ]);
  });

  it('caps command history length', () => {
    const initialHistory = Array.from({ length: 3 }, (_, index) => `cmd-${index + 1}`);
    expect(appendCommandHistory(initialHistory, 'cmd-4', 3)).toEqual(['cmd-2', 'cmd-3', 'cmd-4']);
  });

  it('moves to older history entries', () => {
    const history = ['cmd-1', 'cmd-2', 'cmd-3'];
    expect(moveHistoryCursor(history, -1, 'older')).toBe(2);
    expect(moveHistoryCursor(history, 2, 'older')).toBe(1);
  });

  it('moves to newer history entries and clears after the latest entry', () => {
    const history = ['cmd-1', 'cmd-2', 'cmd-3'];
    expect(moveHistoryCursor(history, 0, 'newer')).toBe(1);
    expect(moveHistoryCursor(history, 2, 'newer')).toBe(-1);
  });

  it('returns empty entries for an out-of-range cursor', () => {
    expect(readHistoryEntry(['cmd-1'], -1)).toBe('');
    expect(readHistoryEntry(['cmd-1'], 99)).toBe('');
  });

  it('reads the selected history entry', () => {
    expect(readHistoryEntry(['cmd-1', 'cmd-2'], 1)).toBe('cmd-2');
  });
});
