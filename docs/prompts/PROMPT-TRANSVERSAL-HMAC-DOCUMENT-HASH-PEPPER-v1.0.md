---
description: "ADR propuesto HMAC pepper hashes documento — AI-EM-ARCH / SEC consult"
name: "HMAC document hash pepper ADR"
agent: "sec-eng"
---

# PROMPT — consulta AI-SEC-ENG + borrador ADR (D-5)

**Emisor:** AI-EM-ARCH  
**Registro:** [INFORME-ADR065-DEUDA-VIVA-POST-OLA1-v1.0](../../docs/informes/INFORME-ADR065-DEUDA-VIVA-POST-OLA1-v1.0.md)  
**Skills:** `security-auditor`, `architecture-decision-records`

## Contexto

`subscribers.document_number_hash` y `expediente_records.document_number_hash` usan SHA-256 **sin pepper** (paridad canónica). Espacio de cédulas colombianas → diccionario offline si hay dump. Gate Ola 1 **aceptó** no abrir hallazgo ahora; pide **una sola decisión** para ambas columnas.

## Objetivo (esta sesión de consulta)

1. Dictamen AppSec: ¿HMAC-SHA256 con pepper de servidor (o HKDF por tenant) es la opción recomendada frente a Argon2id / dejar SHA plano?
2. Impacto: rotación de pepper, backfill, dual-read, ADR-058 / claves PII.
3. Borrador de ADR en estado **Propuesto** (EM-ARCH puede redactar tras tu dictamen) — **no implementar**.

## Restricciones

- Sin código productivo ni migración.
- Ambas columnas o ninguna.
- Escalación CTO para aprobar el ADR.

## Entregable

Informe corto SEC + puntos para el ADR. Sin commit obligatorio.
