/**
 * Paleta de colores del sistema de diseno iWana neXt.
 *
 * NOTA DE ACCESIBILIDAD:
 * - iwana-secondary (#A5C330) sobre blanco = 2.3:1 — NO pasa WCAG AA
 * - Para texto sobre fondo blanco usar #6A7A1C (contraste 6.2:1) — pasa WCAG AA
 * - El token iwana-secondary se usa solo para elementos decorativos y backgrounds
 */
export const iwanaColors = {
  primary: {
    DEFAULT: '#17163A',
    50: '#EEEEFA',
    100: '#D4D3F5',
    200: '#A9A7EA',
    300: '#7E7BDF',
    400: '#534FD4',
    500: '#2D2A9E',
    600: '#232180',
    700: '#1A1960',
    800: '#111040',
    900: '#17163A',
    950: '#0B0B1E',
  },
  secondary: {
    DEFAULT: '#A5C330',
    /** Usar para texto sobre fondo blanco — contraste 6.2:1 (pasa WCAG AA) */
    accessible: '#6A7A1C',
    50: '#F5FAE6',
    100: '#EAF5CC',
    200: '#D5EB99',
    300: '#C0E166',
    400: '#ABD733',
    500: '#A5C330',
    600: '#84A226',
    700: '#6A7A1C',
    800: '#506013',
    900: '#354009',
  },
  neutral: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
} as const;
