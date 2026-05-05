# Spec: Contacto Secundario en Expediente

**Fecha:** 2026-03-31  
**Estado:** En revisión  
**Tipo:** Feature  
**Alcance:** Frontend portal (apps/portal)

---

## 1. Objetivo

Agregar campos de contacto secundario (nombre + teléfono) a la sección "Contacto" del detalle de expediente en el portal. Estos campos ya existen en el backend (`altContactName`, `altContactPhoneEncrypted`), solo requieren exposición en UI.

## 2. Contexto

El expediente (`ExpedienteRecord`) en el backend ya tiene:

- `altContactName` (varchar 160) — nombre del contacto alternativo
- `altContactPhoneEncrypted` (varchar 255) — teléfono encriptado del contacto alternativo

La sección "Contacto" actualmente solo muestra `phonePrimary` y `emailPrimary`.

### Estado real del código al 2026-04-01

- El backend **sí guarda** `altContactName` y `altContactPhoneEncrypted` en la actualización de la sección `contact`.
- El backend **no expone todavía** `altContactPhone` desencriptado en la respuesta de detalle, a diferencia de `phonePrimary` y `emailPrimary`.
- El contrato frontend `ExpedienteRecord` ya incluye `altContactName`, pero **no incluye** `altContactPhone` en claro.
- La completitud de la sección hoy depende directamente del arreglo `fields` definido en la UI, por lo que agregar campos allí impactaría el porcentaje salvo que se ajuste la implementación.
- La construcción actual del payload en el portal omite campos vacíos; por tanto, dejar un input en blanco **no limpia** un valor ya persistido si no se define un comportamiento explícito.

Conclusión: aunque el objetivo visible es de frontend, el refinamiento completo requiere un ajuste mínimo de contrato detalle backend + cliente portal.

## 3. Diseño UI

### Ubicación

Sección "Contacto" en `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`

### Estructura

```text
Sección Contacto:
├── Bloque: Contacto principal
├── Teléfono principal     [input existente]
├── Correo principal       [input existente]
│
├── Separador visual sutil
│
├── Bloque: Contacto secundario
├── Nombre contacto alt.  [input NUEVO]
├── Teléfono contacto alt. [input NUEVO]
```

### Campos nuevos

| Campo             | Backend                    | Tipo input | Encriptado             |
| ----------------- | -------------------------- | ---------- | ---------------------- |
| `altContactName`  | `altContactName`           | text       | No                     |
| `altContactPhone` | `altContactPhoneEncrypted` | tel        | Sí (como phonePrimary) |

### Consideraciones

- El teléfono alternativo hereda el mismo comportamiento de encriptación que `phonePrimary`
- El teléfono alternativo debe heredar el mismo helper visual de dato protegido ya registrado
- El campo es opcional
- La sección debe mantener una lectura visual clara entre contacto principal y secundario

## 4. Decisiones de comportamiento aprobadas

### 4.0 Decisión de arquitectura de secciones (OPCIÓN 3)

Se adopta la estructura con responsabilidades separadas por sección:

- `renderFields`: campos visibles en UI.
- `payloadFields`: campos que viajan al backend en guardado de sección.
- `completionFields`: campos que cuentan para porcentaje de completitud.

Objetivo:

- evitar que cada refinamiento de UX altere de forma accidental completitud o contrato de persistencia;
- permitir campos opcionales enriquecidos (como contacto secundario) sin introducir reglas ad hoc por sección.

Shape objetivo sugerido en frontend:

```ts
type SectionConfig = {
   id: string;
   label: string;
   description: string;
   icon: unknown;
   renderFields: readonly string[];
   payloadFields: readonly string[];
   completionFields: readonly string[];
};
```

Ejemplo para Contacto:

```ts
{
   id: 'contact',
   label: 'Contacto',
   description: 'Canales directos para seguimiento comercial.',
   icon: Phone,
   renderFields: ['phonePrimary', 'emailPrimary', 'altContactName', 'altContactPhone'],
   payloadFields: ['phonePrimary', 'emailPrimary', 'altContactName', 'altContactPhone'],
   completionFields: ['phonePrimary', 'emailPrimary'],
}
```

