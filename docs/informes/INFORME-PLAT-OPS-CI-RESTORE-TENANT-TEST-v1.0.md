# INFORME — CI restore tenant: test de orden del gate

**Fecha:** 2026-10-16 · **Estado:** Corregido y verificado · **Autor:** AI-PLAT-OPS (`plat-ops`)
**Alcance:** solo `scripts/db/restore-tenant.test.mjs` y este informe. Sin commits.

## Cambio

La ruta del informe estaba libre. El test de `--rollback-in-place` ahora normaliza espacios de `main.toString()` antes de buscar el gate y comparar su orden con las escrituras. Revisé las demás comparaciones de texto del archivo: el test vecino también inspeccionaba `main.toString()` y dependía de un salto de línea literal; ahora usa la misma normalización. Las comparaciones restantes son inclusiones o expresiones regulares que no dependen del formato del fuente.

El control negativo desplaza la ubicación del gate después de `createDatabase(args.into)` y comprueba que ese orden no satisface la condición. Por tanto, si el gate real se mueve después de cualquiera de las escrituras vigiladas, la aserción de orden falla. No se modificó `restore-tenant.mjs`.

## Verificación

Se ejecutó Prettier antes de las pruebas:

```text
pnpm exec prettier --write scripts/db/restore-tenant.test.mjs
scripts/db/restore-tenant.test.mjs 122ms (unchanged)
```

Luego se ejecutó `node --test scripts/db/restore-tenant.test.mjs`:

```text
tests 43 · suites 0 · pass 43 · fail 0 · skipped 0 · todo 0
```

## Deuda nueva por severidad

| Severidad | Deuda    |
| --------- | -------- |
| P0        | Ninguna. |
| P1        | Ninguna. |
| P2        | Ninguna. |
| P3        | Ninguna. |

No se añadieron datos personales, ciphertext, HMAC ni claves.
