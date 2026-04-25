# PROMPT - MOD06 Fase 02: commercialApi y endurecimiento de integracion del portal

**Version:** 1.0  
**Estado:** Listo para ejecucion  
**Fecha:** 2026-04-18  
**Modo activo:** Architect

## Vinculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
- PRD base del modulo: `docs/prds/PRD-MOD06-COMERCIAL-DEFINICION-v1.0.md`
- PRD addendum de la fase: `docs/prds/PRD-MOD06-COMERCIAL-ADDENDUM-FASE-02-v1.0.md`
- HLD del modulo: `docs/hlds/HLD-MOD06-ARQUITECTURA-v1.0.md`
- ADR aplicable: `docs/adrs/ADR-028-Extraccion-Modulo-Comercial.md`
- Informe relacionado: `docs/informes/INFORME-MOD06-FASE-01-v1.0.md`
- Prompt anterior: `docs/prompts/PROMPT-MOD06-FASE-01-v1.0.md`

## Modulo

- **Nombre:** Modulo Comercial - Catalogo de Planes, Productos y Servicios
- **Codigo:** MOD06
- **Fase:** FASE-02 (Portal: commercialApi y endurecimiento de integracion)
- **Version:** 1.0
- **Fecha:** 2026-04-18
- **Generado por:** Lead Software Architect Senior (AI-EM-ARCH, Modo Architect)
- **Nombre de archivo destino:** `PROMPT-MOD06-FASE-02-v1.0.md`

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** El portal empresarial expresa correctamente el ownership del bounded context Comercial mediante un `commercialApi` explicito, consumido por Settings y CRM expediente, dejando `tenantSelfApi` exclusivamente para self-service del tenant y coverage.

**Lo que SI entra:**

1. Crear `commercialApi` en `apps/portal/src/lib/api-client.ts`
2. Migrar metodos comerciales de planes y productos a `commercialApi`
3. Actualizar consumidores directos de catalogo comercial en Settings
4. Actualizar el detalle de expediente para usar `commercialApi`
5. Eliminar del estado final los metodos comerciales equivalentes desde `tenantSelfApi`
6. Ejecutar validacion focalizada de typecheck y flujos afectados
7. Actualizar informe vivo de MOD06 con evidencia de la fase

**Lo que NO entra:**

- Nuevos endpoints backend
- Cambios de base de datos o migraciones
- Bundles, promociones, compatibilidad o tax rules
- Refactorizacion total del cliente HTTP del portal
- Movimiento de coverage fuera de `tenantSelfApi`

---

## 2. Artefactos de entrada obligatorios

| Artefacto | Ubicacion | Estado |
| --- | --- | --- |
| PRD base del modulo | `docs/prds/PRD-MOD06-COMERCIAL-DEFINICION-v1.0.md` | Aprobado |
| Addendum de fase | `docs/prds/PRD-MOD06-COMERCIAL-ADDENDUM-FASE-02-v1.0.md` | Aprobado |
| HLD del modulo | `docs/hlds/HLD-MOD06-ARQUITECTURA-v1.0.md` | Aprobado |
| ADR aplicable | `docs/adrs/ADR-028-Extraccion-Modulo-Comercial.md` | Aprobado |
| Informe vivo | `docs/informes/INFORME-MOD06-FASE-01-v1.0.md` | Vigente |
| Prompt previo | `docs/prompts/PROMPT-MOD06-FASE-01-v1.0.md` | Referencia |
| Artefactos faltantes detectados | Ninguno critico | N/A |

---

## 3. Instrucciones para Sr. Dev Fullstack

1. Leer el PRD base, el addendum de Fase 02, el HLD y ADR-028 antes de tocar codigo.
2. Trabajar solo en `apps/portal` salvo ajustes documentales requeridos al cierre.
3. En `apps/portal/src/lib/api-client.ts`, crear `commercialApi` como sibling de `tenantSelfApi`, reutilizando el helper `request`, tipos y mapeadores comerciales existentes.
4. Mover a `commercialApi` los metodos de catalogo comercial ya soportados:
   - `getPlans`
   - `createPlan`
   - `updatePlan`
   - `deletePlan`
   - `getAdditionalProducts`
   - `createAdditionalProduct`
   - `updateAdditionalProduct`
   - `deleteAdditionalProduct`
