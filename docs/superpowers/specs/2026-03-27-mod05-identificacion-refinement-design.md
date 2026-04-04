# MOD05 Identificacion Refinement Design

**Version:** 1.0  
**Estado:** Aprobado con ajustes documentales  
**Fecha:** 2026-03-27  
**Autor:** AI-EM-ARCH  
**Modo activo:** Mixto  
**PRD de referencia:** `docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md`  
**HLD de referencia:** `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md`  
**ADR de referencia:** `docs/adrs/ADR-024-Migracion-CRM-Expediente-Unico.md`  
**Informe soporte:** `docs/informes/INFORME-MOD05-DEFINICION-v1.0.md`

---

## 1. Proposito

Refinar la seccion **Identificacion** del detalle de `Expediente Unico Progresivo` para soportar correctamente persona natural y persona juridica, mostrar el numero de documento en la vista autorizada de detalle, y cambiar la UX de captura desde una edicion siempre abierta hacia un patron de lectura bloqueada con habilitacion explicita por icono de edicion.

El objetivo es corregir fricciones operativas reales del CRM sin abrir una fase nueva ni alterar boundaries aprobados del modulith.

---

## 2. Problema actual

En el estado actual del repo, la seccion `Identificacion` presenta estas limitaciones:

1. Solo modela el formulario como `fullName`, `documentType` y `documentNumber`, sin distinguir adecuadamente entre persona natural y juridica.
2. El backend ya dispone de `personType` y `companyName`, pero la UI no los explota de forma operativa.
3. El numero de documento permanece oculto en el detalle porque el backend devuelve `documentNumberEncrypted` nulificado o solo como placeholder protegido.
4. Tras guardar una seccion, los campos quedan inmediatamente reeditables, lo que favorece cambios accidentales y dificulta diferenciar modo lectura vs modo edicion.

---

## 3. Alcance aprobado

- Refactor funcional de la seccion `Identificacion` dentro de `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`.
- Ajuste del contrato backend/frontend para exponer el numero de documento desencriptado solo en una respuesta de detalle autorizada y auditada.
- Validacion backend diferenciada por tipo de persona en `updateSection(identification)`.
- Persistencia y normalizacion de campos de identificacion para persona natural y juridica.
- Estado de solo lectura despues de guardar, con reactivacion explicita mediante icono de edicion.
- Cobertura de pruebas unitarias y de flujo principal.

Fuera de alcance en este refinamiento:

- Rediseñar el listado de expedientes.
- Exponer documento completo en listados o busquedas masivas.
- Reestructurar las 8 secciones del expediente.
- Cambiar boundaries con Subscribers, Contacts o modulos externos.

---

## 4. Decisiones de diseno

### 4.1 Unica seccion dinamica de identificacion

Se mantiene una sola seccion `Identificacion`, pero su formulario y validaciones cambian dinamicamente segun `personType`.

Valores aprobados:

- `PERSONA_NATURAL`
- `PERSONA_JURIDICA`

### 4.2 Campos por tipo de persona

#### Persona natural

- `personType`
- `firstName`
- `lastName`
- `documentType`
- `documentNumber`

#### Persona juridica

- `personType`
- `companyName`
- `primaryContactName`
- `primaryContactRole`
- `documentType`
- `documentNumber`

### 4.3 Compatibilidad con `fullName`

`fullName` se conserva como campo maestro legado/operativo del expediente por compatibilidad con el modelo actual y con el resto del modulo.

Regla aprobada:

- Si `personType = PERSONA_NATURAL`, `fullName = firstName + ' ' + lastName` normalizado.
- Si `personType = PERSONA_JURIDICA`, `fullName = companyName` normalizado.

El frontend no define `fullName` como fuente de verdad. El backend lo recalcula al persistir la seccion.
El backend debe ignorar, sobrescribir o normalizar cualquier `fullName` enviado por el cliente si no coincide con las reglas derivadas del `personType`.

### 4.4 Catalogo cerrado de tipo de documento

`documentType` pasa de texto libre a lista desplegable.

Catalogo base aprobado:

- `CC`
- `CE`
- `TI`
- `NIT`
- `PASAPORTE`
- `PEP`
- `PPT`
- `OTRO`

Este catalogo vive en frontend como opcion visible y en backend como validacion cerrada de la seccion.

