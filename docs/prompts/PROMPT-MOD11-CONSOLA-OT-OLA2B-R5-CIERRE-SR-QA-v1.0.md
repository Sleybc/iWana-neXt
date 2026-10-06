# PROMPT DE EJECUCIÓN — MOD11 Consola de OT · Ola 2b · R5: cierre de bloqueos de entorno

**Versión:** 1.0
**Fecha:** 2026-10-06
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-SR-QA** (`sr-qa`)
**Origen:** `docs/informes/INFORME-MOD11-CONSOLA-OT-OLA2B-R5-SR-QA-v1.1.md` (NO-GO con 4 bloqueos). La consolidación de AI-EM-ARCH del 2026-10-06 está en el plan v1.2, §Registro de bloqueos — Ola 2.

## Adenda A1 (2026-10-06) — repetición de los E2E con el mecanismo del repositorio

**Veredicto de AI-EM-ARCH sobre R5 v1.2:**

- **CA-09 queda cerrado**, con evidencia de API y SQL sobre `OTE-20261006-003`.
- **Los datos del guion NVDA quedan aceptados.**
- **El 0/16 en el puerto 3100 no se acepta como hallazgo de producto.** El error `useAuth debe usarse dentro de AuthProvider` aparece en `/auth/login`. Ni `AuthProvider` ni `LoginForm` ni el layout raíz han cambiado desde `f9f42b33`, y el mismo código pasó 13/13 en 3002. El informe no registra cómo se levantó el servidor de 3100.
- **Hipótesis principal: un arnés inválido.** Un segundo `next dev` sobre el mismo `apps/portal` comparte el directorio `.next` con el de 3002. Además, la suite exige `--webpack` y `NEXT_PUBLIC_PORTAL_API_URL` vacío (`e2e/playwright.portal.config.ts`).
- **El error lo indujo el encargo.** El paso 1 pedía «un puerto libre distinto de 3002». El repositorio ya tiene un mecanismo para servidor nuevo: **`PW_FORCE_FRESH_SERVER=1` en el puerto 3002**.

**Repetición (paso 1 corregido):**

1. Ejecútala solo cuando el usuario haya detenido su servidor de 3002. No lo detienes tú.
2. Corre `PW_FORCE_FRESH_SERVER=1` con `e2e/playwright.portal.config.ts`, sin otro `next dev` vivo sobre `apps/portal`. Registra el comando exacto y el conteo de los 16 casos.
3. Si el error de `AuthProvider` **se reproduce con este mecanismo**, entonces sí es hallazgo de producto: devuélvelo a `fe-platform`, con la traza.
4. Comprueba también si el consumo de `OTE-20261006-003` en estado `PENDING` converge cuando el worker procesa la conciliación de inventario. Si no converge, es hallazgo para `sr-backend`, con el id de la solicitud de inventario.

**Entrega:** `INFORME-MOD11-CONSOLA-OT-OLA2B-R5-SR-QA-v1.3.md`.

## 1. Qué se resolvió por decisión y no se re-ejecuta

- **[BLOQUEO-P95-R2] se reubica en G7.** No existe entorno compartido: el dominio productivo es deuda activa por ADR-078. Medir el p95 con carga pasa a ser condición de G7, no de G6. La mitigación vigente es el recibo retenido, que reintenta sin volver a subir el archivo. No se re-ejecuta aquí.
- **[BLOQUEO-R5-LECTOR]** queda pendiente de una decisión del CTO: recorrido manual con lector de pantalla o excepción registrada. **No lo cierras tú**, y tampoco lo sustituyes con automatización.

## 2. Alcance exacto

1. **[BLOQUEO-R5-SERVIDOR].** Repite los E2E de B0, R2, R3, OLA1 y E4 contra un **servidor nuevo**: un puerto libre distinto de 3002 y un proceso arrancado por ti, que detienes al terminar. **No detengas el proceso del usuario en 3002.** Informa el conteo y el puerto usado.
2. **[BLOQUEO-CA09-BACKEND], contra backend real local**: api, portal y Postgres de desarrollo en `localhost`, **sin interceptar HTTP**.
   - Usa un **tenant y un usuario de prueba**. Si no existen, créalos con el mecanismo de seed del proyecto y **registra las credenciales en el seed o en el ejemplo de configuración, nunca en el informe ni en el chat**. Prohibido usar credenciales de otro servicio o PII real.
   - Crea una OT **de prueba propia**. No toques las 2 OT reales de `tenant_iwana`.
   - Recorrido: iniciar la OT, capturar la firma en el lienzo, esperar a `AVAILABLE`, registrar la evidencia `SIGNATURE` con `requirementKey = CUSTOMER_SIGNATURE` y ejecutar `close()` con aceptación del cliente. Demuestra que el gate de cierre la acepta.
   - Si el análisis de media no corre en local (worker o Redis caídos), levántalos con los scripts del repo. Si no es posible, emite `[BLOQUEO]` con la causa exacta.
   - Al terminar, deja la OT de prueba identificable como fixture, o elimínala por la vía de anulación si el flujo lo permite. Declara cuál hiciste.

3. **Preparar los datos del guion manual de lector de pantalla.** El CTO eligió la verificación manual el 2026-10-06: `docs/quality/2026-10-06-mod11-ola2b-guion-lector-pantalla-nvda.md` §0. Deja listo en el entorno local, con el mecanismo de seed:
   - un **usuario técnico** y un **usuario supervisor** de prueba;
   - una OT de prueba en `ASSIGNED` con la plantilla v2 y al menos un CPE en la custodia del técnico;
   - una segunda OT de prueba en `BLOCKED`, bloqueada por API, porque el portal no lo permite.

   **No ejecutas el guion**: lo ejecuta una persona. Declara en el informe cómo se identifican las dos OT, nunca las credenciales.

**Fuera de alcance:** código de producción. Un fallo es hallazgo y vuelve al dueño del archivo con ruta y reproducción.

## 3. Skills

| Tipo | Skills |
| --- | --- |
| **Obligatorias** | `playwright-skill`, `e2e-testing-patterns`, `testing-patterns`, `verification-before-completion` |
| **De apoyo** | `postgresql`, para verificar en SQL la evidencia y el cierre |
| **Descartadas** | `wcag-audit-patterns`, porque el lector de pantalla está fuera de este encargo |

## 4. Stop/go

**GO de R5** si se cumplen las dos cosas:

- los E2E pasan contra un servidor nuevo, con su conteo;
- CA-09 queda demostrado contra el backend real local: evidencia `SIGNATURE` registrada y `close()` aceptado, verificado por API y por SQL.

En ese caso el veredicto final de R5 solo queda condicionado al lector de pantalla, según lo que decida el CTO.

**Entrega:** `docs/informes/INFORME-MOD11-CONSOLA-OT-OLA2B-R5-SR-QA-v1.2.md`. Sin commit.
