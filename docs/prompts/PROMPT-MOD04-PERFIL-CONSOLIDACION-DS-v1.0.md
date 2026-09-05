# PROMPT — MOD04 Perfil: consolidacion contra el design system

**Agente destinatario:** AI-FE-PLATFORM
**Modulo:** MOD04 Usuarios internos — superficie frontend, con alcance transversal declarado
**Emitido por:** AI-EM-ARCH · 2026-09-03 · gate G4
**Origen:** [INFORME-MOD04-PERFIL-PORTAL-AUDITORIA-v1.0](../informes/INFORME-MOD04-PERFIL-PORTAL-AUDITORIA-v1.0.md) — hallazgos P-08, P-11, P-12, P-13, P-14

> **CONTRATO DE COMPONENTE CONGELADO:** [`docs/specs/2026-09-03-contrato-formstatus-sectionheader.md`](../specs/2026-09-03-contrato-formstatus-sectionheader.md) **v1.0**, aprobado por AI-DS-OWNER via carril rapido (protocolo §3bis.3). Se implementa **contra esa spec**, no contra criterio propio. Un cambio del contrato exige bump a v1.1 y adenda de EM-ARCH a este prompt; sin adenda, sigue vigente v1.0.

---

## 1. Objetivo exacto de la fase

El modulo de perfil reimplementa a mano piezas que el sistema ya expone, y en el camino incumple SC 4.1.3. Esta fase crea las dos primitivas que faltaban, adopta las que ya existian, y retira codigo muerto.

**Se ejecuta en dos olas** (la tercera se retiro a turno propio, §5). La ola 1 es condicion de la segunda. No las mezcles en un commit.

## 2. Artefactos de entrada obligatorios

1. `AGENTS.md`; la spec congelada citada arriba.
2. El informe de origen, §2 y §3.5.
3. **Referencia canonica del propio portal:** `apps/portal/src/components/settings/CompanyProfileForm.tsx:246-274`. Resuelve el mismo caso de uso (formulario de perfil con RHF+Zod, error de servidor, exito y dirty-guard) con `PortalAlert` y `Button loading={isSubmitting} disabled={isSubmitting || !isDirty}`. **Calca ese patron**; no inventes uno tercero.
4. Skills: `core-components`, `tailwind-patterns`, `iwana-identity-ui-review`, `wcag-audit-patterns`, `frontend-dev-guidelines`.

---

## 3. Ola 1 — crear las dos primitivas y adoptarlas en `profile/`

### Paso 1.1 — `FormStatus` y `SectionHeader` en `packages/ui`

Implementa ambos **exactamente** segun la spec congelada. Los dos puntos que no son negociables porque son la razon de ser del contrato:

- **`FormStatus` con `status="idle"` renderiza el contenedor vacio, no `null`.** Si lo montas condicionalmente, el componente no sirve para nada: region y contenido entrarian al DOM en el mismo tick y el lector de pantalla seguiria sin anunciar el resultado — que es el defecto P-08 con mejor apariencia.
- **`SectionHeader` exige `headingLevel` sin default.** `PersonalInfoForm` necesita `h2` arriba y `h3` en la subseccion de email; un default silencioso rompe el orden de encabezados.

Ambos componen tokens existentes. **Cero tokens nuevos.** `FormStatus` delega en `alertVariants` de `Alert.tsx`; el eyebrow de `SectionHeader` delega en `FormSectionTitle`.

Exportalos desde `packages/ui/src/index.ts` (barrel plano, sin sub-barrels: respeta la convencion del archivo).

### Paso 1.2 — adoptarlas en los cuatro archivos del perfil

