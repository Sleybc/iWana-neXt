# INFORME — `privacy` Fase 1b · Cierre G6

**Versión:** 1.0 · **Fecha:** 2026-10-17 · **Emisor:** AI-EM-ARCH (consolidación; los veredictos son de los informes citados)
**Plan:** [2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md](../plans/2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md) v1.6 · **Contratos:** [v1.0](../prompts/PROMPT-PRIVACY-FASE-1B-v1.0.md), deltas [v1.1](../prompts/PROMPT-PRIVACY-FASE-1B-v1.1.md), [v1.2](../prompts/PROMPT-PRIVACY-FASE-1B-v1.2.md), [v1.3](../prompts/PROMPT-PRIVACY-FASE-1B-v1.3.md) y [v1.4](../prompts/PROMPT-PRIVACY-FASE-1B-v1.4.md)
**Estado:**
- **G4: GO.**
- **G6: GO.**
- **G6.5: GO.** CI [`38992139163`](https://github.com/Sleybc/iWana-neXt/actions/runs/38992139163) sobre `34e66adc`, verde en sus 5 jobs, con todos los pasos ejecutados: integraciones de db, API (incluida `privacy-erasure-api.postgres.integration.spec.ts`) y worker, y la migración 152 con su paridad. El commit siguiente (`48529fd0`, solo MCP) también quedó verde.
- G7 no se evalúa: está diferido hasta la beta ([ADR-095](../adrs/ADR-095-Topologia-Productiva-Dominio-TLS-Hosting.md)).

## 1. Qué entrega la fase

| Capacidad | Regla |
| --- | --- |
| La supresión procedente anonimiza en la misma transacción que `resolve`, con confirmación explícita, vista previa, verificación de residuales y auditoría transaccional | R2, R4 y C2 |
| Los prospectos sin Party se suprimen por HMAC de documento, y hay conflicto si el documento ya es de un suscriptor | R3 |
| Alcance de la anonimización: CRM, Party, usuarios dados de baja, Media, WFM y `tasks`, con un participante por módulo dueño; contratos y cotizaciones se anonimizan y se conservan (D-1B-5) | R7, R13 y R14 |
| Se conservan la solicitud, las autorizaciones y su evidencia (D-1B-7), las marcas y la auditoría | R6 |
| La marca «Anonimizado» se ve en suscriptor, contrato, expediente y 360° | R15 |
| `DATOS_BLOQUEADOS` solo se abre con `DEBER_LEGAL_CONSERVACION` (D-1B-1) y se cierra al anonimizar | R1 |
| A un titular bloqueado se le ocultan los datos en listados, detalle, 360° y subrecursos, y se le excluye de la búsqueda. Lo ven el Oficial (`privacy.read`) y facturación (`crm.blocked_data.read`, D-1B-6), con lectura auditada antes de responder | R8, R9, R16 y C3 |
| Toda mutación sobre un bloqueado responde 409, garantizado por un test de arquitectura | R10 v1.4 |
| Plazo de traslado y traslado extemporáneo | R11 |
| Se retiró `IPersonalDataBlockPort` (D-1B-3) | R12 |

## 2. Evidencia de los gates

| Gate | Evidencia | Veredicto |
| --- | --- | --- |
| G4: seguridad | [V2″](INFORME-PRIVACY-FASE-1B-V2-SEC-v1.2.md): 32 rutas de mutación revisadas, sin altos abiertos | GO |
| G4: boundaries y contratos | [V3](INFORME-PRIVACY-FASE-1B-V3-REV-v1.0.md) y [V3′](INFORME-PRIVACY-FASE-1B-V3-REV-v1.1.md): sin violaciones de boundary; la deriva quedó corregida (H4 a H6 y H13) | GO |
| G6: E2E contra la API real | [V1 v1.8](INFORME-PRIVACY-FASE-1B-V1-QA-v1.8.md): **4/4** con `--retries=0`, sobre el tenant `e2e-privacy-1b-a114bf06` (migrado hasta la 151) | GO |
| G6: suites y cobertura | [V4″](INFORME-PRIVACY-FASE-1B-V4-GATES-v1.2.md) y [FIX-PREVIEW](INFORME-PRIVACY-FASE-1B-FIX-PREVIEW-v1.0.md): API con 5 241 tests y 0 fallos; integración de la API con 92 tests, incluido el test nuevo de supresión con el adaptador real; `privacy/**` con 94,61 % de statements y 82,73 % de branches; `crm/subscribers` sin bajar de su línea base | GO |
| G6.5 | CI [`38992139163`](https://github.com/Sleybc/iWana-neXt/actions/runs/38992139163) sobre `34e66adc` (SHA final de la fase): 5/5 jobs verdes y todos los pasos ejecutados | GO |

**Cobertura R1–R16:**
- R5, R13 y R14 no son casos E2E. Los cubren la integración del CLI (`anonymize-titular.postgres.integration.spec.ts`) y la integración de la API con el adaptador real.
- El resto tiene un caso en la suite viva.

## 3. Defectos encontrados en la fase

| Tipo | Hallazgo |
| --- | --- |
| Del emisor (AI-EM-ARCH) | Contradicción entre R6 y el Anexo A sobre la evidencia de las autorizaciones. Subrecursos sin listar en R8. Rutas enumeradas en vez de una regla en R10. «Eres verificador» impidió escribir la suite. Verificación de `dbiw` con `information_schema`. Condición de parada ambigua del worker |
| De integración | La API no arrancaba (export inválido). Fixtures de spec y de integración desactualizados. Integración de la API oculta por pasos de CI en serie. Test de la 150 sin filtro por schema |
| De producto | `updateSection` filtraba PII de un bloqueado. La auditoría de la supresión no era transaccional. Límites distintos entre la vista previa y `resolve`. La vista previa daba 500 por el enum `TASKS` y por comparaciones uuid/texto |

Las lecciones quedaron en la memoria del emisor y en la sección de evidencia obligatoria de los encargos: suite completa, integración contra una base desechable y arranque real.

## 4. Deuda abierta

| Severidad | Deuda | Dueño |
| --- | --- | --- |
| P1 → implementada | `TASKS` faltaba en el enum `work_order_source_context`. Reproducida (crear una visita y una orden de trabajo con origen `TASKS` fallaba con 22P02) y corregida con la migración 152, con integración en dos schemas y test de paridad entre el contrato y `pg_enum` ([informe](INFORME-WFM-ENUM-ORIGEN-TASKS-v1.0.md)). Pendiente: commit, CI y migrar `dbiw` | WFM |
| P2 | Crear un registro nuevo con el documento de un titular bloqueado no se detecta (D-H15) | Fase 2 de privacidad |
| P2 | `contracts.fiscal_document` está en claro | MOD05 |
| P2 | El soporte fiscal (10 años) debe contar como deber de conservación cuando exista facturación | Facturación |
| P2 | El log global de Nest puede imprimir parámetros (HMAC) de un `QueryFailedError` | `sec-eng` + backend |
| P3 | El cierre de `DATOS_BLOQUEADOS` al vencer la retención | Fase 2 de privacidad |
| P3 | El decorador `guard-blocked-titular` está repetido en tres módulos | CRM |
| P3 | Los tests de supresión crean las tablas a mano | `sr-qa` |
| P3 | El wrapper de turbo se cuelga tras el build en Windows | `plat-ops` |
| P3 | Tests sensibles a la carga: `purchase-order-pdf.service.spec.ts` (límite de 20 s) y `OrganizationSettingsClient.spec.tsx` (espera de texto) fallan con turbo en paralelo en local y pasan aislados | API y portal |
| Menor | Metadatos de informes de agentes ([V5](INFORME-PRIVACY-FASE-1B-V5-DOCS-v1.0.md)) | `docs-governance` |

## 5. Efecto en la re-auditoría de MOD05

- **SUB-A06** (supresión y bloqueo) queda implementado.
- El criterio #1 del checklist de la [re-auditoría](INFORME-MOD05-SUBSCRIBERS-REAUDITORIA-v1.0.md) deja de depender de la mitigación D-1B.
- El [runbook manual](../runbooks/RUNBOOK-PRIVACY-BLOQUEO-SUPRESION-MANUAL-v1.0.md) pasa a vía de emergencia: casos de más de 500 expedientes, o cuando un participante no está disponible.

**HLD:** [HLD-PRIVACY-HABEAS-DATA-v1.1](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.1.md) (Propuesto) describe lo construido en la Fase 1b; espera la aprobación del CTO.
