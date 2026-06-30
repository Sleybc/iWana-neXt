# Design - MOD00 lenguaje visible para Access en portal

**Version:** 1.0
**Estado:** En revisión
**Fecha:** 2026-05-27
**Modo activo:** Empresarial claro
**Origen:** pasada de copy aprobada para hacer comprensible `/dashboard/settings/access` a usuario final sin perder tono SaaS B2B
**ADR rector:** `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
**PRD rector:** `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
**HLD relacionado:** `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
**Spec base relacionada:** `docs/specs/2026-05-25-mod00-roles-de-empresa-design.md`
**Informe vivo:** `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

---

## 1. Objetivo

Reducir el lenguaje tecnico visible en `/dashboard/settings/access` para que un administrador de empresa comprenda mejor la pantalla sin entrenamiento previo en conceptos internos de Access Control.

La pantalla debe conservar precision funcional, pero dejar de depender de terminologia interna como `plantilla del sistema`, `categoria base compatible`, `modulo`, `matriz` o `perfil configurable` cuando exista una alternativa mas clara para negocio.

---

## 2. Direccion aprobada

Se aprueba el modo de copy **empresarial claro**:

1. lenguaje menos tecnico, pero todavia formal;
2. prioridad a comprension operativa sobre exactitud terminologica interna;
3. mantener `perfil` y `acceso` como conceptos centrales;
4. evitar explicaciones largas o pedagogicas dentro de la UI.

---

## 3. Modelo mental aprobado

La pantalla debe hablar de tres cosas:

1. **Perfiles sugeridos** que sirven como punto de partida.
2. **Perfiles personalizados** que la empresa crea y ajusta.
3. **Accesos** que cada perfil permite por sección.

El usuario no necesita entender en UI final:

1. diferencia entre `AccessProfile`, `UserRole` o `AccessPermissionKey`;
2. la nocion interna de `módulo` como taxonomía técnica;
3. el concepto backend de `compatibilityMatrix`.

---

## 4. Reglas de copy

### 4.1 Terminos preferidos

| Concepto interno | Termino visible aprobado |
| --- | --- |
| rol de empresa | perfil de acceso |
| plantilla inicial / plantilla del sistema | perfil sugerido |
| permisos | accesos |
| módulo | sección |
| categoría base compatible | tipo de usuario permitido |
| usar como base | crear a partir de este perfil |

### 4.2 Terminos aceptables que pueden mantenerse

| Termino | Condicion |
| --- | --- |
| guardar | accion primaria corta y clara |
| activo / inactivo | estado operativo comun |
| administrador | categoria entendible para negocio |

### 4.3 Terminos a evitar en UI final

1. matriz
2. configurable
3. compatible, salvo cuando no exista alternativa mas natural
4. sistema, cuando `sugerido` o `predefinido` comunique mejor
5. modulo, si `sección` cubre el mismo significado

---

## 5. Mapa de renombres propuesto

### 5.1 Encabezado y paneles

- `Roles de empresa` → `Perfiles de acceso`
- `Diseña roles de empresa, define qué permisos incluye cada uno y gestiona las plantillas del sistema.`
  → `Crea perfiles de acceso, define lo que puede usar cada uno y apóyate en perfiles sugeridos para empezar más rápido.`
- `Plantillas iniciales` → `Perfiles sugeridos`
- `Estas plantillas del sistema te dan un punto de partida para crear o ajustar roles de empresa.`
  → `Estos perfiles sugeridos te ayudan a crear nuevos perfiles de acceso con menos trabajo manual.`
- `Roles personalizados` → `Perfiles personalizados`
- `Crea roles de empresa personalizados y define qué funciones puede usar cada uno.`
  → `Crea perfiles propios para tu empresa y define qué puede hacer cada uno.`
- `Permisos del rol` → `Accesos del perfil`
- `Administra por módulo los permisos del rol de empresa {nombre}.`
  → `Administra por sección lo que puede ver o hacer {nombre}.`