- Sustituye las **tres copias** del par error/exito (`PersonalInfoForm.tsx:192-203,245-256`; `ChangePasswordForm.tsx:110-121`) por `FormStatus` montado siempre.
- Sustituye las **tres copias** del encabezado de seccion (`PersonalInfoForm.tsx:143-156` y `:213-224`; `ChangePasswordForm.tsx:65-80`) por `SectionHeader`. La tercera es la variante degradada que motiva los ejes `size="sm"` y `tone="secondary"`.
- `ProfileClient.tsx:95-102`: el `<button>` crudo pasa a `Button variant="softDestructive"`. Hoy **no tiene `focus-visible` de ningun tipo** y depende del outline del navegador.
- Los tres submits pasan a usar la prop `loading` de `Button` (`Button.tsx:65,78-105`), que ya aporta spinner y `aria-busy`, en vez del swap manual de texto.
- Con `autoDismissMs` del contrato desaparecen los tres `setTimeout` y su divergencia 3000/4000 ms.
- `ProfileHeader.tsx:24-27`: el `aria-label` esta sobre un `<div>` sin rol y ARIA lo descarta; ademas es redundante con el nombre visible. Usa `role="img"` con la etiqueta, o retirala.
- **`ProfileHeader.tsx:30`: retira el punto verde de "en linea".** Decision de EM-ARCH (informe §3.4): codifica un estado que el modelo de datos no tiene, contrasta 1,74:1 y contradice el badge cuando el usuario esta suspendido.
- `PersonalInfoForm.tsx:219` vs `:152`: unifica la descripcion en `text-gray-500 dark:text-gray-400`.

### Paso 1.3 — retirar codigo muerto y la superficie que arrastra

`apps/portal/src/lib/gravatar.ts` son **143 lineas de MD5 escrito a mano sin un solo importador** (verificado). Borralo. Y con el:

- `apps/portal/next.config.ts:46` — retira `https://www.gravatar.com` de la CSP `img-src`.
- `apps/portal/next.config.ts:93` — retira el `remotePattern` de ese host.
- `ProfileClient.tsx:17` — el comentario dice "header Gravatar" y el header usa iniciales desde el primer dia.

**Verifica antes de borrar** que sigue sin importadores: `grep -rn "lib/gravatar" apps/ packages/`.

---

## 4. Ola 2 — politica de contrasenas: una sola fuente

**P-14.** Hay seis reglas divergentes en doce superficies. Las consecuencias son reales: `ChangePasswordForm.tsx:13` acepta `currentPassword` de un caracter contra un backend que exige diez, y como el `catch` solo mapea 401/403, el 400 resultante sale como error generico. Y dos flujos del **mismo portal** contra el **mismo endpoint** aplican politicas distintas.

1. Sube a `packages/shared/src/constants/` las constantes que hoy viven en `apps/api/src/modules/users/dto/user-field-constraints.ts` — `USER_PASSWORD_MIN`, `USER_PHONE_E164_PATTERN`, `USER_FIELD_MAX` —, que el propio archivo declara "fuente unica" pero es inalcanzable desde los frontends por boundary.
2. Reescribe `packages/shared/src/schemas/auth.schema.ts` sobre esas constantes. **Atencion:** hoy `changePasswordSchema` exige min **8**, mas debil que el backend (min 10). Quien lo adoptara produciria 400s. El minimo pasa a 10.
3. Consume el schema unico desde el portal en los dos flujos: `ChangePasswordForm.tsx` y `app/auth/change-password/page.tsx`.
4. Alinea el `catch` de `ChangePasswordForm.tsx:52-59`: hoy solo mapea 401/403. Mapea tambien 400 mostrando el detalle de validacion, y 409 donde aplique.
5. **`currentPassword` no lleva regla de longitud en el cliente. Solo "campo requerido" (`min(1)`).** La politica de complejidad aplica unicamente a `newPassword`. Validar longitud sobre la contrasena **actual** no aporta seguridad — el servidor la compara contra el hash — y convierte cualquier credencial legada corta en una cuenta que no puede cambiar su propia contrasena. Corrige tambien `PersonalInfoForm.tsx:39`, que hoy exige `min(10)` en la confirmacion del cambio de email con el mensaje enganoso *"Debes confirmar con tu contrasena actual"*. El espejo backend (`ChangePasswordDto.currentPassword` con `@MinLength(10)`) lo retira AI-SR-FULL: emite `[CONSULTA]`.

**El endurecimiento del backend ya esta aprobado** (CTO, 2026-09-03) y lo ejecuta AI-SR-FULL en el Paso 7 de su prompt: `newPassword` con complejidad NIST, y `@MinLength(10)` retirado de `currentPassword`. **La politica del cliente y la del servidor deben quedar identicas al cerrar ambas fases** — si la tuya entra antes, el desfase es transitorio y lo declaras en el reporte; si al cerrar sigue habiendo divergencia, es `[BLOQUEO]`.

