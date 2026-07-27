# INFORME — Cuarta auditoría de gate: DEF-2 + Ola 1 de ADR-065

**Versión:** 1.3
**Fecha:** 2026-07-24
**Modo activo:** **Architect + EM** (auditoría de gate, sin ejecución de código)
**Autor:** AI-EM-ARCH
**Antecedentes:** [v1.0](INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.0.md) · [v1.1](INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.1.md) · [v1.2](INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.2.md)
**Clasificación:** Uso interno

---

## Veredicto

| Gate | v1.2 | **v1.3** |
| --- | --- | --- |
| **Contenido de la Ola 1** | GO | **GO** — sin cambio |
| **DEF-2 hotfix** | GO | **GO** — sin cambio |
| **Escalaciones** | Cerradas y ejecutadas | Sin cambio |
| **Merge de la rama** | Bloqueado por R-6 | **BLOQUEADO por R-10** |

R-6 y R-7 están bien cerrados. El merge sigue bloqueado, pero por otra cosa: **`pnpm lint` está en rojo**, y es el paso 103 del pipeline — antes del build y muy antes de las migraciones que R-6 vino a arreglar. Lo introdujo esta misma rama.

---

## 1. Disposiciones de v1.2 — verificación

| # | Acción | Estado | Evidencia verificada |
| --- | --- | --- | --- |
| 1 | R-6.1 carga perezosa de las llaves | **Cerrada** | `backfill-…util.ts:123-127` inicializa `keys` en `null` cuando no vienen por opciones y `:167-169` las carga **solo tras el primer lote no vacío**, una vez por corrida. Test: «schema sin filas pendientes no exige `MFA_ENCRYPTION_KEY` en el entorno» |
| 2 | R-6.2 clave en el CI | **Cerrada, mejor de lo pedido** | `ci.yml:138-140` genera una clave **efímera** con `openssl rand -hex 32` hacia `$GITHUB_ENV`, en un paso colocado inmediatamente antes de «Run tenant migrations» (`:142`). No entra ningún valor al repositorio — mejor que el valor de laboratorio fijo que propuse |
| 3 | R-7 fallar si `processed > 0 && updated === 0` | **Cerrada** | `backfill-…util.ts:208-217` lanza con diagnóstico y **no** captura, de modo que 088 falla y TypeORM no la marca aplicada. Comentario correcto sobre el porqué. Test: «lanza en vez de retornar `updated=0` silenciosamente» |
| 4 | R-9 vector criptográfico cruzado | **NO hecha** | `backfill-…migration.spec.ts:4` sigue cifrando y descifrando con la **misma** implementación (`encryptAes256Gcm` de `packages/database`). La frontera entre los dos paquetes sigue sin prueba |
| 5 | R-8 nota del umbral de conmutación | **NO hecha** | La cabecera de `088_*` no menciona el umbral; solo repite `transactional = true` |
| 6 | Correr el pipeline completo | **Hecha — y por eso aparece R-10** | Ver §2 |

---

## 2. Compuertas ejecutables — pipeline completo

| Compuerta | Resultado |
| --- | --- |
| `pnpm --filter @iwana/api test` | **Verde** — 205 suites, 2.309 tests, 0 fallos |
| `pnpm typecheck` (monorepo, 8 tareas) | **Verde** |
| `pnpm build` (monorepo, 7 tareas) | **Verde** |
| **`pnpm lint` (monorepo)** | **ROJO** — `Failed: @iwana/web#lint` |

Detalle del rojo: `pnpm --filter @iwana/web lint` → 1 error; `pnpm --filter @iwana/portal lint` → 2 errores. `apps/api` sigue limpio.

---

## 3. Hallazgos abiertos

### R-10 · ALTA · `pnpm lint` está en rojo — es el paso 103 del CI

Tres directivas que silencian una regla inexistente:

| Archivo | Línea |
| --- | --- |
| `apps/web/src/app/(protected)/tenants/page.tsx` | 146 |
| `apps/portal/src/components/assurance/AssuranceClient.tsx` | 320 |
| `apps/portal/src/components/operations/OperationsClient.tsx` | 198 |

`eslint-plugin-react-hooks` **no está declarado en ningún `package.json` del monorepo**, y la configuración raíz (`eslint.config.js`, flat config de ESLint 9) registra únicamente `@typescript-eslint`. En ESLint 9 una directiva que desactiva una regla que no existe es **error**, no aviso: `Definition for rule 'react-hooks/exhaustive-deps' was not found`.

**Las tres son nuevas de esta rama.** Verificado contra `HEAD`: cero ocurrencias en las versiones commiteadas de los tres archivos, y `+1` en cada diff del árbol de trabajo. `pnpm lint` estaba verde antes de esta remediación.

`ci.yml:103` ejecuta `pnpm lint` antes del build y de las migraciones: **el pipeline no llegaría siquiera al paso que R-6 arregló.**

**Salida:** borrar las tres directivas. No protegen nada —la regla no se ejecuta en este repositorio— y su presencia es lo único que rompe; el comportamiento de los `useEffect` no cambia.

**Lo que no hay que hacer:** instalar `eslint-plugin-react-hooks` «para que la directiva sea válida». Eso activaría `exhaustive-deps` sobre todo el frontend de golpe y abriría un frente de violaciones que no tiene nada que ver con esta ola. Si se quiere la regla —y probablemente convenga— es un trabajo propio, con su decisión de baseline de lint y su plan de saneamiento.

