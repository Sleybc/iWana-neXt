# INFORME-MOD04-USUARIOS-AUDITORIA-UIUX-v1.0

## Auditoría de identidad, accesibilidad, copy y UX — "Usuarios y accesos" del portal

**Versión:** 1.0  
**Estado:** Vigente  
**Fecha:** 2026-08-18  
**Modo activo:** Ejecutor  
**Autor de consolidación:** OpenCode  
**Módulo:** MOD04 — Usuarios internos  
**Superficie:** `apps/portal/src/app/dashboard/users` y `apps/portal/src/components/users`  
**Skills aplicadas:** `iwana-identity-ui-review` · `senior-ui-systems-designer` · `ui-ux-pro-max` · `docs-architect`

**Artefactos relacionados:**

- [PRD-MOD04-USUARIOS-INTERNOS-v1.1](../prds/PRD-MOD04-USUARIOS-INTERNOS-v1.1.md)
- [ADR-065 — Paginación numerada y orden por columna](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md)
- [Diseño — Dirección visual "Firma iWana"](../specs/2026-07-12-firma-iwana-diseno-visual-design.md)
- [Tokens de identidad de la skill](../../.agents/skills/iwana-identity-ui-review/references/tokens.md)
- [Elementos de firma de la skill](../../.agents/skills/iwana-identity-ui-review/references/firma-elements.md)

---

## 1. Resumen ejecutivo

La superficie **"Usuarios y accesos"** del portal queda **aprobada** desde la perspectiva de identidad iWana, accesibilidad estructural, copy y patrones de interacción revisados.

**Resultado consolidado:**

| Severidad | Resultado |
| --- | --- |
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 2 provisionales, ambos descartados por contexto |

No se requiere plan de remediación para esta auditoría. Los dos P3 detectados mecánicamente corresponden a indicadores de carga de acciones puntuales, no a spinners usados como carga primaria de la vista.

La revisión fue estática y mecánica sobre el código fuente. No constituye una auditoría completa de seguridad, una prueba E2E ni una medición de contraste computado en navegador.

---

## 2. Alcance y método

### 2.1 Alcance revisado

- Listado operativo de usuarios internos.
- Búsqueda, filtros y paginación.
- Estados de carga, vacío, error y éxito.
- Alta, edición, eliminación y reinicio de contraseña.
- Importación masiva desde CSV.
- Asignación de roles y preview de permisos.
- Mensajes y labels visibles del módulo.
- Controles de accesibilidad estructural presentes en acciones y estados.

### 2.2 Fuentes de evidencia

