# PROMPT — MOD11 Consola OT · Ola 2b · R4 refetch selectivo

**Versión:** 1.0 · **Fecha:** 2026-10-05 · **Destinatario:** `fe-platform`
**Estado:** preparado; espera GO revisado y adaptador B0.
**G4 — revisado y adoptado por AI-EM-ARCH el 2026-10-05.** No lo emitió el orquestador. Se contrastó con el informe B0 §5 (propiedad de archivos), con el dictamen G3 y con las condiciones registradas en el plan v1.2. Se adopta sin cambios de alcance.

## 1. Entrada

Lee AGENTS.md/bootstrap/reglas y plan consola v1.2, UX del 2026-10-05 v1.1 §11.2.5, contrato componente v1.0, API v1.4/completion v1, G3 §§3,4,8 y handoff B0. Plantilla de ejecución v1.2 citada como propuesta; ubicación normativa AGENTS.md.

## 2. Ownership y comportamiento

Posees únicamente `use-execution-order-refresh.ts` y pruebas propias. No estás solo: conserva cambios ajenos. No edites fachada `use-execution-order-console.ts`, shell, otros slots, API ni contratos. Si la fachada no permite el cambio independiente, [BLOQUEO] con ruta/prop, para remediación por B0.

Inicio/cierre refrescan detalle y evaluación publicada. Actividad refresca detalle y actividades; consumo detalle y consumos, más custodia solo si MATERIAL sigue abierto; evidencia detalle e historial de evidencia. No disparar las seis colecciones tras cada mutación. Conserva datos válidos durante refresco/error, loading/error/success por recurso y reintento. Impide resultados de una OT antigua sobre la actual y cargas duplicadas innecesarias. No amplíes autorizaciones ni recalcules completion en cliente.

## 3. Skills y verificación

Lee frontend-dev-guidelines, nextjs-app-router-patterns, testing-patterns antes de escribir; iwana-identity-ui-review si se toca UI (fuera del ownership previsto). Prueba número exacto de llamadas por mutación, fallo parcial y preservación de datos, navegación concurrente, custodia abierta/cerrada. CA-12 y regresión de payload/cierre/offline/storage. Typecheck portal y Jest operations/ Cached: 0, sin bajar baseline B0. GO sin bloqueo/P1.

## 4. Entrega

`docs/informes/INFORME-MOD11-CONSOLA-OT-OLA2B-R4-FE-PLATFORM-v1.0.md`: matriz acción→lecturas, archivos, comandos/conteos, evidencia y deuda. No commit/push.
