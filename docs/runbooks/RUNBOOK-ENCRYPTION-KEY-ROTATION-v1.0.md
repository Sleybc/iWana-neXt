# RUNBOOK — Rotación de clave de cifrado (MFA + PII)

**Tipo:** Runbook operativo  
**Módulo:** TRANSVERSAL — Secretos / cifrado en reposo  
**Versión:** 1.0  
**Fecha:** 2026-07-19  
**Autor:** AI-PLAT-OPS  
**Referencias:** [ADR-058](../adrs/ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md) · [INFORME SEC-02…05](../informes/INFORME-TRANSVERSAL-REMEDIACION-SEC-02-05-v1.0.md) · hallazgo SEC-02  
**Estado ADR-058:** Aprobado (CTO 2026-07-19) — go ops registrado; ejecutar por entorno con checklist §3

---

## Propósito

Rotar `MFA_ENCRYPTION_KEY` (AES-256-GCM, 64 hex → 32 bytes) con ventana de doble lectura (`MFA_ENCRYPTION_KEY_PREVIOUS`), sin downtime de lectura y sin perder ciphertext legado. La fase 2 de ADR-058 separa la PII con `PII_ENCRYPTION_KEY`; su procedimiento aparece en §6ter.

Esta clave cifra secretos MFA y, hasta completar ADR-058 fase 2, también puede descifrar PII histórica de CRM/parties como respaldo legado. Tras esa fase, las escrituras de PII usan `PII_ENCRYPTION_KEY`; las escrituras MFA siguen usando `MFA_ENCRYPTION_KEY`.

**Fuera de alcance de este runbook:** cambiar algoritmo. Recifrado prod y purge git están **autorizados** por CTO (ADR-058) y se ejecutan aquí con dry-run y checklist por entorno.

---

## 1. Generación segura de clave

Procedimiento común para generar cualquier clave AES-256/HMAC de este runbook, incluyendo `MFA_ENCRYPTION_KEY`, `PII_ENCRYPTION_KEY` y `PII_HASH_KEY`. Definir `SECURE_TMP_DIR` como una ruta temporal aprobada, fuera del repo y con acceso exclusivo del operador; preferir almacenamiento efímero protegido. El contenido nunca pasa por stdout ni se muestra en terminal:

```bash
umask 077
set -eu
set -o pipefail
KEY_FILE="$(mktemp "$SECURE_TMP_DIR/key-material.XXXXXX")"
cleanup_key_file() { if [ -n "${KEY_FILE:-}" ]; then rm -f -- "$KEY_FILE"; fi; }
trap cleanup_key_file EXIT HUP INT TERM
openssl rand -hex 32 | tr -d '\n' > "$KEY_FILE"
test "$(wc -c < "$KEY_FILE")" -eq 64
```

Importar el archivo en el secret store aprobado bajo el nombre de la variable indicada por el paso (por ejemplo, `MFA_ENCRYPTION_KEY`, `PII_ENCRYPTION_KEY` o `PII_HASH_KEY`). El mecanismo de importación debe leer desde archivo sin mostrar ni copiar el valor a stdout, argumentos, historial o logs; este runbook no inventa una CLI de secret manager. Confirmar la importación solo por metadatos (nombre/versión/estado), nunca leyendo el valor. Luego borrar el archivo (`rm -f -- "$KEY_FILE"`), comprobar que no existe (`test ! -e "$KEY_FILE"`) y limpiar la variable (`unset KEY_FILE`). El `trap` cubre salida por error o interrupción. Ante error de generación, validación, importación o borrado: detenerse y no desplegar. No ejecutar `cat`, `echo`, `openssl rand -hex 32` aislado ni otra orden que revele la clave. No reutilizar claves entre entornos ni guardar valores en el repo o un `.env`.

Validación fail-fast (código, AI-SR-FULL): rechazar entropía nula (p. ej. 64 ceros, 64 `f`) y placeholders obvios. No hay excepción “ceros para docker”.

---

## 2. Orden de despliegue (estricto)

