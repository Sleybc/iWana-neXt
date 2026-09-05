# ADR-086 — Acceso del titular a su documento de identidad en el perfil propio

**Estado:** Aprobado
**Aprobado por:** CTO, 2026-09-04
**Fecha:** 2026-09-03
**Autor:** AI-EM-ARCH
**Decisión de negocio que lo origina:** CTO, 2026-09-03
**Origen técnico:** [INFORME-MOD04-PERFIL-PORTAL-AUDITORIA-v1.0](../informes/INFORME-MOD04-PERFIL-PORTAL-AUDITORIA-v1.0.md) §4, hallazgo P-10
**Relacionado:** [ADR-067](ADR-067-Proyeccion-PII-Listados-Operativos.md) (Aprobado) — mecanismo de finalidad declarada por campo

---

## Contexto

`GET /users/me` devuelve `documentNumber` (cédula) del usuario autenticado. La auditoría del perfil encontró que **la pantalla nunca lo renderiza**: el dato viajaba al navegador en cada carga sin cumplir ninguna función.

El PRD-MOD04 v1.1 lo prohibía en cuatro puntos (líneas 80, 197, 427, 438) invocando minimización bajo Ley 1581. Existía además una aceptación de riesgo previa del CTO (2026-07-23, hallazgo E-05 del turno backend) que autorizaba la exposición **en el listado ADMIN**, con el residual explícito de *"no propagar la cédula fuera de la superficie ADMIN del tenant"*.

Se planteó la disyuntiva: retirar el campo de la proyección, o darle finalidad exponiéndolo.

## Decisión del CTO

**El documento se muestra en el perfil propio. La política se corrige para reflejarlo.**

El CTO determina que **ver el documento es necesario** y que cada usuario lo maneja bajo su propia responsabilidad. El campo pasa de viajar sin propósito a ser visible y editable por su titular.

## Norma

**1 · La distinción que este ADR fija.** ADR-067 gobierna la **proyección de datos personales de terceros** hacia operadores en listados, y su cláusula 3 la acota deliberadamente. **Este caso es de otra naturaleza:** el sujeto que ve el dato es el **titular del dato**. Bajo Ley 1581 art. 8, el acceso del titular a su propia información y su rectificación son **derechos suyos**, no una cesión sujeta a minimización. Minimizar tiene sentido frente a terceros; frente al titular, negarle su propio dato es el defecto, no el control.

**2 · Finalidad declarada por campo** (mecanismo de ADR-067 cláusula 2, aplicado aquí):

| Campo | Superficie | Finalidad |
| --- | --- | --- |
| `documentNumber` | `GET`/`PATCH /users/me` | Que el titular verifique y **rectifique** su documento de identidad — derecho de acceso y rectificación (Ley 1581 art. 8 lit. a y d). Sin esta superficie, un documento mal capturado en el alta no tiene vía de corrección por su propio titular |
| `documentType` | ídem | Acompaña al anterior: un número sin tipo no es identificable |

**3 · Alcance estricto — el titular, y nadie más.** Esta decisión autoriza la exposición **únicamente en la superficie de perfil propio**, donde el actor y el titular son la misma persona (`findMe(actor.sub)`). **No generaliza.** La exposición del documento de *otros* usuarios sigue gobernada por la decisión del 2026-07-23 para el listado ADMIN y no se amplía aquí.

**4 · La UI debe renderizarlo.** La autorización está atada a la finalidad: un campo que viaja al cliente y no se muestra **no está cubierto por este ADR** — vuelve a ser exposición sin propósito. Si por cualquier motivo la UI deja de exponer el campo, la proyección se retira con ella.

**5 · Trazabilidad del cambio.** Toda modificación del documento desde el perfil propio se audita con valor anterior y nuevo, sujeta a la denylist de redacción vigente (`audit-sanitize.policy.ts`). Esto **depende de cerrar P-07** (hoy `PATCH /users/me` audita sin `oldValue`/`newValue` y en `fireAndForget`): sin esa corrección, un cambio de documento queda registrado solo como `UserProfile UPDATE`, y la rendición de cuentas que sostiene esta autorización no es verificable.

**6 · Fronteras que no se mueven.** El dato no aparece en logs, mensajes de error, cursores, URLs ni parámetros de consulta. El aislamiento por schema de tenant se mantiene. **DT-01 del PRD sigue abierto**: la PII no está cifrada en reposo, y este ADR no lo cierra ni lo relaja — es un gate de pre-producción independiente.

## Consecuencias

### Positivas

- Cierra el derecho de rectificación: hoy un usuario **no puede corregir su propio documento** desde la interfaz, aunque el API lo permita.
- Elimina una exposición sin finalidad, que era la objeción real de la auditoría.
- Cierra la asimetría de que `PATCH /users/me` acepta siete campos editables y el formulario mostraba cuatro.
- Evita construir proyección diferenciada en `toDto`, que es un allowlist común a `findMe` y `findAll`: retirar el campo habría obligado a separarlas, contradiciendo además la decisión del 2026-07-23.

### Negativas / deuda

- El documento sigue viajando al navegador y sin cifrado en reposo (DT-01).
- La cláusula 5 queda **condicionada a P-07**. Mientras no se cierre, la trazabilidad prometida no existe.
- El PRD-MOD04 exige bump: cuatro afirmaciones suyas quedan superadas por esta decisión.

### Fuera de alcance

- Exposición del documento de terceros más allá del listado ADMIN ya decidido.
- Enmascaramiento parcial — descartado por la misma razón que en ADR-067: un documento parcialmente oculto no sirve para verificarlo.
- Cifrado en reposo (DT-01, sin cambio).

## Criterio de aceptación

1. `documentType` y `documentNumber` visibles y editables en el formulario de perfil propio, con las restricciones del DTO (`@MaxLength(30)`).
2. PRD-MOD04 bumpeado con sus cuatro afirmaciones marcadas como superadas y esta finalidad declarada.
3. P-07 cerrado: la auditoría del perfil registra qué cambió, dentro de la transacción.
4. Ningún otro endpoint amplía su proyección de documento a raíz de esta decisión.

## Escalación

Ninguna pendiente. La decisión de negocio está tomada por el CTO (2026-09-03) y **firmada por el CTO el 2026-09-04** — este ADR está `Aprobado` y las citas dejan el marcador `(propuesto)`.

**Laudo sobre la tensión de §5 (denylist vs "valor anterior y nuevo").** La aprobación se registra con la recomendación adoptada (opción 1 de la escalación de cierre): `changedFields` —lista de campos bajo clave no-PII, con `await` dentro de `runInTenantSchema`— **cumple §5**, porque la denylist SEC-P1 vigente redacta cualquier valor o marcador bajo clave PII al persistir (verificado con test; dictamen SEC-ENG sin bloqueantes). Persistir valores literales exigiría enmienda previa a la política de saneado, no a este ADR. Si el CTO dispone otra cosa, se enmienda esta sección en el mismo acto.
