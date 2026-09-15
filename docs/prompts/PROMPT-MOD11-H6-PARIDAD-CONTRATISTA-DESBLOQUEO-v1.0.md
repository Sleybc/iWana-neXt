# PROMPT DE EJECUCIÓN — MOD11 · H6: el contratista bloquea y no puede desbloquear

**Versión:** 1.0
**Fecha:** 2026-09-14
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-SR-FULL** (`sr-backend`)
**Estado:** **Ejecutable.** Defecto vivo, independiente de ADR-091 (Aprobado) y de cualquier tramo. **Se puede ejecutar en paralelo con E1 y con T0.**

## Vínculos de trazabilidad

- Origen del hallazgo: `docs/informes/INFORME-MOD11-ORIGEN-OT-SEC-ENG-DICTAMEN-v1.0.md` §H6
- Decisión: [ADR-091](../adrs/ADR-091-Origen-de-la-OT-Despacho-y-Agenda-Actos-Separados.md) (Aprobado) §D6, condición 2 — **el CTO decidió paridad**: el contratista tiene el mismo alcance operativo que el técnico
- Spec: `docs/specs/2026-09-14-mod11-origen-ot-design.md` v1.0 §8, deuda 5

---

## 1. El defecto

`POST :id/block` admite `CONTRACTOR` en `@Roles`; `POST :id/unblock` **lo excluye**. Un contratista puede bloquear una OT y no puede desbloquearla: **puede dejar varado su propio trabajo** y depender de un empleado para retomarlo.

**Y no es solo un rol de menos: la política de UI y el endpoint se contradicen.** `computeAllowedActions` empuja `UNBLOCK` en la rama de técnico, y esa rama incluye a `CONTRACTOR` —`isTechnician` cubre ambos roles—. Es decir: **la consola le ofrece la acción y el API se la rechaza.** El contratista ve un botón que no funciona.

Esa divergencia política↔endpoint es lo que hay que cerrar, no solo el `@Roles`.

## 2. La decisión ya está tomada

**Paridad** (ADR-091 (Aprobado) §D6, condición 2): el contratista tiene el mismo alcance operativo que el técnico. La corrección va en la dirección de **habilitar el desbloqueo**, no de retirarle el bloqueo.

**No re-abras la decisión.** Si al implementarla encuentras una razón de seguridad para lo contrario —que el tercero no deba desbloquear—, **detente y emite `[CONSULTA]`**: es dictamen, no elección del ejecutor.

## 3. Pasos

1. Restituir la paridad en `POST :id/unblock`, de modo que el alcance efectivo coincida con el de `POST :id/block`.
2. **Verificar que la paridad es real y no solo declarada.** No basta el decorador: comprueba que el permiso correspondiente esté sembrado para el rol y que el guard resuelva el mismo veredicto en ambos comandos. Un rol añadido sin permiso sembrado deja el 403 donde estaba.
3. **Revisar si el mismo desajuste existe en otro comando.** `block` y `unblock` son un par; busca cualquier otro par de comandos de MOD11 donde `@Roles` diverja entre la acción y su reverso. Si aparece, repórtalo; corrígelo solo si es el mismo defecto con otro nombre.
4. Dejar la política de UI y el endpoint diciendo lo mismo: ninguna acción ofrecida por `computeAllowedActions` debe ser rechazada por el guard para el mismo actor y estado.

## 4. Tests

5. Un `CONTRACTOR` asignado a una OT `BLOCKED` **puede desbloquearla**.
6. **La prueba de la divergencia:** para ese mismo actor y estado, lo que `computeAllowedActions` ofrece y lo que el endpoint acepta **coinciden**. Es el test que faltaba y que habría detectado el defecto.
7. Ningún rol gana alcance que no tuviera: un `CONTRACTOR` **no** asignado sigue sin poder desbloquear, y ningún rol ajeno al par gana acceso.
8. Conteo real: jest directo, `--ci --runInBand`, sin turbo y sin `--passWithNoTests`. La suite de `tasks` no baja de **617**.

## 5. Restricciones no negociables

- **Alcance mínimo.** Este prompt corrige un par de comandos. **No toques** el pool reclamable, el estado `CREATED`, la nulabilidad del esquema ni la puerta de despacho: son E1 y E2, y el dictamen de `sec-eng` ya fijó que `CREATED` queda fuera del pool.
- **No amplíes el alcance del contratista más allá de la paridad con el técnico.** La decisión fue igualar, no ampliar.
- No toques `@iwana/shared`: no hay cambio de contrato.
- Sin PII real en fixtures ni tests.

## 6. Entregables

- Paridad efectiva en el par `block`/`unblock`, verificada en decorador, permiso y guard.
- Test de la divergencia política↔endpoint (punto 6).
- Informe de fase en `docs/informes/` con el resultado del barrido del paso 3.

## 7. Stop/go

**GO si y solo si:** un `CONTRACTOR` asignado desbloquea su propia OT; política y endpoint coinciden para el mismo actor y estado; ningún otro rol gana alcance; suite sin regresión con conteo real.

**NO-GO si:** se añade el rol al decorador sin comprobar el permiso sembrado y el veredicto del guard. Eso deja el 403 intacto con apariencia de corregido — exactamente el tipo de verde falso que este repositorio ya conoce.
