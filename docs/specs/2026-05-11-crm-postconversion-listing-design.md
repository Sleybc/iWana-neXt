# Design — CRM post-conversión / bandejas operativas de expedientes

**Version:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-05-11  
**Modo activo:** Mixto  
**Spec de entrada:** `docs/specs/SPEC-MOD05-CRM-POSTCONVERSION-FULLSTACK-v1.0.md`  
**PRD rector:** `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-03-v1.0.md`  
**PRD complementario:** `docs/prds/PRD-MOD05-CRM-AUTO-PIPELINE-v1.0.md`  
**HLD relacionado:** `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md`  
**ADR rector:** `docs/adrs/ADR-027-Conversion-Expediente-Subscriber-Two-Stage.md`

---

## 1. Problema

El pipeline CRM ya soporta el hito `INSTALACION_AGENDADA` y la trazabilidad hacia Subscriber 360°, pero el listado principal de expedientes sigue operando con una semántica binaria de `includeCompleted`.

Eso deja tres fricciones:

1. mezcla en la misma lectura oportunidades activas, expedientes convertidos y archivo histórico;
2. obliga a resolver parte de la semántica en cliente si se quiere separar vistas de negocio;
3. dificulta una UX explícita para post-conversión sin romper `total`, paginación y búsqueda.

---

## 2. Decisión de diseño

Se extiende el contrato existente `GET /crm/expedientes` con un parámetro explícito `view=open|converted|archive|all`, manteniendo `includeCompleted` solo como compatibilidad temporal.

La implementación recomendada preserva la arquitectura actual:

1. backend como fuente de verdad de la segmentación operativa;
2. portal con selector de vistas y recarga remota, sin filtrado local de estados;
3. detalle de expediente enriquecido con una señal mínima de conversión y navegación al subscriber vinculado;
4. overview CRM ajustado solo en la semántica visible para no mezclar cola operativa con histórico.

Se descarta migrar la pantalla a una reescritura amplia basada en server components o filtrar estados solo en cliente, porque agrega riesgo innecesario o contradice el spec.

---

## 3. Diseño backend

### 3.1 Contrato de listado

`GET /crm/expedientes` acepta:

- `view=open|converted|archive|all`
- filtros existentes: `status`, `search`, `documentNumber`, `municipality`, `assignedTo`, `page`, `limit`
- `includeCompleted` como compatibilidad temporal

Reglas:

1. `open` es el default cuando `view` no se informa.
2. `converted` retorna solo `INSTALACION_AGENDADA`.
3. `archive` retorna `CLIENTE_ACTIVO` y `DESCARTADO`.
4. `all` no aplica partición por bandeja.
5. si llegan `view` e `includeCompleted`, prevalece `view`.
6. `status` se compone sobre la vista ya resuelta, no reemplaza la semántica base.
7. `documentNumber` mantiene su filtrado exacto después de aplicar la vista para no romper coincidencias ni `total`.

### 3.2 Encapsulación de reglas

Se introduce un tipo interno `ExpedienteListView` y una función única que mapea `view -> estados permitidos`.

Objetivo:

- evitar duplicación entre controller y service;
- mantener la regla en un solo punto;
- permitir que la respuesta del portal derive badges de contexto desde el mismo contrato.

### 3.3 Detalle de expediente

`GET /crm/expedientes/:id` se extiende con:

```ts
subscriberSummary?: {
  id: string;
  status: 'LEAD' | 'PROSPECT' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  fullName: string;
}
```

Reglas:

1. solo se retorna cuando exista vínculo por `expedienteId`;
2. no se carga el payload 360 completo;
3. la resolución se mantiene dentro del bounded context CRM usando los servicios y puertos ya aprobados por el módulo;
4. no se cambia el modelo de `ExpedienteRecord`.

---

## 4. Diseño frontend portal

### 4.1 Listado de expedientes

La pantalla `apps/portal/src/app/dashboard/crm/expedientes/page.tsx` mantiene su arquitectura actual como página cliente, pero incorpora una semántica operativa explícita:

