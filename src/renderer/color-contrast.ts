/**
 * WCAG AA Contrast Ratio Compliance Utilities
 * Reference: https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
 *
 * WCAG AA Thresholds:
 * - Normal text (< 18pt or < 14pt bold): 4.5:1
 * - Large text (>= 18pt or >= 14pt bold): 3:1
 * - Graphical components / UI components: 3:1
 *
 * Contrast Ratio Formula: (L1 + 0.05) / (L2 + 0.05)
 * where L1 = lighter color's relative luminance, L2 = darker color's relative luminance
 */

/**
 * Convert hex color to RGB values
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  return { r, g, b };
}

/**
 * Calculate relative luminance per WCAG formula
 * https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html#dfn-relative-luminance
 */
export function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);

  // Convert to 0-1 range
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  // Apply gamma correction
  const rLinear = rNorm <= 0.03928 ? rNorm / 12.92 : Math.pow((rNorm + 0.055) / 1.055, 2.4);
  const gLinear = gNorm <= 0.03928 ? gNorm / 12.92 : Math.pow((gNorm + 0.055) / 1.055, 2.4);
  const bLinear = bNorm <= 0.03928 ? bNorm / 12.92 : Math.pow((bNorm + 0.055) / 1.055, 2.4);

  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

/**
 * Calculate contrast ratio between two colors
 */
export function getContrastRatio(color1: string, color2: string): number {
  const l1 = getRelativeLuminance(color1);
  const l2 = getRelativeLuminance(color2);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if contrast ratio meets WCAG AA standards
 */
export function meetsWcagAA(color1: string, color2: string, isLargeText = false): boolean {
  const ratio = getContrastRatio(color1, color2);
  const threshold = isLargeText ? 3 : 4.5;
  return ratio >= threshold;
}

/**
 * Get descriptive WCAG level
 */
export function getWcagLevel(ratio: number, isLargeText = false): string {
  if (isLargeText) {
    if (ratio >= 7) return 'AAA (large text)';
    if (ratio >= 4.5) return 'AAA (large text, 4.5:1)';
    if (ratio >= 3) return 'AA (large text)';
    return 'Fail';
  }

  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA (graphics)';
  return 'Fail';
}

/**
 * Audit a color pair and provide detailed report
 */
export function auditContrast(
  foreground: string,
  background: string,
  context: string,
  fontSize = 'normal'
): {
  foreground: string;
  background: string;
  ratio: number;
  context: string;
  isLargeText: boolean;
  meetsAA: boolean;
  meetsAAA: boolean;
  wcagLevel: string;
} {
  const isLargeText = fontSize === 'large' || fontSize === 'bold';
  const ratio = getContrastRatio(foreground, background);

  return {
    foreground,
    background,
    ratio: Math.round(ratio * 100) / 100, // Round to 2 decimals
    context,
    isLargeText,
    meetsAA: meetsWcagAA(foreground, background, isLargeText),
    meetsAAA: ratio >= (isLargeText ? 4.5 : 7),
    wcagLevel: getWcagLevel(ratio, isLargeText),
  };
}
