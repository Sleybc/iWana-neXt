# MOD05/MOD06/MOD07 — IVA de internet por punto de servicio · Plan de orquestación

**Fecha:** 2026-10-12 · **Versión:** 1.8 · **Emisor:** AI-EM-ARCH (modo EM + Orchestrator)
**Decisión:** [ADR-093](../adrs/ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md) — Aprobado por el CTO el 2026-10-12
**Prompt G4:** [PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.4.md](../prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.4.md) — contratos sin cambio (C-API-3 v1.2); v1.0–v1.3 superados
**Launcher ejecutado (relanzamiento T11):** [PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.5.md](../prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.5.md) · **Informe de cierre:** [INFORME-MOD05-IVA-PUNTO-SERVICIO-G6-v1.0.md](../informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-G6-v1.0.md) · corrección S-T7-01: [LAUNCH-v1.4](../prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.4.md) (superado) · cierre: [LAUNCH-v1.3](../prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.3.md) (superado) · Ola 2-bis: [LAUNCH-v1.2](../prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.2.md) (superado) · Ola 2: [LAUNCH-v1.1](../prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.1.md) (superado) · Ola 1: [LAUNCH-v1.0](../prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.0.md) (superado)

**Goal:** cerrar SUB-C03. El IVA se resuelve por concepto facturable y punto de servicio, con la regla verificada contra el ET y la doctrina DIAN de 2026, antes de que exista Billing.

**Impacto declarado:**

- **Multi-tenant:** sin cambio.
- **Seguridad:** el soporte de estrato es PII y se guarda como adjunto de media.
- **Escala:** función pura por línea.
- **Regulación:** es el objeto de la fase; los puntos ⚠ quedan en el contador.

## Estado al 2026-10-14 (v1.8): **G6 re-confirmado — GO; SUB-C03 cerrado en G6**

Adenda 2 del [informe G6](../informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-G6-v1.0.md) y [cierre consolidado con D-PDF](../informes/INFORME-MOD05-IVA-PDF-CIERRE-G6-v1.0.md). Pendientes: commit → G6.5 → G7.

## Estado al 2026-10-13 (v1.7, histórico): G6 en re-confirmación

| Punto | Estado |
| --- | --- |
| G6 / SUB-C03 | **GO en sustancia; evidencia por re-confirmar** sobre el árbol consolidado: una segunda sesión de T11 y P1 de D-PDF cambiaron el árbol después del G6. Ver la adenda en el [informe G6](../informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-G6-v1.0.md) |
| Informes de T11 | v1.1 = registro del G6; v1.2 = verificación del código vigente. Ambos se conservan |
| `tsc` de `@iwana/api` | **Rojo (TS2741)** hasta que P2 de D-PDF añada `STRATUM_EVIDENCE` a `MEDIA_CONSTRAINTS` |
| Integración de T11 | Sin base nueva: `dbiw` con `E2E_TENANT_SLUG=iwana` (el spec clona un schema efímero) |
| Commit | Después del gate consolidado en verde (plan D-PDF v1.1 §Commit) |

## Estado al 2026-10-12 (v1.6, histórico — cierre G6 / SUB-C03)

| Bloque / gate                   | Estado                                                                                                                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T11 `sr-backend`                | ✅ Cerrado. [Informe v1.1](../informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T11-v1.1.md); helper `contractsApi.create` diferido a D-PDF P3                                                                                       |
| T12 `data-eng`                  | ✅ Conteos agregados en 3 schemas de desarrollo: 0 coincidencias; consulta equivalente en transacción `READ ONLY`; [propuesta histórica](../informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T12-v1.0.md) permanece **NO EJECUTAR** |
| Re-verificación `sec-eng`       | ✅ GO para S-T7-01. Observación no bloqueante: integración verifica las filas y la metadata de los handlers se cubre en prueba unitaria separada                                                                             |
| Re-verificación `gate-verifier` | ✅ GO: API 338 suites / 4.744 tests aprobados, 4/15 omitidos, 0 tareas cacheadas; integración 14/14; `crm/contracts` 82,78 % de branches sin integración                                                                     |
| G6 / SUB-C03                    | ✅ Cerrados tras la re-verificación de seguridad y el gate técnico                                                                                                                                                           |
| Pendientes no bloqueantes       | Helper de Portal y S-T7-02/S-T7-03 quedan en D-PDF; cualquier redacción histórica requiere decisión del CTO. El inventario solo cubre los tres schemas de desarrollo consultados                                             |

**Deuda operativa:** una salida de herramienta expuso accidentalmente la URI local de `iwana_readonly`; no se repite aquí. Rotar esa credencial local y actualizar su configuración queda pendiente. No hubo cambios de rol ni escrituras en la base.

## Estado al 2026-10-12 (v1.5, histórico — relanzamiento)

