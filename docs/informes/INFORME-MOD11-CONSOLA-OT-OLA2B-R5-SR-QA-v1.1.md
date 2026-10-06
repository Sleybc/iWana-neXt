# Actualización R5 — Calidad, accesibilidad y regresión de la consola de OT

- **Versión:** 1.1
- **Fecha:** 2026-10-06
- **Estado:** **NO-GO de QA; bloqueos explícitos**
- **Agente:** AI-SR-QA (`sr-qa`)
- **Informe base:** [R5 v1.0](INFORME-MOD11-CONSOLA-OT-OLA2B-R5-SR-QA-v1.0.md)
- **Fuentes vigentes:** UX MOD11 v1.3; contrato de componente v1.1; API de OT v1.5.

## Actualización de hallazgos

La deuda de atribución MATERIAL que R5 v1.0 marcaba como incumplimiento queda resuelta por el contrato aditivo v1.5 y su implementación. El historial con clave se muestra bajo el requisito exacto; las filas heredadas sin clave se presentan una sola vez en el grupo neutral, sin inferir su origen. UX v1.3 §14.2 y contrato de componente v1.1 fijan que conteo y paginación son globales.

El copy nuevo de captura de evidencia y firma quedó ratificado en UX v1.3 §15. Los informes R2 y R3 cuentan con actualizaciones v1.1.

## Regresión consolidada

| Gate | Resultado actualizado |
| --- | --- |
| Typecheck monorepo | `pnpm typecheck --force`: exit 0; 8 tareas exitosas, `Cached: 0` |
| Lint monorepo | `pnpm lint --force`: exit 0; 8 tareas exitosas, `Cached: 0`; hay advertencias de baseline, ningún error |
| Jest monorepo | `pnpm test -- --force -- --no-cache`: 7.873 aprobadas, 16 omitidas, 0 fallidas; 10 tareas exitosas, `Cached: 0` |
| Jest `operations/` | 44 suites, 759 pruebas aprobadas, sin caché |
| E2E consola B0/R2/R3/OLA1 | 13/13 aprobados en Chromium; backend simulado por `page.route` |
| Auditoría de UI | `audit-ui.mjs`: P0–P3 en cero y `findings: []` |
| Migración de clave de consumo | Pruebas unitarias aprobadas y una integración aprobada contra PostgreSQL real, schema aislado |

Los E2E reutilizaron el servidor de desarrollo existente en `127.0.0.1:3002`; el intento de obtener un servidor nuevo encontró el puerto ocupado. No se detuvo el proceso que el usuario podía estar usando.

## Bloqueos que impiden GO

- **[BLOQUEO-R5-LECTOR]** Falta recorrido manual con NVDA, JAWS o VoiceOver. Roles ARIA, axe, teclado en Jest y navegador Chromium automatizado no permiten afirmar la experiencia de lectura real.
- **[BLOQUEO-CA09-BACKEND]** Falta registrar una firma contra backend real y demostrar que `close()` acepta esa evidencia. Los E2E interceptan HTTP; la sesión autenticada disponible permitió solo GET. No se modificó ni cerró la OT real observada.
- **[BLOQUEO-R5-SERVIDOR]** El gate de servidor nuevo quedó sin evidencia porque el puerto 3002 estaba ocupado.
- **[BLOQUEO-P95-R2]** Sigue pendiente una medición de p95/p99 con carga en staging o producción; los números locales no cierran ese gate.

La consulta histórica MATERIAL de R5 v1.0 queda **cerrada**, no se conserva como bloqueo. Ver API v1.5, UX §14 y los informes R2/R3 v1.1.

**Veredicto: NO-GO de QA** hasta completar las verificaciones de lector de pantalla y CA-09 en un entorno de prueba autorizado. El p95 compartido permanece como gate independiente de R2.
