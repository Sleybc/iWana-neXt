# SPEC — MOD05 CRM / Subscriber post-conversión — Ejecución full stack

**Version:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-05-11  
**Modo activo:** Mixto  
**Autor:** AI-EM-ARCH  
**PRD rector:** docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-03-v1.0.md  
**PRD complementario:** docs/prds/PRD-MOD05-CRM-AUTO-PIPELINE-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md  
**ADR rector:** docs/adrs/ADR-027-Conversion-Expediente-Subscriber-Two-Stage.md  
**Informe vivo relacionado:** docs/informes/INFORME-MOD05-DEFINICION-v1.0.md

---

## 1. Objetivo

Definir la ejecución full stack para resolver la convivencia operativa entre expediente CRM y subscriber después de la conversión, sin romper la trazabilidad aprobada del módulo.

El resultado esperado es:

1. sacar del tablero comercial principal los expedientes que ya dejaron de ser oportunidad activa;
2. conservar el expediente como registro histórico, auditable y navegable;
3. hacer explícita la transición operativa hacia Subscriber 360°;
4. implementar una UX de negocio clara en portal sin depender de filtros técnicos opacos;
5. mantener compatibilidad con el diseño aprobado de conversión two-stage.

---

## 2. Decisión funcional cerrada

### 2.1 Regla de negocio aprobada

Un expediente convertido no se elimina del CRM. Cambia de bandeja operativa.

La visibilidad queda definida así:

| Vista | Estados incluidos | Propósito |
| --- | --- | --- |
| `Abiertas` | `NUEVO_POTENCIAL`, `PRECALIFICADO`, `VALIDANDO_COBERTURA`, `EN_COTIZACION`, `LISTO_PARA_INSTALACION` | Trabajo comercial diario |
| `Convertidas` | `INSTALACION_AGENDADA` | Transición comercial-operativa con subscriber ya creado |
| `Archivo` | `CLIENTE_ACTIVO`, `DESCARTADO` | Histórico comercial cerrado |

### 2.2 Ownership por etapa

| Etapa | Owner primario |
| --- | --- |
| Hasta `LISTO_PARA_INSTALACION` | CRM |
| Desde `INSTALACION_AGENDADA` | Subscriber para operación, CRM para histórico |
| Desde `CLIENTE_ACTIVO` | Subscriber para ciclo de vida del cliente; CRM conserva trazabilidad |

### 2.3 Decisión técnica derivada

No se debe resolver esta necesidad filtrando en cliente sobre `listExpedientes()` actual. Eso rompería `total`, paginación y consistencia de búsqueda. La semántica de vistas debe salir del backend.

---

## 3. Alcance de ejecución

### 3.1 En scope

1. Extender `GET /crm/expedientes` con una semántica explícita de vista operativa.
2. Reorganizar la pantalla principal de expedientes en tres vistas de negocio.
3. Mantener búsqueda directa sobre todo el CRM cuando el usuario lo solicite.
4. Enriquecer el detalle del expediente con señal clara de conversión y acceso al subscriber.
5. Conservar el enlace inverso ya existente desde Subscriber 360° al expediente origen.
6. Agregar validaciones backend, pruebas frontend y E2E focalizadas.

### 3.2 Fuera de scope

1. Cambios de schema o migraciones de base de datos.
2. Nuevos bounded contexts o cambios de ownership entre módulos.
3. Reescritura completa del dashboard CRM.
4. Nuevos módulos de facturación, provisioning, tickets o inventario.
5. WebSockets, SSE o rediseño del motor de pipeline.

---

## 4. Diseño UX objetivo

### 4.1 Pantalla principal de expedientes

La página apps/portal/src/app/dashboard/crm/expedientes/page.tsx debe abrir por defecto en la vista `Abiertas`.

Componentes UX obligatorios:

1. selector principal de vistas con labels de negocio: `Abiertas`, `Convertidas`, `Archivo`;
2. badge de conteo por vista usando resumen ya disponible del pipeline;
3. filtros existentes preservados: estado, búsqueda, documento;
4. acción secundaria de búsqueda: `Buscar en todo CRM` para salir temporalmente de la vista activa y consultar `all`;
5. empty state distinto por vista.

### 4.2 Reglas visuales por vista