**Esfuerzo: S.**

### R-9 · BAJA · Sigue abierta — y reformulo la recomendación

`backfill-…migration.spec.ts` valida la coherencia interna de la utilidad de `packages/database`: cifra con `encryptAes256Gcm` de ese mismo archivo y descifra con la misma función. Un cambio de formato en `apps/api/src/common/crypto/aes-gcm.util.ts` pasaría los dos conjuntos de tests y rompería el backfill en producción.

Mi redacción anterior pedía «un vector cruzado», lo que empuja a un import cruzado — justo lo que R-11 desaconseja. **Reformulo:** el vector debe ser **dato, no import**. Una constante de ciphertext fija, generada una sola vez con la utilidad de `apps/api`, embebida como literal en ambos specs, y cada lado afirmando que descifra al plaintext conocido. Cero acoplamiento entre paquetes, y una deriva de formato en cualquiera de los dos rompe su propio test de inmediato.

### R-11 · BAJA · El spec importa `packages/database` por ruta relativa profunda

`backfill-…migration.spec.ts:7` importa con siete niveles de `../` hacia `packages/database/src/migrations/shared/…`, saltándose el alias `@iwana/db`. Typecheck y Jest lo aceptan, pero acopla un test de `apps/api` al layout interno de otro paquete y contradice la convención de imports del repositorio (externo → `@iwana/*` → relativo).

**Salida:** mover el spec a `packages/database`, que es donde vive la utilidad que prueba. Resuelve R-11 y deja R-9 como un literal en cada lado.

### R-12 · BAJA · Matiz sobre el guardián que yo mismo pedí

`processed > 0 && updated === 0` también dispara cuando la **única** fila pendiente de un tenant tiene el ciphertext genuinamente corrupto: la corrida de migraciones se detiene para todos los tenants por un dato roto. Es el precio del fallo ruidoso y **lo prefiero al silencioso**, así que mantengo el guardián. Lo que conviene ajustar es el diagnóstico: el mensaje atribuye la causa a la clave de cifrado, y la otra causa posible es ciphertext corrupto.

**Salida:** añadir esa segunda causa al mensaje y decir que la vía de salida es sanear la fila, no relajar el guardián.

### R-8 · BAJA · Sigue abierta

Sin la nota del umbral (~50.000 filas) a partir del cual conviene conmutar `088_*` a `transactional = false` con commit por lote. Es documentación en la cabecera del archivo; se arrastra sin coste, pero también se cierra sin coste.

---

## 4. Disposición

| # | Acción | Severidad | Responsable | Momento |
| --- | --- | --- | --- | --- |
| 1 | **R-10**: borrar las tres directivas `react-hooks/exhaustive-deps`. **No** instalar el plugin | ALTA | AI-FE-PLATFORM | **Bloqueante de merge** |
| 2 | **R-11**: mover `backfill-…migration.spec.ts` a `packages/database` | BAJA | AI-SR-QA | Con la disposición 3 |
| 3 | **R-9**: vector de ciphertext como literal en ambos specs | BAJA | AI-SR-QA | Con la disposición 2 |
| 4 | **R-12**: añadir «ciphertext corrupto» como segunda causa en el mensaje del guardián | BAJA | AI-SR-FULL | Cuando se toque el archivo |
| 5 | **R-8**: nota del umbral en la cabecera de `088_*` | BAJA | AI-SR-FULL | Cuando se toque el archivo |
| 6 | Re-correr `pnpm lint`, `pnpm typecheck`, `pnpm build` y la suite **antes** de abrir el PR | — | quien haga el PR | Antes de merge |

Cerrada la 1, el merge queda desbloqueado. Las cinco restantes son BAJA y ninguna bloquea: 2-5 pueden viajar en el mismo PR o en uno de limpieza.

**Sin escalación al CTO.**

---

## 5. Nota de proceso

Cuatro rondas. El hallazgo alto se ha movido una capa hacia afuera cada vez, y siempre a la capa que no se estaba mirando:

| Ronda | Hallazgo alto | Compuerta que lo habría visto |
| --- | --- | --- |
| v1.0 | Efecto ausente con forma presente (`applySort` sobrescrito) | Ninguna automática — revisión de contrato |
| v1.1 | Doble de prueba desactualizado | La suite, que no se corrió |
| v1.2 | Variable de entorno ausente en el job | El pipeline, que no se corre en local |
| v1.3 | Directivas de lint inválidas | `pnpm lint` del monorepo, no el del paquete tocado |

El patrón es estable: **el trabajo se verifica en el perímetro donde se hizo, y el defecto aparece en el perímetro de al lado.** En v1.3 es especialmente nítido — `apps/api`, donde vivía toda la remediación de backend, tiene lint, typecheck y suite verdes; el rojo está en `apps/web` y `apps/portal`, tocados de pasada.

La contramedida no es más ceremonia: es que el stop/go nombre **el comando del monorepo**, no el del paquete. `pnpm lint` y `pnpm typecheck` en la raíz cuestan segundos gracias a la caché de Turborepo y habrían atrapado tres de las cuatro rondas. Lo incorporo como requisito permanente de cierre de fase para las olas restantes de ADR-065.
