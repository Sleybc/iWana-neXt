# PROMPT - MOD05 CRM Gestion Comercial y Operativa Fase 01

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-04-04  
**Fase:** 01 - Unificacion UX + modelo operativo/comercial  
**Modulo:** MOD05 - CRM  
**Rol destino:** Senior Developer Fullstack  
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`

---

## 1. Objetivo de la fase

Implementar en MOD05 la unificacion de `Interes comercial` y `Atribucion comercial` en una sola seccion de detalle llamada `Gestion comercial y operativa`, corrigiendo la ambiguedad entre:

1. Origen de la oportunidad.
2. Originador comercial.
3. Responsable actual.
4. Historial comercial.
5. Historial operativo.

La fase debe mejorar el modelo de lectura del expediente sin colapsar conceptos de negocio distintos en una sola entidad ambigua.

---

## 2. Artefactos de entrada obligatorios

Lee y comprende antes de cambiar codigo:

| Artefacto                | Ruta                                                              | Uso                                     |
| ------------------------ | ----------------------------------------------------------------- | --------------------------------------- |
| PRD base CRM             | `docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md`                      | Modelo vigente del expediente           |
| PRD origen/atribucion    | `docs/prds/PRD-MOD05-CRM-ORIGEN-ATRIBUCION-v1.1.md`               | Estado actual de captacion y atribucion |
| PRD nuevo de unificacion | `docs/prds/PRD-MOD05-CRM-GESTION-COMERCIAL-OPERATIVA-v1.0.md`     | Fuente funcional principal de esta fase |
| HLD CRM                  | `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md`                        | Boundaries y estructura del modulo      |
| Informe relacionado      | `docs/informes/INFORME-MOD05-ATRIBUCION-INCENTIVOS-FASE1-v1.0.md` | Estado implementado previo              |
| AGENTS.md                | `AGENTS.md`                                                       | Reglas del repo, seguridad y comandos   |

### Archivos de referencia obligatorios

| Archivo                                                                      | Rol                             |
| ---------------------------------------------------------------------------- | ------------------------------- |
| `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`                | Vista principal del detalle     |
| `apps/portal/src/components/crm/expedientes/expediente-ui.ts`                | Labels, opciones y metadatos UI |
| `apps/portal/src/lib/api-client.ts`                                          | Contratos tipados portal/API    |
| `apps/api/src/modules/crm/expedientes/entities/expediente-record.entity.ts`  | Estado actual del agregado      |
| `apps/api/src/modules/crm/attributions/entities/sales-attribution.entity.ts` | Historial comercial actual      |

---

## 3. Alcance tecnico

### Portal

1. Reemplazar visualmente las secciones separadas por una sola seccion `Gestion comercial y operativa`.
2. Crear jerarquia visual con este orden:
   - Responsable actual
   - Interes del cliente
   - Origen de la oportunidad
   - Atribucion comercial
   - Historial comercial
   - Historial operativo
3. Renombrar labels para reducir ambiguedad.
4. Mantener permisos diferenciados para correccion del originador.

### API / Backend

1. Introducir el concepto explicito de `responsable actual` en el agregado o en un contrato equivalente si aun no existe.
2. Mantener separado el concepto de originador comercial.
3. Crear historial operativo separado del historial comercial.
4. Exponer contratos claros para:
   - obtener responsable actual
   - reasignar responsable actual manualmente
   - listar historial operativo
5. Reutilizar `sales_attributions` para historial comercial solo si la semantica sigue clara.

---

## 4. Decisiones no negociables

1. `Canal de captacion` pertenece a `Origen de la oportunidad`.
2. `Detalle de origen` pertenece al mismo bloque y no debe duplicarse con otro significado.
3. `Originador comercial` no es igual a `Responsable actual`.
4. `Responsable actual` cambia manualmente.
5. `Originador comercial` solo puede corregirse por `ADMIN`.
6. El historial comercial y el historial operativo deben mantenerse separados.
7. No automatizar reasignacion por estado en esta fase.

---

## 5. Trabajo esperado en frontend

### 5.1 Rediseño de la vista detalle

En `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`:

1. Eliminar la lectura fragmentada entre `Interes comercial` y `Atribucion comercial`.
2. Introducir una sola seccion visual `Gestion comercial y operativa`.
3. Crear un resumen superior con:
   - responsable actual
   - rol si existe
   - fecha de ultima asignacion
   - CTA de reasignacion
4. Ubicar `Originador comercial` mas abajo, nunca al mismo nivel principal del responsable actual.

### 5.2 Labels y UX

Actualizar naming en `expediente-ui.ts` para usar:

| Antes             | Despues                       |
| ----------------- | ----------------------------- |
| Interes comercial | Interes del cliente           |
| Origen del lead   | Origen de la oportunidad      |
| Bloque combinado  | Gestion comercial y operativa |

### 5.3 Historiales

La vista debe renderizar dos bloques distintos:

1. `Historial comercial`
2. `Historial operativo`

No usar una lista unica mezclada.

---

## 6. Trabajo esperado en backend

### 6.1 Estado actual del expediente

Revisar `ExpedienteRecord` y sus DTOs para introducir o normalizar:

```typescript
currentResponsibleUserId?: string | null;
currentResponsibleAssignedAt?: Date | null;
```

Si el proyecto ya tiene un campo equivalente, reutilizarlo en lugar de duplicarlo.

### 6.2 Historial operativo

Crear una entidad o mecanismo dedicado para movimientos operativos del responsable actual.

Campos minimos esperados:

```typescript
id: uuid;
tenantId: uuid;
expedienteId: uuid;
previousResponsibleUserId: uuid | null;
newResponsibleUserId: uuid;
changedBy: uuid;
changedAt: timestamptz;
notes: string | null;
```

### 6.3 Contratos API nuevos o ajustados

Definir contratos para:

| Metodo     | Endpoint sugerido                                    | Proposito                             |
| ---------- | ---------------------------------------------------- | ------------------------------------- |
| GET        | `/api/v1/crm/expedientes/:id/responsibility`         | Obtener responsable actual + metadata |
| POST/PATCH | `/api/v1/crm/expedientes/:id/responsibility`         | Reasignar responsable actual          |
| GET        | `/api/v1/crm/expedientes/:id/responsibility/history` | Listar historial operativo            |

Puedes ajustar naming del endpoint si el modulo ya tiene una convención mejor, pero la separacion conceptual es obligatoria.

### 6.4 Atribucion comercial

Mantener `sales_attributions` como historial comercial, cuidando que en contratos y UI ya no se comunique como si fuera el responsable actual del caso.

---

## 7. Testing minimo obligatorio

### Backend

1. Reasignar responsable actual crea historial operativo.
2. Reasignar responsable no cambia originador comercial.
3. Corregir originador comercial exige permisos admin.
4. Corregir originador sin motivo falla si la regla se implementa en esta fase.

### Frontend

1. La nueva seccion unificada renderiza sin duplicidad conceptual.
2. `Responsable actual` aparece arriba del bloque.
3. `Originador comercial` aparece en su subbloque propio.
4. `Canal de captacion` y `Detalle de origen` se muestran dentro de `Origen de la oportunidad`.
5. Existen bloques separados para historial comercial y operativo.

---

## 8. Restricciones

1. No mezclar historial comercial y operativo en una sola tabla o timeline visual sin etiquetas claras.
2. No automatizar la asignacion del responsable por cambio de estado.
3. No introducir logica de incentivos, payout o comisiones.
4. No romper multi-tenancy por schema.
5. No usar strings de rol fuera de `UserRole.*`.
6. No introducir PII nueva en logs, tests ni docs.

---

## 9. Entregables esperados

| #   | Entregable                                                         |
| --- | ------------------------------------------------------------------ |
| 1   | Nueva seccion visual `Gestion comercial y operativa` en el detalle |
| 2   | Contrato tipado para responsable actual                            |
| 3   | Mecanismo de reasignacion manual                                   |
| 4   | Historial operativo separado                                       |
| 5   | Historial comercial conservado y clarificado                       |
| 6   | Ajustes de labels y UX para origen de la oportunidad               |
| 7   | Tests backend y frontend de no regresion conceptual                |

---

## 10. Criterios de aceptacion

1. Un usuario puede distinguir claramente `quien tiene el caso ahora` de `quien trajo el cliente`.
2. El origen de la oportunidad no se confunde con atribucion o reasignacion interna.
3. El responsable actual se puede cambiar manualmente.
4. El cambio de responsable actual queda en historial operativo.
5. El cambio de originador comercial queda en historial comercial.
6. La interfaz deja de mostrar dos secciones con semantica superpuesta.

---

## 11. Stop / Go

- **Stop si:** la implementacion propone fusionar originador y responsable actual en el mismo concepto de datos.
- **Stop si:** se intenta resolver la reasignacion por automatismos de pipeline en esta fase.
- **Go si:** la separacion entre origen, atribucion comercial y responsabilidad operativa queda clara en API, UI y tests.
