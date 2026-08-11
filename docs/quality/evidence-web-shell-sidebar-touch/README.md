# Evidencia — shell sidebar web (targets táctiles + focus)

**Fecha:** 2026-08-10  
**Spec E2E:** `e2e/tests/web-shell-sidebar-touch-a11y.spec.ts`  
**Sesión:** mocks `setupWebApiMocks` + login plataforma (sin PII real)

| Archivo | Viewport | Tema | Contenido |
| --- | --- | --- | --- |
| `375-light-sidebar-open.png` | 375 | claro | Drawer mobile abierto |
| `375-light-focus-close.png` | 375 | claro | Foco en botón cerrar (`h-11 w-11`) |
| `375-dark-sidebar-open.png` | 375 | oscuro | Drawer mobile abierto |
| `375-dark-focus-close.png` | 375 | oscuro | Foco en botón cerrar |
| `1440-light-shell.png` | 1440 | claro | Shell desktop |
| `1440-dark-shell.png` | 1440 | oscuro | Shell desktop |
| `1440-dark-focus-user-menu.png` | 1440 | oscuro | Foco en menú de usuario |

**Medición CA-T1 (Playwright `boundingBox`):** cierre ≥ 44×44; marca/nav alto ≥ 44.