---

## 5. Ola 3 (`Avatar`) — RETIRADA de esta fase

**P-12 sale de este prompt por decision de EM-ARCH, aprobada por el CTO el 2026-09-03.** Pasa a turno propio: [PROMPT-TRANSVERSAL-AVATAR-CONTRATO-v1.0](PROMPT-TRANSVERSAL-AVATAR-CONTRATO-v1.0.md).

**Por que se retira, y no por falta de valor:** es la unica de las tres olas que no arregla ningun defecto funcional ni de seguridad, y a la vez la que mas superficie de regresion toca — seis sitios en dos aplicaciones. Mezclarla aqui convertia un prompt acotado al perfil en uno que cruza medio repositorio. Ademas necesita contrato de DS-OWNER antes de escribirse: crear un componente del design system sin contrato es exactamente lo que produjo las seis divergencias que viene a cerrar.

**No toques `ProfileHeader.tsx:18-19` ni ningun otro calculo de iniciales en esta fase.** Si al migrar el resto te tienta unificarlos, no lo hagas: `[CONSULTA]` a AI-DS-OWNER.

---

## 6. Restricciones no negociables

1. **No introduzcas tokens nuevos ni radios arbitrarios.** `rounded-[20px]` y `[18px]` desaparecen del perfil hacia `rounded-xl`; los 44 usos del resto del repo **estan escalados al CTO y quedan fuera** — parchearlos aqui crearia una tercera isla.
2. **No unifiques los tres eyebrows del repo.** Escalado igualmente: son unas 80 llamadas. Aqui solo el contrato delega en `FormSectionTitle`.
3. **No migres los banners inline fuera de `profile/`** (21 de error + 10 de exito en el portal). El contrato queda congelado por esta fase; la ola de migracion se calendariza aparte.
4. **No toques `apps/web`** salvo lo estrictamente necesario para que `SectionHeader` viva en `packages/ui` sin romper compilacion.
5. No cambies comportamiento funcional. Si al migrar detectas un defecto de logica, `[CONSULTA]`, no lo arregles de paso: los defectos funcionales tienen su propio prompt y su propio commit.
6. Texto visible en espanol, sentence case. Dark mode completo y sin `dark:bg-gray-{700,800,900,950}`.

## 7. Entregables

- Olas 1 y 2 implementadas. La ola 3 esta **fuera de esta fase** (§5): no debe aparecer nada de `Avatar` ni de iniciales en tu diff.
- Tests de los dos componentes nuevos en `packages/ui`, incluyendo el invariante que da sentido al contrato: **`FormStatus` con `status="idle"` renderiza la region viva en el DOM**.
- Evidencia a11y con `jest-axe` (ya registrado en `apps/portal/src/jest.setup.ts:4-6`) sobre el perfil renderizado y sobre un formulario con errores visibles.
- Reporte de fase con el recuento de markup retirado y las divergencias declaradas.

## 8. Evidencia de gate exigida

```bash
pnpm --filter @iwana/ui exec jest --ci
pnpm --filter @iwana/portal exec jest --ci --testPathPattern='components/profile/.*\.spec\.tsx$'
pnpm lint && pnpm typecheck
```

Jest invocado directo, **nunca** `pnpm --filter @iwana/portal test`: ese script arrastra `--passWithNoTests` y sale 0 sin ejecutar nada.

## 9. Criterio de stop/go

**STOP y emite `[BLOQUEO]` a AI-EM-ARCH si:**

- Implementar `FormStatus` segun la spec exige un token que no existe.
- Subir las constantes a `@iwana/shared` rompe un import de `apps/api` por boundary.
- La ola 2 obliga a cambiar la politica del backend y SR-FULL no lo acepta en su fase.
- Borrar `gravatar.ts` revela un importador que el barrido no vio.

**GO si:** olas 1 y 2 cerradas, contrato implementado fielmente, evidencia a11y sin violaciones, gates en verde, ningun token ni radio nuevo introducido, y **ningun cambio de avatar o iniciales** en el diff.
