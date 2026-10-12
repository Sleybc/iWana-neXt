# Informe — MOD05 Suscriptores · Runbook B13

**Versión:** 1.0  
**Fecha:** 2026-10-12  
**Responsable:** `plat-ops`  
**Estado:** Entregado para revisión de `sec-eng`; no ejecutado contra ningún entorno.  
**Alcance:** Runbook operativo G7 de migración 143, backfill Party PII y despliegue B5.

## Entregables

| Ruta | Resultado |
| --- | --- |
| `docs/runbooks/RUNBOOK-MOD05-PARTY-PII-BACKFILL-v1.0.md` | Secuencia por tenant, comandos respaldados por el CLI existente, criterios de abortar, conteos de verificación, rollback pre/post `--apply`, contracción separada y coordinación con ADR-058. |

## Evidencia y límites

- Leídos `AGENTS.md`, plan MOD05 v1.3, informes B1 y B7 (B7-02), prompt v1.3 §1 B13, runbook de rotación ADR-058, y skills `database-migration` y `postgresql`.
- Se verificó documentalmente que `pnpm --filter @iwana/db migration:tenant:run` procesa todos los tenants `ACTIVE` y migraciones pendientes; el backfill toma un único tenant `ACTIVE` por invocación. El runbook declara esta diferencia y la posible aplicación parcial del DDL entre schemas.
- Se incluyen comandos para generar backup por tenant con dump+sidecar+SHA y para un restore de ensayo aislado; se referencia el procedimiento vigente de release para el criterio de restore verificable.
- Se fijan los conteos de aceptación: cero `party.document_number_hmac` nulos fuera de `NODATA-*` y cero `party_contact.value_encrypted` nulos. También se bloquea la continuación si un contacto NODATA impide cumplir el segundo conteo.
- No se ejecutaron comandos contra bases de datos, migraciones, backfill, backups ni restores. No se modificó código.

## Riesgos por severidad

| Severidad | Riesgo / estado |
| --- | --- |
| Crítica | Ninguno nuevo introducido por la documentación. |
| Alta | B7-02/G7 sigue pendiente de ejecución en cada tenant. Release B5 no debe promoverse hasta que la flota aplicable tenga backup restaurable, migración, dry-run limpio, `--apply` y conteos aprobados. El runner puede dejar schemas `ACTIVE` parcialmente migrados si una ejecución falla. |
| Alta | Candidatos a fusión y fallos de backfill requieren resolución humana; no se autoriza fusión automática ni continuar ignorando errores. |
| Media | La contracción de `party_contact.value` y `subscribers.whatsapp` queda deliberadamente pendiente como migración separada, condicionada a evidencia completa para todos los tenants y a comprobar que no hay lectores/escritores. |
| Media | La rotación de `PII_HASH_KEY` no puede superponerse a este backfill: exige recalcular todas las columnas HMAC. La rotación AES ADR-058 conserva su ventana de doble clave y su verificación independiente. |

**Cierre B13:** runbook entregado para revisión de `sec-eng`. G7 permanece abierto hasta la ejecución autorizada por tenant y la evidencia descrita.
