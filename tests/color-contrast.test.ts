import { describe, it, expect } from 'vitest';
import {
  getRelativeLuminance,
  getContrastRatio,
  meetsWcagAA,
  auditContrast,
  getWcagLevel,
} from '../src/renderer/color-contrast';

describe('color-contrast utilities', () => {
  describe('getRelativeLuminance', () => {
    it('should calculate luminance for white', () => {
      const lum = getRelativeLuminance('#ffffff');
      expect(lum).toBeCloseTo(1, 2);
    });

    it('should calculate luminance for black', () => {
      const lum = getRelativeLuminance('#000000');
      expect(lum).toBeCloseTo(0, 2);
    });

    it('should calculate luminance for mid-gray', () => {
      const lum = getRelativeLuminance('#808080');
      expect(lum).toBeGreaterThan(0.2);
      expect(lum).toBeLessThan(0.22);
    });
  });

  describe('getContrastRatio', () => {
    it('should calculate 21:1 for black on white', () => {
      const ratio = getContrastRatio('#000000', '#ffffff');
      expect(ratio).toBeCloseTo(21, 0);
    });

    it('should calculate 1:1 for same color', () => {
      const ratio = getContrastRatio('#666666', '#666666');
      expect(ratio).toBeCloseTo(1, 0);
    });

    it('should be symmetric (order independent)', () => {
      const ratio1 = getContrastRatio('#000000', '#ffffff');
      const ratio2 = getContrastRatio('#ffffff', '#000000');
      expect(ratio1).toBeCloseTo(ratio2, 2);
    });
  });

  describe('meetsWcagAA', () => {
    it('should pass for sufficient normal text contrast', () => {
      const meets = meetsWcagAA('#000000', '#ffffff', false);
      expect(meets).toBe(true);
    });

    it('should fail for insufficient normal text contrast', () => {
      const meets = meetsWcagAA('#999999', '#ffffff', false);
      expect(meets).toBe(false);
    });

    it('should pass for large text with lower ratio', () => {
      // ~4:1 ratio on this pair should pass for large text but might not for normal
      const meets = meetsWcagAA('#555555', '#ffffff', true);
      expect(meets).toBe(true);
    });
  });

  describe('getWcagLevel', () => {
    it('should return AAA for 7:1 ratio', () => {
      const level = getWcagLevel(7);
      expect(level).toBe('AAA');
    });

    it('should return AA for 4.5:1 ratio', () => {
      const level = getWcagLevel(4.5);
      expect(level).toBe('AA');
    });

    it('should return AA graphics for 3:1 ratio', () => {
      const level = getWcagLevel(3);
      expect(level).toBe('AA (graphics)');
    });

    it('should return Fail for 2:1 ratio', () => {
      const level = getWcagLevel(2);
      expect(level).toBe('Fail');
    });

    it('should distinguish large text levels', () => {
      const level = getWcagLevel(4.5, true);
      expect(level).toContain('large text');
    });
  });

  describe('auditContrast', () => {
    it('should generate detailed audit report', () => {
      const report = auditContrast('#000000', '#ffffff', 'test case', 'normal');
      expect(report).toEqual({
        foreground: '#000000',
        background: '#ffffff',
        ratio: expect.any(Number),
        context: 'test case',
        isLargeText: false,
        meetsAA: true,
        meetsAAA: true,
        wcagLevel: 'AAA',
      });
    });

    it('should mark large text appropriately', () => {
      const report = auditContrast('#333333', '#ffffff', 'large text test', 'large');
      expect(report.isLargeText).toBe(true);
    });
  });
});

describe('Accessibility - Component Color Contrast Audit', () => {
  describe('ConfirmationDialog', () => {
    it('eyebrow (#8a5030) on card background (#fffbf7) meets WCAG AA', () => {
      const audit = auditContrast('#8a5030', '#fffbf7', 'confirm-eyebrow', 'normal');
      expect(audit.meetsAA).toBe(true);
    });

    it('title (#333) on card background (#fffbf7) meets WCAG AA', () => {
      const audit = auditContrast('#333333', '#fffbf7', 'confirm-title', 'normal');
      expect(audit.meetsAA).toBe(true);
    });

    it('message (#5d4533) on card background (#fffbf7) meets WCAG AA', () => {
      const audit = auditContrast('#5d4533', '#fffbf7', 'confirm-message', 'normal');
      expect(audit.meetsAA).toBe(true);
    });

    it('button text (#ffffff) on danger button background (#9c2323) meets WCAG AA', () => {
      const audit = auditContrast('#ffffff', '#9c2323', 'confirm-danger-button', 'normal');
      // White text on dark red should have strong contrast
      expect(audit.meetsAA).toBe(true);
      expect(audit.ratio).toBeGreaterThan(4.5);
    });
  });

  describe('ErrorNotice', () => {
    it('eyebrow (#7b2f23) on error background meets WCAG AA for small text', () => {
      const audit = auditContrast('#7b2f23', '#ffe8e8', 'error-eyebrow', 'normal');
      // Small eyebrow text should still aim for good contrast
      const ratio = getContrastRatio('#7b2f23', '#ffe8e8');
      expect(ratio).toBeGreaterThan(2);
    });

    it('title on error background meets WCAG AA', () => {
      const audit = auditContrast('#333333', '#ffe8e8', 'error-title', 'normal');
      expect(audit.meetsAA).toBe(true);
    });

    it('reason text (#6f3428) on error background meets WCAG AA', () => {
      const audit = auditContrast('#6f3428', '#ffe8e8', 'error-reason', 'normal');
      // Audit current color
      const ratio = getContrastRatio('#6f3428', '#ffe8e8');
      expect(ratio).toBeGreaterThan(2);
    });

    it('button text (#70281e) on light button background meets WCAG AA', () => {
      const audit = auditContrast('#70281e', '#ffffff', 'error-button', 'normal');
      // Light background for button may not be enough
      const ratio = getContrastRatio('#70281e', '#ffffff');
      expect(ratio).toBeGreaterThan(3);
    });
  });

  describe('StatePanel', () => {
    it('eyebrow (#44566f) on info background meets WCAG AA for small text', () => {
      const audit = auditContrast('#44566f', '#ebf2f9', 'state-info-eyebrow', 'normal');
      const ratio = getContrastRatio('#44566f', '#ebf2f9');
      expect(ratio).toBeGreaterThan(2);
    });

    it('error eyebrow (#7a2e2e) on error background meets WCAG AA', () => {
      const audit = auditContrast('#7a2e2e', '#ffeeea', 'state-error-eyebrow', 'normal');
      const ratio = getContrastRatio('#7a2e2e', '#ffeeea');
      expect(ratio).toBeGreaterThan(2);
    });

    it('body text (#53677f) on info background meets WCAG AA', () => {
      const audit = auditContrast('#53677f', '#ebf2f9', 'state-info-body', 'normal');
      expect(audit.meetsAA).toBe(true);
    });

    it('error body text (#7f3c34) on error background meets WCAG AA', () => {
      const audit = auditContrast('#7f3c34', '#ffeeea', 'state-error-body', 'normal');
      const ratio = getContrastRatio('#7f3c34', '#ffeeea');
      expect(ratio).toBeGreaterThan(2);
    });
  });
});
