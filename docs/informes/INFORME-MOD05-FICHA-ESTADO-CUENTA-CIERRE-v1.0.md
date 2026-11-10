# Informe de cierre — MOD05 Ficha: estado de cuenta y valores heredados

**Versión:** 1.0
**Estado:** G6 ✅ — unitarias, E2E, lint, tipos y audit-ui en verde; sin commit
**Fecha:** 2026-11-09
**Spec:** [2026-11-09-mod05-ficha-estado-de-cuenta-ux](../specs/2026-11-09-mod05-ficha-estado-de-cuenta-ux.md) · **Plan:** [2026-11-09-mod05-ficha-estado-de-cuenta](../plans/2026-11-09-mod05-ficha-estado-de-cuenta.md) · **Origen:** [referencia UISP CRM v1.1](../referencias/REFERENCIA-UISP-CRM-MOD05-v1.1.md) §15.8

## 1. Entregado

| Bloque | Resultado |
|---|---|
| A | Panel «Estado de cuenta» en la Vista general: deuda pendiente, saldo a favor, hasta tres documentos pendientes, «Vencido» con texto, avisos de custodia y suplantación, enlaces a Facturación. Solo con `BILLING_INVOICES_READ`. Una sola carga compartida con la pestaña Facturación (`use-subscriber-statement.ts`, memoizada) |
| B | Política del contrato: «Heredar de la empresa: {valor}» en selectores y ayuda «Vacío: se usa el valor de la empresa (N día/días)» enlazada con `aria-describedby`; aviso si la política de la empresa no carga; cuerpo de guardado sin cambios |

Sin endpoints, contratos, migraciones ni cambios en `apps/api` o `packages/shared`.

## 2. Evidencia de gates

| Gate | Resultado |
|---|---|
| Línea base (Tarea 0, `9ed55090` + árbol) | 348 suites, 3479 pruebas: 3477 pasan, 1 omitida, 1 falla (`AssuranceClient.spec.tsx`, inestable conocido, ajeno) |
| Suite completa tras el cambio | Ver §2.1 |
| Lint del portal | 0 errores; 42 avisos preexistentes, ninguno en archivos de este cambio |
| Typecheck del portal | 0 errores |
| `audit-ui.mjs` (subscribers y billing) | Sin hallazgos (CA-12) |
| E2E `portal-billing-flow.spec.ts` (CA-11) | **8 de 8 en verde** (43,6 s), incluido el caso «ficha con métricas» ampliado. Primera corrida: falló la preparación porque el worker no corría y el tenant de prueba quedó en `PROVISIONING`; se arrancaron solo la API (`pnpm --filter @iwana/api dev`) y el worker (`pnpm --filter @iwana/worker dev`), sin `dev.mjs` |
| `test-change-reviewer` | Sin expectativas debilitadas; arnés de `subscriber-billing-tab.spec.tsx` justificado por R-A3; mocks con identidad estable (cambio de otra sesión) neutros |
| Revisión final de código | «Listo con menores»; el Importante (falta de prueba de la ficha con permiso) se corrigió con `SubscriberDetailClient.estado-cuenta.portal.spec.tsx` |
| Boundaries, contratos, PII en logs, migraciones, OpenAPI | No aplican: cambio solo de portal |

### 2.1 Conteo final

`pnpm exec jest --silent` en `apps/portal`, sin caché de Turbo: **352 suites y 3494 pruebas, 3493 pasan, 1 omitida (preexistente), 0 fallos**. Frente a la línea base: +4 suites y +15 pruebas (12 del plan, «sin vencidos» y 2 de la ficha con permiso); las omitidas no suben.

## 3. Desviaciones respecto al plan

- Pruebas: ayudante `money()` por el espacio duro de `formatBillingMoney`; `crypto.randomUUID` con `node:crypto` en la prueba de política (jsdom no lo trae, mismo arreglo que `billing-ui.spec.tsx`); reintento buscado dentro de la región.
- Agregados por revisión: caso «sin vencidos», memoización del hook (evita recalcular las pestañas en cada render), plural «día/días», prueba de la ficha con permiso.

## 4. Omisiones y riesgos

- Producto: con un titular anonimizado o con la auditoría de privacidad caída, el panel de la Vista general muestra un error con «Reintentar» que no se resuelve (ya pasaba en la pestaña). Decidir si se oculta.
- Al recargar, panel y pestaña vuelven al indicador de carga (comportamiento previo de la pestaña). Cambios hechos en otras pestañas no refrescan el estado de cuenta sin recargar la ficha (consecuencia de R-A3).
- Commit bloqueado: `subscriber-billing-tab.spec.tsx` y `SubscriberDetailClient.mod05-deuda.portal.spec.tsx` mezclan este cambio con uno de otra sesión.
