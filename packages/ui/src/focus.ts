/**
 * Anillo de foco visible compartido (Firma iWana / WCAG 2.2 AA).
 * Usar en controles interactivos nativos o compuestos que no traigan focus ring propio.
 */
export const interactiveFocusClassName =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-iwana-primary-300 dark:focus-visible:ring-offset-dark-surface-2';

/**
 * Control de icono del header: óvalo 44×56, radio de superficie (`rounded-2xl`).
 * Un cuadrado + `rounded-full` o `rounded-2xl` se lee como círculo; el ancho extra lo alinea al buscador.
 */
export const headerIconControlClassName =
  'flex h-11 w-14 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-iwana-surface-soft hover:text-iwana-primary dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-gray-400 dark:hover:bg-dark-surface-4 dark:hover:text-white';
