import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryPlatformAuditLogsDto } from './query-platform-audit-logs.dto';

/** `excludeSessionEvents` llega como texto de query string (PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE2 §A.3). */
describe('QueryPlatformAuditLogsDto.excludeSessionEvents', () => {
  const build = (query: Record<string, unknown>) =>
    plainToInstance(QueryPlatformAuditLogsDto, query);

  it("'true' se convierte en true y valida", async () => {
    const dto = build({ excludeSessionEvents: 'true' });
    expect(dto.excludeSessionEvents).toBe(true);
    expect(await validate(dto)).toHaveLength(0);
  });

  it("'false' se convierte en false (no en true por ser texto no vacío) y valida", async () => {
    const dto = build({ excludeSessionEvents: 'false' });
    expect(dto.excludeSessionEvents).toBe(false);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('ausente queda en false por defecto', async () => {
    const dto = build({});
    expect(dto.excludeSessionEvents).toBe(false);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('un texto que no es booleano se rechaza', async () => {
    const errors = await validate(build({ excludeSessionEvents: 'yes' }));
    expect(errors.map((e) => e.property)).toEqual(['excludeSessionEvents']);
  });
});
