# Checklist de calidad — OT de instalacion MOD09–MOD11

**Version:** 1.0  
**Estado:** En revision  
**Fecha:** 2026-07-27  
**Owner:** AI-SR-QA  
**Auditor de seguridad:** AI-SEC-ENG  
**Plan:** `docs/plans/2026-07-27-mod09-mod11-ot-instalacion-redesign.md`

---

## 1. Regla de evidencia

Cada fila se cierra con test/comando, resultado, fecha, agente y referencia de commit o informe. “Implementado” sin evidencia no equivale a aprobado.

## 2. Matriz criterio ↔ prueba

| ID | Riesgo/criterio | Nivel | Evidencia exigida | Estado |
| --- | --- | --- | --- | --- |
| QA-01 | Otro tenant no lee ni muta OT | P0 | integración con dos schemas y token/contexto separado | Abierto |
| QA-02 | UUID conocido sin alcance/asignación no concede acceso | P0 | `404` indistinguible para recurso ausente/cross-tenant/fuera de ABAC y `403` solo para recurso visible sin permiso, cubriendo read, assign/reassign, start, activity, item-usage, evidence/upload/media, block/unblock, close, follow-up, plantillas y re-drive | Abierto |
| QA-03 | Coordinador sin `execute` no registra trabajo | P0 | matriz permiso×asignacion | Abierto |
| QA-04 | Contratista asignado con permiso sí ejecuta | P1 | caso positivo y revocación | Abierto |
| QA-05 | OT terminal es inmutable | P0 | mutaciones completas rechazadas | Abierto |
| QA-06 | Cierre concurrente produce un resultado | P0 | prueba de carrera | Abierto |
| QA-07 | Idempotency key no duplica actividad/evidencia/consumo | P0 | reintento HTTP/job | Abierto |
| QA-08 | Outbox y cambio de OT son atomicos | P0 | rollback antes/después de commit | Abierto |
| QA-09 | Consumidor duplicado/fuera de orden no revierte proyección | P0 | integración worker | Abierto |
| QA-10 | Job resuelve tenant explícitamente | P0 | dos tenants + pgBouncer/search_path | Abierto |
| QA-11 | Serial y custodia se validan en MOD12 | P0 | serial ajeno, duplicado, sin stock | Abierto |
| QA-12 | Rechazo de inventario queda conciliable | P1 | estado/alerta/reintento | Abierto |
| QA-13 | Plantilla publicada es inmutable | P1 | versionado y snapshot | Abierto |
| QA-14 | Gate 422 enumera faltantes | P1 | matriz de resultados | Abierto |
| QA-15 | Agenda no ejecuta ni cierra OT | P1 | component + Playwright | Abierto |
| QA-16 | OT terminal no muestra inputs | P1 | component + Playwright | Abierto |
| QA-17 | No hay enum crudo/UUID prominente | P2 | inspección y unit tests de copy | Abierto |
| QA-18 | Estados loading/error/forbidden/stale/offline/conflict | P1 | component + E2E | Abierto |
| QA-19 | Foco, teclado, contraste y lector | P1 | auditoria WCAG manual/automatizada | Abierto |
| QA-20 | Responsive móvil y desktop | P1 | snapshots/capturas y navegación | Abierto |
| QA-21 | Logs sin PII, payloads, firmas ni URLs secretas | P0 | review de logs y pruebas | Abierto |
| QA-22 | OpenAPI coincide con HTTP real | P1 | validación de contrato | Abierto |
| QA-23 | Migraciones tenant son reversibles | P0 | run/revert en dos schemas | Abierto |
| QA-24 | Reconciliador detecta divergencia | P1 | fault injection | Abierto |
| QA-25 | Corrección crea seguimiento y no reabre | P1 | API + E2E | Abierto |
| QA-26 | Dos confirmaciones concurrentes crean una sola OT | P0 | integración PostgreSQL + constraint/retry | Abierto |
| QA-27 | Cada resultado converge en OT/Task/VisitRequest/Event/legado | P0 | tabla ejecutada por las seis filas de ADR-068 (Aprobado) | Abierto |
| QA-28 | MOD12 confirma y MOD11 falla antes de guardar uso | P0 | fault injection, reconciliación y replay sin duplicado | Abierto |
| QA-29 | Idempotency key con payload distinto responde 409 | P0 | hash canónico de intención | Abierto |
| QA-30 | DTOs y auditoria minimizan/redactan PII/textos libres | P0 | respuestas por rol + inspección audit/logs | Abierto |
| QA-31 | Mass assignment de campos server-owned se rechaza | P0 | tenant/actor/status/assignee/version/evidence/unknown | Abierto |
| QA-32 | Cuadrilla/custodia valida tipo, responsable, membresia y vigencia | P0 | asignación, revocación y comando posterior | Abierto |
| QA-33 | Rate limit efectivo por actor/tenant | P1 | ráfaga controlada produce 429 | Abierto |
| QA-34 | Ingress efectivo protege TLS | P0 | evidencia AI-PLAT-OPS y redirección/terminación aprobada | Abierto |
| QA-35 | Errores 403/404/409/422 usan body tipado y no enumeran | P1 | contract/integration assertions | Abierto |
| QA-36 | Existe E2E vertical con API y PostgreSQL reales | P0 | flujo Agenda→OT→MOD12→proyecciones sin mocks internos | Abierto |
| QA-37 | Lag de reconciliación no se declara aprobado sin umbral | P1 | métrica visible; umbral marcado “sin aprobar” | Abierto |
| QA-38 | Crash-window outbox no pierde ni duplica efecto | P0 | commit→enqueue y enqueue→mark con inbox | Abierto |
| QA-39 | DLQ y re-drive preservan tenant/evento y son auditados | P1 | retry agotado + re-drive autorizado | Abierto |
| QA-40 | Catálogo/perfiles de permisos conserva compatibilidad sin sobreprivilegio | P0 | migración `MOD00_ACCESS_V1` + alias medido | Abierto |
| QA-41 | Carrera del consecutivo no duplica número OT | P0 | dos creaciones concurrentes + constraint/retry | Abierto |
| QA-42 | Idempotencia, mutación, outbox y audit-intent son atómicos | P0 | fault injection en cada escritura; todo commit o todo rollback con `intentId` estable | Abierto |
| QA-43 | Retención y expiración de idempotencia no reejecutan a ciegas | P0 | HMAC versionado, recibo sin PII, tombstone no-PII, replay durante horizonte y `409 IDEMPOTENCY_EXPIRED` tras expiración | Abierto |
| QA-44 | Fallo de audit-intent impide CUD y fallo de entrega no pierde rastro | P0 | rollback de inserción + retry/DLQ/re-drive auditado | Abierto |
| QA-45 | Evidencia queda ligada al mismo tenant+OT y no se reutiliza | P0 | asset/evidencia/URL temporal de otro tenant, otra OT o ya enlazado | Abierto |
| QA-46 | Evidencia valida contenido y tiempo confiable | P0 | MIME falso, tamaño, `PENDING_ANALYSIS/AVAILABLE/REJECTED/EXPIRED`, polling 202, hash y receivedAt/verifiedAt de servidor | Abierto |
| QA-47 | Matriz endpoint×permiso×ABAC es exhaustiva | P0 | negativos y positivos para todos los endpoints y comandos | Abierto |
| QA-48 | Acceso directo a media reautoriza y no filtra storage | P0 | URL firmada expirada/ajena, objectKey y bucket ausentes | Abierto |
| QA-49 | Offline no persiste PII, firma ni evidencia | P0 | inspección storage/cache/service worker y logout/cambio de tenant | Abierto |
| QA-50 | Threat model y ASVS L2 tienen trazabilidad ejecutable | P1 | STRIDE actualizado + mapeo de controles a pruebas G6 | Abierto |

