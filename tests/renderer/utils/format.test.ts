import { describe, expect, it } from 'vitest';
import { formatStatus, formatTime, statusTheme } from '../../../src/renderer/utils/format';

describe('format UI utils', () => {
  describe('statusTheme', () => {
    it('returns correct theme for running status based on context', () => {
      expect(statusTheme('running', 'resource')).toBe('green');
      expect(statusTheme('running', 'task')).toBe('blue');
      expect(statusTheme('running')).toBe('blue');
    });

    it('returns green for success statuses', () => {
      expect(statusTheme('ready')).toBe('green');
      expect(statusTheme('success')).toBe('green');
      expect(statusTheme('passed')).toBe('green');
      expect(statusTheme('ok')).toBe('green');
    });

    it('returns red for failure statuses', () => {
      expect(statusTheme('failure')).toBe('red');
      expect(statusTheme('failed')).toBe('red');
      expect(statusTheme('error')).toBe('red');
    });

    it('returns amber for warning statuses', () => {
      expect(statusTheme('warning')).toBe('amber');
      expect(statusTheme('warn')).toBe('amber');
    });

    it('returns blue for queued status and gray for unknown status', () => {
      expect(statusTheme('queued')).toBe('blue');
      expect(statusTheme('unknown')).toBe('gray');
    });
  });

  describe('formatStatus', () => {
    it('formats running status based on context', () => {
      expect(formatStatus('running', 'resource')).toBe('Running');
      expect(formatStatus('running', 'task')).toBe('In Progress');
    });

    it('formats standard statuses cleanly', () => {
      expect(formatStatus('ready')).toBe('Ready');
      expect(formatStatus('queued')).toBe('Queued');
      expect(formatStatus('failure')).toBe('Failed');
      expect(formatStatus('success')).toBe('Success');
      expect(formatStatus('passed')).toBe('Passed');
      expect(formatStatus('warn')).toBe('Warning');
    });

    it('capitalizes arbitrary custom statuses', () => {
      expect(formatStatus('custom')).toBe('Custom');
    });
  });

  describe('formatTime', () => {
    it('formats date values to locale string', () => {
      const date = new Date('2026-01-01T12:00:00.000Z');
      expect(formatTime(date)).toBe(date.toLocaleString());
    });
  });
});
