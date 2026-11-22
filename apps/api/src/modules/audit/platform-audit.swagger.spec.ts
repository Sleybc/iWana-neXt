/**
 * F2-D5: el listado y la exportación de la auditoría de plataforma documentan en
 * OpenAPI los mismos filtros de consulta, incluidos los de exclusión.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PlatformAuditController } from './platform-audit.controller';
import { PlatformAuditService } from './platform-audit.service';

const FILTERS = [
  'action',
  'entityType',
  'userId',
  'fromDate',
  'toDate',
  'excludeSessionEvents',
  'excludeAccessEvents',
];

describe('PlatformAuditController Swagger', () => {
  let app: INestApplication;
  let paths: Record<string, Record<string, { parameters?: Array<{ name: string; in: string }> }>>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PlatformAuditController],
      providers: [{ provide: PlatformAuditService, useValue: {} }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    paths = document.paths as typeof paths;
  });

  afterAll(async () => {
    await app?.close();
  });

  function queryParams(path: string): string[] {
    return (paths[path]?.['get']?.parameters ?? [])
      .filter((param) => param.in === 'query')
      .map((param) => param.name);
  }

  it.each(['/platform-audit-logs', '/platform-audit-logs/export'])(
    '%s documenta todos los filtros, incluidas las exclusiones',
    (path) => {
      expect(queryParams(path)).toEqual(expect.arrayContaining(FILTERS));
    },
  );
});