## 3. Casos end-to-end obligatorios

1. Instalacion ejecutada con checklist, equipo serializado, material, evidencia y conformidad.
2. Instalacion completada con observaciones.
3. Visita no ejecutada por ausencia/rechazo/inaccesibilidad con causa y reprogramacion.
4. Bloqueo por falta de material y posterior seguimiento.
5. Contratista asignado, permiso vigente y revocación durante el flujo.
6. Red inestable durante actividad/evidencia con confirmacion sin duplicado.
7. Dos coordinadores actúan sobre la misma version y uno recibe conflicto.
8. Evento duplicado/fuera de orden y reconciliacion.
9. Intentos BOLA dentro y entre tenants.
10. Consulta de OT terminal y creación de seguimiento.
11. Dos confirmaciones concurrentes de la misma agenda y una sola OT.
12. Cada resultado canonico: ejecutada, observada, seguimiento, no ejecutada y cancelada.
13. Cuadrilla vigente, reasignación durante ejecución y revocación antes del comando.
14. MOD12 confirma movimiento, MOD11 falla y reconciliador recupera sin duplicar.
15. Mass assignment, misma idempotency key con payload distinto y rate limit.
16. Al menos un recorrido vertical con API y PostgreSQL reales; mocks solo para servicios externos inevitables.
17. Crash del relay en ambas ventanas, DLQ y re-drive autorizado.
18. Migración del catálogo de permisos sin concesión implícita.
19. Carrera simultánea del número OT.
20. Fallo atómico en idempotencia/audit-intent y recuperación durable por DLQ.
21. Evidencia cross-tenant/cross-OT, MIME falso, cuarentena, URL expirada y replay.
22. Toda la matriz endpoint×permiso×ABAC, incluido re-drive y administración de plantillas.