### 5.2 Tabla y metadata

- `Rol de empresa` → `Perfil`
- `Categoría base` → `Tipo de usuario`
- `Permisos` → `Accesos`
- `Acción` → `Acciones`
- `Sin roles de empresa configurados` → `Aún no has creado perfiles personalizados`
- `Todavía no hay roles de empresa configurados para tu organización.`
  → `Cuando crees tu primer perfil, aparecerá aquí para que puedas editarlo y revisar sus accesos.`

### 5.3 Acciones

- `Ver accesos` → `Ver lo que permite`
- `Usar como base` → `Crear a partir de este perfil`
- `Configurar` → `Editar accesos`
- `Seleccionado` → `En edición`
- `Crear rol` → `Crear perfil`
- `Guardar permisos` o `Guardar` en este contexto → `Guardar cambios`

### 5.4 Modales y drawers

- `Crear nuevo rol de empresa` → `Crear nuevo perfil`
- `¿Cómo quieres empezar a diseñar el nuevo rol?` → `¿Cómo quieres crear este perfil?`
- `Usar una plantilla` → `Usar un perfil sugerido`
- `Parte de una plantilla del sistema para configurar el rol más rápido.`
  → `Empieza con un perfil sugerido y ajusta solo lo necesario.`
- `Empezar desde cero` se mantiene, pero su descripción cambia a:
  `Crea el perfil desde cero y define sus accesos paso a paso.`
- `Crear rol` en diálogo → `Crear perfil`
- `Editar rol` → `Editar perfil`
- `Permisos de la plantilla` → `Lo que permite este perfil`

### 5.5 Editor de secciones

- `Ajusta solo los permisos del módulo {x}.` → `Ajusta solo los accesos de la sección {x}.`
- `Buscar permiso dentro del módulo` → `Buscar acceso dentro de esta sección`
- `Sin coincidencias en este módulo` → `No encontramos accesos en esta sección`
- `No hay permisos adicionales para esta categoría base en este momento.`
  → `No hay más accesos disponibles para este tipo de usuario en este momento.`
- `Elige un rol de empresa del listado para revisar o modificar sus permisos.`
  → `Elige un perfil de la lista para revisar o cambiar sus accesos.`

---

## 6. Criterios de calidad

La pasada de copy se considera correcta si cumple esto:

1. un usuario entiende que la pantalla sirve para crear y ajustar perfiles de acceso;
2. la nocion de `perfil sugerido` se entiende sin explicar el backend;
3. `accesos` y `secciones` reemplazan lenguaje tecnico donde no haya perdida funcional;
4. los botones principales describen la accion en lenguaje de negocio;
5. no se introduce copy excesivamente largo ni informal.

---

## 7. Alcance de implementacion

### Entra

1. textos visibles del encabezado;
2. textos de paneles, botones, vacios, descripciones y estados del modulo;
3. textos de modal de creacion/edicion y drawer de vista previa;
4. labels y placeholders del editor de accesos.

### No entra

1. renombrar contratos backend, enums o tipos TypeScript;
2. cambiar nombres de endpoints, DTOs o entidades;
3. modificar copy de otros módulos fuera de `/dashboard/settings/access`;
4. reestructurar el flujo visual del módulo más allá de ajustes menores de ancho si el nuevo copy lo requiere.

---

## 8. Impacto esperado en pruebas

Se espera actualización de pruebas que hoy dependan de nombres exactos como:

1. `Crear rol`
2. `Ver accesos`
3. `Permisos del rol`
4. `Catálogo de permisos`
5. labels del diálogo y del buscador

La lógica y el comportamiento no cambian; el impacto es principalmente en asserts de texto accesible y contenido visible.

---

## 9. Recomendacion final

Implementar esta pasada como un barrido coherente del módulo completo en una sola iteración, no como cambios aislados de etiquetas. El riesgo principal no es técnico, sino semántico: mezclar copy viejo y nuevo dejaría una UI más confusa que la actual.
