# Design — Sistema de botones iWana neXt · Fase 02 web

**Versión:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-05-04  
**Modo activo:** Mixto  
**Rol ejecutor:** Senior Developer Fullstack  
**Gobierno:** AI-EM-ARCH

---

## 1. Contexto

La Fase 01 dejó resuelta la primitive `Button` y la migración prioritaria de `apps/portal`, pero mantuvo fuera de alcance tres superficies relevantes de `apps/web` para evitar expansión de fase. Esa deuda quedó documentada en el informe vivo y ahora pasa a ser el alcance principal de continuación.

Fase 02 se enfoca en homologar la plataforma web con la gramática ya aprobada:

> Command Pill + Utility Icon para acciones visibles, repetidas e irreversibles.

Además, esta fase debe cerrar la deuda formal de evidencia before/after que quedó abierta al finalizar la Fase 01.

## 2. Alcance aprobado

La fase queda limitada a tres superficies concretas:

- `apps/web/src/components/dashboard/TenantsTable.tsx`
- `apps/web/src/components/users/UserManagementModal.tsx`
- `apps/web/src/components/tenants/TenantBrandingForm.tsx`

También incluye:

- ajustes de pruebas focalizadas en `apps/web`;
- actualización del informe vivo de botones;
- cierre formal de evidencia visual before/after cuando el entorno lo permita.

Fuera de alcance:

- barrido general de `apps/web`;
- cambios de API, auth, tenancy, roles, permisos o flujo funcional;
- nuevos tokens globales o nuevas primitives fuera del sistema actual;
- refactor transversal del patrón dropdown o modal más allá de lo necesario para esta fase.

## 3. Alternativas evaluadas

### Opción A — Fase 02 estricta por superficies

Migrar solo los tres candidatos auditados y cerrar evidencia pendiente.  
**Ventaja:** controla riesgo y deja una entrega trazable.  
**Desventaja:** no barre inconsistencias menores fuera del alcance.

### Opción B — Fase 02 transversal ampliada en `apps/web`

Expandir el barrido a otras inconsistencias encontradas durante la ejecución.  
**Ventaja:** aumenta consistencia inmediata.  
**Desventaja:** mezcla migración con auditoría abierta y eleva deriva de alcance.

### Opción C — Documentación primero

Crear artefactos nuevos de fase y posponer código.  
**Ventaja:** gobernanza fuerte.  
**Desventaja:** retrasa una deuda ya delimitada y comprobada.

## 4. Dirección elegida

Se aprueba **Opción A — Fase 02 estricta por superficies**.

La fase se organiza en dos frentes:

1. **Migración priorizada en `apps/web`**  
   Resolver semántica visual y accesible de acciones en tabla, modal y formulario de branding.

2. **Cierre de evidencia y trazabilidad**  
   Completar la evidencia comparativa y consolidar la continuidad documental entre Fase 01 y Fase 02.

## 5. Estrategia por superficie

### 5.1 `TenantsTable.tsx`

Problema actual:

- trigger icon-only de tres puntos con affordance débil;
- acciones operativas y destructivas dentro de dropdown;
- badges de estado ya resueltos como información pasiva, sin necesidad de cambio funcional.

Dirección de fase:

- reforzar el trigger para que se perciba como control interactivo gobernado;
- mantener el dropdown existente, sin rediseñar su patrón estructural;
- asegurar nombre accesible y foco visible consistentes con la gramática aprobada;
- no convertir pills de estado en acciones.

### 5.2 `UserManagementModal.tsx`

Problema actual:

- conviven varias acciones operativas con una acción destructiva fuerte;
- la acción irreversible debe quedar claramente jerarquizada sin competir con acciones de mantenimiento.

Dirección de fase:

- mantener la eliminación como acción destructiva explícita;
- revisar jerarquía visual y affordance para que no compita innecesariamente con guardar o resetear contraseña;
- preservar el flujo actual del modal y sus callbacks.

### 5.3 `TenantBrandingForm.tsx`

Problema actual:

- `Eliminar imagen` usa un patrón destructivo manual local;
- la acción de limpiar slot y la de subir activo deben distinguirse mejor dentro del sistema visual.

Dirección de fase:

- migrar `Eliminar imagen` al patrón destructivo gobernado;
- mantener `Seleccionar archivo` como acción operativa no destructiva;
- conservar el comportamiento incremental de upload y limpieza por slot.

## 6. Testing, evidencia y documentación

### 6.1 Testing

Se deben tocar solo los tests afectados:

- `apps/web/src/components/users/UserManagementModal.spec.tsx`
- `apps/web/src/components/tenants/TenantBrandingForm.spec.tsx`
- cobertura nueva o ampliada para `TenantsTable` si sigue sin prueba directa

El foco de prueba es:

- nombre accesible;
- continuidad de callbacks;
- presencia de acciones correctas;
- semántica de interacción, no pixel-perfect styling.

### 6.2 Evidencia visual

La fase debe producir evidencia before/after de las superficies web intervenidas y, en la medida posible, cerrar la deuda pendiente arrastrada desde Fase 01.

Si alguna captura before no puede recuperarse de forma íntegra por estado del workspace o falta de baseline vivo, la causa debe quedar documentada explícitamente.

### 6.3 Informe vivo

El informe de botones debe consolidar:

1. Fase 01: primitive + portal
2. Fase 02: plataforma web priorizada + cierre de evidencia

## 7. Criterios de salida

- `TenantsTable`, `UserManagementModal` y `TenantBrandingForm` quedan alineados a la gramática aprobada.
- No cambia la lógica funcional de dropdowns, modal ni formulario.
- Los controles críticos tienen affordance y nombre accesible correctos.
- La evidencia visual queda archivada con estado explícito de before/after.
- El informe vivo registra validaciones, archivos tocados, deuda remanente y estado go/stop.

## 8. Riesgos y stop/go

La fase se detiene si:

- resolver `TenantsTable` exige rediseñar el patrón shared de dropdown y no solo su affordance;
- la eliminación en `UserManagementModal` requiere nuevo flujo de confirmación no previsto;
- `TenantBrandingForm` necesita una primitive nueva o tokens globales para verse correcto;
- obtener evidencia before real exige revertir trabajo ya aprobado de Fase 01.

En esos casos corresponde documentar bloqueo y escalar a EM-ARCH antes de ejecutar cambios mayores.

## 9. Referencias

- [SPEC-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md](../../specs/SPEC-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md)
- [PLAN-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md](../../plans/PLAN-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md)
- [INFORME-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md](../../informes/INFORME-TRANSVERSAL-BOTONES-SISTEMA-FASE-01-v1.0.md)
- [2026-05-04-sistema-botones-fase-01-design.md](./2026-05-04-sistema-botones-fase-01-design.md)
