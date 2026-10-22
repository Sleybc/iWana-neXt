# INFORME-MOD13 — Aprovisionamiento · Ola 1

**Versión:** 1.0  
**Estado:** En revisión · Ola ejecutada con bloqueos de contrato  
**Fecha:** 2026-10-22  
**Emisor:** AI-EM-ARCH  
**Fuentes:** [PRD-MOD13](../prds/PRD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.0.md) · [HLD-MOD13](../hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.0.md) · [ADR-098](../adrs/ADR-098-IPAM-y-Aprovisionamiento-Certificado-MOD13.md) · [plan](../plans/2026-10-22-mod13-aprovisionamiento.md) · [prompt de fase](../prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.0.md)

## Resultado por bloque

| Bloque           | Resultado                                                                                                                                         | Entregable o evidencia                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| P0 · prod-ux     | **Bloqueado** por contrato incompleto. No se inventaron campos ni se redactaron flujos parciales.                                                 | [Spec UX](../specs/2026-10-22-mod13-aprovisionamiento-ux.md)             |
| S0 · sec-eng     | **Cerrado.** Q2 requiere `network.provisioning.read` para mostrar la sección técnica del suscriptor.                                              | [Revisión de seguridad](INFORME-MOD13-REVISION-SEGURIDAD-DISENO-v1.0.md) |
| D1 · data-eng    | **Cerrado.** Extensión pública 028, migraciones tenant 160–162 y entidades; ida y vuelta en PostgreSQL local.                                     | Evidencia debajo                                                         |
| B1a · sr-backend | **Parcialmente cerrado.** Esquemas, colas y seis permisos implementados; los DTO de respuesta quedan bloqueados porque el HLD no fija sus campos. | `packages/shared/src/contracts/network/` y evidencia debajo              |

## Bloqueos de contrato

### Identidad del certificador

PRD §5 RF-NET-14 y HLD §9 piden mostrar quién certificó en «Servicio técnico». El HLD §3.2 solo persiste `certified_by` como UUID y `certified_at`; §4 y §6.5 no especifican una identidad legible ni la consulta o proyección que la resolvería. P0 se detuvo conforme al contrato congelado. Se requiere re-sync versionado del HLD antes de completar la spec UX.

### Formas de los DTO de respuesta

El prompt B1a solicita `RouterDto`, `Ipv4NetworkDto`, `PlanProfileDto`, `NetworkSettingsDto`, `ServiceProvisioningDto` y `ProvisioningInboxRowDto`. El HLD nombra esas respuestas, pero no define sus campos; tampoco define el shape anidado de `ServiceProvisioningDto` en `ProvisioningOrderContextDto`. No se publicaron tipos supuestos. Se requiere fijar los shapes en una versión aprobada del HLD para terminar B1a y habilitar a sus consumidores.

### Hallazgos de seguridad que bloquean el avance

S0 reporta **0 P0, 4 P1, 3 P2 y 0 P3**. Los dos bloqueos de contrato expresos son:

- R6 no define el resultado maker-checker cuando `assignedTechnicianId` es `null`; se debe fallar cerrado o fijar una identidad verificable del ejecutor.
- El PRD atribuye la regularización a NOC, mientras que la matriz congelada del HLD concede `network.provisioning.regularize` solo a ADMIN.

Además, antes de cerrar G5 el informe exige especificar las guardas server-side de R12, la auditoría completa de mutaciones y la proyección mínima para el técnico; también queda verificar el pipeline global de seguridad y sanear `last_error` en la revisión de implementación.

## Implementación y evidencia

### D1 · datos y migraciones

Q1 quedó resuelto con la opción autorizada por el usuario: el Postgres local tenía `btree_gist` 1.8 disponible y `trusted`, pero aún no instalada. El rol migrator podía crearla. La migración pública 028 la instala una vez y la conserva en `down`, siguiendo el precedente público 018. La tenant 160 mantiene la exclusión GiST del HLD; B1b no necesita un lock por tenant como garantía contra solapamientos.