### 4.5 Numero de documento visible solo en detalle

Se aprueba mostrar el numero de documento desencriptado en la vista detalle autorizada del expediente.

Restriccion obligatoria:

- El listado de expedientes y cualquier respuesta masiva deben seguir sin exponer PII.
- La desencriptacion se limita a una respuesta puntual de detalle autorizado, nunca a listados ni respuestas masivas.
- El contrato debe ser aditivo: el valor visible no reemplaza `documentNumberEncrypted` como campo persistido canonico.
- El acceso al documento visible debe restringirse al contexto autenticado autorizado del portal bajo RBAC vigente.
- El acceso a este dato debe dejar trazabilidad de auditoria y no puede registrarse en logs el valor plano.

### 4.5.1 Contrato de API para PII en detalle

La respuesta del detalle del expediente debe separar el dato persistido cifrado del dato visible autorizado.

Regla aprobada:

- `documentNumberEncrypted` sigue siendo el campo persistido en el modelo.
- el frontend consume un campo aditivo de lectura, por ejemplo `documentNumber`, solo en el detalle autorizado;
- el backend no debe exponer este valor en listados, filtros devueltos al cliente, logs de aplicacion ni eventos de auditoria con payload plano.

### 4.5.2 Precondicion funcional y regulatoria

Este refinamiento asume que el actor autenticado del portal ya opera dentro del contexto autorizado del expediente. La necesidad de una precondicion adicional de consentimiento o validacion legal especifica para revelar documento en detalle queda marcada como **requiere verificacion con fuente oficial y criterio funcional aprobado** si el PRD vigente no la cierra de forma explicita.

### 4.6 UX bloqueada tras guardar

Despues de guardar la seccion `Identificacion`:

- la vista vuelve a modo lectura;
- los inputs quedan bloqueados;
- aparece un icono/boton de edicion para habilitar cambios;
- si el usuario cancela, se restauran los datos persistidos.

La intencion es reducir edicion accidental y dejar mas claro cuando el asesor esta consultando versus modificando datos sensibles.

### 4.7 No reutilizar campos ambiguos

No se reutiliza `altContactName` para el contacto principal de persona juridica.

Decision:

- crear campos explicitos para el contacto principal juridico;
- mantener separados el contacto principal empresarial y los contactos alternos u operativos ya existentes.
- `primaryContactName` y `primaryContactRole` representan al representante principal o interlocutor principal de la razon social dentro de Identificacion y no reemplazan los contactos de seguimiento comercial u operativo de la seccion `Contacto`.

---

## 5. Modelo de datos objetivo

### 5.1 Campos existentes a reutilizar

- `personType`
- `companyName`
- `documentType`
- `documentNumberEncrypted`
- `fullName`

### 5.2 Campos nuevos requeridos

Se aprueba agregar de forma aditiva los siguientes campos al expediente:

- `firstName`
- `lastName`
- `primaryContactName`
- `primaryContactRole`

Implementacion esperada:

- migracion tenant aditiva y reversible a nivel de columnas;
- actualizacion de entidad TypeORM;
- inclusion en contrato API del detalle.

Este cambio debe trazarse como addendum arquitectonico del modelo vigente de MOD05 porque introduce nuevas columnas funcionales no presentes en la spec base `docs/superpowers/specs/SPEC-MOD05-EXPEDIENTE-UNICO-v1.0.md`.

### 5.3 Reglas de normalizacion

- Cambio a persona natural: `companyName`, `primaryContactName`, `primaryContactRole` pasan a `null`.
- Cambio a persona juridica: `firstName` y `lastName` pasan a `null`.
- Todos los strings se guardan `trim()`.
- `documentNumber` se cifra nuevamente cuando cambia.

---

## 6. Comportamiento frontend esperado

### 6.1 Vista lectura

Cuando la seccion ya tiene datos persistidos, el usuario ve tarjetas o filas de lectura en lugar de textboxes editables.

Contenido visible:

- Tipo de persona
- Nombres y apellidos, o razon social
- Tipo de documento
- Numero de documento
- Contacto principal y cargo, cuando aplique

### 6.2 Vista edicion

Se habilita con icono de lapiz en la cabecera de la seccion.

Comportamiento:

