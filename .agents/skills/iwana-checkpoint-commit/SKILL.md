---
name: iwana-checkpoint-commit
description: "Commitea una ola sobre main verificando el contenido exacto del índice (árbol limpio, índice exportado o stash --keep-index con respaldo SHA-256) y publica por tren según ADR-107, vigilando el CI en segundo plano. Usar cuando el usuario pide commitear una ola, hacer un checkpoint o publicar en main. No usar sin esa petición expresa."
disable-model-invocation: true
metadata:
  category: workflow
  triggers: checkpoint, commit por ola, commitear ola, stash keep-index, staging parcial, push a main, tren, G6.5
---

# Checkpoint de commits por ola

**Argumentos:** la ola (ej. `MOD05-FASE-09-D`), la lista de rutas y la fuente de su GO (informe o plan).

Fuentes normativas:
- `docs/adrs/ADR-107-Publicacion-por-Lotes-y-G6.5-Asincrono.md`: commit por ola, push por tren, G6.5 asíncrono y topes de ceremonia (D8). La tabla de cuándo hacer commit y cuándo push está en `docs/informes/INFORME-TRANSVERSAL-TIEMPOS-ENTREGA-v1.0.md` §4.
- `docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md`: reglas 2, 4 enmendada, 4-ter y 7.

Esta skill las empaqueta y no las reemplaza. Si divergen, prevalece ADR-107. Todo se trabaja en `main`, sin ramas ni worktrees, y nunca con `--no-verify` (`guard-bash` lo niega).

## Reglas que no se negocian

1. **Nada se descarta.** Ni `git checkout -- <ruta>`, ni `git clean`, ni `git stash drop`, ni `reset --hard`.
   Lo que no entra en el commit se queda en el árbol tal como está.
2. **Nadie edita el árbol mientras hay un stash de verificación activo:** ni tú, ni otra sesión, ni otro
   agente. Un `pop` con archivos sin seguimiento modificados falla con «ya existe».
3. **Rutas explícitas.** `git add <ruta> <ruta> …`, nunca un directorio entero. Antes de cada `git add`, revisa
   los `??` de `git status --porcelain`.
4. **Sin GO verificado en su fuente, la ola no se commitea.** El estado se lee del informe o plan, no de la memoria.
5. **Mensajes convencionales en inglés** (`feat(crm): …`, `docs(mod14): …`), con el informe o plan de la ola en el cuerpo.
6. **Ningún commit solo registra un G6.5** (ADR-107 D4 y D8.4). El registro viaja en el siguiente commit funcional.

## Pasos

### 0. Elegir cómo aislar el índice (ADR-107 D6)

Primero arma el índice con el paso 1. Después mira qué queda fuera de él, con `git status --porcelain` menos las rutas del índice:

| Caso | Condición | Cómo se corre el gate |
| --- | --- | --- |
| **A** | Fuera del índice no hay cambios | Gate en el árbol. Se omiten los pasos 2, 3 y 5 |
| **B** | Hay cambios ajenos fuera del índice, pero **ninguno** en los paquetes que verifica el gate ni en los paquetes del workspace de los que dependen. O bien la ola es solo de documentos | El gate de código corre en el árbol. El documental corre sobre el índice exportado: `git checkout-index -a --prefix="$TEMP/indice-<ola>/"` y, dentro de esa carpeta, `node scripts/audit-adr-citations.mjs` y `node scripts/audit-doc-locations.mjs`. Se omiten los pasos 2, 3 y 5 |
| **C** | Hay cambios ajenos en los paquetes del gate o en sus dependencias | Pasos 2 a 5 con stash, tal como están |

Los casos A y B no congelan a las demás sesiones: la regla 2 solo aplica en el caso C. Precedente del caso B: `7926ba9b` (2026-11-09), con 267 rutas ajenas en el árbol.

### 1. Armar y revisar el índice

```bash
git add <rutas explícitas de la ola>
git diff --cached --name-only
git diff --cached --name-only | grep -E '(^|/)\.cache/|next-env\.d\.ts$|\.tmp-' && echo "ABORTAR"
```

Si la guarda imprime algo: saca esas rutas del índice con `git restore --staged <ruta>` y vuelve a revisar.

### 2. Respaldar los archivos parcialmente en el índice (regla 4-ter, caso C)

Son los que aparecen en `git diff --name-only` y en `git diff --cached --name-only` a la vez. Cópialos
**completos** fuera del repo y registra su SHA-256:

```bash
PARTIAL=$(comm -12 <(git diff --name-only | sort) <(git diff --cached --name-only | sort))
BACKUP="$TEMP/iwana-checkpoint/<ola>"; mkdir -p "$BACKUP"
for f in $PARTIAL; do mkdir -p "$BACKUP/$(dirname "$f")"; cp "$f" "$BACKUP/$f"; done
(cd "$BACKUP" && sha256sum $PARTIAL) > "$BACKUP.sha256"
```