Se entregaron las migraciones tenant 160–162 y sus integraciones, la migración pública 028 y su integración, el registro de migraciones, siete entidades TypeORM y el aviso de rollback destructivo de 160/161 en el plan CLI de revert. Las pruebas usaron schemas fixture efímeros en `dbiw`; no se modificaron schemas de tenants `ACTIVE`. Al terminar se verificaron cero schemas fixture, cero filas del tenant fixture y la extensión instalada en versión 1.8.

**Conteo real de ciclo de migración:** 3 migraciones tenant aplicadas y revertidas (160, 161 y 162) sobre fixtures efímeros. La migración pública 028 se aplicó; su `down` se ejecutó y conserva intencionalmente `btree_gist` 1.8 por ser una extensión compartida. Resultado de integración enfocado: 4 suites/4 tests aprobados, una por cada migración 028 y 160–162.

Comandos y conteos reportados por D1:

```text
pnpm --config.use-node-version=24.18.0 --filter @iwana/db test:integration -- --runInBand --cacheDirectory C:/appiw/packages/database/.jest-integration-cache-d1 --runTestsByPath src/migrations/public/028_enable_btree_gist.integration.spec.ts src/migrations/tenant/160_network_catalog.integration.spec.ts src/migrations/tenant/161_network_provisioning.integration.spec.ts src/migrations/tenant/162_seed_network_permissions.integration.spec.ts
4 suites, 4 tests: passed

pnpm --config.use-node-version=24.18.0 --filter @iwana/db exec jest --cacheDirectory C:/appiw/packages/database/.jest-cache-d1 --runInBand src/migrations/public/migration-order.spec.ts src/migrations/tenant/migration-order.spec.ts src/migrations/public/026_media_usage_stratum_evidence.spec.ts src/migrations/public/027_media_usage_privacy_evidence.spec.ts
4 suites, 27 tests: passed

pnpm --config.use-node-version=24.18.0 --filter @iwana/db typecheck
pnpm --config.use-node-version=24.18.0 --filter @iwana/db build
ESLint de las rutas afectadas
Resultado: los tres gates pasaron
```

En una corrida de integración más amplia, 35 suites y 105 tests pasaron. Seis suites no iniciaron porque sus guardas exigen `DB_NAME=test` o `iwana_it_*` y rechazaron `DB_NAME=dbiw`; no se cambiaron esas guardas. Las suites afectadas fueron `subscriber-deuda-153-156`, `026_media_usage_stratum_evidence`, `152_work_order_source_context_tasks`, `145_contract_stratum_evidence_unique`, `027_media_usage_privacy_evidence` y `work-order-source-context-parity`.

### B1a · contratos compartidos

Se publicaron enums, `ControlParamsSchema`, esquemas del evento y envoltura firmada, canonicalización estable por orden de claves, nombres de cola y las seis claves de permiso en el barrel compartido. Los DTO sin shape contractual quedaron pendientes por el bloqueo anterior.

```text
pnpm --config.use-node-version=24.18.0 --filter @iwana/shared exec jest src/contracts/network/network.contracts.spec.ts --runInBand --cacheDirectory ./.tmp-mod13-jest-cache
1 suite, 5 tests: passed

pnpm --config.use-node-version=24.18.0 --filter @iwana/shared lint
pnpm --config.use-node-version=24.18.0 --filter @iwana/shared typecheck
Prettier --check sobre las rutas modificadas
Resultado: todos pasaron
```

## Siguiente paso

No iniciar B1b, B2 ni F1/F2 hasta que se resincronicen los shapes faltantes y se resuelvan los bloqueos de autorización del informe S0. Después, B1b puede consumir las seis claves ya publicadas y la exclusión de red garantizada por PostgreSQL.

No se creó ningún commit. Se conservaron los cambios preexistentes del árbol de `main` ajenos a esta ola.
