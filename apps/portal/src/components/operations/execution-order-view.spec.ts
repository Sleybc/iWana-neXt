import { getExecutionOrderCompletionDisplay } from './execution-order-view';

describe('getExecutionOrderCompletionDisplay', () => {
  describe('con completed y total', () => {
    it('redondea el porcentaje a dos decimales', () => {
      const display = getExecutionOrderCompletionDisplay({ completed: 1, total: 3 });
      expect(display.value).toBe(33.33);
    });

    it('redondea hacia arriba al segundo decimal', () => {
      const display = getExecutionOrderCompletionDisplay({ completed: 2, total: 3 });
      expect(display.value).toBe(66.67);
    });

    it('mantiene enteros sin decimales', () => {
      const display = getExecutionOrderCompletionDisplay({ completed: 3, total: 3 });
      expect(display.value).toBe(100);
      expect(display.isComplete).toBe(true);
    });

    it('expone la etiqueta de conteo', () => {
      const display = getExecutionOrderCompletionDisplay({ completed: 1, total: 3 });
      expect(display.label).toBe('1 de 3');
    });

    it('devuelve 0 cuando el total es 0', () => {
      const display = getExecutionOrderCompletionDisplay({ completed: 0, total: 0 });
      expect(display.value).toBe(0);
    });

    it('acota porcentajes fuera de rango', () => {
      const display = getExecutionOrderCompletionDisplay({ completed: 5, total: 3 });
      expect(display.value).toBe(100);
    });
  });

  describe('solo con progress', () => {
    it('redondea el porcentaje a dos decimales en la etiqueta', () => {
      const display = getExecutionOrderCompletionDisplay({ progress: 33.33333333333333 });
      expect(display.value).toBe(33.33);
      expect(display.label).toBe('33.33%');
    });

    it('acota valores negativos y mayores a 100', () => {
      expect(getExecutionOrderCompletionDisplay({ progress: -5 }).value).toBe(0);
      expect(getExecutionOrderCompletionDisplay({ progress: 150 }).value).toBe(100);
    });
  });

  it('sin datos devuelve progreso no disponible', () => {
    const display = getExecutionOrderCompletionDisplay(null);
    expect(display.value).toBe(0);
    expect(display.label).toBe('Progreso no disponible');
    expect(display.isComplete).toBe(false);
  });
});