| Paso | Acción                | Notas                                                                                                                                                                                                                              |
| ---- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Inventario            | CLI desplegado: `pnpm encryption:reencrypt` (alias de `pnpm --filter @iwana/api encryption:reencrypt` → `node dist/cli/reencrypt-aes.js`). Requiere build previo de `@iwana/api`.                                                  |
| 1    | Generar clave nueva   | Usar §1 e importar como nueva `MFA_ENCRYPTION_KEY` (aún no activa en prod); no imprimir el valor.                                                                                                                                  |
| 2    | Desplegar doble clave | `MFA_ENCRYPTION_KEY_PREVIOUS` = clave **antigua** (la que aún descifra el ciphertext existente; puede ser débil/comprometida). `MFA_ENCRYPTION_KEY` = clave **nueva** fuerte (cifra escrituras nuevas; Joi rechaza entropía nula). |
| 3    | Healthcheck           | `GET /api/v1/health` OK; login/MFA/PII de lectura smoke en el entorno.                                                                                                                                                             |
| 4    | Dry-run del recifrado | `pnpm encryption:reencrypt` (default dry-run). Revisar conteos: candidates, reencrypted (plan), decrypt_errors, schemas. Opcional: `-- --schema=tenant_x`.                                                                         |
| 5    | Recifrado real        | Solo si dry-run está limpio y hay go/no-go del entorno (tabla abajo): `pnpm encryption:reencrypt -- --apply`. Idempotente por tenant; métricas en stdout.                                                                          |
| 6    | Verificación 100 %    | `pnpm encryption:reencrypt -- --verify-active-only` — descifrado solo con `MFA_ENCRYPTION_KEY` (sin PREVIOUS). Exit ≠ 0 si quedan fallos.                                                                                          |
| 7    | Retirar PREVIOUS      | Quitar `MFA_ENCRYPTION_KEY_PREVIOUS` del entorno y redesplegar.                                                                                                                                                                    |
| 8    | Post-check            | Healthcheck + smoke MFA/PII otra vez.                                                                                                                                                                                              |

Rollback en ventana de doble clave: volver a poner la antigua en `MFA_ENCRYPTION_KEY` y dejar `PREVIOUS` vacío o alineado al runbook de incidente — **no** retirar PREVIOUS si el recifrado no terminó.

Coordinación: AI-PLAT-OPS ejecuta el despliegue de variables y la orquestación; el artefacto de recifrado lo entrega AI-SR-FULL. Sin ese binario/job, detenerse en el paso 0.

---

## 3. Checklist go / no-go por entorno

| Entorno             | Quién da el go                              | Condiciones mínimas                                                                                                                                           |
| ------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **dev / lab local** | Owner técnico del entorno                   | Backup o volumen desechable aceptable; dry-run primero; no secretos reales de clientes.                                                                       |
| **staging**         | EM-ARCH + owner staging                     | Backup restaurable verificado; ventana acordada; dry-run limpio; ADR-058 conocido.                                                                            |
| **producción**      | **CTO — go concedido 2026-07-19** (ADR-058) | Backup/restore probado; dry-run limpio en staging equivalente; plan de rollback escrito; owner PLAT-OPS confirma ventana; G7 de release si aplica despliegue. |

Go CTO de ADR registrado. Cada ventana de prod aún exige checklist de esta fila antes de pasos 5–7 (no reabrir decisión; sí confirmar readiness operativa).

---

## 4. Qué NO hacer

1. **Dejar 64 ceros** (u otra clave de entropía nula) en ningún entorno, ni “temporalmente” en docker.
2. **Commitear** `MFA_ENCRYPTION_KEY`, `MFA_ENCRYPTION_KEY_PREVIOUS`, ni dumps con ciphertext+clave.
3. **Retirar `PREVIOUS`** antes de verificar recifrado al **100 %** (filas ilegibles = incidente).
4. Invertir previous/activa en el primer despliegue (escrituras nuevas quedarían con la clave vieja o ilegibles).
5. Ejecutar purge de historial git en el mismo cambio que la rotación (ver §5).
6. Force-push o `git filter-repo` / BFG sin decisión CTO y sin confirmar que ningún entorno vivo depende del secreto leaked.

---

## 5. Historial git (purge)

Si una clave débil o real estuvo versionada:

- **No** reescribir historial en este procedimiento.
- Escalar al CTO: purge solo **después** de rotar en todos los entornos que aún pudieran usar ese valor.
- Implica coordinación (force-push controlado, invalidación de clones) — fuera de alcance de AI-PLAT-OPS sin go explícito.

---

## 6. Variables y plantilla

Ver `.env.example` (raíz): `MFA_ENCRYPTION_KEY` vacío + comentario de generación; `MFA_ENCRYPTION_KEY_PREVIOUS` opcional y vacío por defecto; `PII_HASH_KEY` (SEC-P1) independiente, mismo formato 64 hex.

En local, si un `.env` no versionado aún contiene 64 ceros, no desplegar ese placeholder: generar e importar una `MFA_ENCRYPTION_KEY` nueva mediante §1 y seguir §2; conservar la clave previa solo en el secret store local aprobado. No dejar el valor nuevo en `.env` ni subir ese archivo.

---

## 6bis. Rotación de `PII_HASH_KEY` (D-D / SEC-P1)

`PII_HASH_KEY` **no** se rota con el procedimiento AES de §2. Es una clave distinta a propósito (ADR-078 (propuesto) D-A): rotar cifrado no debe forzar recalcular hashes, y viceversa.

