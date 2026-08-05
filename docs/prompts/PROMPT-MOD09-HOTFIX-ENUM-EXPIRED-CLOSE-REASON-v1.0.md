# PROMPT-MOD09-HOTFIX-ENUM-EXPIRED-CLOSE-REASON-v1.0

**Módulo:** MOD09 WFM  
**Fase:** Hotfix post-auditoría N1/N2  
**Fecha:** 2026-08-05  
**Generado por:** AI-EM-ARCH (Orchestrator)  
**Ejecutores:** AI-SR-FULL (backend+migración); AI-SR-QA (tests); FE solo si el contrato tipado del schedule cambia

---

## Hallazgos aceptados

| ID | Sev | Decisión |
| --- | --- | --- |
| **N1** | Bloqueante | Migración tenant `107` — `ALTER TYPE schedule_event_status ADD VALUE IF NOT EXISTS 'EXPIRED'`. Patrón 093. Reabre H2 hasta GO de tests. |
| **N2** | Medio | `attemptDecision: CLOSE_CASE` exige `closeReason` (trim, max 500). Sin motivo → 400. Persistir ese texto en `cancelReason`. Spec E5 CA3. |

## Fuera de alcance

G6.5, G7, cobertura WFM, F0.5/F0.6.

## Stop/go

Detener si el down de enum requiere pérdida de filas EXPIRED sin guarda destructiva documentada.
