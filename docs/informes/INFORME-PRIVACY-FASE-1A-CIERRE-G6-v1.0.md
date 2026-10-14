# INFORME — `privacy` · Habeas Data · Cierre G6 de la Fase 1a

**Versión:** 1.0 · **Fecha:** 2026-10-14
**Emisor:** AI-EM-ARCH (consolidación). Los veredictos son de `sec-eng`, `sr-qa`, `boundary-reviewer`, `contract-drift-reviewer`, `gate-verifier` y `docs-governance`, ninguno de los cuales produjo el código revisado
**Decisión:** [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) (Aprobado) · **Plan:** [v1.6](../plans/2026-10-14-privacy-habeas-data-fase-1.md) · **Contrato:** [prompt v1.3](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md) (cadena v1.3 → v1.0, adendas A1–A26)
**Estado:** **G6 de la Fase 1a: GO** · G6.5 pendiente (027 en CI) · G7 no evaluado · la Fase 1b (Q8) no se incluye (D-F1A)

## 1. Alcance cerrado

Cierra E-2 de la auditoría MOD05 (SUB-A06, SUB-A07 y SUB-B03) en lo que corresponde a la Fase 1a:

| Área | Qué queda en el código |
| --- | --- |
| Titular | Party (ADR-030) |
| Autorizaciones | Por finalidad, solo-anexar, con texto legal versionado. El canal es el medio del titular (A24). Se exigen en el alta y la conversión (A18), y el traspaso desde el expediente es idempotente |
| Solicitudes del titular | Consulta, reclamo y suplantación con reloj legal en días hábiles (calendario colombiano con Ley 2578), las seis transiciones, la identidad diferida (A13) y la proyección del detalle por permiso (A23) |
| Suplantación (Ley 2573) | Solo contratos impugnados, suspendidos en la misma transacción que su auditoría (A17, A25), con tareas y fecha estimada de denuncia |
| Operación | Marcas, retención, incidentes con reporte único, inventario declarativo y alertas diarias (A19) |
| Portal | Bandeja, radicación, detalle, Cumplimiento en la ficha 360° y administración (spec v1.2 ratificada, 53 CA) |

## 2. Veredictos que se consolidan

| Revisor | Informe | Veredicto |
| --- | --- | --- |
| `sec-eng` | [SEC v1.1](INFORME-PRIVACY-FASE-1A-SEC-v1.1.md) | **GO.** SEC-01 corregido (R1). SEC-02 queda como deuda P2, condicionada al storage local |
| `sr-qa` | [QA v1.2](INFORME-PRIVACY-FASE-1A-QA-v1.2.md) y [v1.1](INFORME-PRIVACY-FASE-1A-QA-v1.1.md) | **GO.** 3/3 E2E contra el portal y la API reales, sin interceptores. Integración Postgres 13/13, con la atomicidad de `complete`. Matriz de 53 CA. Cobertura de `privacy`: 96,50 % de statements y 87,53 % de branches (31 suites, 141 tests). Tenant sintético `INACTIVE` |
| `boundary-reviewer` | [BOUNDARY v1.1](INFORME-PRIVACY-FASE-1A-BOUNDARY-v1.1.md) | **Sin hallazgos.** A25: no se crea `AuditLog` fuera de `audit`; un solo `forwardRef` |
| `contract-drift-reviewer` | [DRIFT v1.1](INFORME-PRIVACY-FASE-1A-DRIFT-v1.1.md) | **GO**, con una observación menor (§5) |
| `gate-verifier` | [GATES v1.1](INFORME-PRIVACY-FASE-1A-GATES-v1.1.md) | **Verde.** Lint, typecheck y tests de `api`, `shared`, `db`, `portal` y `worker` con 0 en caché. La API pasa 4.963 tests (R5) |
| `docs-governance` | [DOCS v1.1](INFORME-PRIVACY-FASE-1A-DOCS-v1.1.md) | NO-GO por dos bloqueantes, **corregidos por AI-EM-ARCH**: la tabla de estado del plan (v1.6) y este informe |

## 3. Cómo se llegó al GO

**Ola 4a:** NO-GO. Los motivos fueron:
- SEC-01;
- la auditoría escrita fuera de su módulo;
- la envoltura de dos respuestas;
- la QA, que no corrió por falta de base migrada;
- la cobertura, de 54 / 33 %;
- el plan.

**Ola 4a-bis:**
- R1: SEC-01 y las envolturas;
- R2: A25, `AuditService.logWithin`;
- R3: los enums del cliente;
- R4: la cobertura;
- R5: A26, `partyId` en la respuesta del suscriptor, que **solo el E2E real detectó**;
- R4b: los E2E reales, 3/3.

**Defectos del emisor (AI-EM-ARCH) en la fase:** las adendas A1–A26 corrigieron contratos congelados sin trazar regla → campo. Están registrados en cada versión del prompt y como lección de memoria. Ninguno llegó a datos reales: todo estuvo sin commitear o en un tenant sintético.

## 4. Condición del GO y pasos antes de producción

1. **G6.5:** la integración real de la migración pública 027 en CI (`DB_NAME=test`). La suite existe (`027_media_usage_privacy_evidence.integration.spec.ts`) y no se marca aprobada hasta correr.
2. **Dictámenes jurídicos** de ADR-094 §7.3 (⚠): bloquean producción, no la construcción. Los gestiona el CTO.
3. **G7:** `HLD-PRIVACY-v1.0` (deuda de AI-EM-ARCH, excepción documental de la Fase 1).
4. **Requisito por empresa:** publicar el texto de autorización. Sin él, el expediente y el alta responden 422 (A18).

## 5. Deuda registrada

| Severidad | Deuda | Dueño o destino |
| --- | --- | --- |
| P2 | SEC-02: el storage local no respeta el TTL de la URL firmada. Producción obliga MinIO; no cargar datos reales con storage local | `plat-ops` |
| P2 | Traslado: sin `transferDueAt` ni marca de traslado extemporáneo (A26) | Fase 1b |
| P2 | Métrica de alertas sin destino de métricas; solo en logs (Q6) | Plataforma |
| P2 | Conciliar por tenant las filas heredadas sin Party ni finalidad que dejó el backfill de la 146 | Operación al desplegar |
| P2 | La corrida de cobertura global de la API con `--no-cache` falla en `subscribers.controller.fase2.http.spec.ts:514`, un test sensible al tiempo. El gate oficial (`turbo --force`) pasa | `sr-backend` (CRM) |
| P2 | Interacciones del portal con evidencia parcial o simulada (estados de red, filtros, responsive, validación de archivos) | `sr-qa` |
| Menor | `SubscriberRecord.partyId` sigue opcional en `api-client.ts`, aunque la API siempre lo envía (A26) | `fe-platform` |
| P3 | El adaptador de suplantación replica la regla de transición de `ContractsService` | `sr-backend` |
| P3 | Evidencias huérfanas sin limpieza; nombres de contrato y de actores en el detalle | Fase 2 |
| Pendiente CTO | Número de módulo de `privacy`; E-3 (placeholders) de la auditoría MOD05; rotar `iwana_readonly` | CTO |

## 6. Siguiente

La **Fase 1b** cubre Q8 (bloqueo y anonimización) y el plazo de traslado. Lleva plan y contrato propios, con la pasada regla → campo **antes** de lanzar. Los cinco puntos abiertos están en el prompt v1.3 §3 (D-F1A). No está en la ruta crítica de la Ley 2573.
