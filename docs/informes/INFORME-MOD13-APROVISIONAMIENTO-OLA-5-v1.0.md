# INFORME-MOD13 — Aprovisionamiento · Ola 5

**Versión:** 1.0  
**Estado:** F2 construido; build del portal y F1-v bloqueados por precondiciones del entorno  
**Fecha:** 2026-10-22  
**Emisor:** fe-platform (Codex)  
**Fuentes:** [HLD-MOD13 v1.1](../hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md) · [plan de ejecución](../plans/2026-10-22-mod13-aprovisionamiento.md) · [prompt de fase](../prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md) · [spec UX](../specs/2026-10-22-mod13-aprovisionamiento-ux.md) · [informe Ola 4](INFORME-MOD13-APROVISIONAMIENTO-OLA-4-v1.0.md)

## Resultado

F2 incorpora el panel de aprovisionamiento de la OT, la bandeja de instalaciones, la sección de servicios técnicos del suscriptor y los ajustes de red. Los controles respetan permisos y roles existentes; los formularios consumen el contrato congelado de `@iwana/shared`. Se añadieron estados de carga, error, vacío y resultado, paginación y navegación por teclado de las pestañas de la bandeja. No se modificaron HLD, contratos ni primitivas del design system. No hubo commit.

La validación funcional se ejecutó con pruebas de componentes; no se validó contra el API vivo. El build de producción compiló el código y pasó TypeScript, pero Next.js no pudo completar el prerender al intentar crear una ruta dentro de `.next`.

## Evidencia

| Alcance | Resultado medido |
| --- | --- |
| Pruebas focalizadas del portal | **4 suites, 239 tests aprobados**, incluidas las pruebas de componentes de red y las suites de OT relacionadas. |
| Intento de suite amplia del portal | No se obtuvo una corrida completa utilizable: una prueba de `OperationalEventualitiesPanel` expiró y el proceso excedió el tiempo disponible. No se declara verde la suite completa. |
| Portal typecheck | Pasó (`tsc --noEmit`). |
| Portal lint | Pasó con 0 errores y **43 advertencias** en archivos ajenos a F2; los archivos de F2 no agregaron advertencias. |
| Portal build | `next build --webpack` compiló y completó TypeScript; falló durante la generación de páginas con `EPERM` al crear `apps/portal/.next/server/app/_not-found.segments/_not-found`. Se repitió con un worker y con las rutas de salida preparadas; persistió el mismo error. El ajuste temporal `cpus: 1` fue retirado. Turbopack quedó detenido tras más de tres minutos sin avanzar de la compilación. |
| Revisión UI y whitespace | `audit-ui.mjs`: sin hallazgos. `git diff --check`: pasó. |
| Jest | Las cachés de las corridas se apuntaron fuera del repositorio; no se creó un directorio de caché Jest en el árbol del portal. |
| F1-v contra API real | **0 suites / 0 tests**: `127.0.0.1:3000` no aceptaba conexiones y no estaban configuradas `E2E_TENANT_ADMIN_EMAIL` ni `E2E_TENANT_ADMIN_PASSWORD`. No se ejecutaron pruebas con mocks para sustituir la precondición ni se imprimieron secretos. |

## Bloqueos y siguiente paso

**[BLOQUEO] Build del portal:** el proceso de Next.js recibe `EPERM` al crear una carpeta de salida bajo `.next`, incluso con las rutas de salida ya creadas. TypeScript y compilación Webpack pasan, pero falta completar el build en un entorno donde Next pueda escribir y renombrar sus artefactos.

**[BLOQUEO] F1-v:** falta que el API escuche en `127.0.0.1:3000` y que el entorno tenga credenciales E2E para un tenant de pruebas no `ACTIVE`. La validación contra el API real sigue pendiente; G4 no se cierra con esta evidencia.

La Ola 5 deja los entregables F2 implementados y las pruebas focalizadas verdes. No declara completo el gate de build ni G4; ambos requieren repetir la validación cuando estén disponibles sus precondiciones.