5. Mantener `tenantSelfApi` con responsabilidades legitimas de self-service del tenant y coverage. No mover coverage en esta fase.
6. Actualizar los consumidores directos para usar `commercialApi`:
   - `apps/portal/src/components/settings/PlanCatalogManager.tsx`
   - `apps/portal/src/components/settings/AdditionalProductsManager.tsx`
   - `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
7. Si durante la migracion necesitas una delegacion temporal para mantener el archivo compilando, usala solo como paso intermedio. El estado final no debe dejar metodos de catalogo comercial publicados desde `tenantSelfApi`.
8. No introducir nuevos clientes HTTP ni partir `api-client.ts` en multiples archivos salvo bloqueo tecnico real documentado.
9. No cambiar contratos backend ni nombres de endpoints REST. Esta fase es de ownership y wiring, no de expansion funcional.
10. Ejecutar validacion focalizada al cierre:
   - `pnpm --filter @iwana/portal typecheck`
   - pruebas afectadas si cambian helpers o mapeadores
   - Playwright focalizado sobre expediente si el wiring lo requiere
11. Actualizar `docs/informes/INFORME-MOD06-FASE-01-v1.0.md` con evidencia de la iteracion y decision de continuidad.

---

## 4. Restricciones no negociables

1. No romper boundaries del modulith ni inventar ownership nuevo fuera de Comercial.
2. No mover `coverage` en esta fase.
3. No agregar endpoints, DTOs backend, migraciones ni cambios de schema.
4. No dejar aliases residuales de planes o productos comerciales en `tenantSelfApi` al cierre.
5. No mezclar esta fase con bundles, promociones, compatibilidad o tax rules.
6. No introducir secretos, datos reales ni tenancy hardcodeada en cliente.

---

## 5. Entregables tecnicos obligatorios

1. `commercialApi` implementado en el cliente del portal.
2. Consumidores de Settings migrados a `commercialApi`.
3. Detalle de expediente migrado a `commercialApi` para planes y productos.
4. `tenantSelfApi` sin metodos de catalogo comercial de planes y productos.
5. Validacion focalizada en verde.

---

## 6. Entregables documentales obligatorios

1. Actualizacion del informe vivo en `docs/informes/INFORME-MOD06-FASE-01-v1.0.md`.
2. Si aparece un bloqueo tecnico real, documentar stop/go en el mismo informe vivo.
3. No crear un informe paralelo para esta iteracion salvo instruccion explicita.

---

## 7. Criterios de aceptacion

| CA | Descripcion |
| --- | --- |
| CA-01 | Existe `commercialApi` como objeto exportado explicito en el portal |
| CA-02 | Settings de planes consume `commercialApi` |
| CA-03 | Settings de productos consume `commercialApi` |
| CA-04 | El expediente consume `commercialApi` para catalogo comercial |
| CA-05 | `tenantSelfApi` deja de exponer metodos comerciales de planes y productos |
| CA-06 | `coverage` permanece en `tenantSelfApi` |
| CA-07 | Typecheck del portal queda en verde |
| CA-08 | La validacion focalizada de los flujos afectados queda en verde |

---

## 8. Criterio de stop/go

**Detenerse inmediatamente si:**

- El refactor obliga a cambiar contratos backend no previstos.
- Mover `coverage` se vuelve requisito tecnico para completar el cambio.
- El diff deja de ser focalizado y empieza a convertirse en una refactorizacion general del cliente HTTP.

**Documentar causa en:** `docs/informes/INFORME-MOD06-FASE-01-v1.0.md`

**Escalar a:** Lead Software Architect Senior / EM-Architect

**Recomendacion esperada:** describir bloqueo, alternativas evaluadas y por que conviene dividir el trabajo antes de continuar.

---

## 9. Criterio de salida de la fase

- `commercialApi` operativo y consumido por los flujos definidos.
- `tenantSelfApi` reducido a self-service del tenant y coverage.
- Sin cambios backend ni cambios de schema.
- Typecheck y pruebas focalizadas en verde.
- Informe vivo actualizado con evidencia, riesgos residuales y siguiente fase recomendada.