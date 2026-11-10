# Plan de implementación — D-2 · Constancia previa a la purga

> Para agentes ejecutores, aplicar `executing-plans` y las verificaciones de `AGENTS.md`.

**Objetivo.** Exigir constancia vigente por baja para la selección y la purga directa. [Spec aprobada](../specs/2026-11-10-plat-ops-d2-constancia-purga-tenant.md)

**Arquitectura.** PostgreSQL conserva la referencia opaca y la huella en `public`. Los procedimientos de DBA serializan registro y revocación con el lock de R7. Las dos funciones existentes mantienen sus firmas y permisos.

- [x] Fijar línea base de `@iwana/db` y `@iwana/worker` con `iwana-test-evidence`. Pos-ola: `@iwana/db` 79 suites / 429 pruebas; `@iwana/worker` 21 suites / 199. El diff de la ola no elimina ni relaja pruebas: los conteos solo suben.
- [x] Crear `packages/database/src/migrations/public/031_tenant_purge_evidence.ts` después de P2-2. Proteger el registro con RLS forzado, auditar alta y revocación y guardar evidencia tras borrar el tenant. Adaptar las funciones de selección y purga con `up` y `down` transaccionales. Registrar 031 en `public/index.ts` después de 030.
- [x] Añadir `031_tenant_purge_evidence.integration.spec.ts` con PostgreSQL desechable. Cubrir los dos tipos de constancia, ausencia, nueva baja, revocación, restricción de roles y reversión. Adaptar solo los fixtures del worker que necesitan purgar de verdad y mantener sus aserciones.
- [x] Documentar en la spec D-2 los comandos parametrizados de DBA, el inventario de G7 y la suspensión de la purga antes de revertir 031 en un entorno real.
- [x] Obtener revisión `boundary-reviewer`, `sec-eng` y `test-change-reviewer`. Verificar lint, typecheck, tests sin caché e integraciones desechables de los paquetes afectados.
