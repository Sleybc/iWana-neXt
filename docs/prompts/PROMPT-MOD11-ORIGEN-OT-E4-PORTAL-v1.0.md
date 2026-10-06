# PROMPT — MOD11 Origen OT · E4 portal

**Versión:** 1.0 · **Fecha:** 2026-10-05 · **Destinatario:** `fe-platform`
**Estado:** preparado; espera GO revisado de B0. Requiere E3 en GO, ya registrado en `docs/informes/INFORME-MOD11-ORIGEN-OT-E3-v1.1.md`, y G2/G3 cerrados.
**G4 — revisado y adoptado por AI-EM-ARCH el 2026-10-05.** No lo emitió el orquestador. Se contrastó con tablas v1.2 §7.2, con la UX v1.1 §7 y con el informe B0 §5. Se adopta sin cambios de alcance.

## 1. Entrada y ownership

Lee AGENTS.md/bootstrap/reglas, planes consola v1.2/origen v1.1; UX `docs/specs/2026-10-05-mod11-consola-ot-requisito-ux.md` v1.1 §7; tablas `docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md` v1.2 §7.2; G3 §3 y handoff B0. Plantilla ejecución v1.2 citada como propuesta; AGENTS.md gobierna el destino.

Posees `ExecutionOrdersTable.tsx`, `ExecutionOrderSummary.tsx`, sus pruebas y, si evita duplicación, `execution-order-window-copy.ts`. No estás solo; conserva cambios ajenos y copy consolidado B0. No edites shell, hooks, slots, backend ni contratos.

## 2. Encargo

Con ventana nula, CREATED/ASSIGNED/EN_ROUTE/IN_PROGRESS/BLOCKED muestran «Por programar»; COMPLETED/COMPLETED_WITH_OBSERVATIONS/NOT_EXECUTED/CANCELLED muestran «Sin ventana planificada». La misma semántica en tabla y resumen. Fechas existentes conservan formato/intervalo; mono técnico solo para fechas, no para estos estados textuales.

En resumen abierto sin ventana añade la ayuda aprobada: «Esta orden no tiene una ventana planificada. Coordina su programación con el equipo de programación.» No invites al técnico a reclamar CREATED. No agregues columna, orden local ni encabezados ordenables. Consume orden publicado por servidor y capacidad sortableFields vacía.

## 3. Skills y gate

Lee frontend-dev-guidelines, core-components, testing-patterns, iwana-identity-ui-review y wcag-audit-patterns. Prueba todos los estados nulos y fechas existentes, ayuda solo cuando corresponde, sin enum crudo ni sort local. Typecheck portal; Jest operations/ Cached: 0 con baseline B0 conservado; audit-ui.mjs limpio y evidencia navegador. GO por CA-12 de origen sin P1/bloqueos.

## 4. Entrega

`docs/informes/INFORME-MOD11-ORIGEN-OT-E4-PORTAL-v1.0.md`: rutas, conteos, comandos, evidencia y deuda. No commit/push.
