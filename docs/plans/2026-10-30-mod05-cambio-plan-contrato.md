# Cambio de plan del contrato — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task. Sin commits, stash ni reversión de cambios ajenos.

**Goal:** Cambiar inmediatamente el plan comercial de contratos DRAFT/ACTIVE con confirmación y mejorar el formulario de edición.

**Architecture:** Acción dedicada, snapshot construido mediante puerto de catálogo y persistencia con IVA/auditoría en una transacción tenant. Frontend con diálogo independiente y prevención de guardados parciales. Facturas existentes intactas; sin prorrateo, cargos ni reconfiguración de red.

**Tech Stack:** NestJS, TypeORM/PostgreSQL, Zod shared, Next.js/React, @iwana/ui.

Spec aprobada: `docs/specs/2026-10-30-mod05-cambio-plan-contrato-ux.md`.

## Tarea 1 — contrato y backend (sr-backend)

Archivos: `packages/shared/src/schemas/contract.schema.ts` y tests; `apps/api/src/modules/crm/contracts/contracts.service.ts`, `contracts.controller.ts`, DTO nuevo y tests dentro de `tests/`.

- [ ] Publicar esquema exportado junto a los contratos existentes:

```ts
export const ContractPlanChangeSchema = z.object({
  planId: z.string().min(1).max(120),
  expectedUpdatedAt: z.string().datetime(),
  expectedMonthlyPrice: z.number().finite().nonnegative(),
}).strict();
export type ContractPlanChangeInput = z.infer<typeof ContractPlanChangeSchema>;
```

- [ ] Añadir `POST /crm/contracts/:id/plan-change`, con roles/permisos/guardas de titular de las mutaciones existentes. Respuesta `{data: Contract}` y OpenAPI.
- [ ] Bloquear fila del contrato, comprobar versión/estado y guardas del suscriptor. Resolver plan activo y tarifa por segmento mediante CommercialCatalogReadPort, crear snapshot servidor; mismo plan retorna sin duplicar historial.
- [ ] DRAFT conserva IVA pendiente. ACTIVE recalcula IVA con el plan capturado y datos persistidos. Guardar ID/snapshot/IVA y `audit.logWithin` en la misma transacción; propagar errores de auditoría para rollback.
- [ ] Errores: `CONTRACT_PLAN_CHANGE_NOT_ALLOWED`, `CONTRACT_CHANGED`, `PLAN_UNAVAILABLE`, `PLAN_PRICE_REQUIRED`, `PLAN_PRICE_CHANGED` y errores fiscales existentes. Nunca confiar precio/snapshot del browser.
- [ ] Revisar escritores existentes: evitar save obsoleto que sobrescriba el nuevo plan. Cubrir concurrencia con prueba real o explicar barrera precisa.
- [ ] Pruebas: éxito DRAFT/ACTIVE, plan inactivo, precio ausente, versión obsoleta, estado no permitido, IVA inválido, rollback de auditoría, mismo plan e aislamiento.
- [ ] Ejecutar Jest focal sin caché, lint/typecheck shared/api y PostgreSQL real con schema sintético (nunca tenant_iwana). Registrar cifras reales.

## Tarea 2 — formulario y acción de plan (fe-platform)

Archivos: nuevo `ChangeContractPlanDialog.tsx` y pruebas; `ContractDetailDrawer.tsx`, `use-contract-plan.ts` si requiere exponer tecnología; `apps/portal/src/lib/api-client.ts` solo nueva función y tipo de plan-change; conservar línea ajena existente.

- [ ] Añadir cliente tipado:

```ts
changePlan: (id: string, input: ContractPlanChangeInput, tenantSlug?: string) =>
  request<Contract>(`/crm/contracts/${id}/plan-change`,
    { method: 'POST', body: JSON.stringify(input) }, tenantSlug)
```

- [ ] En Editar, Cambiar plan habilitado solo DRAFT/ACTIVE y sin campos pendientes. Mensaje explícito si hay cambios por guardar/cancelar.
- [ ] Diálogo independiente con SearchablePicker (planes activos), detalle resuelto, comparación actual/nuevo con velocidades y precio. Confirmar deshabilitado si mismo plan, carga, tarifa ausente o guardando; preservar selección/reintentar ante fallo.
- [ ] Confirmación de aplicación inmediata y facturas emitidas intactas. En éxito respuesta actualiza contrato local, tarjeta y anuncio accesible; no guardar otros campos automáticamente.
- [ ] Rediseñar secciones abiertas: Plan; Servicio e instalación; Facturación; Punto de servicio/IVA; Datos fiscales. Reducir superficies anidadas, títulos h3 sentence case, labels asociados, foco visible, pie fijo con errores.
- [ ] Preservar flujos de estrato, privacidad, ciclo y lifecycle; cambios de plan cancelados no mutan API.
- [ ] Tests de selector/confirmación, carga/error/reintento, comparación, versión obsoleta, dirty guard, refresco y cancelación. Regresión suites existentes de drawer/ciclo/estrato.
- [ ] Ejecutar typecheck/lint Portal y audit-ui de rutas tocadas con 0 hallazgos.

## Tarea 3 — revisión, integración y evidencia (padre + revisores)

- [ ] Revisar cumplimiento spec antes de calidad; corregir hallazgos relevantes con implementadores.
- [ ] Revisión de boundaries/tenancy y deriva shared/DTO/OpenAPI/Portal. Revisión UX/DS del resultado.
- [ ] Correr checks focales tras integración. No repetir suites sin cambio/fallo nuevo que lo justifique.
- [ ] Actualizar informe `docs/informes/INFORME-MOD05-CAMBIO-PLAN-DISENO-v1.0.md` con implementación, comandos, cifras y límites reales.

## Dispatch

| Bloque | Rol | Skills |
|---|---|---|
| Backend | sr-backend | nestjs-expert, test-driven-development, openapi-spec-generation, iwana-test-evidence |
| Frontend | fe-platform | frontend-dev-guidelines, core-components, nextjs-app-router-patterns, iwana-identity-ui-review, system-vocabulary-review, testing-patterns |
| Revisión | boundary-reviewer / contract-drift-reviewer / ds-owner | architect-review / iwana-identity-ui-review |

La autorización de implementar se recibió del usuario; no requiere otra aprobación entre tareas. Se conserva el árbol compartido y no se commitea.
