# SPEC - MOD09 Programacion / WFM Franja Operativa de Agendamiento

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-11  
**Modo activo:** Mixto  
**Autor:** AI-EM-ARCH  
**Perfil aplicado:** docs/roles/Perfil_IA_EM_Architect_Unificado_v1.md  
**Aprobacion:** CTO humano, 2026-05-11  
**PRD base:** docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md  
**HLD vigente:** docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md  
**ADR vigente:** docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md  
**Spec relacionada:** docs/specs/SPEC-MOD09-PROGRAMACION-WFM-COMMAND-CENTER-v1.0.md  
**Informe vivo:** docs/informes/INFORME-MOD09-FASE-02-v1.0.md

---

## 1. Contexto y decision

El formulario de creacion de eventos WFM usa actualmente dos controles `datetime-local`: inicio programado y fin programado. Esta interaccion delega al operador el calculo manual de la duracion, abre selectores nativos del navegador fuera del sistema visual iWana y aumenta friccion en un flujo repetitivo de agendamiento.

La decision aprobada para ejecucion Full Stack es reemplazar ese modelo visible por una **franja operativa compacta**:

1. una sola fecha de visita,
2. una hora de inicio,
3. una duracion estimada,
4. una hora de fin calculada y no editable.

El contrato externo del backend se conserva: el formulario debe seguir enviando `scheduledStartAt` y `scheduledEndAt` hacia WFM.

---

## 2. Objetivo de ejecucion

Implementar una experiencia de agendamiento coherente con la identidad iWana, reduciendo la carga cognitiva del operador sin reabrir el bounded context WFM ni modificar el contrato REST existente.

El resultado esperado es que un usuario pueda agendar una instalacion indicando, por ejemplo:

- fecha: `2026-05-11`,
- hora de llegada: `08:30`,
- duracion: `2 h 30 min`,
- fin calculado: `11:00`.

Al guardar, el sistema transforma esos valores a `scheduledStartAt` y `scheduledEndAt` en formato compatible con el API actual.

---

## 3. Alcance

### En alcance

- Redisenar la seccion de programacion en `ScheduleEventForm`.
- Sustituir los dos campos visibles `datetime-local` por fecha, hora de inicio, duracion y fin calculado.
- Mantener compatibilidad con creacion de eventos desde scheduling general y desde expediente CRM.
- Mantener validaciones de duracion minima, fin posterior al inicio y payload final.
- Actualizar pruebas unitarias del formulario.
- Validar typecheck y tests del portal.
- Actualizar el informe vivo de MOD09 con la evidencia del cambio.

### Fuera de alcance

- Crear endpoints nuevos.
- Cambiar tablas, entidades o migraciones.
- Introducir drag-and-drop, realtime, mapa, disponibilidad avanzada o capacity planning.
- Cambiar el flujo de transicion CRM posterior a la creacion WFM.
- Crear una libreria de calendario reusable para todo el monorepo en esta fase.

---

## 4. Diseno funcional de la UI

### 4.1 Seccion visible

La seccion debe presentarse como `Programacion` dentro del formulario existente.

Composicion desktop:

| Control | Comportamiento |
| --- | --- |
| Fecha de visita | Selector de un solo dia, con valor requerido. |
| Hora de llegada | Selector de hora en intervalos de 15 minutos. |
| Duracion estimada | Controles rapidos y opcion manual. |
| Termina | Valor calculado, readonly, con fecha si cruza medianoche. |

Composicion mobile:

- una columna,
- controles con altura tactil suficiente,
- chips de duracion con wrap estable,
- sin overlays que tapen el CTA principal de forma irreversible.

### 4.2 Copy aprobado

Usar texto visible en espanol y sentence case:

- `Programacion`
- `Fecha de visita`
- `Hora de llegada`
- `Duracion estimada`
- `Termina`
- `Duracion rapida`
- `Personalizada`
- `La duracion minima es de 15 minutos`
- `La hora de fin debe ser posterior al inicio`

No renderizar enums crudos ni textos tecnicos del payload.

### 4.3 Duraciones rapidas

Duraciones iniciales aprobadas:

| Label | Minutos |
| --- | ---: |
| `45 min` | 45 |
| `1 h` | 60 |
| `1 h 30 min` | 90 |
| `2 h` | 120 |
| `2 h 30 min` | 150 |
| `3 h` | 180 |

