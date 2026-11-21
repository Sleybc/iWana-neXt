import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { AuditRowBasic, type AuditBasicEntry } from './AuditRowBasic';

const NOW = new Date('2026-11-21T12:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

function entry(createdAt: string): AuditBasicEntry {
  return {
    id: 'a-1',
    action: 'UPDATE',
    entityType: 'Tenant',
    entityId: 't-1',
    userId: null,
    actor: null,
    ipAddress: null,
    userAgent: null,
    requestId: null,
    oldValue: null,
    newValue: null,
    createdAt,
  };
}

function renderTime(createdAt: string) {
  const { container } = render(
    <AuditRowBasic entry={entry(createdAt)} expanded={false} onToggle={() => undefined} />,
  );
  const time = container.querySelector('time');
  if (!time) throw new Error('sin <time>');
  return time;
}

describe('AuditRowBasic — tiempo con tope de 30 días', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('a 29 días muestra el tiempo relativo', () => {
    expect(renderTime(new Date(NOW - 29 * DAY).toISOString())).toHaveTextContent('hace 29 días');
  });

  it('a 31 días muestra la fecha corta', () => {
    const createdAt = new Date(NOW - 31 * DAY).toISOString();
    const expected = new Date(createdAt).toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'short',
    });
    const time = renderTime(createdAt);
    expect(time).toHaveTextContent(expected);
    expect(time).not.toHaveTextContent(/hace/);
  });

  it('conserva la fecha completa en title', () => {
    const createdAt = new Date(NOW - 31 * DAY).toISOString();
    expect(renderTime(createdAt)).toHaveAttribute(
      'title',
      new Date(createdAt).toLocaleString('es-CO'),
    );
  });
});
