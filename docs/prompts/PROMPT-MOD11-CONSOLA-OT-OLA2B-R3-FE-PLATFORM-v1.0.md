# PROMPT — MOD11 Consola OT · Ola 2b · R3 consumo y custodia

**Versión:** 1.0 · **Fecha:** 2026-10-05 · **Destinatario:** `fe-platform`
**Estado:** preparado; espera GO revisado y slots de B0.
**G4 — revisado y adoptado por AI-EM-ARCH el 2026-10-05.** No lo emitió el orquestador. Se contrastó con el informe B0 §5 (propiedad de archivos), con el dictamen G3 y con las condiciones registradas en el plan v1.2. Se adopta sin cambios de alcance.

## 1. Entrada

Lee AGENTS.md, bootstrap, reglas por path y plan de consola v1.2. Consume UX `docs/specs/2026-10-05-mod11-consola-ot-requisito-ux.md` v1.1 §§3–6,8–9; contrato de componente del 2026-10-05 v1.0; API execution-orders v1.4/completion v1; G3 §§3,5,8; informe B0. Plantilla de ejecución v1.2 citada como propuesta, subordinada a AGENTS.md.

## 2. Encargo y ownership

Posees `ExecutionOrderMaterialAction.tsx`, `use-execution-order-custody.ts` y sus pruebas. Consume el slot B0. No estás solo: conserva cambios ajenos. No edites shell/fachada, evidencia, refresh, ventana, API o contratos.

Consulta custodia solo cuando se abre MATERIAL con REGISTER_ITEM_USAGE permitido. Preinicio, lectura, otras acciones, inicio/cierre y simple carga de OT no la consultan. Responsable técnico/cuadrilla no equivale a ubicación de stock. Usa los endpoints existentes y resolución vigente del responsable. Filtra artículos ACTIVE por categoría del snapshot y asignación compatible; conserva paginación. No declares vacío definitivo con una página sin coincidencias si quedan páginas por recorrer; no trunques resultados compatibles.

Consumo conserva requirementKey, cantidad, finalDisposition y payload vigente. Historial queda bajo su requisito, separado de captura; no confundir disponibilidad con consumo. Maneja carga/error/reintento/offline/cancelación/cambio de OT sin respuesta obsoleta. Respeta la API estable de B0 para que R4 pueda refrescar custodia solo si MATERIAL sigue abierto.

## 3. Skills

Antes de escribir lee frontend-dev-guidelines, nextjs-app-router-patterns, core-components, wcag-audit-patterns, testing-patterns, iwana-identity-ui-review. Usa TDD/debugging cuando corresponda. Sin nuevos tokens/dependencias ni cambios contractuales.

## 4. Gate y entrega

CA-10/11: prueba negativa preinicio y readonly, consulta al abrir, selección por categoría con varias páginas, histórico, payload, error/reintento, cambio de OT y offline. Typecheck portal; Jest operations/ Cached: 0 con baseline B0 conservado; audit-ui.mjs limpio; evidencia navegador del acto MATERIAL. GO sin P1/bloqueos. Entrega `docs/informes/INFORME-MOD11-CONSOLA-OT-OLA2B-R3-FE-PLATFORM-v1.0.md` con archivos, conteos, comandos, evidencia y deuda. No commit/push.
