# INFORME — MOD05 · Cierre G6 de D-PDF y re-confirmación del G6 de IVA

**Versión:** 1.0 · **Fecha:** 2026-10-14
**Emisor:** AI-EM-ARCH (consolidación; los veredictos son de `sec-eng`, `sr-qa` y `gate-verifier`, que no produjeron el código)
**Planes:** [D-PDF v1.4](../plans/2026-10-12-mod05-iva-soporte-pdf.md) · [IVA v1.8](../plans/2026-10-12-mod05-iva-punto-servicio.md)
**Estado:** **G6 D-PDF: GO · G6 IVA: re-confirmado GO · SUB-C03: cerrado en G6** · **G6.5: GO** (CI `38735918857`, 2026-10-15) · G7 pendiente

## 1. Veredictos que se consolidan

| Revisión | Veredicto | Fuente |
| --- | --- | --- |
| Seguridad D-PDF | GO; antivirus de PDF = deuda Media (P2) | [SEC v1.0](INFORME-MOD05-IVA-PDF-SEC-v1.0.md) |
| Calidad D-PDF | Cobertura cumplida sin integración (`media` 93,33/80,00 %, `crm/contracts` 93,48/94,17 %). El único NO-GO, la integración en `dbiw`, quedó resuelto por decisión del plan v1.3 | [QA v1.0](INFORME-MOD05-IVA-PDF-QA-v1.0.md) |
| P4: OpenAPI del soporte | GO. Verificado por AI-EM-ARCH en `contracts.controller.ts:241,251` | [P4 v1.0](INFORME-MOD05-IVA-PDF-P4-v1.0.md) |
| Gate delta | GO para G6 y para el commit: `tsc` verde; lint con 0 errores; API `--force` con 339 suites / 4.797 tests, 0 en caché | [Gates v1.1](INFORME-MOD05-IVA-PDF-GATES-v1.1.md) |
| Re-confirmación del G6 de IVA | Adenda 2 sobre el árbol consolidado | [G6 IVA](INFORME-MOD05-IVA-PUNTO-SERVICIO-G6-v1.0.md) |

## 2. Evidencia de integración aceptada y su condición

- **P2:** 19/19 contra `dbiw` con la 026 aplicada temporalmente, por autorización del CTO, y revertida. AI-EM-ARCH verificó la reversión en la base: CHECK original, 0 assets `stratum_evidence` y 0 registros de la 026.
- **Condición de G6.5:** la corrida de CI del SHA del commit debe mostrar la suite de P2 **ejecutada, sin omisiones y en verde**, y las integraciones de las migraciones 026 y 145 con `DB_NAME=test`. Si falta alguna, G6.5 es NO-GO.
- Las 2 suites / 14 tests omitidos de la corrida amplia son de la línea base: requieren `DB_NAME=i4_qa_20261006_a1` y no pertenecen a estas fases.

## 3. Lo que queda cerrado

- **SUB-C03 (IVA del internet):** regla de ADR-093 implementada por concepto facturable y punto de servicio, con soporte de estrato verificado.
- **S-T7-01** (PII en la auditoría de contratos), **S-T7-02** (pertenencia del soporte) y **S-T7-03** (tipos aceptados en el portal).
- **F-1** (SALES podía no subir el soporte) y **F-2** (beneficio desbloqueable con un id cualquiera).

## 4. Pendiente

| Ítem | Gate | Dueño |
| --- | --- | --- |
| Dos commits (116 rutas de código, 44+ de documentación; `OTHER = 0`) | antes de G6.5 | CTO |
| Corrida de CI por SHA con la condición de §2 | G6.5 | CTO → consolidación AI-EM-ARCH |
| MinIO privado en el destino; migraciones 026, 143, 144 y 145; backfill PII por tenant (runbook B13) | G7 | `plat-ops` |
| Aplicar las migraciones pendientes en `dbiw` tras el commit | desarrollo | CTO |
| Antivirus de PDF | deuda Media (P2) | `sec-eng` + `sr-backend` |
| Redacción histórica de `audit_logs` | decisión | CTO (T12: 0 coincidencias en desarrollo) |
| Rotar la credencial local `iwana_readonly` | operación | CTO |
| E-2 (Habeas Data) y E-3 (placeholders) | módulo | CTO |

## Adenda — G6.5 cumplido (2026-10-15, AI-EM-ARCH)

Corrida de CI [`38735918857`](https://github.com/Sleybc/iWana-neXt/actions/runs/38735918857) sobre el SHA `70786da0`: **success** (6 de 6 checks). Integraciones de API con `E2E_TENANT_SLUG=test`: 14 suites en PASS y 2 omitidas por diseño, que no son de esta fase; 73 tests. Integraciones de migraciones con `DB_NAME=test`: 28 de 28 suites y 106 de 106 tests.

| Condición de §2 | Línea del log de CI |
| --- | --- |
| Suite de P2 ejecutada, sin omisiones y en verde | `PASS src/modules/crm/contracts/tests/contracts.service.postgres.integration.spec.ts`. La suite corre bajo `describeWithDb`: en esta corrida no se omitió y no tiene `it.skip` |
| Integración de la 026 con `DB_NAME=test` | `PASS src/migrations/public/026_media_usage_stratum_evidence.integration.spec.ts` |
| Integración de la 145 con `DB_NAME=test` | `PASS src/migrations/tenant/145_contract_stratum_evidence_unique.integration.spec.ts` |

**Historial:** el CI de `main` estuvo en rojo del 12 al 15 de octubre por specs de prueba que dependían del estado de migración (B5 y el fixture de contratos) y por un respaldo de la clave HMAC en el entorno. Se corrigió en R6, R7 y R8 ([prompt de privacidad v1.3 §5](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md)).

**G6.5 de D-PDF: ✅ GO. Re-confirmado el G6.5 de IVA (adenda del informe G6 de IVA).** Pendiente: G7.