| Bloque    | Estado                                                                                                                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T11       | `[BLOQUEO]` resuelto (prompt v1.4 §0): el tipo de `contractsApi.create` del portal pasa a D-PDF P3. **Se relanza**                                                                                  |
| T12       | Entregado. El script es de solo lectura (verificado). Conteos N/D porque `postgres-dev` no estaba disponible: los completa el CTO o se relanza T12 cuando vuelva. **No bloquea G6**                 |
| **D-PDF** | Aprobada por el CTO → [plan propio](2026-10-12-mod05-iva-soporte-pdf.md). P1 y P3 corren en paralelo con T11; P2 espera a que T11 cierre (ambos tocan `crm/contracts/**`). Cierra S-T7-02 y S-T7-03 |

## Estado al 2026-10-12 (v1.4, histórico)

| Revisión / bloque                            | Estado                                                                                                                                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T8 `sr-qa`, `boundary-reviewer`              | ✅ GO                                                                                                                                                                                                       |
| `contract-drift-reviewer`, `docs-governance` | GO con menores (los de deriva van a T11; el de documentos lo corrigió AI-EM-ARCH)                                                                                                                           |
| T7 `sec-eng`, `gate-verifier`                | **NO-GO** por S-T7-01. La causa raíz es transversal: el sanitizador no cubre `fiscal_document` ni `fiscal_name`, y todas las respuestas de escritura de contratos pasan por el interceptor (prompt v1.3 §1) |
| T11 `sr-backend` ∥ T12 `data-eng`            | **Ola 3-bis**: corrección y, en T12, inventario histórico de solo lectura                                                                                                                                   |
| Re-verificación                              | `sec-eng` (solo S-T7-01) ∥ `gate-verifier` → G6                                                                                                                                                             |

**Decisión del CTO que se prepara:** redactar o no la PII histórica en `audit_logs`, que es de solo-anexar. T12 entrega conteos y una propuesta; no bloquea G6.

## Estado al 2026-10-12 (v1.3, histórico)

| Bloque                    | Estado                                                                                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1–T6, T9, T10            | ✅ Verificados contra el árbol, sin commitear. F-2 cerrado en la entrada: `stratumEvidenceMediaId` ya no está en ningún DTO de entrada. F-1 cerrado: SALES sube por `POST /crm/contracts/:id/stratum-evidence` |
| T7 `sec-eng` ∥ T8 `sr-qa` | **Ola 3 (cierre)**                                                                                                                                                                                             |

**Enmienda registrada.** Durante la Ola 2-bis, y comunicada al EM-ARCH como ratificada, la carga del soporte se limitó a la allowlist vigente de `MediaUsage.GENERAL` (10 MiB, solo imágenes), porque la ola no podía tocar `media/**`. El contrato v1.2 decía PDF, JPG o PNG.

**Puntos de revisión obligatorios para T7:**

- **R1** — `_hasVerifiedStratumEvidence` (`crm/contracts/contracts.service.ts:803-815`) comprueba que el asset exista y sea `usage = GENERAL`, **no** que pertenezca al contrato. Hoy el id solo lo escribe el endpoint acotado, así que el riesgo se limita a ids heredados de v1.1 que apunten a otro asset `GENERAL`. Evaluar la severidad.
- **R2** — La carga exige almacenamiento MinIO privado sin URL pública (`contracts.service.ts:795`, 503 en otro caso). Confirmar que no filtra configuración en el error.
- **R3** — `accept` del portal incluye `image/gif` e íconos (`CreateContractDialog.tsx:818`): tipos sin sentido para un soporte fiscal; superficie innecesaria.
- **R4** — URL firmada ≤ 300 s, sin persistencia ni registro, y auditoría `STRATUM_EVIDENCE_ACCESS`.

**Decisión pendiente del CTO — D-PDF.** Los soportes típicos (certificado municipal de estratificación, recibo digital de un servicio público) suelen ser **PDF**. Sin PDF, el operador debe fotografiar o capturar el documento; si no lo hace, el cliente queda al 19 %: el error no es fiscal, pero cobra de más.

- **Recomendación:** fase de seguimiento corta con un uso dedicado `MediaUsage.STRATUM_EVIDENCE` (PDF, JPEG, PNG y WEBP; 10 MiB; Media ya valida los bytes mágicos de PDF en `media/magic-bytes.ts:28`). Supone una migración pública que amplía `chk_media_assets_usage`, con el precedente de la migración 020.
- **Efecto adicional:** cierra R1, porque la verificación pasa a ser `usage = STRATUM_EVIDENCE`, y R3, porque el `accept` se restringe.
- Tres bloques pequeños: `data-eng`, `sr-backend` (incluye `media/**`) y `fe-platform`. **No bloquea** este cierre.

