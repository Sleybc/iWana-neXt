import { NotFoundException } from '@nestjs/common';
import { LegalTextsService } from './legal-texts.service';
import { LegalTextsController } from './legal-texts.controller';

const legalText = {
  id: '76000000-0000-4000-8000-000000000001',
  type: 'AUTORIZACION',
  version: '3.0',
  sha256: 'a'.repeat(64),
  content: 'Texto sintético para pruebas.',
  format: 'PLAIN',
  publishedAt: '2026-10-14T15:00:00.000Z',
  url: null,
  isCurrent: true,
};

describe('LegalTextsController', () => {
  const service = { getCurrent: jest.fn(), list: jest.fn(), create: jest.fn() };
  let controller: LegalTextsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new LegalTextsController(service as unknown as LegalTextsService);
  });

  it('responde el texto actual dentro de data y devuelve 404 si no está publicado', async () => {
    service.getCurrent.mockResolvedValueOnce(legalText).mockResolvedValueOnce(null);
    await expect(controller.current({ type: 'AUTORIZACION' } as never)).resolves.toEqual({
      data: legalText,
    });
    await expect(
      controller.current({ type: 'POLITICA_TRATAMIENTO' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('valida cada publicación del listado antes de envolver la respuesta', async () => {
    service.list.mockResolvedValue([legalText]);
    await expect(controller.list()).resolves.toEqual({ data: [legalText] });
  });

  it('publica y valida la respuesta de una nueva versión', async () => {
    service.create.mockResolvedValue(legalText);
    await expect(
      controller.create({ type: 'AUTORIZACION', version: '3.0' } as never),
    ).resolves.toEqual({
      data: legalText,
    });
  });
});