| Fuente | Resultado |
| --- | --- |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/users apps/portal/src/app/dashboard/users --json` | 0 P0 · 0 P1 · 0 P2 · 2 P3 provisionales |
| `UsersTable.tsx` | Skeletons, empty states accionables, primitives de tabla y acciones con estados accesibles |
| `UsersClient.tsx` | Panel operativo, banners de importación, recuperación de errores y composición del flujo |
| `BulkImportUsersModal.tsx` | Flujo de importación, validación, polling, credenciales temporales y guards de cierre |
| `can-delete-user.ts` | Reglas de autorización de eliminación y razones visibles para el usuario |
| `company-role-preview.ts` | Derivación de perfiles y permisos sin duplicación de permisos |
| `users-query.ts` | Estado canónico de filtros y paginación en URL, alineado a ADR-065 |
| `portal-ui.tsx` y `@iwana/ui` | Revisión de primitives compartidas usadas por la superficie |

---

## 3. Veredicto por criterio

| Criterio | Veredicto | Evidencia principal |
| --- | --- | --- |
| Identidad iWana | Cumple | `UsersClient.tsx:617-621`, `BulkImportUsersModal.tsx:622-627`, tokens semánticos en la superficie |
| Estados de carga | Cumple | `UsersTable.tsx:295-305` usa `PortalSkeletonBlock` para la carga inicial |
| Empty states | Cumple | `UsersTable.tsx:314-349` distingue sin resultados de primera vez y ofrece acción |
| Copy de producto | Cumple | `user-labels.ts`, labels en español y sentence case; no se exponen enums crudos |
| Accesibilidad estructural | Cumple | `aria-busy`, `aria-label`, `aria-describedby`, `sr-only`, `role="status"` y `aria-live` |
| RBAC visible | Cumple | `can-delete-user.ts:25-85` refleja restricciones y comunica motivos de bloqueo |
| Importación masiva | Cumple | `BulkImportUsersModal.tsx:183-1145`, flujo con estados recuperables y entrega única de credenciales |
| Paginación y filtros | Cumple | `users-query.ts:23-88`, parámetros canónicos y reinicio de página al filtrar |

---

## 4. Hallazgos

### P0

Ninguno.

### P1

Ninguno.

### P2

Ninguno.

### P3 provisionales descartados

#### P3-1 — Spinner en acción de edición de fila

- **Evidencia:** `apps/portal/src/components/users/UsersTable.tsx:129-143`.
- **Detección mecánica:** `Loader2` con `animate-spin` en la acción de edición.
- **Contexto:** el spinner sustituye temporalmente el icono de edición de una fila mientras se prepara ese usuario; el botón permanece con `aria-busy` y no representa la carga primaria de la tabla.
- **Decisión:** descartado. Es un indicador de acción puntual aceptable para un botón de icono.
- **Acción:** ninguna.

#### P3-2 — Spinner de procesamiento de importación masiva

- **Evidencia:** `apps/portal/src/components/users/BulkImportUsersModal.tsx:879-905`.
- **Detección mecánica:** `Loader2` con `animate-spin` y color primario.
- **Contexto:** está dentro de un estado explícito de progreso con `role="status"`, `aria-live="polite"`, texto "Procesando lote" y resumen de registros procesados. La importación continúa en segundo plano y puede reanudarse desde el banner del listado.
- **Decisión:** descartado. No es un spinner bloqueante de la página o de la tabla; comunica una operación asíncrona en curso.
- **Acción:** ninguna.

---

## 5. Evidencia de cumplimiento

### 5.1 Identidad y tokens

- El panel principal usa `PortalPanel` con eyebrow **"Directorio"**, título **"Listado de usuarios"** y descripción operativa (`UsersClient.tsx:617-621`).
- El modal de importación usa el eyebrow **"Gestión de accesos"** (`BulkImportUsersModal.tsx:620-627`).
- El texto de acento lima usa `iwana-secondary-700` en el enlace **"Volver atrás"** (`BulkImportUsersModal.tsx:770-775`), evitando lima DEFAULT como texto sobre blanco.
- Las superficies de apoyo usan `iwana-surface-soft` y `dark-surface-*` en los estados de progreso y resultado (`BulkImportUsersModal.tsx:891-905`, `925-945`).
- El CTA de primera creación usa `variant="primary"` (`UsersTable.tsx:340-347`), coherente con la regla de que lima no es el CTA filled por defecto de una vista operativa.
- El blob lima al 5% aparece solo en el empty state de primera vez (`UsersTable.tsx:330-334`), uso permitido por la dirección Firma iWana.

### 5.2 Estados de carga y vacío

- La tabla muestra filas skeleton durante la carga inicial (`UsersTable.tsx:295-305`), en lugar de un spinner primario.
- El estado filtrado usa **"Sin resultados"**, explica la causa y ofrece **"Limpiar filtros"** (`UsersTable.tsx:313-328`).
- El estado de primera vez usa **"Aún no hay usuarios"**, explica el siguiente paso y ofrece **"Nuevo usuario"** (`UsersTable.tsx:329-349`).
- Los errores del listado ofrecen **"Reintentar"** (`UsersClient.tsx:598-614`).

### 5.3 Accesibilidad y RBAC

- Las acciones de fila tienen labels contextualizados con el email (`UsersTable.tsx:129-167`).
- La acción de edición comunica su estado ocupado con `aria-busy` (`UsersTable.tsx:134-140`).
- Cuando la eliminación está bloqueada, el motivo se expone mediante `aria-describedby` y un texto `sr-only` (`UsersTable.tsx:162-173`).
- `can-delete-user.ts` evita autoeliminación, protege roles de plataforma, respeta la regla ADMIN/SYSTEM_ADMIN y bloquea la eliminación del administrador principal (`can-delete-user.ts:34-54`).
- El progreso de importación y sus resultados usan `role="status"` y `aria-live="polite"` (`BulkImportUsersModal.tsx:879-924`, `1052-1084`).

### 5.4 Importación masiva y manejo de secretos

- El archivo CSV se valida por extensión, tamaño, cantidad de usuarios, columnas obligatorias y errores por fila (`BulkImportUsersModal.tsx:390-475`).
- El job tiene idempotencia, polling y reanudación desde `sessionStorage`/banner (`BulkImportUsersModal.tsx:210-388`, `500-535`).
- Las contraseñas temporales se advierten como entrega única y se ofrecen acciones explícitas para copiar o descargar (`BulkImportUsersModal.tsx:941-979`).
- El cierre se protege mientras hay una importación en curso o mientras las credenciales no se han guardado (`BulkImportUsersModal.tsx:245-265`, `640-685`).
- El estado local elimina las contraseñas reclamadas al reiniciar o cerrar el flujo (`BulkImportUsersModal.tsx:174-181`, `218-237`).

---

## 6. Decisión y disposición

**Decisión:** aprobar la superficie "Usuarios y accesos" sin cambios de UI derivados de esta auditoría.

**Disposición:**

- No abrir tareas de remediación P0-P2.
- No modificar los dos spinners detectados: ambos son estados de acciones puntuales o de procesos asíncronos explícitos.
- Mantener `PortalEmptyState`, `PortalSkeletonBlock`, `PortalAlert` y `PortalPanel` como primitives normativas de la superficie.
- Mantener el label visible **"Usuarios y accesos"** en el menú principal de Administración del portal.
- Mantener la gestión de usuarios del tenant en `apps/portal`; `apps/web` queda fuera del flujo operativo del tenant, conforme al PRD de MOD04.

---

## 7. Límites y deuda no bloqueante

- Esta revisión no sustituye una auditoría de seguridad backend ni una verificación E2E.
- No se ejecutó una medición de contraste computado en navegador en esta fase.
- Las tablas de preview y credenciales del modal usan `<table>` nativo estilizado localmente (`BulkImportUsersModal.tsx:788-859`, `987-1041`). Se considera aceptable porque son tablas técnicas internas del modal y no listados operativos; no se abre deuda P3.

---

## 8. Cierre

La superficie auditada cumple la dirección visual Firma iWana y los patrones operativos del portal revisados. Presenta estados de carga, vacío, error, progreso y éxito con acciones comprensibles; copy localizado; controles RBAC visibles; y manejo explícito de credenciales temporales.

**Veredicto final:** **Aprobada — 0 P0 · 0 P1 · 0 P2 · 0 P3 accionables.**

No se incluyen PII, secretos, credenciales ni tokens en este informe.