**Precondición de G7 (despliegue):** almacenamiento MinIO privado en el entorno de destino; sin él, la carga responde 503.

## Estado al 2026-10-12 (v1.2, histórico)

| Bloque                              | Estado                                                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| T1–T6                               | ✅ Verificados contra el árbol (prompt v1.2 §0), sin commitear                                                                           |
| **F-1** (Alto)                      | SALES no puede subir el soporte: `/media/upload` es solo de ADMIN                                                                        |
| **F-2** (Alto, integridad fiscal)   | El id del soporte llega del cliente sin validar y basta con que no sea nulo para obtener el beneficio. Defecto del contrato C-API-3 v1.0 |
| T9 `sr-backend` ∥ T10 `fe-platform` | **Ola 2-bis**: soporte acotado al contrato (C-API-3 v1.2)                                                                                |
| T7 ∥ T8                             | Ola 3, tras T9 y T10                                                                                                                     |

## Estado al 2026-10-12 (v1.1, histórico)

| Bloque          | Estado                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T1 `sr-backend` | ✅ Verificado contra el árbol: enums en shared y `IInternetVatResolverPort` exportado. Su informe: 392/392 combinaciones; API 330 suites / 4.639 tests |
| T2 `data-eng`   | ✅ Migración 144 = C-DDL-2. Reporte: 4 contratos clasificados; 1 PRODUCT y 1 SERVICE sin concepto, para que el operador los clasifique                 |
| T5 `prod-ux`    | ✅ Spec ratificada con dos ajustes (spec §8) → C-API-3 v1.1                                                                                            |
| T3 ∥ T4 ∥ T6    | **Ola 2**                                                                                                                                              |
| T7 ∥ T8         | Ola 3                                                                                                                                                  |

## 0. Gates y bloqueos

| Gate / bloqueo         | Estado                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| G1–G3                  | ADR-093 aprobado; el alcance funcional lo define el ADR                                                         |
| G4                     | Se firma al lanzar la Ola 1                                                                                     |
| **Precondición**       | Remediación de suscriptores B1–B13 **commiteada**. Hoy hay unas 75 rutas sin commitear y solo B1 está en `main` |
| Puntos ⚠ de ADR-093 §6 | No bloquean: el motor marca `requiresAccountantReview`                                                          |
| E-2, E-3               | Fuera de esta fase                                                                                              |
| **G6**                 | ✅ Cerrado al 2026-10-12 tras T11, re-verificación S-T7-01 por `sec-eng` y re-gate `gate-verifier`              |

**Restricción de secuencia:** T3 toca `crm/contracts/**`, que la Fase 04 de suscriptores también podría tocar (pestaña Servicios). No se despachan en paralelo.

## 1. Olas y ruta crítica

```
Ola 1:  T1 sr-backend (Taxation + enums shared) ∥ T2 data-eng (migración 144) ∥ T5 prod-ux (spec UX)
          │ publica C-TAX-1           │ en main                      │ → ratificación AI-EM-ARCH
          ▼                           ▼                              ▼
Ola 2:  T3 sr-backend (contratos) ∥ T4 sr-backend (catálogo) ∥ T6 fe-platform (UI; requiere T5 ratificada)
Ola 3:  T7 sec-eng ∥ T8 sr-qa → boundary-reviewer · contract-drift-reviewer · gate-verifier · docs-governance → G6
```

**Ruta crítica:** T1 → T3 → T7/T8. T2 y T5 corren en su sombra.
**Puntos de sincronización:**

1. T1 publica los enums: T3 y T4 los consumen.
2. T2 en `main`: T3 y T4 mapean las columnas.
3. Spec T5 ratificada: arranca T6.

T3 y T4 son dos sesiones de `sr-backend` con propiedad de archivos disjunta (`crm/contracts` frente a `commercial`).

## 2. Matriz de dispatch

Skills verificadas en disco el 2026-10-11/12 (`ls .agents/skills/<nombre>/SKILL.md`). Se leen como documentación antes de escribir.

