---
description: "Wave 1 Comercial UI — AI-SR-QA: gate stop/go operativo (precio, delete, focus, audit-ui)."
name: "Commercial UI Wave1 SR-QA"
argument-hint: "Ejecutar tras commits FE Wave 1; aprobador ≠ productor"
agent: "sr-qa"
---

# Prompt de ejecución — Wave 1 · AI-SR-QA

**Modo:** Sr. Dev QA (verifica; no implementa features).  
**Orquestador:** AI-EM-ARCH.  
**Precondición:** FE-PLATFORM declaró GO interno Wave 1.  
**Aprobador de gate ≠ productor FE.**

**Entradas:**
- [INFORME-COMMERCIAL-UI-ALIGNMENT-v1.5](../../docs/informes/INFORME-COMMERCIAL-UI-ALIGNMENT-v1.5.md) § criterios Wave 1
- Spec delta PROD-UX
- Plan remediación W1.6
- Skills: `testing-patterns`, `e2e-testing-patterns` / `playwright-skill` si hay E2E; Jest portal como mínimo

## Checklist stop/go (obligatorio)

| # | Criterio | Resultado |
| --- | --- | --- |
| 1 | Ítem sin precio vigente muestra «Sin precio vigente», nunca `$0` | PASS / FAIL |
| 2 | Eliminar plan abre Dialog; cancelar no llama API | PASS / FAIL |
| 3 | Desde Actividad o alerta, `focus` abre o resalta la entidad | PASS / FAIL |
| 4 | KPI Listos navega al tab con más incompletos | PASS / FAIL |
| 5 | Error carga planes ofrece Reintentar | PASS / FAIL |
| 6 | Jest commercial/portal tocados verdes | PASS / FAIL |
| 7 | `audit-ui.mjs` sobre `components/commercial` = 0 | PASS / FAIL |

## Comandos mínimos

```bash
pnpm --filter @iwana/portal test -- commercial
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/commercial
```

Gate navegador manual o Playwright: `/dashboard/commercial` con tenant de prueba (sin PII real en el informe).

## Entregables

1. Tabla PASS/FAIL con evidencia (archivo:línea de test, captura o traza).  
2. Veredicto **GO** o **NO-GO** Wave 1.  
3. Deuda residual no bloqueante (máx. 5 ítems).

## Stop / go

- **GO** → EM-ARCH puede abrir Wave 2 y emitir informe v1.6 de cierre operativo.  
- **NO-GO** → devolver a FE-PLATFORM con IDs H20–H22 fallidos; no iniciar Wave 2 de producto.