| Vista | Copy sugerido | Tono esperado |
| --- | --- | --- |
| `Abiertas` | Oportunidades activas para gestión comercial | operativo / prioritario |
| `Convertidas` | Expedientes ya convertidos a suscriptor y en transición operativa | informativo / seguimiento |
| `Archivo` | Histórico comercial cerrado o descartado | secundario / archivo |

### 4.3 Detalle del expediente

Cuando el expediente esté en `INSTALACION_AGENDADA` o `CLIENTE_ACTIVO`, el detalle debe mostrar un banner superior:

- mensaje: `Este expediente ya fue convertido a suscriptor.`;
- helper: `La operación posterior se gestiona desde Suscriptores.`;
- CTA primario: `Ir al suscriptor`;
- CTA secundario: `Ver historial del expediente` solo cuando aplique dentro de la misma pantalla.

### 4.4 Subscriber 360°

Se mantiene como regla fija el enlace inverso desde Subscriber 360° al expediente origen. No se rediseña esa pantalla en esta fase; solo se preserva y, si hace falta, se refuerza el copy de trazabilidad.

---

## 5. Diseño backend

### 5.1 Contrato de listado

Extender `GET /crm/expedientes` con query param nuevo:

- `view=open|converted|archive|all`

Reglas:

1. `open` es el default cuando el parámetro no venga informado;
2. `converted` retorna solo `INSTALACION_AGENDADA`;
3. `archive` retorna `CLIENTE_ACTIVO` y `DESCARTADO`;
4. `all` desactiva la partición por vista y permite búsqueda global controlada;
5. `includeCompleted` se mantiene por compatibilidad temporal, pero `view` tiene precedencia cuando ambos lleguen.

### 5.2 Implementación esperada

Archivos backend objetivo:

- apps/api/src/modules/crm/expedientes/expedientes.controller.ts
- apps/api/src/modules/crm/expedientes/expediente.service.ts
- apps/api/src/modules/crm/expedientes/tests/expedientes.controller.spec.ts
- apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts

Cambios esperados:

1. introducir enum o tipo interno para la vista del listado;
2. mapear cada vista a un conjunto explícito de estados;
3. preservar composición con filtros existentes (`status`, `search`, `documentNumber`, `municipality`, `assignedTo`);
4. mantener el filtrado exacto por documento después de aplicar la vista seleccionada;
5. no duplicar la lógica de estados en controller y service.

### 5.3 Enriquecimiento del detalle

Extender `GET /crm/expedientes/:id` para incluir:

```text
subscriberSummary?: {
  id: string;
  status: 'LEAD' | 'PROSPECT' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  fullName: string;
}
```

Reglas:

1. solo retornar `subscriberSummary` cuando exista vínculo por `expedienteId`;
2. no cargar datos 360 completos del subscriber en este endpoint;
3. resolverlo dentro del bounded context CRM sin abrir joins transversales fuera del módulo.

### 5.4 Compatibilidad y no-regresión

1. no cambiar el modelo de datos de `ExpedienteRecord`;
2. no cambiar la lógica de conversión two-stage ya aprobada;
3. no tocar el cálculo existente de `getPipelineSummary()` salvo para reutilizar sus conteos en portal;
4. no introducir nuevos endpoints si el contrato actual puede extenderse sin ambigüedad.

---

## 6. Diseño frontend

### 6.1 API client

Actualizar apps/portal/src/lib/api-client.ts para soportar:

1. `view?: 'open' | 'converted' | 'archive' | 'all'` en `crmApi.listExpedientes()`;
2. `subscriberSummary?: { id: string; status: string; fullName: string }` en la respuesta de detalle de expediente.

### 6.2 Listado CRM

Actualizar apps/portal/src/app/dashboard/crm/expedientes/page.tsx con estas reglas:

1. el estado por defecto de la pantalla es `view = 'open'`;
2. el cambio de vista dispara recarga server-side, no filtrado local;
3. `Buscar en todo CRM` conmuta temporalmente a `view = 'all'` manteniendo los filtros escritos;
4. si el usuario limpia búsqueda y documento, la pantalla vuelve a la vista activa seleccionada;
5. la tabla debe mostrar un badge adicional de contexto cuando el resultado venga de `all`, indicando si pertenece a `Abiertas`, `Convertidas` o `Archivo`.

### 6.3 Detalle de expediente

Actualizar apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx para:

1. renderizar banner de conversión en `INSTALACION_AGENDADA` y `CLIENTE_ACTIVO`;
2. navegar a `/dashboard/crm/subscribers/[subscriberId]` cuando exista `subscriberSummary`;
3. mantener el detalle editable según reglas vigentes, sin bloquear la lectura histórica.

### 6.4 Overview CRM

Actualizar apps/portal/src/components/crm/CrmOverviewClient.tsx solo en lo estrictamente necesario para alinear semántica visible:

1. `Total` debe seguir representando pipeline operativo y no confundirse con archivo;
2. si se muestran activos en overview, el copy debe indicar que son cierre histórico, no cola operativa;
3. no abrir rediseño visual amplio en esta fase.

---

## 7. Testing y validación

### 7.1 Backend

Casos mínimos:

1. `view=open` excluye `INSTALACION_AGENDADA`, `CLIENTE_ACTIVO` y `DESCARTADO`;
2. `view=converted` retorna solo `INSTALACION_AGENDADA`;
3. `view=archive` retorna `CLIENTE_ACTIVO` y `DESCARTADO`;
4. `view=all` permite búsqueda directa transversal;
5. `includeCompleted` sigue funcionando mientras no se envíe `view`;
6. `GET /crm/expedientes/:id` retorna `subscriberSummary` cuando el expediente está vinculado.

### 7.2 Frontend

Casos mínimos:

1. la pantalla abre en `Abiertas`;
2. cambiar a `Convertidas` recarga y actualiza conteo/copy;
3. `Buscar en todo CRM` conserva filtros y etiqueta el origen del resultado;
4. el banner de conversión aparece en detalle cuando aplica;
5. el CTA `Ir al suscriptor` navega correctamente cuando existe vínculo.

### 7.3 E2E

Agregar o ampliar flujo portal para cubrir:

1. cambio entre `Abiertas`, `Convertidas` y `Archivo`;
2. búsqueda de un expediente convertido desde `Todo CRM`;
3. navegación expediente convertido → subscriber;
4. navegación subscriber → expediente origen.

Validaciones objetivo:

- `pnpm --filter @iwana/api test -- src/modules/crm/expedientes/tests/expediente.service.spec.ts src/modules/crm/expedientes/tests/expedientes.controller.spec.ts`
- `pnpm --filter @iwana/portal test -- --runInBand`
- `pnpm --filter @iwana/api typecheck`
- `pnpm --filter @iwana/portal typecheck`
- `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-expedientes.spec.ts`

---

## 8. Secuencia recomendada de ejecución

1. Extender contrato backend de listado con `view` y cubrir pruebas.
2. Extender detalle de expediente con `subscriberSummary` y cubrir pruebas.
3. Actualizar `api-client` del portal.
4. Implementar tabs/vistas del listado en portal.
5. Implementar búsqueda `Todo CRM`.
6. Implementar banner y CTA en detalle de expediente.
7. Ajustar overview solo si el copy queda inconsistente.
8. Cerrar con validación E2E focalizada.

---

## 9. Criterios de aceptación

1. `INSTALACION_AGENDADA` deja de aparecer en la bandeja principal `Abiertas`.
2. El expediente convertido no se elimina ni pierde navegabilidad.
3. El usuario puede entrar a `Convertidas` y `Archivo` sin filtros técnicos manuales.
4. Existe una forma explícita de búsqueda directa sobre todo el CRM.
5. El detalle del expediente convertido hace visible el paso de ownership operativo hacia subscriber.
6. La trazabilidad bidireccional expediente ↔ subscriber queda navegable desde portal.
7. No se introducen migraciones, deuda de boundary ni cambios de stack.

---

## 10. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Resolverlo solo en frontend | Totales y paginación inconsistentes | mover la semántica de vista al backend |
| Duplicar lógica de estados en varios archivos | Drift futuro del pipeline | centralizar mapeo de vistas en backend |
| Búsqueda global ambigua | Resultados difíciles de interpretar | etiquetar origen del resultado cuando se use `all` |
| Sobrecargar el detalle con datos del subscriber | Acoplamiento innecesario | exponer solo `subscriberSummary` |

---

## 11. Siguiente artefacto derivado

Si este spec queda aprobado, el siguiente entregable debe ser un prompt operativo basado en docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md para que AI-SR-FULL ejecute backend, portal, tests y actualización del informe vivo en una sola pasada controlada.