## 4. Comandos base

- `pnpm --filter @iwana/api test`
- `pnpm --filter @iwana/portal test`
- `pnpm test:e2e`
- `pnpm test:e2e:portal`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm db:migrate:all`
- comando de revert focalizado según migracion aprobada
- `pnpm audit:adr-citations`
- `pnpm audit:doc-locations`

AI-SR-QA puede focalizar durante desarrollo, pero G5/G6 exigen la selección integral acordada y salida archivada.

## 5. Gate de seguridad

AI-SEC-ENG debe emitir hallazgos por severidad para:

- BOLA/IDOR y tenant isolation;
- permisos, asignación y revocación;
- mass assignment y validación de DTO;
- idempotencia y replay;
- evidencia, firma, media y PII;
- inventario y custodia;
- logs/auditoria;
- DTOs/PII/retención y protección en reposo;
- throttling y TLS;
- dependencias y superficie de ataque.

Un P0 o P1 abierto implica **NO-GO**.

## 6. Gates del protocolo

### Corte de ejecución 2026-07-27

El backend tiene controles estructurales verificados, pero el gate sigue abierto por proyección efectiva de eventos, receipt/saga de inventario, plantilla/acciones, contrato OpenAPI completo, rate limiting y boundaries Media/cuadrillas/follow-up/redrive. Los endpoints sin boundary deben permanecer fail-closed (`503`) y no crear evidencia ficticia.

- [x] G1 CTO aprueba ADR-068 (Aprobado el 2026-07-27).
- [ ] G2 AI-EM-ARCH aprueba alcance UX/DS; no equivale a congelación.
- [ ] G3 backend/frontend y consultores emiten factibilidad; AppSec no deja omisiones de contrato.
- [ ] G4 AI-EM-ARCH emite prompts que declaran contratos DS/API congelados con artefactos reales.
- [ ] G5 implementación supera gates técnicos, migración, observabilidad, reconciliación y rollback.
- [ ] G6 PROD-UX/DS-OWNER/SR-QA/SEC-ENG completan review con QA-01 a QA-50.
- [ ] G7 AI-EM-ARCH recomienda y CTO aprueba producción.
- [ ] Informe vivo actualizado con comandos/resultados.
- [ ] Cobertura del core no inferior a 80%.
- [ ] No hay boundary violations ni PII en logs.

**Veredicto actual:** NO-GO.