Valor por defecto recomendado por tipo:

| Tipo de evento | Duracion por defecto |
| --- | ---: |
| `INSTALLATION` | 120 minutos |
| `MAINTENANCE` | 90 minutos |
| `TROUBLESHOOTING` | 60 minutos |
| Otro tipo soportado | 60 minutos |

### 4.4 Duracion personalizada

La opcion personalizada debe permitir ajustar horas y minutos sin texto libre ambiguo.

Reglas:

- minimo: 15 minutos,
- paso recomendado: 15 minutos,
- maximo inicial: 12 horas,
- mostrar error si el valor es invalido,
- conservar seleccion rapida si el valor coincide con una duracion predefinida.

---

## 5. Diseno visual y sistema iWana

La interfaz debe aplicar la identidad iWana: fresca, vanguardista, minimalista y equilibrada.

Reglas visuales:

1. No usar `datetime-local` visible ni depender del picker nativo del navegador para el flujo principal.
2. Usar tokens existentes de `@iwana/ui` y Tailwind v4 CSS-first.
3. Azul noche iWana como color principal para texto, bordes activos y foco.
4. Lima iWana solo como acento de confirmacion o estado activo; para texto sobre blanco usar `iwana-secondary-700`.
5. Mantener densidad operativa: nada de hero, cards decorativas ni explicaciones extensas dentro del modal.
6. Estados `hover`, `focus-visible`, `disabled`, `readonly` y `error` deben ser evidentes.
7. El campo `Termina` debe sentirse calculado: superficie neutra, iconografia o label auxiliar discreto, sin cursor de edicion.

Recomendacion de estructura visual:

```text
Programacion
[ Fecha de visita ] [ Hora de llegada ]
[ Duracion estimada                  ]
[ 45 min ] [ 1 h ] [ 1 h 30 min ] [ 2 h ] [ 2 h 30 min ] [ 3 h ] [ Personalizada ]
[ Termina: 11:00 ]
```

---

## 6. Contrato tecnico frontend

### 6.1 Archivos probables

- `apps/portal/src/components/scheduling/ScheduleEventForm.tsx`
- `apps/portal/src/components/scheduling/ScheduleEventForm.spec.tsx`
- opcional: `apps/portal/src/components/scheduling/schedule-event-time.ts`
- opcional: `apps/portal/src/components/scheduling/ScheduleTimeFields.tsx`

### 6.2 Estado interno recomendado

El formulario puede seguir usando `react-hook-form` y `zod`, pero el modelo visible debe separar la entrada humana del payload API.

Campos visibles sugeridos:

```ts
type ScheduleEventFormTimeFields = {
  scheduledDateLocal: string;
  scheduledStartTimeLocal: string;
  durationMinutes: number;
};
```

Payload final hacia API:

```ts
type ScheduleEventApiTimePayload = {
  scheduledStartAt: string;
  scheduledEndAt: string;
};
```

### 6.3 Transformacion obligatoria

El submit debe calcular:

```ts
scheduledStartAt = combineLocalDateAndTime(scheduledDateLocal, scheduledStartTimeLocal)
scheduledEndAt = addMinutes(scheduledStartAt, durationMinutes)
```

La transformacion debe ser testeable de forma aislada si se extrae a helper.

### 6.4 Edicion y valores iniciales

Si el formulario recibe valores existentes o defaults:

- derivar `scheduledDateLocal` desde `scheduledStartAt`,
- derivar `scheduledStartTimeLocal` desde `scheduledStartAt`,
- derivar `durationMinutes` como diferencia entre inicio y fin,
- si falta fin, aplicar duracion por defecto segun tipo.

---

## 7. Backend y contratos API

No se requiere cambio backend para esta spec si el endpoint actual de WFM ya acepta `scheduledStartAt` y `scheduledEndAt`.

El Sr. Dev Fullstack debe verificar:

1. DTO de creacion de evento mantiene ambos campos requeridos.
2. Validacion backend rechaza fin menor o igual al inicio.
3. OpenAPI no cambia si no se modifica el contrato.
4. Si se decide reforzar validacion backend, actualizar pruebas y OpenAPI correspondiente.

Decision arquitectonica:

- **Requiere ADR:** No.
- **Requiere CTO:** No.
- **Motivo:** cambio de UX local y transformacion frontend compatible con contrato vigente; no cambia boundary, stack, seguridad ni persistencia.

---

## 8. Accesibilidad, responsive y seguridad

### Accesibilidad

- Cada control debe tener label asociado.
- Chips de duracion deben ser botones con `aria-pressed` cuando aplique.
- El fin calculado debe anunciar cambios relevantes sin ruido excesivo; usar texto visible suficiente antes de `aria-live`.
- Errores deben estar asociados al campo que los produce.
- Navegacion por teclado completa: fecha, hora, chips, personalizada y submit.

### Responsive

- Desktop: grilla de dos columnas donde aporte lectura rapida.
- Mobile: una columna, chips con wrap y sin overflow horizontal.
- Textos no deben solaparse ni truncarse de forma que oculten informacion critica.

### Seguridad y privacidad

- No registrar en consola datos sensibles del expediente, cliente o direccion.
- No incluir PII en tests o fixtures.
- Mantener tenant y autenticacion delegados al cliente API existente.

---

## 9. Testing esperado

### Unit frontend

Actualizar o agregar pruebas para:

1. render de `Fecha de visita`, `Hora de llegada`, `Duracion estimada` y `Termina`.
2. seleccion de duracion rapida recalcula fin.
3. duracion personalizada `2 h 30 min` calcula fin correctamente.
4. inicio `08:30` + duracion `150` produce fin `11:00`.
5. cruce de medianoche muestra fecha del dia siguiente.
6. duracion menor a 15 minutos muestra error.
7. submit envia `scheduledStartAt` y `scheduledEndAt`, no campos visibles internos.
8. flujo desde expediente CRM conserva `expedienteId`, ticket y work order refs cuando aplique.

### Typecheck y lint

Comandos minimos:

```bash
pnpm --filter @iwana/portal test -- ScheduleEventForm.spec.tsx
pnpm --filter @iwana/portal typecheck
```

Si se toca backend:

```bash
pnpm --filter @iwana/api test -- wfm
pnpm --filter @iwana/api typecheck
```

### E2E recomendado si hay tiempo de fase

Cubrir el flujo:

1. abrir expediente listo para instalacion,
2. entrar a `Agendar instalacion`,
3. elegir fecha, hora y duracion,
4. confirmar que se crea evento WFM,
5. verificar retorno o actualizacion de estado esperada.

---

## 10. Definition of Done

La ejecucion se considera completa cuando:

1. El formulario ya no muestra dos campos `datetime-local` para inicio y fin.
2. Hay un solo selector de fecha visible.
3. La hora de fin se calcula desde inicio + duracion.
4. El payload API conserva `scheduledStartAt` y `scheduledEndAt`.
5. La UI respeta tokens iWana y no usa colores ad hoc fuera del sistema.
6. Mobile y desktop no presentan solapamientos ni overflow horizontal.
7. Las pruebas unitarias cubren calculo de duracion y submit.
8. Typecheck de portal pasa.
9. Si se toca backend, pruebas WFM y OpenAPI quedan actualizadas.
10. `docs/informes/INFORME-MOD09-FASE-02-v1.0.md` queda actualizado con evidencia de ejecucion.

---

## Criterio stop/go

**Go:** ejecutar si el cambio se limita a UX, transformacion local y pruebas del formulario.

**Stop y escalar:** detener si la implementacion exige introducir una dependencia externa de calendario, cambiar contrato REST, modificar entidades WFM, alterar transiciones CRM o tocar boundaries entre CRM, WFM y Assurance.

---

## 11. Estado de ejecucion

Implementado en portal el 2026-05-11 con estos resultados:

- `ScheduleEventForm` reemplaza la entrada visible de `Inicio/Fin programado` por `Fecha de visita`, `Hora de llegada`, `Duracion estimada` y `Termina`.
- La transformacion a `scheduledStartAt` y `scheduledEndAt` se mantiene compatible con el API existente.
- La logica temporal quedo aislada en helper dedicado para facilitar pruebas y mantenimiento.
- Validacion ejecutada: `pnpm --filter @iwana/portal test -- ScheduleEventForm.spec.tsx` y `pnpm --filter @iwana/portal typecheck` en verde.
