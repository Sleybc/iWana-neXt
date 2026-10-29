# PROMPT — Privacy · Textos legales · B7 (correctivo de CI)

## Módulo

- **Nombre:** `privacy`
- **Fase:** Textos legales, bloque correctivo B7
- **Versión:** 1.0
- **Fecha:** 2026-10-29
- **Generado por:** AI-EM-ARCH
- **Agente destinatario:** `sr-backend`
- **Plantilla:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` v1.2 (en revisión)

## 1. Objetivo exacto

- **Resultado esperado:** el job «Unit tests + gate de cobertura» del CI vuelve a verde sobre `main`.
- **Lo que sí entra:**
  - retirar `AuthModule` de `imports` en `apps/api/src/modules/privacy/privacy.module.ts`;
  - ajustar únicamente las pruebas de composición de `privacy` que dependan de ese import.
- **Lo que no entra:** cambiar `RolesGuard`, `PermissionsGuard`, `AuthModule`, la configuración de Jest, otros módulos o el contrato (spec v1.2).

## 2. Diagnóstico de partida (verificado por AI-EM-ARCH)

- **Corrida:** CI 40961614745 sobre `4d54799e`. `@iwana/api#test` falla con `1 failed, 4 skipped, 434 passed` (439 suites).
- **Suite que falla:** `src/modules/crm/subscribers/tests/subscribers.module.spec.ts`, con `SyntaxError: Unexpected token 'export'`.
- **Cadena del import:** `subscribers.module` → `privacy.module.ts:5` (`import { AuthModule }`) → `auth.module` → `auth.controller` → `auth.service.ts:15` (`otplib`, ESM). La misma suite falla igual en local.
- **Origen:** B6 (D-B4-1) añadió `AuthModule` a `PrivacyModule` para resolver `RolesGuard`.
- **Por qué sobra:** `RolesGuard` solo depende de `Reflector`, y Nest instancia los guards de `@UseGuards` en el contexto del módulo. `tasks` y `crm` usan `RolesGuard` sin importar `AuthModule`.

## 3. Pasos

1. Retira `AuthModule` del array `imports` y su `import` en `privacy.module.ts`. No toques los `@UseGuards` de los 9 controladores.
2. Comprueba que el guard sigue aplicándose: `privacy.roles-guard.http.spec.ts` debe seguir dando 403 a un token de plataforma en las rutas mutantes, y el perfil DPO (AUDITOR) y ADMIN deben pasar.
3. Si `privacy.module.spec.ts` o `privacy.swagger.spec.ts` dependían del import, ajústalos para que resuelvan el guard como lo hacen las pruebas de `tasks` o `crm`. **Si no hay forma de resolver `RolesGuard` sin `AuthModule`, emite `[BLOQUEO]` y para**: no reintroduzcas el import y no toques la configuración de Jest.
4. **Corre la suite completa de `@iwana/api`** con el mismo comando que usa el CI (`pnpm --filter @iwana/api test -- --coverage`), sin caché de Turbo. Reporta el conteo de suites: deben salir las 439 del CI (435 ejecutadas + 4 omitidas preexistentes) y **0 fallidas**.
5. Corre `typecheck` y `lint` de `@iwana/api`.

## 4. Restricciones

- No commitees: AI-EM-ARCH verifica y commitea por separado.
- No toques los cambios sin commitear de MOD13 ni de organización, que siguen en el árbol.
- Solo `pnpm`.

## 5. Entregables

`docs/informes/INFORME-PRIVACY-TEXTOS-LEGALES-B7-v1.0.md` (verifica que la ruta esté libre). Debe incluir:

- el diff;
- el conteo de la suite completa de API (suites y pruebas);
- el resultado de la prueba de `RolesGuard`;
- typecheck y lint con su código de salida;
- deuda nueva por severidad.

## 6. Stop/go

- **GO:** suite completa de API con 0 suites fallidas, guard verificado, typecheck y lint con código 0.
- **STOP (`[BLOQUEO]`):** si el guard no puede resolverse sin `AuthModule`, o si aparece otra suite roja ajena a este cambio. En ese caso, informa su nombre y su error literal y no la corrijas.
