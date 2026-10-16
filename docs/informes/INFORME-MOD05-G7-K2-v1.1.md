# INFORME — MOD05 + privacidad G7 · reconciliación K2

**Versión:** 1.1 · **Fecha:** 2026-10-15 · **Estado:** GO para el inventario de destinos K2
**Responsable:** AI-DATA-ENG
**Fuentes:** [Plan G7](../plans/2026-10-15-mod05-privacy-g7-release.md) · [Prompt G7, §5.1 K2Δ](../prompts/PROMPT-MOD05-PRIVACY-G7-v1.0.md) · [Ensayo M2 v1.0](INFORME-MOD05-G7-M2-ENSAYO-v1.0.md)

## Cambio

El ensayo M2 encontró cuatro columnas cifradas objetivo en tablas que no existen en el esquema restaurado ni son creadas por las migraciones tenant registradas: `subscriber_contacts.email_encrypted`, `subscriber_contacts.phone_encrypted`, `potential_leads.email_encrypted` y `potential_leads.phone_encrypted`. Se retiraron esos cuatro destinos de los inventarios AES y PII de K2. No se crearon tablas ni se alteró ninguna migración.

Se añadió una prueba de invariantes que contrasta los destinos cifrados públicos y tenant contra las sentencias `CREATE TABLE` de los archivos incluidos en los runners de migraciones. Incluye una comprobación negativa con un destino sintético que no corresponde a una tabla migrada. La integración PostgreSQL ya no fabrica las dos tablas ausentes y ahora verifica 17 recifrados del fixture.

## Verificación

| Comprobación                                                              | Resultado                                                                        |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Specs enfocadas de K2 y del inventario                                    | 3 suites, 53 pruebas aprobadas                                                   |
| Integración K2 en PostgreSQL desechable                                   | 1 suite, 1 prueba aprobada; contenedor y puerto retirados al terminar            |
| `pnpm exec turbo run test --filter=@iwana/api --force --output-logs=full` | 381 suites y 5.100 pruebas aprobadas; 4 suites y 15 pruebas omitidas; 0 fallidas |
| Turbo                                                                     | 4 tareas exitosas; 0 cache hit                                                   |
| `git diff --check`                                                        | Aprobado                                                                         |

La integración cubrió dry-run y apply en su base sintética aislada. No se ejecutó contra tenants reales. No se cambiaron datos persistentes compartidos y no se hizo commit.

## Cierre

La fuente del bloqueo del ensayo M2 queda corregida en el inventario: cada destino de K2 corresponde a una tabla creada por el runner registrado. Esto no aprueba por sí solo el runbook de release; el ensayo M2b debe repetir dry-run, apply, idempotencia y verify sobre una restauración representativa, y comprobar que verify termina en cero.

La ruta de este informe no existía antes de crearlo. No se incluyen secretos ni datos personales.