1. vista por defecto `Abiertas`;
2. selector principal de vistas `Abiertas`, `Convertidas`, `Archivo`;
3. badges de conteo apoyados en `getPipelineSummary()`;
4. filtros existentes preservados;
5. acción secundaria `Buscar en todo CRM`.

La pantalla no filtra estados localmente. Cada cambio de vista dispara una nueva lectura remota usando `crmApi.listExpedientes({ view })`.

### 4.2 Regla para búsqueda global

`Buscar en todo CRM` solo se habilita cuando exista `search` o `documentNumber`.

Comportamiento:

1. al activarse, consulta `view='all'`;
2. mantiene los filtros escritos;
3. cada resultado muestra un badge adicional indicando su bandeja de origen: `Abiertas`, `Convertidas` o `Archivo`;
4. si el usuario limpia búsqueda y documento, la tabla vuelve a la vista operativa seleccionada.

### 4.3 Detalle de expediente

Cuando el expediente esté en `INSTALACION_AGENDADA` o `CLIENTE_ACTIVO`, la vista detalle muestra un banner superior con:

- mensaje principal de conversión;
- helper de operación desde Suscriptores;
- CTA `Ir al suscriptor` cuando exista `subscriberSummary`.

La señal de conversión depende del estado del expediente, no de la existencia del vínculo, para mantener claridad operativa incluso si el vínculo todavía no está disponible en la lectura.

### 4.4 Subscriber 360° y overview

Subscriber 360° conserva el enlace inverso existente al expediente origen sin rediseño de pantalla.

`CrmOverviewClient` solo ajusta copy y agrupación visible:

1. `Total` sigue representando la cola operativa del pipeline;
2. `Activos` se presenta como cierre histórico, no como trabajo pendiente;
3. no se abre un rediseño visual amplio en esta fase.

---

## 5. Errores y validación

1. `view` inválido retorna `400`; no cae silenciosamente en `open`.
2. El portal no debe habilitar `Todo CRM` sin búsqueda o documento.
3. No se agregan endpoints nuevos ni cambios de schema.
4. `includeCompleted` se mantiene solo para compatibilidad con consumidores existentes mientras el portal migra a `view`.

---

## 6. Testing

### 6.1 Backend

Cobertura mínima:

1. `open` excluye `INSTALACION_AGENDADA`, `CLIENTE_ACTIVO` y `DESCARTADO`;
2. `converted` retorna solo `INSTALACION_AGENDADA`;
3. `archive` retorna `CLIENTE_ACTIVO` y `DESCARTADO`;
4. `all` permite búsqueda transversal;
5. `includeCompleted` sigue funcionando cuando `view` no viene;
6. `findById` retorna `subscriberSummary` cuando existe vínculo.

### 6.2 Frontend

Cobertura mínima:

1. la pantalla abre en `Abiertas`;
2. cambiar de vista vuelve a leer backend y actualiza conteo/copy;
3. `Buscar en todo CRM` conserva filtros y etiqueta bandeja de origen;
4. el detalle muestra banner de conversión cuando aplica;
5. el CTA al suscriptor navega correctamente cuando hay vínculo.

### 6.3 E2E

Flujo focal:

1. navegación entre `Abiertas`, `Convertidas` y `Archivo`;
2. búsqueda global de expediente convertido desde `Todo CRM`;
3. expediente convertido -> subscriber;
4. subscriber -> expediente origen.

---

## 7. Riesgos controlados

1. **Regla de vistas dispersa**: se evita con un único mapeo backend.
2. **Inconsistencia entre tabs y conteos**: se evita haciendo que la segmentación salga del backend y reutilizando `getPipelineSummary()`.
3. **Sobrerrefactor del portal**: se evita manteniendo la página actual y cambiando solo la semántica visible.
4. **Acoplamiento cross-module**: se evita devolviendo solo `subscriberSummary` mínimo.

---

## 8. Resultado esperado

El operador distingue sin ambigüedad tres bandejas operativas:

1. trabajo comercial activo;
2. expedientes ya convertidos con seguimiento de transición;
3. archivo histórico cerrado.

La trazabilidad CRM <-> Subscriber se conserva, el backend sigue siendo la fuente de verdad y la fase puede ejecutarse sin migraciones ni cambios de boundary.
