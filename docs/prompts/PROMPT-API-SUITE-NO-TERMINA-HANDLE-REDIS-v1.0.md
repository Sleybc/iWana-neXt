# PROMPT DE EJECUCIÓN — API: la suite de pruebas nunca termina

**Versión:** 1.0
**Fecha:** 2026-09-15
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-SR-QA** (`sr-qa`) · **C:** `plat-ops` si toca CI
**Estado:** **Ejecutable.** Infraestructura de pruebas transversal; independiente de MOD11 y de cualquier tramo en curso.

## Vínculos de trazabilidad

- Hallazgo: auditoría de AI-EM-ARCH del 2026-09-15 sobre el cierre de T0 y H6
- Regla del repositorio que gobierna la solución: `apps/api/jest.config.js`, nota **R-14 — «CAUSA RAÍZ (no subir testTimeout: eso trata el síntoma)»**

---

## 1. El defecto

**`pnpm exec jest` sobre `apps/api` ejecuta las 4040 pruebas en verde en ~224 s y después no termina nunca.** El propio jest lo dice:

```
Time:        224.071 s
Jest did not exit one second after the test run has completed.
```

Quien la lance sin saberlo ve silencio indefinido, sin distinguir «va bien» de «está colgada». En esta auditoría costó dos horas de reloj antes de que alguien preguntara.

## 2. La causa, ya aislada

**Un único spec: `apps/api/src/app.bootstrap.spec.ts`**, en su segundo test.

Compila un `TestingModule` real que importa `HealthModule`. Ese grafo alcanza `AssuranceModule`, que hace `BullModule.registerQueue`, así que al compilar se instancian colas BullMQ reales. Su cliente ioredis apunta a **6379** —el default de `config.get('REDIS_PORT', 6379)`, porque en pruebas no se carga el `.env`, que declara **6380**—. Nadie escucha ahí: el cliente reintenta indefinidamente y **el handle sobrevive a `moduleRef.close()`**, porque una cola que nunca llegó a conectar no se cierra limpiamente.

**Evidencia, por partida doble:**

| | Con el spec | Sin el spec |
| --- | --- | --- |
| ¿Jest termina solo? | Nunca | **Sí, `EXIT=0`** |
| `ECONNREFUSED` en el log | **470** | **0** |
| Tests | 4040 pasan, 0 fallan | 4037 pasan, 0 fallan |

La diferencia son exactamente sus 3 tests. Y por eliminación: de los cuatro specs que tocan el grafo de `AppModule`, **solo este cuelga**; `app.module.config`, `app.config.production-urls` y `tenant-public-routes` salen limpios.

**El autor lo anticipó.** El spec lleva escrito: *«No montamos AppModule completo: TestingModule+TypeORM/Redis es deuda distinta»*. Evitó `AppModule`, pero `HealthModule` ya arrastra la cola.

## 3. La dirección de la solución

**El test necesita el grafo, no colas que funcionen.** Su único propósito es probar que el scanner de Nest no lanza `UndefinedModuleException` en ese camino. Aislar la infraestructura conserva íntegro ese valor y elimina la causa.

### 3.1 Lo que NO se acepta

- **`--forceExit`.** Es la solución de manual y **está prohibida aquí**: la nota R-14 del propio `jest.config.js` fija que no se tratan síntomas. Taparía este fallo y **cualquier fuga futura, incluida una real**; habría hecho que las dos horas pasaran más calladas, no que no pasaran.
- **Subir `testTimeout`.** Mismo motivo, y además no aplica: las pruebas no agotan tiempo, terminan bien.
- **Borrar o `skip` del spec.** Verifica una regresión real de ciclo de módulos —la Vía B de `WfmModule`— y su valor no está en discusión.

### 3.2 Lo que se espera

Que ninguna cola real se instancie al compilar ese grafo de prueba. **Elige el mecanismo y justifícalo en el informe**: sustituir los proveedores de cola por dobles vía `getQueueToken`, interceptar la creación del cliente, o lo que resulte más robusto frente a que el grafo sume colas mañana — ese punto es el que debes razonar, porque enumerar colas a mano envejece mal.

**Cerrar las colas en `afterAll` no es la vía**: una cola que nunca conectó puede colgarse al cerrarse, y hereda el mismo problema de enumeración.

## 4. La guarda

Sin ella esto reaparece en silencio, que es justo lo que costó las dos horas.

**Añade una verificación que falle ruidosamente si la suite de `apps/api` deja de terminar sola.** No basta con que hoy salga: hace falta que mañana, si alguien reintroduce un handle abierto, el fallo sea visible e inmediato en vez de un cuelgue mudo.

Si la guarda vive en CI, **`plat-ops` es consulta obligatoria** antes de tocar el workflow.

## 5. Barrido

**Verifica que no queda ninguna otra fuga.** La evidencia de §2 dice que hoy es el único, pero se midió con `--runInBand`. Comprueba que también termina sola en la configuración con la que corre `pnpm test` —`maxWorkers: '50%'` bajo turbo con `--concurrency=1`—, y que la config de integración (`jest.integration.config.js`) no arrastra el mismo problema.

Si aparece otra fuente, repórtala; corrígela solo si es el mismo defecto con otro nombre.

## 6. Restricciones no negociables

- **No toques código de producción.** El defecto está en el arnés de pruebas, no en la aplicación.
- **No toques `apps/api/src/modules/tasks/`**: hay tramos activos sobre ese árbol (E1 en curso). Si tu corrección necesitara tocarlo, **detente y emite `[BLOQUEO]`**.
- **No cambies el default `6379` del código.** Es correcto como default de producción; el problema es que en pruebas no debería abrirse ninguna conexión, no que el número esté mal.
- Sin PII real en fixtures ni tests.

## 7. Entregables

- El spec deja de abrir conexiones reales, conservando sus tres tests y lo que verifican.
- Guarda contra la regresión silenciosa (§4).
- Informe de fase en `docs/informes/` con el mecanismo elegido y su justificación (§3.2), y el resultado del barrido (§5).

## 8. Stop/go

**GO si y solo si:**

- `pnpm exec jest --ci --runInBand` sobre `apps/api` **termina solo**, con el código de salida y el conteo real en el informe.
- **Cero `ECONNREFUSED`** en el log completo (hoy son 470).
- Los tres tests de `app.bootstrap.spec.ts` siguen existiendo y siguen verificando lo mismo.
- Conteo total sin regresión: **4040**, con las 4 suites omitidas de siempre.
- La suite también termina sola en la configuración real de `pnpm test`.

**NO-GO si:** la suite termina gracias a `--forceExit`, a un `skip` o a haber borrado el spec. Eso no es cerrar el defecto: es dejar de verlo.
