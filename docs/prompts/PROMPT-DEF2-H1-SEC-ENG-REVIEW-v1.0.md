---
description: "Review AppSec H-1 clampLimit CRM (Ley 1581) — AI-SEC-ENG"
name: "DEF-2 H-1 review seguridad CRM"
agent: "sec-eng"
---

# PROMPT DE EJECUCIÓN — AI-SEC-ENG (consulta / G6 seguridad)

**Emisor:** AI-EM-ARCH (Orquestador)
**Fecha:** 2026-07-24
**Gate origen:** [INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.0](../../docs/informes/INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.0.md) · D-2 / H-1
**Skills:** `security-auditor`, `backend-security-coder`

## Objetivo

Revisar (solo lectura + informe) la remediación de **H-1**: tope de `limit` en listados CRM que hoy permiten `?limit=10000` y devuelven PII descifrada (documento, teléfono, correo). Relevancia **Ley 1581**.

## Entradas

- Diff / implementación de AI-SR-FULL del prompt `adr065-ola1-def2-remediacion-sr-full.prompt.md` (si aún no existe, auditar el estado actual y el diseño propuesto: `clampLimit` máx. 100 o DTO `@Max(100)`).
- Endpoints: subscribers list + expedientes list (ambos puntos del controller).
- Helper: `apps/api/src/common/pagination/clamp-limit.ts`.

## Alcance

- [ ] Confirmar que **ninguna** ruta CRM de listado paginado acepta `limit > 100` tras el parche (controller + service + DTO).
- [ ] Verificar que el rechazo/cap no filtra detalles útiles a un atacante (mensaje genérico).
- [ ] Comprobar que no queda bypass (`offset` legacy, query duplicada, otro controller).
- [ ] Dictamen: **aceptable** / **aceptable con ajustes** / **bloqueante**.
- [ ] Si hay residual de D-4 (documentNumber full-scan + AES): clasificar severidad residual y si bloquea cierre DEF-2.

## Fuera de alcance

- Implementar el parche (SR-FULL).
- Excepción de cumplimiento (solo CTO).

## Entregable

Informe corto en `docs/informes/` o sección en el reporte de fase: hallazgos P0–P3, veredicto, evidencia por ruta. Sin PII real.
