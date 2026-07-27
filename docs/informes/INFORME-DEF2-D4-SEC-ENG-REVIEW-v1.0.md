# INFORME-DEF2-D4-SEC-ENG-REVIEW-v1.0

**Tipo:** INFORME · AppSec  
**Agente:** AI-SEC-ENG (persistido por AI-EM-ARCH)  
**Fecha:** 2026-07-24  
**Alcance:** Cierre D-4 / O-6 (hash determinista `documentNumber` en `expediente_records`) + residuales H-1-R-P3a/c (meta R2/R3, abuso `limit`)  
**Baseline:** OWASP ASVS L2 · Ley 1581 · patrón canónico `subscribers.document_number_hash` (migración 014)  
**Dependencia:** diff AI-SR-FULL de `docs/prompts/PROMPT-DEUDA-D4-HASH-META-CRM-v1.0.md`  
**Modo:** solo lectura · sin código · sin commit  

---

## Dictamen

| Campo | Valor |
| --- | --- |
| **Dictamen** | **aceptable** |
| **Bloquea merge/despliegue** | No |
| **Cierre seguridad D-4 (MEDIA previa)** | Sí — eliminado full-scan + decrypt AES en list |
| **Excepción CTO** | No requerida |
| **Cierre limpio DEF-2 (gate producto)** | D-4 seguridad OK; ops debe ejecutar backfill por tenant para filas legacy (`hash IS NULL`) |

---

## Checklist del prompt (verificación)

| # | Control | Resultado | Evidencia |
| --- | --- | --- | --- |
| 1 | List por `documentNumber` no descifra en masa (solo lookup por hash) | **PASS** | `findAll`: `andWhere('expediente.documentNumberHash = :docHash', …)` + `getManyAndCount`; sin rama `getMany`/decrypt/`DOCUMENT_NUMBER_SCAN_CAP`. |
| 2 | Hash = digest determinista SHA-256; no se loguea documento ni hash con PII en claro de forma inútil | **PASS** | `hashDocumentNumber` → SHA-256 hex 64. Misma semántica que subscribers. List anula `documentNumberHash`. Backfill en fallo: warn solo con `expediente.id`. Audit redacta `documentNumberHash`. |
| 3 | Respuesta de list anula `*Encrypted` | **PASS** | Tras hydrate: ciphertext y hash → `null`. |
| 4 | Migración no escribe plaintext en SQL | **PASS** | `087_add_expediente_document_number_hash.ts`: solo `ADD COLUMN` + índice parcial; `transactional = true`. |
| 5 | Backfill no filtra PII a logs | **PASS** | Decrypt en memoria → hash → save; catch loguea id. |

---

## Controles colaterales (H-1 residuales)

| Residual H-1 | Estado |
| --- | --- |
| H-1-R-P3a meta R2/R3 | **Cerrado** |
| H-1-R-P3c abuso `limit` | **Cerrado** |

---

## Residuales (no bloquean)

| ID | Sev | Hallazgo |
| --- | --- | --- |
| D-4-R-I1 | Informativa | Hash sin pepper (paridad subscribers). |
| D-4-R-P3a | Baja | Legacy `hash IS NULL` no matchea hasta backfill ops. |
| D-4-R-P3b | Baja | No exponer `backfillDocumentNumberHashes` por HTTP sin RBAC admin. |

**Sin hallazgos Crítica / Alta / Media abiertos.**

---

## Handoff

| Destinatario | Acción |
| --- | --- |
| **AI-EM-ARCH** | D-4 seguridad **GO**; backfill ops = completitud funcional. |
| **AI-SR-FULL** | Sin corrección bloqueante. |
| **AI-SR-QA** | Mantener specs en regresión. |
| **AI-PLAT-OPS** | Tras `087`: backfill por tenant. |
| **CTO** | Sin excepción. |

## Veredicto ejecutivo

**Aceptable para merge desde AppSec.**
