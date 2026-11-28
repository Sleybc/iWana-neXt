# Plan — Usuarios de UISP: lectura lenta, descartados sin vuelta atrás y autores de tickets (2026-11-26)

**Estado:** en ejecución (pedido del usuario el 2026-11-26: «analiza, verifica y corrige»).
**Base:** `main` = `301cfb51`. Spec: [usuarios v1.3](../specs/2026-11-15-transversal-importacion-uisp-usuarios.md) · [ADR-110](../adrs/ADR-110-Importacion-por-Lotes-desde-UISP-y-Portabilidad.md) D15.

## Diagnóstico (verificado en la LAN, solo lectura y sin PII, con autorización del usuario)

| #   | Síntoma                                                                | Causa                                                                                                                                                                                                                                                                    | Evidencia                                                                                       |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1   | «La lectura está tardando más de lo normal»                            | La lectura recorre 25 201 tickets, 108 357 pagos y 31 906 tareas (≈530 páginas) y tarda 2–5 min; el portal deja de esperar a los 2 min (30 sondeos × 4 s). La lectura sí termina.                                                                                        | Log de la API 01:02 y 01:07 UTC: `api=28, eliminadosEnProcesos=45`.                             |
| 2   | La lista ya no muestra los nombres y no cambia al traer de nuevo       | A las 19:05:44 UTC se descartaron las 73 filas (28 vigentes + 45 eliminados) en una sola acción. Descartar borra nombre y correo (CHECK de la 211) y una fila resuelta nunca se reabre: las lecturas siguientes las cuentan como `intactos`. No hay forma de deshacerlo. | `migration_uisp_users`: 73 `DESCARTADO`, mismo `updated_at`; auditoría `accion: DESCARTAR` ×73. |
| 3   | «Última lectura: 1:24 p. m.» aunque se leyó a las 8 p. m.              | `meta.lastFetchedAt` es el máximo de `last_fetched_at` de las filas, y la lectura no toca las resueltas.                                                                                                                                                                 | Mismo `last_fetched_at` (18:24 UTC) en las 73 filas.                                            |
| 4   | Ticket `d72ca14a…`: todos los comentarios a nombre de una sola persona | Consecuencia de 2: sin equivalencias `USUARIO` (0 filas), la promoción del lote `519999c6…` (20:59 UTC, después del descarte) deja todo a nombre de quien importó, como dice la spec para «Descartar». No es un defecto de la promoción.                                 | 2 comentarios con el mismo autor = `importedBy`; lote `CONCILIADO`, sin purgar.                 |

## Tareas

### T1 — Recuperar usuarios descartados (API + contrato + portal)

- `POST /migration/uisp-users/reopen` `{ ids }` (1–100): las filas `DESCARTADO` vuelven a `PENDIENTE`; las demás se cuentan como omitidas, sin error. Auditoría `accion: RECUPERAR` con ids y conteos. Enlazado y creado no se reabren (tienen usuario y equivalencia).
- Portal: botón «Recuperar (N)» con descartados seleccionados; al terminar lanza «Traer usuarios» para que vuelvan nombre y correo de los vigentes.
- Hecho cuando: unitarias del servicio y del portal, integración contra Postgres (recuperar → traer → nombre de vuelta), OpenAPI del endpoint.

### T2 — La espera del portal cubre una lectura completa

- `UISP_USERS_FETCH_MAX_POLLS` de 30 a 150 (10 min) y el aviso dice que puede tardar unos minutos.

### T3 — «Última lectura» se mueve en cada lectura

- La lectura renueva `last_fetched_at` de las filas resueltas que vuelve a ver (sin tocar estado ni datos). La purga solo borra `PENDIENTE`, así que no cambia.
- Hecho cuando: prueba de integración con una fila resuelta.

### T4 — Spec v1.4

- §2.3 fila «Recuperar», §2.2 duración de la lectura y fecha de lectura.

## Pasos del usuario tras desplegar (no automatizables)

1. Usuarios de UISP → filtro «Descartados» → seleccionar → «Recuperar».
2. Crear (con rol) o «Enlazar con…» a cada persona; a las 45 «sin datos» escribirles el nombre o enlazarlas.
3. Lotes → lote `519999c6…` → «Actualizar autores»: re-atribuye asignados, autores de comentarios y pagos sin reimportar.

## Reglas

- Solo `pnpm`, pruebas en serie con pocos workers. Sin commits ni push sin autorización del usuario.
- La LAN y los contenedores `*_prod` solo en lectura para diagnóstico; nunca se escriben.

## Fuera de alcance / riesgo

- Comentarios de UISP sin `userId` (p. ej. escritos por el cliente) también quedan a nombre de quien importa (spec §2.6). No se verificó si el ticket `d72ca14a…` tiene alguno: la carga está cifrada.
- Velocidad de la lectura: no se sube el tamaño de página de UISP sin conocer su límite.
