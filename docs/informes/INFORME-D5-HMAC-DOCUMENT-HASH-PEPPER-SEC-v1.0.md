# INFORME — D-5 AppSec: HMAC / pepper en `document_number_hash`

**Versión:** 1.0
**Fecha:** 2026-07-25
**Agente:** AI-SEC-ENG (persistido por AI-EM-ARCH)
**Emisor del prompt:** AI-EM-ARCH (`hmac-document-hash-pepper-adr`)
**Registro:** [INFORME-ADR065-DEUDA-VIVA-POST-OLA1-v1.0](INFORME-ADR065-DEUDA-VIVA-POST-OLA1-v1.0.md) · D-5
**Modo:** Solo lectura · sin código · sin commit
**Clasificación:** Uso interno

---

## 1. Dictamen

| Campo | Valor |
| --- | --- |
| **Opción recomendada** | **HMAC-SHA256 con pepper de servidor** (clave MAC dedicada) |
| **Alcance** | **Ambas columnas o ninguna:** `subscribers.document_number_hash` + `expediente_records.document_number_hash` |
| **No recomendado** | Dejar SHA-256 plano a largo plazo · Argon2id/scrypt para este índice |
| **Evolución opcional (fase 2 del ADR)** | HKDF-SHA256(pepper_maestro, `info=tenantId\|schema`) — no bloquea MVP |
| **Severidad residual hoy** | BAJA→MEDIA (informativa Ola 1; no bloquea merge vigente) |
| **Bloquea Ola 2 / DEF-2** | **No** |
| **Aprobación** | **Escalación CTO** para aprobar ADR (estado Propuesto) |

**Veredicto ejecutivo:** Para lookup determinista indexado sobre espacio pequeño (cédulas/NIT CO), el PRF correcto es **HMAC-SHA256 keyed**, no un KDF lento ni SHA desnudo. Misma semántica canónica en CRM + expedientes; pepper **distinto** de `MFA_ENCRYPTION_KEY` / `PII_ENCRYPTION_KEY` (ADR-058).

---

## 2. Modelo de amenaza (STRIDE acotado)

**Activo:** número de documento (PII Ley 1581) persistido cifrado (AES-GCM) + hash de igualdad para list/lookup sin full-scan decrypt.

**Hecho verificado:** `hashDocumentNumber` = SHA-256 hex 64, sin pepper (`apps/api/src/common/crypto/hash-document.util.ts`), paridad migración 014 / D-4.

| Amenaza | Riesgo con SHA plano | Mitiga HMAC+pepper |
| --- | --- | --- |
| **I** — Dump DB / backup tenant | Diccionario offline trivial (CC ~6–10 dígitos; NIT enumerable) → reidentificación | Sin pepper, hash inútil para atacante offline |
| **I** — Correlación cross-tenant | Mismo documento → mismo hash en todos los schemas | Global: no. HKDF/tenant: sí (fase 2) |
| **T** — Manipulación hash | Ya hay ciphertext; hash no es integrity del PII | N/A primario |
| **S** — Spoof lookup | Requiere conocer pepper + doc | Eleva barra si pepper no está en el dump |

**Nota:** el hash **no sustituye** cifrado en reposo. Es índice de igualdad. ASVS L2: secreto de aplicación + rotación documentada.

---

## 3. Comparación de opciones

| Opción | ¿Lookup B-tree O(1)? | Defensa dump | Ops / rotación | Dictamen |
| --- | --- | --- | --- | --- |
| **A. SHA-256 plano (status quo)** | Sí | Nula ante diccionario CO | Cero | Aceptable residual corto plazo; **no** postura objetivo |
| **B. HMAC-SHA256 + pepper servidor** | Sí (64 hex) | Alta si pepper ≠ dump | Dual-read + rehash (como AES previous) | **Recomendada** |
| **C. HKDF por tenant + HMAC** | Sí | + aísla blast radius / correlación | Más secretos o derivación + backfill multi-tenant | Fase 2 opcional |
| **D. Argon2id / scrypt** | No práctico | Buena para passwords | Coste CPU por query; no encaja índice | **Descartada** |

**Por qué no Argon2id:** el caso de uso es *equality PRF para índice*, no almacenamiento de secreto.

---

## 4. Diseño recomendado (puntos para ADR — Propuesto)

1. Sustituir `SHA-256(document)` por `HMAC-SHA256(pepper, utf8(document)) → hex 64` (misma longitud de columna).
2. Una sola función canónica compartida usada por **subscribers y expediente_records** (y backfills).
3. **No** reutilizar bytes de `MFA_ENCRYPTION_KEY` / `PII_ENCRYPTION_KEY` como pepper.
4. Variables propuestas: `DOCUMENT_HASH_PEPPER` (activa) + `DOCUMENT_HASH_PEPPER_PREVIOUS` (rotación).
5. Normalización de entrada: **congelar contrato** en el ADR; cualquier cambio exige rehash total.

### Fuera de alcance del ADR D-5

- `email_hash` / `phone_hash` en subscribers (ticket hermano).
- `hashEmail` de auth/users.
- Cambiar AES-GCM o el runbook ADR-058.

### Fase 2 opcional

`pepper_tenant = HKDF-SHA256(...)` — CTO puede diferir.

---

## 5. Impacto: rotación, backfill, ADR-058

D-5 es ADR **hermano** de 058 (gestión de secretos + dual key), no una enmienda. Pepper dedicado + dual-read + rehash vía decrypt; **no** acoplar al recifrado AES salvo ventana ops explícita.

Orden lógico post-aprobación CTO: desplegar dual-read → backfill idempotente ambas tablas → retirar SHA legado / previous.

---

## 6. Cumplimiento

| Dimensión | Nota |
| --- | --- |
| Ley 1581 | Medida técnica adicional; no inventar obligación específica de HMAC. |
| OWASP ASVS L2 | Clave de aplicación para PRF de PII indexada; rotación y separación de secretos. |
| Multi-tenant | Schema isolation intacta. |

---

## 7. Escalación

```text
[ESCALACIÓN DE SEGURIDAD] → AI-EM-ARCH → CTO
Asunto: Aprobación ADR (Propuesto) — HMAC-SHA256 + DOCUMENT_HASH_PEPPER
 para subscribers.document_number_hash + expediente_records.document_number_hash
Severidad actual: no crítica / no bloquea Ola 2
Acción pedida: aprobar o rechazar ADR; si aprueba, go implementación (SR-FULL + PLAT-OPS)
```

---

## 8. Handoff

| Destinatario | Acción |
| --- | --- |
| **AI-EM-ARCH** | Redactar ADR Propuesto con §§4–5; abrir D-5 al CTO |
| **CTO** | Aprobar / diferir / rechazar |
| **AI-SR-FULL** | Tras go: util HMAC, dual-read, backfill, tests sin PII |
| **AI-PLAT-OPS** | Secretos + Joi fail-fast + runbook |
| **AI-SR-QA** | Specs rotación |
| **AI-DATA-ENG** | Informado si ETL asume SHA estable |