En los casos A y B, un archivo parcialmente en el índice obliga a pasar al caso C.

### 3. Aislar el índice (caso C)

Excluye siempre los archivos generados que el gate reescribe. `next typegen` reescribe `next-env.d.ts` en
el typecheck del portal, y eso hace fallar el `pop`:

```bash
git stash push --keep-index --include-untracked -m checkpoint-<ola> -- . \
  ":(exclude)apps/portal/next-env.d.ts" ":(exclude)apps/web/next-env.d.ts"
git stash list
```

### 4. Gate

- **Código:** lint y typecheck de cada paquete tocado y tests sin caché de Turbo, con conteo real. Sigue la skill
  `iwana-test-evidence` o delega en el subagente `gate-verifier`. Si el índice toca un `*.module.ts`, corre la suite
  **completa** del paquete.
- **Documentos:** `pnpm audit:adr-citations` y `pnpm audit:doc-locations` con `BLOQUEANTE: 0`. En el caso B, sobre el índice exportado.
- **Dependencias:** `pnpm install --frozen-lockfile` sobre el índice.

Conserva las líneas `Test Suites:`/`Tests:` y los `BLOQUEANTE:` para el informe.

### 5. Restaurar y comprobar (caso C)

```bash
git stash pop
(cd "$BACKUP" && sha256sum -c "$BACKUP.sha256")
git diff --cached --name-only
```

- **`pop` no limpio:** `[BLOQUEO]` y parar. Antes de proponer nada, compara el árbol y el índice con `stash@{0}`,
  `stash@{0}^2` y `stash@{0}^3`. Para conservar el stash sin rama, usa `git update-ref refs/checkpoint/<ola> <sha>`.
  El `drop` solo se hace con autorización del CTO.
- **SHA-256 distinto:** no se commitea. Restaura ese archivo desde su copia y emite `[BLOQUEO]` con la lista.
  El precedente es el commit G (2026-10-31), donde el `pop` reordenó líneas de `contracts.service.ts`.

### 6. Commit

Solo con el gate en GO (y, en el caso C, con el paso 5 limpio): `git commit` con el mensaje de la regla 5. Husky corre lint-staged
y commitlint. Si lint-staged reformatea, revisa que los tests que leen código como texto sigan pasando.
Comprueba después que `git stash list` quedó como estaba: lint-staged usa su propio stash y lo limpia.

### 7. Push por tren, solo si el usuario lo ordenó (ADR-107 D2, D3 y D5)

Se publica cuando alguien o algo necesita el código: otra sesión o máquina, evidencia que solo existe en CI, la corrección de un rojo, el cierre de fase o una jornada de commits sin respaldo. No por ola ni para ver el verde.

- **Una migración que agrega NOT NULL, CHECK o FK que el código vigente no cumple no se pushea sola.** Va en el
  mismo push que el código que la satisface (2026-10-17: `main` quedó rojo unas 3,5 h).
- `git fetch` primero. Si `origin/main` avanzó: `[BLOQUEO]`, sin rebase ni merge por tu cuenta.
- Mira `git log origin/main..HEAD`. Si hay commits ajenos que el usuario no autorizó, publica solo hasta el SHA autorizado, en avance rápido: `git push origin <sha>:refs/heads/main`. Si no, `git push origin main`. Nunca con `--force`.
- No publiques con `main` en rojo, salvo la corrección (D5), ni con una corrida en curso y otra en espera: GitHub cancelaría la que espera.
- **G6.5:** localiza la corrida con `gh run list --commit <sha>` y vigílala **en segundo plano** con `gh run watch <id> --exit-status`. Informa al usuario cuando termine, sin esperar a que pregunte. Revisa la corrida de **cada** push. Si falla, `gh run view <id> --log-failed`. Con CI en rojo no corrijas ni reviertas: clasifica el job y el primer error, y emite `[BLOQUEO]`. Puedes relanzar solo los jobs fallidos (`gh run rerun <id> --failed`) si se cumplen dos condiciones:
  - el fallo es una prueba inestable con evidencia (el commit no toca la prueba y esa misma prueba pasó en la corrida anterior);
  - el usuario lo ordena.
- Solo esperan al G6.5 antes de seguir las olas de CI o infraestructura, las migraciones del primer punto y las correcciones de un rojo (D3). Las demás olas arrancan con G6.

## Entrega

Por cada commit: SHA, ola, rutas, caso de aislamiento (A, B o C), evidencia del gate con cifras y, en el caso C, el resultado del paso 5.

Si hubo push: el run id, cada job con su conclusión y la lista de lo que sigue local.

El veredicto G6.5 se anota en el informe o plan de la fase y viaja en el siguiente commit funcional (regla 6), nunca en un commit propio.