**Consecuencia aceptada (D-D):** rotar `PII_HASH_KEY` exige **backfill completo** de todas las columnas `*_hmac` (users, subscribers, expediente_records, platform_users) recalculando HMAC con la clave nueva a partir del plaintext (email en claro / ciphertext descifrado). No hay columna de versión de clave en este corte — eso requeriría ADR propio.

Procedimiento operativo resumido:

1. Usar el procedimiento seguro de §1 para generar e importar una nueva `PII_HASH_KEY`; desplegarla **solo tras** tener ventana para backfill.
2. Ejecutar backfill por schema (mismo andamiaje que migración 108 / util `backfill-pii-hmac.util`) hasta `pending = 0`.
3. Verificar búsquedas por documento/email/teléfono.
4. Retirar la clave antigua del secret store.

Sin backfill completo, las búsquedas deterministas quedan rotas (hashes viejos ≠ HMAC nueva clave).

**Despliegue inicial SEC-P1 (expand/contract, no rotación):** ver [RUNBOOK-SEC-P1-VENTANA-EXPAND-CONTRACT-v1.0.md](./RUNBOOK-SEC-P1-VENTANA-EXPAND-CONTRACT-v1.0.md) — secuencia S1 + A1/A2 + B1. No mezclar rotación de clave con la ventana 2 del contract.

---

## 6ter. Separación y rotación de `PII_ENCRYPTION_KEY` (ADR-058 fase 2)

**Estado:** procedimiento sujeto a K1/K2 y a revisión de SEC-ENG. No habilita una ventana si el código, la imagen del migrator o el Compose del entorno no exponen estas variables de forma explícita y segura.

`PII_ENCRYPTION_KEY` es una clave AES-256-GCM independiente de MFA: exactamente 64 caracteres hexadecimales, fuerte y diferente de `MFA_ENCRYPTION_KEY`. En producción su ausencia o igualdad con la clave MFA es fail-closed. `PII_ENCRYPTION_KEY_PREVIOUS` es opcional para lectura durante una rotación. No imprimir ni pasar valores de claves por línea de comandos, configuración versionada o logs.

### A. Primera separación: MFA → PII

1. **Preflight.** Cerrar K1 y K2, ensayar en base desechable, tener backup/restores verificados y aprobación de la ventana. Confirmar que Compose inyecta al API y al migrator `PII_ENCRYPTION_KEY`, `PII_ENCRYPTION_KEY_PREVIOUS` y `PII_DECRYPT_LEGACY_MFA`; `docker compose ... config --quiet` debe terminar en `0`. El valor por defecto de lectura legado es `true` mientras se recifra.
2. **Generar.** Usar el procedimiento común de §1 e importar la clave nueva bajo `PII_ENCRYPTION_KEY`, distinta de MFA, sin mostrar su valor. La misma regla aplica al crear `PII_ENCRYPTION_KEY_PREVIOUS` en una rotación posterior. No reutilizar claves entre entornos.

3. **Desplegar el lector compatible.** Con escrituras detenidas según la ventana, configurar `PII_ENCRYPTION_KEY` nueva, `PII_ENCRYPTION_KEY_PREVIOUS` vacía y `PII_DECRYPT_LEGACY_MFA=true`. Mantener las variables MFA actuales (incluida `MFA_ENCRYPTION_KEY_PREVIOUS` si la requiere su rotación separada). No dejar convivir instancias del binario anterior con las nuevas escrituras PII: la versión anterior solo entiende la clave MFA. Arrancar el conjunto aprobado y comprobar health/MFA/lectura PII. Mantener el fallback MFA hasta verificar todo el inventario de tenants.
4. **Recifrar por tenant.** Compilar `@iwana/api` y ejecutar el CLI K2 con un `schema_name` verificado por invocación. Los modos PII resuelven el schema con consulta parametrizada a `public.tenants`, sin filtrar por status; exigen fila de tenant registrada y namespace físico existente. Así se cubren schemas retenidos en cualquier estado (`ACTIVE`, `INACTIVE`, `SUSPENDED` o `MARKED_FOR_DELETION`). Schema ausente/no registrado falla antes de consultar tablas tenant; tablas u objetivos faltantes impiden completar verify. No admiten `public` ni ejecución de flota. El flujo MFA general conserva su restricción a tenants `ACTIVE`. `--mfa-to-pii` es dry-run por defecto; inspeccionar sus conteos antes de usar `--apply`. Aplicar dos veces para comprobar idempotencia y ejecutar `--verify-pii-only`. Comandos exactos:

   ```bash
   pnpm --filter @iwana/api build
   pnpm --filter @iwana/api encryption:reencrypt -- --mfa-to-pii --schema="$TENANT_SCHEMA"
   pnpm --filter @iwana/api encryption:reencrypt -- --mfa-to-pii --apply --schema="$TENANT_SCHEMA"
   pnpm --filter @iwana/api encryption:reencrypt -- --mfa-to-pii --apply --schema="$TENANT_SCHEMA"
   pnpm --filter @iwana/api encryption:reencrypt -- --verify-pii-only --schema="$TENANT_SCHEMA"
   ```

   `TENANT_SCHEMA` es el `schema_name` verificado en el inventario, no el UUID ni el slug. Ejecutar dry-run, apply, segunda aplicación y verify para cada schema registrado con namespace, cualquiera que sea el status del tenant; no cambiar el estado de tenants. Si faltan tablas/objetivos o verify no termina en cero, detener el barrido y mantener la clave legado. El ensayo K2 documentó 21 candidatos, 21 recifrados en la primera aplicación, 0 en la segunda y verify con 0 filas que solo abran con claves MFA; `NULL` se conservó. La salida contiene modo, schema/tipo y conteos, sin valores, texto claro ni IDs. Véase [informe K2](../informes/INFORME-MOD05-G7-K2-v1.0.md). No retirar `MFA_ENCRYPTION_KEY` ni desactivar lectura MFA legado mientras queden filas sin verificar.

