# INFORME-MOD13-INTERFACES-SEGURIDAD-v1.5

**Estado:** PASS de seguridad del delta O2-M y del guard 401/403 por revisión independiente SEC-ENG.  
**Fecha:** 2026-10-27  
**Alcance:** revisión independiente del delta runtime de interfaces IPv4, D-14, tenancy, privacidad de auditoría y protección de IP locales. No cierra G6, CA-R12, G6.5 ni G7.

## Dictamen

SEC-ENG dio PASS del delta revisado en O2-M y confirmó también el ajuste del guard 401/403. Durante el cierre QA se detectó que `NetworkTenantGuard` respondía 401 ante claims válidos de otro tenant. El perfil SR-QA y AGENTS.md requieren 403 para ese caso. El guard ahora conserva 401 ante credenciales/contexto ausentes o inválidos y emite 403 `FORBIDDEN` cuando los claims tenant/schema no coinciden con el contexto; SEC-ENG verificó que el cuerpo no expone claims ni schemas y coincide con `NetworkErrorDto` y el contrato.

## Controles revisados

- **Pausa de aprovisionamiento:** el contexto completo que podría reemitir `routerInstruction` devuelve `409 RESERVATIONS_PAUSED` antes de consultar el adaptador cuando la pausa está activa. La proyección técnica de cinco campos no contiene instrucciones y continúa disponible. `release` y `certify` no quedan bloqueados.
- **Privacidad de auditoría:** los campos de dirección, `managementHost`, instrucción de router, IP de suscriptor y texto libre se omiten en la copia de auditoría según las allowlists revisadas. La respuesta HTTP permanece intacta y la metadata de IP/User-Agent del evento automático se conserva. La evidencia PostgreSQL comprueba que no se almacenan IP ni texto de razón en las filas verificadas.
- **Protección de IPAM:** ADR-101 aprobada se aplica tenant-wide en validación manual, asignación automática y cálculo de ocupación; cubre IP locales de otros routers e interfaces inactivas. La regularización reutiliza la protección. El orden L1→L2 y las direcciones de locks L2 ordenadas evitan carreras y deadlocks en los casos cubiertos.
- **Tenancy MT-01:** la prueba PostgreSQL presenta claims de tenant B con contexto A y verifica 403, ninguna consulta/escritura al schema A y filas idénticas antes/después. La prueba unitaria distingue sesión ausente, claims con contexto ausente (401) y mismatch (403). SEC-ENG confirmó que el body `FORBIDDEN` es consistente con el contrato.

## Residuales y límites

- Los registros transaccionales suplementarios que usan `AuditService.logWithin` no reciben IP/User-Agent cuando el llamador no los proporciona; el interceptor automático sí conserva esa metadata. Se mantiene documentado como residual, no como bloqueo de aislamiento.
- La clasificación de direcciones IP como dato personal o su retención regulada requiere verificación con fuente oficial; este informe no inventa una conclusión normativa.
- `ipProtection` permanece `PENDING`. La migración 165 con `up/down/up` real no sustituye el ensayo operativo CA-R12: la captura sigue deshabilitada hasta demostrar rollback fail-closed y conservar la protección en las rutas IPAM.
- La configuración validada acepta `NETWORK_IP_PROTECTION=ACTIVE|PENDING` y defaulta a `PENDING`. SEC-ENG dio PASS condicionado al estado actual: si alguien configura `ACTIVE` antes de CA-R12, las rutas permiten captura y el código no verifica automáticamente la aprobación del gate operativo. El entorno actual no tiene override y permanece cerrado. No cambiar a `ACTIVE` antes de la evidencia aprobada de CA-R12.
- La cobertura statements/branches de algunos archivos core queda bajo 80%; G6 permanece parcial. CI Linux por SHA y habilitación productiva son gates independientes.
- La suite de eventos de aprovisionamiento que requiere `IWANA_REDIS_INTEGRATION_AVAILABLE=true` no se contó; cinco tests quedaron fuera del conteo de PASS.

## Evidencia vinculada

- [Matriz CA → pruebas v1.4](../quality/2026-10-26-mod13-interfaces-matriz.md).
- [Informe de calidad O3 v1.0](INFORME-MOD13-INTERFACES-CALIDAD-v1.0.md).
- [Plan de orquestación v1.9](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md).
- [ADR-101 aprobada](../adrs/ADR-101-Enmienda-ADR-098-Proteccion-IP-Infraestructura-MOD13-v1.1.md).

**Firma:** AI-SEC-ENG. PASS del delta O2-M y del comportamiento 401/403; PASS condicionado al estado actual `PENDING`. NO PASS para activar captura o cerrar CA-R12 hasta el ensayo fail-closed y su revisión aprobada. No autoriza despliegue a producción.

**Nota posterior (2026-10-27, cierre E7_resume v1.5):** este informe conserva su alcance de revisión del delta y no dictamina gates. El dictamen posterior de AI-EM-ARCH sobre la re-revisión de E7 es **G6 PASS**; `NETWORK_IP_PROTECTION=PENDING` y la captura local siguen deshabilitadas. Ver [apéndice E7_resume v1.5](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md).