Para `identification`, los 3 arreglos se resuelven dinámicamente por `personType` para mantener la semántica ya implementada.

### 4.1 Completitud

Los campos `altContactName` y `altContactPhone` **no afectan la completitud** de la sección `Contacto` ni la completitud global del expediente.

Implicación técnica:

- no basta con agregarlos al arreglo `contact.fields` actual si ese arreglo sigue siendo fuente del cálculo de completitud;
- la implementación debe separar al menos una de estas dos responsabilidades:
  - `fields` visibles/renderizables;
  - `completionFields` o equivalente para el porcentaje.

### 4.2 Limpieza de valores

Cuando el usuario elimine manualmente el contenido de `altContactName` o `altContactPhone` y guarde la sección:

- el backend debe persistir `null` para esos campos;
- no debe mantenerse silenciosamente el valor anterior.

Implicación técnica:

- el portal debe enviar explícitamente `null` o cadena vacía normalizada para estos campos;
- el backend debe traducir el valor vacío a `null` en `buildSectionUpdate()`.

### 4.3 Contrato de lectura

El detalle del expediente debe exponer:

- `altContactName` en claro;
- `altContactPhone` desencriptado solo en el endpoint de detalle autorizado, nunca en listados.

Implicación técnica:

- el portal no debe intentar reconstruir el valor desde `altContactPhoneEncrypted`;
- el backend debe desencriptar `altContactPhoneEncrypted` en `findById()` igual que ya lo hace con `phonePrimary`.

## 5. Cambios de código

### Archivo: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`

1. **FIELD_LABELS** — agregar:

   ```ts
   altContactName: 'Nombre contacto alternativo',
   altContactPhone: 'Teléfono contacto alternativo',
   ```

2. **FIELD_PLACEHOLDERS** — agregar:

   ```ts
   altContactName: 'Nombre de quien puede contactar',
   altContactPhone: '3001234567',
   ```

3. **SECTIONS** — en `contact.fields`, agregar `altContactName` y `altContactPhone`

    Refinamiento requerido:

   - migrar la estructura de sección a `renderFields`, `payloadFields` y `completionFields`.
   - contacto secundario entra en `renderFields` y `payloadFields`, pero no en `completionFields`.

4. **buildDraftValues** — agregar:

   ```ts
   altContactName: expediente.altContactName ?? EMPTY_VALUE,
    altContactPhone: expediente.altContactPhone ?? previous.altContactPhone ?? EMPTY_VALUE,
   ```

5. **getProtectedFieldHelper** — manejar `altContactPhone` con mensaje similar a `phonePrimary`

6. **Form render** — en la sección contacto, agregar dos Inputs después de `emailPrimary`

7. **Payload de guardado** — normalizar `altContactName` y `altContactPhone` a `null` cuando el usuario vacíe el campo y guarde

8. **Cálculo de completitud** — usar únicamente `completionFields` por sección

9. **Render de formulario** — usar únicamente `renderFields` por sección

### Archivo: `apps/portal/src/lib/api-client.ts`

Agregar al contrato `ExpedienteRecord`:

```ts
altContactPhone?: string | null;
```

### API/Backend

- `PATCH /crm/expedientes/{id}/sections/contact` ya soporta `altContactName` y `altContactPhone`, pero debe confirmarse comportamiento explícito para limpieza a `null`.
- `GET /crm/expedientes/{id}` debe exponer `altContactPhone` desencriptado en la respuesta de detalle.

### Archivo backend: `apps/api/src/modules/crm/expedientes/expediente.service.ts`

1. **findById()** — desencriptar `altContactPhoneEncrypted` y devolver `altContactPhone`
2. **buildSectionUpdate(CONTACT)** — persistir:

```ts
if ('altContactName' in data) {
   result.altContactName = data.altContactName ? String(data.altContactName) : null;
}

if ('altContactPhone' in data) {
   result.altContactPhoneEncrypted = data.altContactPhone
      ? this.encryptValue(String(data.altContactPhone))
      : null;
}
```

1. **Masking** — mantener `altContactPhoneEncrypted = null` en listados y no exponer `altContactPhone` fuera del detalle

