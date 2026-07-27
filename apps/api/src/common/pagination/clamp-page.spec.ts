import { BadRequestException } from '@nestjs/common';
import { clampPage } from './clamp-page';

describe('clampPage', () => {
  describe('entradas válidas', () => {
    it('acepta page=1 limit=20 dentro del rango', () => {
      const result = clampPage(1, 20);
      expect(result).toEqual({ page: 1, limit: 20 });
    });

    it('acepta page=99 limit=101 en el límite exacto (9_999)', () => {
      const result = clampPage(99, 101);
      expect(result).toEqual({ page: 99, limit: 101 });
    });

    it('acepta page=333 limit=30 dentro del rango (9_990)', () => {
      const result = clampPage(333, 30);
      expect(result).toEqual({ page: 333, limit: 30 });
    });

    it('acepta combinaciones intermedias válidas', () => {
      expect(clampPage(50, 50)).toEqual({ page: 50, limit: 50 });
      expect(clampPage(200, 25)).toEqual({ page: 200, limit: 25 });
      expect(clampPage(1, 1)).toEqual({ page: 1, limit: 1 });
    });
  });

  describe('page * limit > maxOffset (9_999)', () => {
    it('rechaza page=101 limit=100 (10_100 > 10_000)', () => {
      expect(() => clampPage(101, 100)).toThrow(BadRequestException);
      expect(() => clampPage(101, 100)).toThrow('El número de página excede el límite permitido');
    });

    it('rechaza page=1000 limit=20 (20_000 > 10_000)', () => {
      expect(() => clampPage(1000, 20)).toThrow(BadRequestException);
    });

    it('rechaza page=100_000 limit=1', () => {
      expect(() => clampPage(100_000, 1)).toThrow(BadRequestException);
    });

    it('respeta maxOffset personalizado', () => {
      expect(() => clampPage(11, 10, 100)).toThrow(BadRequestException);
      expect(clampPage(10, 10, 100)).toEqual({ page: 10, limit: 10 });
    });
  });

  describe('page inválida', () => {
    it('rechaza page=0', () => {
      expect(() => clampPage(0, 20)).toThrow(BadRequestException);
      expect(() => clampPage(0, 20)).toThrow('El número de página debe ser al menos 1');
    });

    it('rechaza page negativa', () => {
      expect(() => clampPage(-1, 20)).toThrow(BadRequestException);
    });

    it('rechaza page no numérica (NaN)', () => {
      expect(() => clampPage(NaN, 20)).toThrow(BadRequestException);
      expect(() => clampPage(NaN, 20)).toThrow('Los parámetros de paginación no son válidos');
    });

    it('rechaza page Infinity', () => {
      expect(() => clampPage(Infinity, 20)).toThrow(BadRequestException);
    });

    it('rechaza page no entera (float)', () => {
      expect(() => clampPage(1.5, 20)).toThrow(BadRequestException);
      expect(() => clampPage(1.5, 20)).toThrow('Los parámetros de paginación no son válidos');
    });
  });

  describe('limit inválido', () => {
    it('rechaza limit=0', () => {
      expect(() => clampPage(1, 0)).toThrow(BadRequestException);
      expect(() => clampPage(1, 0)).toThrow('El límite de página debe ser al menos 1');
    });

    it('rechaza limit negativo', () => {
      expect(() => clampPage(1, -5)).toThrow(BadRequestException);
    });

    it('rechaza limit NaN', () => {
      expect(() => clampPage(1, NaN)).toThrow(BadRequestException);
    });

    it('rechaza limit no entero (float)', () => {
      expect(() => clampPage(1, 20.5)).toThrow(BadRequestException);
      expect(() => clampPage(1, 20.5)).toThrow('Los parámetros de paginación no son válidos');
    });
  });

  describe('BL-2: cota alcanzable — el clamp no es código muerto', () => {
    // MAX_PAGE_OFFSET = 9_999; MAX_PAGE = 100; MAX_LIMIT = 100.
    // Con estas cotas page=100, limit=100 → offset=10_000 > 9_999 se rechaza.
    // Si alguien sube MAX_PAGE_OFFSET a 10_000 o más, este test falla
    // porque page*limit ya no lo excede. Si alguien borra clampPage de
    // los servicios, los endpoints dejan de proteger el pool de pgBouncer.
    it('rechaza page=100 limit=100 porque 10_000 excede MAX_PAGE_OFFSET', () => {
      expect(() => clampPage(100, 100)).toThrow(BadRequestException);
      expect(() => clampPage(100, 100)).toThrow('El número de página excede el límite permitido');
    });

    it('acepta page=99 limit=101 justo en el borde del límite (9_999)', () => {
      const result = clampPage(99, 101);
      expect(result).toEqual({ page: 99, limit: 101 });
    });

    it('MAX_PAGE_OFFSET está por debajo de MAX_PAGE × MAX_LIMIT', () => {
      const MAX_PAGE = 100;
      const MAX_LIMIT = 100;
      const maxTheoreticalOffset = MAX_PAGE * MAX_LIMIT;
      // Importado dinámicamente para validar el valor real exportado
      const { MAX_PAGE_OFFSET: exportedMaxOffset } = require('./clamp-page');
      expect(exportedMaxOffset).toBeLessThan(maxTheoreticalOffset);
    });
  });

  describe('el helper no cambia el contrato de respuesta', () => {
    it('devuelve la misma tupla page/limit que recibe', () => {
      const { page, limit } = clampPage(3, 25);
      expect(page).toBe(3);
      expect(limit).toBe(25);
    });

    it('es transparente para el llamador cuando es válido', () => {
      // Debe funcionar exactamente igual que antes para entradas válidas
      const result = clampPage(1, 20);
      const skip = (result.page - 1) * result.limit;
      expect(skip).toBe(0);
    });
  });
});
