# LAUNCH — MOD11 · Orquestación: origen de la OT y corrección

**Versión:** 1.0 · **Fecha:** 2026-09-14 · **Emitido por:** AI-EM-ARCH
**Planes:** `docs/plans/2026-09-14-mod11-origen-ot.md` · `docs/plans/2026-09-14-mod11-correccion-ot.md`
**Gates:** G1 de origen-OT **cerrado** (ADR-091 aprobado + dictamen de `sec-eng` aceptado). G1 de corrección-OT **cerrado** (ADR-090 aprobado por el CTO el 2026-09-15).

---

## 1. Orden de ejecución

```
  paralelo ──► H6  paridad contratista        sr-backend   (controlador + test)
                   independiente de todo lo demás

  serie    ──► T0  assign() persiste          sr-backend   ─┐
                        │                                    │ mismo archivo:
               E1  esquema e identidad        sr-backend    │ execution-orders.service.ts
                        │                                    │ no se solapan
               E2  puerta de despacho         sr-backend   ─┘
                        │
               E3  agendar después            sr-backend
                        │
               E4  consola y proyecciones     fe-platform + prod-ux + sr-backend
```

**T0, E1, E2 y E3 tocan `execution-orders.service.ts`: se ejecutan de uno en uno.** El proyecto trabaja siempre sobre `main`, sin ramas: dos agentes editando el mismo archivo a la vez se pisan.

**H6 sí es paralelo** —vive en el controlador—, con una condición: si al cerrar la divergencia política↔endpoint necesitara editar `execution-orders.service.ts`, espera su turno en la serie.

## 2. Qué se lanza y con qué archivo

| # | Tramo | Estado | Launcher |
| --- | --- | --- | --- |
| 1 | **H6** paridad contratista | **Ejecutable ya** | `docs/prompts/PROMPT-MOD11-H6-PARIDAD-CONTRATISTA-DESBLOQUEO-v1.0.md` |
| 2 | **T0** `assign()` persiste | **Ejecutable ya** | `docs/prompts/PROMPT-MOD11-CORRECCION-OT-T0-LAUNCH-v1.0.md` |
| 3 | **E1** esquema e identidad | **Ejecutable ya** | `docs/prompts/PROMPT-MOD11-ORIGEN-OT-E1-LAUNCH-v1.0.md` |
| 4 | **E2** puerta de despacho | Espera T0 **y** E1 | archivo propio al cerrar E1 |
| 5 | **E3** agendar después | Espera E2 | archivo propio |
| 6 | **E4** consola y proyecciones | Espera E3 | archivo propio |
| — | **T2 → T1 → T3** corrección | **Desbloqueados.** T2 se adelanta: cierra la OT despachada irreversible | archivo propio |

**Por qué E2 espera a T0:** su CA-07 exige que el técnico asignado pueda operar, y hoy `assign()` no persiste. Sin T0, E2 no puede demostrar su propio criterio.

**Por qué T1 espera a E1:** fue reexpresado para cubrir también la OT despachada sin cita. Hasta que el esquema la admita, ese segundo caso no existe y el diseño quedaría a medias.

## 3. Lo que ningún ejecutor puede reabrir

- **`CREATED` queda fuera del pool reclamable.** Dictaminado por `sec-eng` y decidido por el CTO: la bolsa es de supervisión.
- **La sede es obligatoria al despachar.** Sin ella la OT se lista, se abre y ningún comando la mueve.
- **La paridad del contratista es igualar, no ampliar.**
- La regla de acceso vive en **cinco sitios** (spec origen-OT §3.6.2): cambiarla en uno solo produce filas que listan y dan 404.

Cualquiera de estos que parezca equivocado durante la ejecución es `[CONSULTA]` o `[BLOQUEO]` hacia AI-EM-ARCH, nunca decisión del ejecutor.

## 4. Cierre de cada ola

Conteo real por suite —jest directo, `--ci --runInBand`, sin turbo, sin `--passWithNoTests`—; la suite de `tasks` no baja de **617**; `pnpm audit:adr-citations` y `pnpm audit:doc-locations` en `BLOQUEANTE: 0`.

Cada tramo entrega informe de fase en `docs/informes/` y **reporta a AI-EM-ARCH antes de que se lance el siguiente**.
