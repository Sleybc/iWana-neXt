# PROMPT — MOD09–MOD11 OT de instalacion Fase 04 Gate QA

**Version:** 1.0  
**Estado:** Emitido — G4 congelado (2026-07-27); ejecutar en G6 tras G5  
**Fecha:** 2026-07-27  
**Modo activo:** Auditoria y release gate  
**Generado por:** AI-EM-ARCH  
**Owner:** AI-SR-QA  
**Auditores:** AI-SEC-ENG y AI-EM-ARCH  
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`

## Contratos congelados (G4)

- **Contrato de API congelado.** Tipos: `packages/shared/src/contracts/operations/execution-orders.ts`. OpenAPI: `apps/api/openapi/tasks-execution-orders.v1.json`.
- **Contrato de componente congelado.** Spec: `docs/specs/2026-07-27-mod09-mod11-ot-instalacion-ds-contrato.md` v1.1.
- **Nombres congelados (G4).** Ver informe vivo §9.

---

## 1. Objetivo exacto de la fase

Emitir evidencia reproducible y veredicto GO/NO-GO del flujo completo sin implementar fixes durante la auditoría.

**Entra:** Task 9 y checklist completo.  
**No entra:** corregir código silenciosamente, reducir severidad por conveniencia o cerrar gaps sin evidencia.

## 2. Artefactos de entrada obligatorios

- ADR-068 aprobado por el CTO el 2026-07-27;
- contratos congelados;
- plan con tareas marcadas;
- checklist;
- informes vivos;
- commits/PRs de fases anteriores.

## 3. Instrucciones

1. Activar `testing-patterns`, `e2e-testing-patterns`, `playwright-skill`, `wcag-audit-patterns`, `security-auditor` y `verification-before-completion`.
2. Trazar QA-01 a QA-50 a una prueba y cada prueba a evidencia.
3. Ejecutar casos felices, negativos, concurrencia, idempotencia/expiración, audit-intent, mass assignment, PII, multi-tenant, matriz endpoint×permiso×ABAC, media/evidencia, cuadrillas, TLS/throttling, migración/rollback, offline sin persistencia, WCAG y responsive.
4. Incluir E2E vertical API+PostgreSQL, matriz completa de convergencia y fault injection MOD12→MOD11, idempotencia, auditoría y Media/Assets.
5. AI-SEC-ENG audita en solo lectura y emite severidades.
6. AI-SR-QA registra comandos/resultados reales y cobertura.
7. AI-EM-ARCH recomienda stop/go para G7; no modifica código.

## 4. Restricciones no negociables

- Un P0/P1 abierto es NO-GO.
- No declarar “pasa” con pruebas no ejecutadas o inestables.
- No usar datos reales ni incluir PII en evidencias.
- No omitir rollback, reconciliación u observabilidad.

## 5. Entregables

- Checklist completamente evidenciado.
- Reporte QA y reporte AppSec en informes vivos.
- Capturas/trazas autorizadas de E2E/a11y.
- Estado de cobertura, migraciones, reconciliación y rollback.
- Veredicto AI-EM-ARCH.

## 6. Criterios de aceptacion

- CA-04-01: QA-01 a QA-50 tienen evidencia.
- CA-04-02: cobertura core ≥80%.
- CA-04-03: lint, typecheck, build y suites acordadas pasan.
- CA-04-04: no hay P0/P1 ni boundary violations.
- CA-04-05: rollback y reconciliación son reproducibles.

## 7. Stop/go

Ante fallo, registrar NO-GO, reabrir el gap en el informe vivo y devolverlo al owner. No ejecutar correcciones desde este prompt.

## 8. Salida

La fase entrega el veredicto de calidad G6 y la recomendación para G7. Producción solo obtiene GO cuando CTO cierra G7; si G6 falla, registrar NO-GO con owner, severidad y próximo gate.