| Bloque                                | Subagente     | Obligatorias                                                                                                              | Apoyo (condición)                                                                                                                                                         | Descartadas y por qué                                                                                   | Gate ejecutable                                                                                          |
| ------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| T1 Motor canónico                     | `sr-backend`  | `nestjs-expert`, `typescript-expert`, `test-driven-development`, `testing-patterns`                                       | `typescript-pro` (si la unión discriminada del resultado exige tipos avanzados)                                                                                           | `postgresql`, `database-migration`: función pura sin I/O; `bullmq-specialist`: sin colas                | `pnpm exec turbo run test --filter=@iwana/api --filter=@iwana/shared --force`                            |
| T2 Migración 144                      | `data-eng`    | `postgresql`, `database-migration`                                                                                        | `backend-security-coder` (si el backfill lee PII del suscriptor; solo debe leer `person_type`, `customer_segment` y `stratum`)                                            | `nestjs-expert`: solo `@Column`; `bullmq-specialist`: backfill dentro de la migración                   | integración `up/down/up` contra Postgres real                                                            |
| T5 Spec UX                            | `prod-ux`     | `iwana-identity-ui-review`, `system-vocabulary-review`, `docs-architect`                                                  | `ui-ux-pro-max`, **subordinada** a `iwana-identity-ui-review`, `core-components`, `tailwind-patterns` y tokens (solo si hace falta un patrón nuevo de carga de documento) | `frontend-dev-guidelines`: no escribe código                                                            | ratificación AI-EM-ARCH                                                                                  |
| T3 Contratos                          | `sr-backend`  | `nestjs-expert`, `backend-security-coder`, `openapi-spec-generation`, `test-driven-development`                           | `postgresql` (si la activación usa bloqueo de fila)                                                                                                                       | `database-migration`: el DDL es de T2; `bullmq-specialist`: síncrono                                    | turbo API `--force` + integración de activación                                                          |
| T4 Catálogo                           | `sr-backend`  | `nestjs-expert`, `openapi-spec-generation`, `testing-patterns`                                                            | `typescript-expert` (Zod discriminado por tipo de ítem)                                                                                                                   | `database-migration`: DDL de T2; `backend-security-coder`: sin PII                                      | turbo API `--force`                                                                                      |
| T6 UI                                 | `fe-platform` | `frontend-dev-guidelines`, `iwana-identity-ui-review`, `core-components`, `tailwind-patterns`, `system-vocabulary-review` | `playwright-skill` (flujo crear contrato con soporte), `frontend-security-coder` (carga de archivos)                                                                      | `ui-ux-pro-max`: la spec ya decide                                                                      | `pnpm exec turbo run test --filter=@iwana/portal --force` + `audit-ui.mjs` de `iwana-identity-ui-review` |
| T9 Soporte acotado                    | `sr-backend`  | `nestjs-expert`, `backend-security-coder`, `test-driven-development`, `postgresql`                                        | `auth-implementation-patterns` (guards y permiso del endpoint)                                                                                                            | `bullmq-specialist`: la carga es síncrona; `database-migration`: sin DDL                                | turbo API `--force` + integración del stop/go T9                                                         |
| T10 Consumo del soporte               | `fe-platform` | `frontend-dev-guidelines`, `frontend-security-coder`, `testing-patterns`                                                  | `playwright-skill` (flujo crear → subir soporte)                                                                                                                          | `ui-ux-pro-max`, `iwana-identity-ui-review` como diseño: no hay cambio visual (sí corre `audit-ui.mjs`) | turbo portal `--force` + `audit-ui.mjs`                                                                  |
| T11 Sanitizador + auditoría explícita | `sr-backend`  | `nestjs-expert`, `backend-security-coder`, `test-driven-development`, `testing-patterns`                                  | `security-auditor` (para no sobre-redactar claves técnicas)                                                                                                               | `database-migration`: sin DDL; `bullmq-specialist`: sin colas                                           | turbo API `--force` + integración sin PII en `audit_logs`                                                |
| T12 Inventario histórico              | `data-eng`    | `postgresql`, `backend-security-coder`                                                                                    | —                                                                                                                                                                         | `database-migration`: no hay migración, solo una propuesta                                              | informe con conteos, sin escrituras                                                                      |
| T7 Seguridad                          | `sec-eng`     | `security-auditor`, `backend-security-coder`                                                                              | `frontend-security-coder` (carga del soporte)                                                                                                                             | `test-driven-development`: no escribe código                                                            | informe GO/NO-GO                                                                                         |
| T8 Calidad                            | `sr-qa`       | `testing-patterns`, `iwana-test-evidence`, `verification-before-completion`                                               | `e2e-testing-patterns` (si T6 añade E2E)                                                                                                                                  | `ui-ux-pro-max`: no evalúa diseño                                                                       | matriz CA ↔ test + cobertura ≥ 80 % en stmts y branches                                                  |

## 3. Fuera de este plan

- SUB-M03 (`tax_regime` → `vatResponsibility` + RUT): fase propia, ligada al inicio de Billing.
- Retirar físicamente `subscribers.vat_treatment`: después de Billing.
- Dictamen del contador sobre V8, V9, V10, V14 y el uso mixto: lo gestiona el CTO.

## Lanzamiento ejecutado (histórico)

> Espejo de [PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.5.md](../prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.5.md). **El archivo es la fuente y prevalece si divergen.**

Relanzamiento de T11 `sr-backend`, en paralelo con la Ola 1 de D-PDF. Después, `sec-eng` (solo S-T7-01) ∥ `gate-verifier` → G6. La ola terminó y G6/SUB-C03 se cerraron; el estado vigente consta en v1.6.