5. **Cerrar lectura legado.** Cambiar `PII_DECRYPT_LEGACY_MFA=false` únicamente cuando cada tenant registrado, sin importar status, tenga verify en cero. K2 requiere ejecutar el comando de forma explícita para cada schema y no ofrece una corrida de flota. Si un schema no se puede resolver, faltan tablas/objetivos o su verify no termina en cero, mantener `PII_DECRYPT_LEGACY_MFA=true` en el API y migrator. Tras completar el inventario, desplegar el booleano `false`, reiniciar el conjunto aprobado y repetir health/smoke de lectura PII y MFA. `MFA_ENCRYPTION_KEY` permanece necesaria para MFA.

**Parada:** claves ausentes/iguales, Compose incompleto, cualquier error de descifrado, tenant sin evidencia, o smoke rojo. Mantener `PII_DECRYPT_LEGACY_MFA=true`, claves anteriores y mantenimiento; escalar al dueño de K/SEC-ENG. No desactivar el fallback por calendario.

**Rollback:** la antigua versión de la aplicación no puede leer ciphertext escrito con la clave PII. No volver a ella después de la primera escritura PII, salvo que se restaure el backup compatible y verificado conforme al runbook de release. En una ventana de recifrado incompleta, conservar las claves MFA y PII actuales/previas y la bandera legado en `true`; no recifrar hacia atrás ni retirar ninguna clave hasta un plan revisado.

### B. Rotación posterior de `PII_ENCRYPTION_KEY`

Solo después de cerrar la lectura legado MFA en cada schema de tenant registrado, sin importar el status, mediante la invocación PII explícita por schema:

1. Abrir una ventana, detener escrituras y respaldar/ensayar restore como en el runbook de release por tenant.
2. Generar la nueva clave mediante §1; importar la actual como `PII_ENCRYPTION_KEY_PREVIOUS` y la nueva como `PII_ENCRYPTION_KEY`, sin mostrar ningún valor. Conservar `PII_DECRYPT_LEGACY_MFA=false`. No usar una CLI de secret manager no aprobada ni imprimir el valor durante la carga.
3. Desplegar el lector/escritor compatible sin coexistencia con el binario anterior. Las escrituras nuevas van con la clave PII activa; lecturas aceptan activa y previa. Validar health y lectura antes de continuar.
4. El contrato K2 publicado cubre MFA→PII (`--mfa-to-pii`) y verificación (`--verify-pii-only`); no documenta un modo PII previa→PII activa. No reutilizar el modo MFA→PII para esta rotación. Detenerse y abrir una ampliación revisada de K2 que publique comando de dry-run, apply, verify e idempotencia antes de cambiar claves o recifrar.
5. Retirar `PII_ENCRYPTION_KEY_PREVIOUS` solo después de verificación cero en toda la flota y smoke exitoso. Conservar el historial de rotación y la evidencia agregada sin guardar claves.

**Parada/rollback:** ante error, conservar ambas claves y no retirar previous. No regresar al binario anterior si ya se cifró una fila con la nueva clave; restaurar tenant/global solo conforme a la frontera y autorización CTO del runbook de release. `PII_DECRYPT_LEGACY_MFA` no se vuelve a `true` salvo que el plan determine que sobreviven filas MFA-legado; documentar y revalidar ese cambio con SEC-ENG.

---

## 7. Nota para AI-SEC-ENG

Este runbook **no** auto-aprueba el gate de seguridad (G-SEC). SEC-ENG debe re-revisar tras merges de remediación (fail-fast Joi, job de recifrado, ausencia de placeholders inseguros en ejemplos versionados, rotación PII_HASH_KEY documentada).
