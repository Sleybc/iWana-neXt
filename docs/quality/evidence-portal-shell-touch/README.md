# Evidencia — shell portal (targets táctiles + focus)

**Fecha:** 2026-08-10  
**Spec E2E:** `e2e/tests/portal-shell-touch-a11y.spec.ts`  
**Sesión:** cookie mock + API mocks (sin PII real)

| Archivo | Viewport | Tema | Contenido |
| --- | --- | --- | --- |
| `375-light-sidebar-open.png` | 375 | claro | Drawer abierto |
| `375-light-focus-close.png` | 375 | claro | Foco en cerrar |
| `375-dark-sidebar-open.png` | 375 | oscuro | Drawer abierto |
| `1440-light-shell.png` | 1440 | claro | Shell desktop |
| `1440-dark-focus-user-menu.png` | 1440 | oscuro | Foco menú usuario |

**Medición:** hamburger, home, buscar, theme, campana, cierre sidebar y filas nav ≥ 44 px (`boundingBox`).
