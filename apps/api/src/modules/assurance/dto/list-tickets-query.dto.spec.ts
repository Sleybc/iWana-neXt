import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListTicketsQueryDto } from './index';

describe('ListTicketsQueryDto', () => {
  describe('paginación (page/limit)', () => {
    it('acepta limit sin page (regresión del 400 por page requerido)', async () => {
      const dto = plainToInstance(ListTicketsQueryDto, { limit: '20' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.limit).toBe(20);
    });

    it('acepta la omisión total de page y limit', async () => {
      const dto = plainToInstance(ListTicketsQueryDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('convierte page y limit a número', async () => {
      const dto = plainToInstance(ListTicketsQueryDto, { page: '1', limit: '20' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.page).toBe(1);
      expect(dto.limit).toBe(20);
    });

    it('rechaza page menor a 1 (cota conservada)', async () => {
      const dto = plainToInstance(ListTicketsQueryDto, { page: '0' });
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'page')).toBe(true);
    });

    it('rechaza limit mayor a 100 (cota conservada)', async () => {
      const dto = plainToInstance(ListTicketsQueryDto, { limit: '999' });
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'limit')).toBe(true);
    });
  });
});
