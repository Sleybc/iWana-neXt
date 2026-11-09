---
name: iwana-checkpoint-commit
description: "Commitea una ola sobre main verificando el contenido exacto del índice (stash --keep-index, respaldo SHA-256, gate sobre el índice aislado) y revisa el CI del push. Usar cuando el usuario pide commitear una ola, hacer un checkpoint o publicar en main. No usar sin esa petición expresa."
disable-model-invocation: true
metadata:
  category: workflow
  triggers: checkpoint, commit por ola, commitear ola, stash keep-index, staging parcial, push a main, G6.5
---

# Checkpoint de commits por ola

**Argumentos:** la ola (ej. `MOD05-FASE-09-D`), la lista de rutas y la fuente de su GO (informe o plan).

Fuente normativa: `docs/prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md` (reglas 2, 4 enmendada,
4-ter y 7). Esta skill las empaqueta y no las reemplaza. Si divergen, prevalece el prompt. Todo se trabaja en
`main`, sin ramas ni worktrees, y nunca con `--no-verify` (`guard-bash` lo niega).

## Reglas que no se negocian

1. **Nada se descarta.** Ni `git checkout -- <ruta>`, ni `git clean`, ni `git stash drop`, ni `reset --hard`.
   Lo que no entra en el commit se queda en el árbol tal como está.
2. **Nadie edita el árbol mientras hay un stash de verificación activo:** ni tú, ni otra sesión, ni otro
   agente. Un `pop` con archivos sin seguimiento modificados falla con «ya existe».
3. **Rutas explícitas.** `git add <ruta> <ruta> …`, nunca un directorio entero. Antes de cada `git add`, revisa
   los `??` de `git status --porcelain`.
4. **Sin GO verificado en su fuente, la ola no se commitea.** El estado se lee del informe o plan, no de la memoria.
5. **Mensajes convencionales en inglés** (`feat(crm): …`, `docs(mod14): …`), con el informe o plan de la ola en el cuerpo.

## Pasos

### 1. Armar y revisar el índice

```bash
git add <rutas explícitas de la ola>
git diff --cached --name-only
git diff --cached --name-only | grep -E '(^|/)\.cache/|next-env\.d\.ts$|\.tmp-' && echo "ABORTAR"
```

Si la guarda imprime algo: saca esas rutas del índice con `git restore --staged <ruta>` y vuelve a revisar.

### 2. Respaldar los archivos parcialmente en el índice (regla 4-ter)

Son los que aparecen en `git diff --name-only` y en `git diff --cached --name-only` a la vez. Cópialos
**completos** fuera del repo y registra su SHA-256:

```bash
PARTIAL=$(comm -12 <(git diff --name-only | sort) <(git diff --cached --name-only | sort))
BACKUP="$TEMP/iwana-checkpoint/<ola>"; mkdir -p "$BACKUP"
for f in $PARTIAL; do mkdir -p "$BACKUP/$(dirname "$f")"; cp "$f" "$BACKUP/$f"; done
(cd "$BACKUP" && sha256sum $PARTIAL) > "$BACKUP.sha256"
```

### 3. Aislar el índice

Excluye siempre los archivos generados que el gate reescribe. `next typegen` reescribe `next-env.d.ts` en
el typecheck del portal, y eso hace fallar el `pop`:

```bash
git stash push --keep-index --include-untracked -m checkpoint-<ola> -- . \
  ":(exclude)apps/portal/next-env.d.ts" ":(exclude)apps/web/next-env.d.ts"
git stash list
```

### 4. Gate sobre el índice aislado

- **Código:** lint y typecheck de cada paquete tocado y tests sin caché de Turbo, con conteo real. Sigue la skill
  `iwana-test-evidence` o delega en el subagente `gate-verifier`. Si el índice toca un `*.module.ts`, corre la suite
  **completa** del paquete.
- **Documentos:** `pnpm audit:adr-citations` y `pnpm audit:doc-locations` con `BLOQUEANTE: 0`.
- **Dependencias:** `pnpm install --frozen-lockfile` sobre el índice.

Conserva las líneas `Test Suites:`/`Tests:` y los `BLOQUEANTE:` para el informe.

### 5. Restaurar y comprobar

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

Solo con el gate en GO y el paso 5 limpio: `git commit` con el mensaje de la regla 5. Husky corre lint-staged
y commitlint. Si lint-staged reformatea, revisa que los tests que leen código como texto sigan pasando.

### 7. Push, solo si el usuario lo ordenó

- **Una migración que agrega NOT NULL, CHECK o FK que el código vigente no cumple no se pushea sola.** Va en el
  mismo push que el código que la satisface (2026-10-17: `main` quedó rojo unas 3,5 h).
- `git fetch` primero. Si `origin/main` avanzó: `[BLOQUEO]`, sin rebase ni merge por tu cuenta.
- `git push origin main`, sin `--force`.
- **G6.5:** `gh run list --commit <sha>` y `gh run watch <id>` hasta que termine; si falla,
  `gh run view <id> --log-failed`. Revisa la corrida de **cada** push, no solo la del último. Con CI en rojo no
  corrijas ni reviertas: clasifica el job y el primer error, y emite `[BLOQUEO]`.

## Entrega

Por cada commit: SHA, ola, rutas, evidencia del gate con cifras y resultado del paso 5. Si hubo push, el run id,
cada job con su conclusión y la lista de lo que sigue local.
