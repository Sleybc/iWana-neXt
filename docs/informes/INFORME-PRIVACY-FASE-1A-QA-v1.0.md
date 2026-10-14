# INFORME — Privacy Fase 1a · QA

**Versión:** 1.0  
**Fecha:** 2026-10-14  
**Responsable:** AI-SR-QA  
**Estado:** `[BLOQUEO]` — precondición de base de datos incumplida; C2 no ejecutado.

## Bloqueo de precondición

La precondición del CTO requiere que `dbiw` haya recibido `pnpm db:backup` y `pnpm db:migrate:all`, incluyendo las migraciones públicas 026 y 027 y las tenant 145–147. PostgreSQL responde en `127.0.0.1:5433`, pero el registro de migraciones públicas de `dbiw` confirma que esa migración no terminó: hay 24 filas y faltan `MediaUsageStratumEvidence1784419214000` (026) y `MediaUsagePrivacyEvidence1784419215000` (027). La última fila registrada es `PlatformUsersPasswordResetRequired1784419213000`.

Evidencia de solo lectura:

| Comando | Resultado |
| --- | --- |
| `Test-NetConnection 127.0.0.1 -Port 5433 -InformationLevel Quiet` | `True` |
| `docker exec iwana_postgres_dev psql -U iwana -d dbiw -At -c "SELECT current_database(), COUNT(*) FROM public.typeorm_migrations"` | `dbiw\|24` |
| `docker exec iwana_postgres_dev psql -U iwana -d dbiw -At -c "SELECT name FROM public.typeorm_migrations ORDER BY id"` | 24 entradas; última `PlatformUsersPasswordResetRequired1784419213000`; no aparecen las migraciones públicas 026 ni 027. |

Por esta precondición incumplida, se detuvo C2 antes de ejecutar pruebas, Playwright, cobertura o cualquier comando de migración. No se escribieron ni modificaron tests de producción. Conteo de pruebas de esta sesión: **0 ejecutadas**; cobertura y matriz CA ↔ test quedan **sin evaluar**.

## Alcance pendiente

Cuando el CTO confirme `dbiw` respaldada y migrada, ejecutar la matriz CA-UX-PRIV-01 a 53 (incluido CA-33 reemplazado), la tabla de plazos, la cobertura de `apps/api/src/modules/privacy/**` con umbrales de 80 % en statements y branches, la cobertura de interacciones P2 de Q7 y los tres E2E contra la API levantada sin mocks. Ninguno de esos gates queda aprobado por este informe.

## Deuda por severidad

- **Bloqueante de ejecución:** falta aplicar las migraciones requeridas a `dbiw` antes de los E2E reales. Responsable de la precondición: CTO.
- **Sin hallazgos QA nuevos:** no se ejecutaron pruebas ni se modificó código de tests.
