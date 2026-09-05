# PROMPT — Transversal: contrato de `Avatar` e identidad de persona en la UI

**Agente destinatario:** AI-DS-OWNER (contrato) → luego AI-FE-PLATFORM (implementación y migración)
**Alcance:** transversal — `packages/ui`, `packages/shared`, `apps/portal`, `apps/web`
**Emitido por:** AI-EM-ARCH · 2026-09-03 · gate G4
**Origen:** [INFORME-MOD04-PERFIL-PORTAL-AUDITORIA-v1.0](../informes/INFORME-MOD04-PERFIL-PORTAL-AUDITORIA-v1.0.md) — hallazgo P-12
**Motivo del turno propio:** retirado de [PROMPT-MOD04-PERFIL-CONSOLIDACION-DS-v1.0](PROMPT-MOD04-PERFIL-CONSOLIDACION-DS-v1.0.md) §5 por decisión de EM-ARCH aprobada por el CTO el 2026-09-03

---

## 1. Objetivo exacto

Fijar el contrato de cómo se representa la identidad de una persona en la UI, y unificar las **seis implementaciones divergentes** que hoy conviven. Es un turno de dos actos: **primero el contrato (DS-OWNER), después la migración (FE-PLATFORM)**. No se invierten.

## 2. Por qué es turno propio y no un paso de otra fase

No arregla ningún defecto funcional ni de seguridad — es coherencia visual y deuda —, pero toca **seis sitios en dos aplicaciones**, de modo que su superficie de regresión supera con holgura la del módulo donde se detectó. Incrustarlo en el turno de perfil habría convertido un prompt acotado en uno que cruza medio repositorio.

Y hay una razón de fondo: **crear un componente del design system sin contrato previo es exactamente lo que produjo las seis divergencias**. Repetir el gesto para arreglarlas sería el mismo error con mejor intención.

## 3. Estado verificado

| # | Ruta:línea | Lógica | Fallback |
| --- | --- | --- | --- |
| 1 | `apps/portal/src/components/profile/ProfileHeader.tsx:18-19` | `firstName[0] + lastName[0]` | `'?'` |
| 2 | `apps/portal/src/components/scheduling/ScheduleCalendar.tsx:143-153` | idem, luego `email.slice(0,2)` | email |
| 3 | `apps/portal/src/components/layout/TenantSeal.tsx:22-29` | por palabras; una palabra → `slice(0,2)` | `'?'` |
| 4 | `apps/web/src/components/tenants/TenantCreateSummary.tsx:26-31` | **copia literal de #3** | `'iW'` |
| 5 | `apps/web/src/components/layout/DropdownUser.tsx:30-41` | `displayName[0]` | `'U'` |
| 6 | `apps/web/src/components/users/UsersTable.tsx:77-80` | `firstName \|\| lastName \|\| email` → `charAt(0)` | — |

`apps/portal/src/components/layout/DropdownUser.tsx:57-59` ni siquiera muestra iniciales: pinta un icono genérico. **Consecuencia visible:** para el mismo usuario, el avatar del header del portal y el de su perfil no coinciden.

`@iwana/ui` **no exporta `Avatar`** (verificado contra `packages/ui/src/index.ts`, 24 componentes). Tampoco `Tooltip`.

Duplicación asociada: `[firstName, lastName].filter(Boolean).join(' ')` aparece **22 veces** en el repo. Existe `formatPortalUserTitle` (`apps/portal/src/lib/api-client.ts:4136`) pero **no está exportado** y solo lo usa el buscador global.

---

## 4. Acto 1 — contrato (AI-DS-OWNER)

Produce la spec en `docs/specs/YYYY-MM-DD-contrato-avatar.md`, formato del perfil DS-OWNER §7. Debe resolver, como mínimo:

1. **API de `Avatar`**: ejes `size` y `variant`, comportamiento con imagen (`avatarUrl` existe en el modelo y hoy no se usa en ninguna parte) y sin ella, y estados requeridos.
2. **`getInitials(name)` canónico.** Hay que **decidir**, no promediar: cuántos caracteres, qué hacer con nombres de una sola palabra, con apellidos compuestos, y con caracteres fuera del BMP — `firstName?.[0]` rompe un par sustituto. Y **un único fallback**: hoy hay cuatro (`'?'`, `'iW'`, `'U'`, email).
3. **La cuestión de privacidad**, que no es menor: la implementación #2 cae al email como iniciales. Un avatar no debe filtrar la dirección de correo de un tercero en una vista donde el email no se expone. Decide si el fallback puede derivarse del email en alguna superficie, o en ninguna.
4. **Tokens**: tamaños contra la escala vigente, sin radios arbitrarios. Si necesitas un valor que no existe, **escala** — no lo inventes en la spec.
5. **Accesibilidad**: un avatar de iniciales es contenido no textual. Define si es `role="img"` con nombre accesible o decorativo con `aria-hidden` cuando el nombre ya está visible al lado — que es el caso de `ProfileHeader`, donde hoy hay un `aria-label` sobre un `<div>` sin rol que ARIA descarta.

Emite `[CONSULTA]` a AI-PROD-UX si el fallback afecta a cómo se identifica a una persona en listados operativos.

## 5. Acto 2 — implementación y migración (AI-FE-PLATFORM)

**No arranca sin la spec del Acto 1 congelada y citada por ruta y versión** (§3bis regla 4).

1. `Avatar` + `getInitials` en `packages/ui`, exportados desde el barrel plano.
2. `formatFullName` exportable en `@iwana/shared`, y retirar las 22 copias del patrón.
3. Migrar los seis sitios de §3, más `DropdownUser` del portal, que hoy no muestra iniciales.
4. Un test por cada regla del contrato que hoy diverge: nombre de una palabra, nombre vacío, apellido ausente, y el fallback canónico.

**Migración por aplicación, no toda de golpe:** primero `apps/portal`, verde, y después `apps/web`. Si algo se rompe, el diff que hay que leer es la mitad.

## 6. Restricciones no negociables

1. **Sin tokens nuevos ni radios arbitrarios.** Los 44 radios del repo están escalados al CTO; este turno no los toca ni añade otro.
2. No cambies comportamiento funcional de ninguna pantalla. Es coherencia visual: si detectas un defecto de lógica al migrar, `[CONSULTA]`, no lo arregles de paso.
3. Texto visible en español, sentence case. Dark mode completo.
4. **No toques `components/profile/` mientras el turno de perfil siga abierto.** Coordina con EM-ARCH: dos fases editando el mismo archivo es cómo se pierde un fix en un merge.

## 7. Evidencia de gate

```bash
pnpm --filter @iwana/ui exec jest --ci
pnpm --filter @iwana/portal exec jest --ci
pnpm --filter @iwana/web exec jest --ci
pnpm lint && pnpm typecheck
```

Jest invocado directo, nunca el script `test` del paquete: en `apps/portal` arrastra `--passWithNoTests` y sale 0 sin ejecutar nada.

## 8. Criterio de stop/go

**STOP y emite `[BLOQUEO]` a AI-EM-ARCH si:**

- El contrato exige un token que no existe en la escala vigente.
- La decisión sobre el fallback derivado del email tiene implicaciones de privacidad que no puedes acotar tú.
- Al migrar aparece un séptimo sitio no listado en §3 con lógica distinta a las seis conocidas.

**GO si:** spec congelada, `Avatar` y `getInitials` implementados fielmente, los seis sitios más `DropdownUser` migrados, `formatFullName` unificado, gates en verde y ningún cambio funcional en el diff.