## 6. Validaciones

- `altContactPhone`: formato colombiano de teléfono (10 dígitos, inicia en 3)
- `altContactName`: máximo 160 caracteres

Validaciones recomendadas por capa:

- Frontend:
  - feedback inmediato si el teléfono no cumple el patrón esperado;
  - límite visual de caracteres en `altContactName`.
- Backend:
  - validar longitud máxima de `altContactName`;
  - validar el patrón del teléfono antes de cifrarlo, para no persistir basura estructural.

## 7. Comportamiento

- Si el usuario guarda la sección con `altContactName` o `altContactPhone` vacíos, se guarda `null`
- Los campos no son requeridos — la sección puede guardarse sin ellos
- No afecta la completitud del expediente (no se incluyen en cálculo)
- Si el backend devuelve un teléfono alternativo ya registrado, el portal debe mantenerlo visible tras recarga del detalle igual que ocurre con otros campos protegidos

## 8. Criterios de aceptación

### CA-01 Visualización

- la sección `Contacto` muestra `Nombre contacto alternativo` y `Teléfono contacto alternativo` debajo del bloque principal;
- el separador visual no rompe la gramática actual del detalle.

### CA-02 Persistencia

- un valor nuevo en ambos campos se persiste y reaparece al recargar el detalle.

### CA-03 Limpieza

- si el usuario elimina uno o ambos campos y guarda, el detalle vuelve a mostrarlos vacíos.

### CA-04 Seguridad

- `altContactPhone` no aparece en listados;
- `altContactPhoneEncrypted` no se expone al usuario final;
- el helper de dato protegido aparece si ya existe teléfono alternativo persistido.

### CA-05 Completitud

- agregar estos dos campos no modifica el porcentaje de completitud de la sección `Contacto` ni del expediente.

## 9. Fuera de alcance

- No agregar email alternativo (Opción B)
- No crear nueva sección — se integra en Contacto existente
- No rediseñar la estructura completa de sección Contacto
- No cambiar reglas de completitud de otras secciones

## 10. Tasks

- [ ] Agregar `altContactName` y `altContactPhone` a FIELD_LABELS y FIELD_PLACEHOLDERS
- [ ] Migrar configuración de secciones a `renderFields`, `payloadFields`, `completionFields`
- [ ] Ajustar sección Contacto para renderizar nuevos campos sin impactar completitud
- [ ] Agregar a buildDraftValues
- [ ] Agregar getProtectedFieldHelper para altContactPhone
- [ ] Renderizar inputs en formulario de Contacto
- [ ] Extender `ExpedienteRecord` en portal con `altContactPhone`
- [ ] Desencriptar `altContactPhoneEncrypted` en backend para respuesta de detalle
- [ ] Permitir limpieza explícita a `null` en backend y frontend
- [ ] Ajustar guardado para usar `payloadFields` (no `renderFields`)
- [ ] Ajustar cálculo de porcentaje para usar `completionFields`
- [ ] Verificar que el listado siga ocultando PII
- [ ] Ejecutar test manual en <http://localhost:3002>
- [ ] Agregar validación focalizada o E2E mínima del caso

## 11. Recomendación de implementación

Orden sugerido:

1. Migrar `SECTIONS` al esquema triple (`render/payload/completion`) sin cambiar comportamiento funcional existente.
2. Ajustar detalle backend para exponer `altContactPhone` desencriptado.
3. Ajustar `api-client` del portal para incluir `altContactPhone`.
4. Integrar UI de contacto secundario sobre `renderFields`.
5. Implementar limpieza explícita a `null` usando `payloadFields`.
6. Validar con typecheck + E2E focalizado.

## 12. Riesgos y notas

- Si se agregan los campos directamente al arreglo `contact.fields` actual sin separar cálculo, la completitud cambiará y la spec quedará inconsistente.
- Si no se modifica `findById()`, el teléfono alternativo no sobrevivirá correctamente a la recarga visual del detalle.
- Si no se define limpieza explícita, el usuario no podrá borrar un valor ya guardado aunque vacíe el input en UI.
