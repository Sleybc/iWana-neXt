# PROMPT — MOD04 Perfil: defectos funcionales bloqueantes (P0)

**Agente destinatario:** AI-FE-PLATFORM
**Modulo:** MOD04 Usuarios internos — superficie frontend de perfil propio
**Emitido por:** AI-EM-ARCH · 2026-09-03 · gate G4
**Origen:** [INFORME-MOD04-PERFIL-PORTAL-AUDITORIA-v1.0](../informes/INFORME-MOD04-PERFIL-PORTAL-AUDITORIA-v1.0.md) — hallazgos P-01, P-03, P-06, P-15

---

## 1. Objetivo exacto de la fase

Cerrar los defectos funcionales que impiden declarar cerrado el modulo Usuarios. Son cuatro, y dos de ellos rompen la pantalla para usuarios reales. **No es una fase de refactor**: la consolidacion contra el design system va en un prompt aparte y no debe mezclarse en este commit.

## 2. Artefactos de entrada obligatorios

1. `AGENTS.md` y `.github/copilot-instructions.md`.
2. El informe de origen, §2 (hallazgos) y §3.3 (semantica de borrado ya decidida).
3. `docs/hlds/HLD-MOD04-USUARIOS-INTERNOS-v1.2.md` — la v1.1 esta superada (describia un componente eliminado y declaraba "sin desalineaciones").
4. Skills: `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `typescript-expert`.

## 3. Instrucciones

### Paso 1 — P-01: el UUID que viaja como slug de tenant

`userApi.getMe` tiene la firma `(tenantSlug?: string)` (`apps/portal/src/lib/api-client.ts:5031`), y su propio comentario dice *"sin param userId"*. Dos call sites siguen pasandole el id del usuario:

- `apps/portal/src/components/profile/ProfileClient.tsx:39` → `userApi.getMe(user.id)`
- `apps/portal/src/components/auth/AuthProvider.tsx:90` → `userApi.getMe(userId)`

**Corrige los dos.** El segundo esta fuera de `components/profile/` pero es el mismo defecto de la misma funcion: dejarlo vivo seria cerrar la mitad de un bug.

Ambos parametros son `string`, asi que el compilador nunca lo vio. **Cierra tambien esa puerta**: introduce un tipo de marca para el slug de tenant (por ejemplo `type TenantSlug = string & { readonly __brand: 'TenantSlug' }`) y tipa con el los parametros `tenantSlug` de `userApi`, de modo que pasar un id crudo deje de compilar. Si el coste de propagarlo a las 20 funciones con esa firma resulta desproporcionado, acotalo a `userApi` y **declara la decision** en el reporte de fase; no lo amplies sin consultar.

### Paso 2 — P-03: el prefijo telefonico que rompe el guardado

En `apps/portal/src/components/profile/PersonalInfoForm.tsx`:

- `:69` — `defaultPhone = profile.phone ?? phonePrefix` siembra el prefijo desnudo (`'+57'`) como **valor** del campo. Debe usarse solo como `placeholder`, que ya existe en `:179`. Si el usuario no tiene telefono, el campo arranca **vacio**.
- `:33` — el esquema Zod valida `max(20)` pero no el formato que el label promete. Replica el patron real del backend: `/^\+\d{7,15}$/` (`apps/api/src/modules/users/dto/user-field-constraints.ts:20`), con mensaje en espanol y sentence case. Un campo vacio sigue siendo valido: es opcional.

Mueve `COUNTRY_PHONE_PREFIX` (`:17-28`) fuera del componente. Es una tabla de datos de dominio, no UI. Ubicacion: `packages/shared/src/constants/`, junto con el patron E.164 — hoy el regex esta escrito a mano en `apps/portal/src/components/users/BulkImportUsersModal.tsx:136` y definido en `apps/api`, inalcanzable desde el portal por boundary.

### Paso 3 — P-06: permitir vaciar un campo opcional

`PersonalInfoForm.tsx:104-108` usa comprobacion de verdad, asi que un campo vaciado nunca llega al backend. **La semantica ya esta decidida** (informe §3.3):

> `undefined` = no tocar · `null` = borrar · `''` no es un valor valido y no se envia.

El backend ya la implementa (`users.service.ts:1554-1561`). Del lado del cliente: emite `null` cuando el campo quedo vacio **y antes tenia valor**, y omite la clave cuando no cambio.

Esto **requiere un cambio de una linea en el backend** que no puedes hacer tu: los campos con `@Matches` (`phone`) rechazan `null` con `@IsOptional()` a secas. Emite `[CONSULTA]` a AI-SR-FULL, que lo cubre en su prompt de seguridad; **no bloquees por ello** — implementa el cliente y deja el caso de `phone: null` cubierto por test marcado como pendiente de esa correccion.

### Paso 4 — P-15: los cuatro bordes

- **`reset()` ausente.** Tras un `updateMe` exitoso, `PersonalInfoForm` no re-basa sus `defaultValues`: `isDirty` sigue en `true` y el boton queda habilitado. El formulario de email de la misma pantalla si lo hace (`:132`); calca ese patron con el objeto **que devuelve el servidor**, no con los valores del formulario.
- **Skeleton desalineado.** `ProfileClient.tsx:71-81` usa un grid de 3 hijos con ratio `1.5fr/0.9fr`, contra un layout real de 2 hijos con `3fr/2fr` y el header fuera del grid (`:119`). Alinea el esqueleto con la estructura real.
- **`setTimeout` sin cleanup**, tres veces (`PersonalInfoForm.tsx:113,134`; `ChangePasswordForm.tsx:51`). Con el contrato `FormStatus` esto desaparece via `autoDismissMs`, pero **ese componente llega en otro prompt**: aqui limita el alcance a limpiar los timers en `useEffect`, sin adelantar el refactor.
- **`throw` inalcanzable.** `ProfileClient.tsx:46` lanza un `Error` cuyo mensaje descarta su propio `catch` en `:53`. Ademas ese `catch {}` ciego impide distinguir 401 de 500: captura el error, y si es `ApiError` con status 401, propaga la condicion de sesion en vez de mostrar "No fue posible cargar tu perfil".

### Paso 5 — exponer el documento de identidad en el formulario

**Decisión del CTO del 2026-09-03**, formalizada en [ADR-086](../adrs/ADR-086-Acceso-Titular-Documento-Perfil-Propio.md) (propuesto) y [PRD-MOD04 v1.2](../prds/PRD-MOD04-USUARIOS-INTERNOS-v1.2.md).

`PATCH /users/me` acepta siete campos y el formulario muestra cuatro. Anade `documentType` y `documentNumber` a `PersonalInfoForm`, con las restricciones reales del DTO (`documentNumber` `@MaxLength(30)`; `documentType` es un enum — usa el label en espanol de `getPortalDocumentTypeLabel`, **nunca el enum crudo**).

**Por que este paso no es cosmetico:** hoy el backend devuelve la cedula en cada carga del perfil y la pantalla no la muestra. Ese dato viajaba sin finalidad, que era la objecion real de la auditoria. **ADR-086 (propuesto) §4 ata la autorizacion a que la UI lo renderice**: si este paso no se hace, la proyeccion debe retirarse del backend en su lugar. No es opcional dejarlo a medias.

Un campo vacio sigue siendo valido — son opcionales — y aplica la misma semantica de borrado del Paso 3.

## 4. Restricciones no negociables

1. **No toques la superficie del design system.** Nada de `FormStatus`, `SectionHeader`, `Alert` ni migracion de banners: eso es `PROMPT-MOD04-PERFIL-CONSOLIDACION-DS-v1.0` y su contrato aun no esta implementado.
2. **No toques backend.** Si necesitas un cambio alli, `[CONSULTA]` a AI-SR-FULL.
3. Texto visible en espanol, sentence case, sin enums crudos. Los mensajes de Zod sin texto explicito emiten en ingles: revisa que ningun `max(100)` quede sin mensaje.
4. Sin `any` explicito, sin promesas flotantes, imports sin ciclos.
5. **El diff en vuelo entra en tu commit.** `PersonalInfoForm.tsx` ya tiene sin commitear la correccion `updateMe(userId, dto)` → `updateMe(dto)`. Es el defecto hermano de P-01; incluyelo con su test en lugar de dejarlo suelto.

## 5. Entregables

- Codigo de los cinco pasos.
- **No crees archivos `*.spec.tsx`.** Son propiedad de AI-SR-QA (plan de fase §8.1): cuando entras, los 9 casos bloqueantes ya existen y **estan en rojo**. Tu entregable es ponerlos en verde. Si un invariante que corriges no tiene caso, pideselo a QA — no escribas el spec tu, o el merge colisiona.
- Reporte de fase con: decision sobre el alcance del tipo de marca, `[CONSULTA]` emitida a SR-FULL, y evidencia de gate.

## 6. Evidencia de gate exigida

**No uses `pnpm --filter @iwana/portal test`**: el script del paquete lleva `--passWithNoTests` (`apps/portal/package.json:10`) y sale 0 aunque no ejecute nada. Invoca jest directo:

```bash
pnpm --filter @iwana/portal exec jest --ci --testPathPattern='components/profile/.*\.spec\.tsx$'
```

Adjunta al reporte la linea `Tests: N passed` y ademas `pnpm lint` y `pnpm typecheck` en verde.

## 7. Criterio de stop/go

**STOP y emite `[BLOQUEO]` a AI-EM-ARCH si:**

- El tipo de marca obliga a tocar mas de `userApi` y no tienes criterio para acotarlo.
- Descubres un tercer call site de `getMe` con el mismo defecto fuera de los dos declarados.
- La correccion de P-06 exige cambiar la forma del DTO compartido y no solo admitir `null`.

**GO si:** los cuatro defectos estan corregidos, cada uno con test que lo fija, lint y typecheck en verde, y ningun cambio fuera del alcance declarado.

## 8. Fuera de alcance (no lo hagas aqui)

Consolidacion DS, avatar, politica de contrasenas, `gravatar.ts`, y cualquier archivo de `apps/web`. Todo eso tiene prompt propio o esta escalado.