- se reemplaza la vista lectura por inputs/selects;
- al guardar, vuelve a lectura;
- al cancelar, descarta cambios locales y vuelve a lectura.

### 6.3 Cambio de tipo de persona

Al cambiar `personType` en modo edicion:

- la UI muestra solo los campos aplicables;
- se limpian en estado local los campos incompatibles;
- se mantiene `documentType` y `documentNumber` mientras sigan siendo validos para el flujo.

---

## 7. Validaciones backend

La validacion especifica de `ExpedienteSection.IDENTIFICATION` debe aplicar estas reglas:

### 7.1 Para persona natural

Requeridos:

- `personType`
- `firstName`
- `lastName`
- `documentType`
- `documentNumber`

### 7.2 Para persona juridica

Requeridos:

- `personType`
- `companyName`
- `primaryContactName`
- `primaryContactRole`
- `documentType`
- `documentNumber`

### 7.3 Reglas comunes

- `documentType` debe pertenecer al catalogo aprobado.
- `documentNumber` no puede quedar vacio si se esta guardando identificacion.
- `fullName` se reconstruye siempre en backend.
- El payload parcial no puede dejar el expediente en un estado inconsistente segun el tipo de persona seleccionado.

---

## 8. Impacto por archivos

### 8.1 Backend

- `apps/api/src/modules/crm/expedientes/entities/expediente-record.entity.ts`
- `apps/api/src/modules/crm/expedientes/expediente.service.ts`
- `apps/api/src/modules/crm/expedientes/dto/update-section.dto.ts`
- `packages/database/src/migrations/tenant/` o `packages/database/src/migrations/tenant/*.ts` para la migracion aditiva
- pruebas de `expediente.service.spec.ts` y controlador si aplica

### 8.2 Frontend

- `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
- `apps/portal/src/lib/api-client.ts`
- `apps/portal/src/components/crm/expedientes/expediente-ui.ts`

### 8.3 Documentacion viva

- `docs/informes/INFORME-MOD05-DEFINICION-v1.0.md`

---

## 9. Pruebas requeridas

### 9.1 Backend

- valida persona natural con campos requeridos;
- valida persona juridica con campos requeridos;
- recalcula `fullName` segun `personType`;
- desencripta `documentNumber` en detalle;
- sigue ocultando PII en listados.
- audita el acceso al documento visible sin persistir el valor plano en logs o auditorias.

### 9.2 Frontend

- render condicional de campos por tipo de persona;
- bloqueo de la seccion despues de guardar;
- reactivacion de edicion por icono;
- cancelacion restaura valores persistidos.

### 9.3 E2E / flujo

- editar identificacion de persona natural;
- guardar y verificar modo bloqueado;
- habilitar edicion otra vez;
- editar identificacion de persona juridica y validar campos visibles.

---

## 10. Riesgos y mitigaciones

| Riesgo                                         | Impacto                              | Mitigacion                                                                                     |
| ---------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Expedientes legacy solo con `fullName`         | Lectura incompleta de datos antiguos | Fallback de lectura mientras no existan campos nuevos                                          |
| Exposicion indebida de PII                     | Riesgo de seguridad/compliance       | Limitar documento visible solo al detalle autenticado, con RBAC, auditoria y sin logs en plano |
| Mezcla semantica con contactos existentes      | Ambiguedad operativa                 | Campos explicitos para contacto principal juridico                                             |
| Cambio de tipo de persona deja basura de datos | Inconsistencia                       | Normalizacion a `null` de campos incompatibles                                                 |

---

## 11. Criterio de aceptacion

Se considera completo cuando:

1. El operador puede diferenciar persona natural y juridica en `Identificacion`.
2. La UI muestra campos distintos segun el tipo seleccionado.
3. `documentType` se captura mediante lista desplegable.
4. El numero de documento se muestra en detalle del expediente.
5. Tras guardar, la seccion queda bloqueada.
6. Solo se reabre mediante accion explicita de editar.
7. Las pruebas cubren validacion, persistencia, seguridad basica y flujo principal.

---

## 12. Decision final

Se aprueba ejecutar este refinamiento como evolucion acotada de MOD05 sobre el flujo ya implementado, sin abrir una nueva fase y manteniendo multi-tenant por schema, zero-trust PII en respuestas masivas y compatibilidad aditiva con ADR-024.
