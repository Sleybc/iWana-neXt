# Lanzamiento — MOD13 · E7_resume v1.5: re-revisión de G6 sin re-ejecutar

**Versión:** 1.19 · **Estado:** vigente; sustituye a v1.18 · **Fecha:** 2026-10-27
**Plan:** [orquestación v3.12](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · **Encargo:** [E7_resume v1.5](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.5.md) · **Matriz:** [QA v2.11 §13.17](../quality/2026-10-26-mod13-interfaces-matriz.md)
**Evidencia:** [R-1 a R-9 v1.4](../quality/evidence-mod13-ca-r12-e1/e7-resume-v1.4-r1-r9.json) · [probe de captura](../quality/evidence-mod13-ca-r12-e1/e7-auth-capture-probe.json) · [E-7](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md) · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)

**Estado:** G6 NO PASS tras v1.4 por P1-1 (R-7 sin huellas persistidas) y P1-2 (entrega documental). Decisión humana: re-revisión sin re-ejecutar. R-7a se apoya en R-8; R-7b, en el probe de captura con el mismo build y en la guarda estática; 3002 se retira del criterio y MFA queda fuera de alcance. `NETWORK_IP_PROTECTION=PENDING`.

| #   | Subagente | Encargo                                                                                                                                                                                | Skills obligatorias                                     | Insumo                                  |
| --- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------- |
| 1   | `sr-qa`   | Re-evaluar P1-1 con §2 (R-8 para R-7a; probe + mismo build + guarda para R-7b) y P1-2 con §3. Dictaminar PASS o NO PASS con razón; sin ejecutar contra bases ni colas.               | `iwana-test-evidence`, `verification-before-completion` | Encargo v1.5; artefactos v1.4 y probe   |
| 2   | `sec-eng` | Cerrar C1 repitiendo en solo lectura los cuatro listados de Docker y la búsqueda de temporales; revisar C2/C3 contra las disposiciones de §3.                                           | `security-auditor`                                      | Encargo v1.5; ADR-101 v1.1              |

**Secuencia:** (#1 ∥ #2) → apéndice en E-7 → dictamen de AI-EM-ARCH sobre G6. Si `sr-qa` no acepta §2, AI-EM-ARCH emite aparte una corrida completa. Sin commit. G6.5 y G7 siguen separados; antes de G6.5, resolver los 3 fallos del Portal completo ajenos a MOD13.
