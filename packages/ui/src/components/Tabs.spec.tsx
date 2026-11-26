/** @jest-environment jsdom */
import { act } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const mount = (element: ReactElement) => act(() => root.render(element));

const tab = (label: string) => {
  const found = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
    (button) => button.textContent === label,
  );
  if (!found) throw new Error(`No existe la pestaña ${label}`);
  return found;
};

/** Pulsa la tecla sobre la pestaña y devuelve el evento para consultar `defaultPrevented`. */
const press = (label: string, key: string) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => {
    tab(label).focus();
    tab(label).dispatchEvent(event);
  });
  return event;
};

const expectActive = (label: string) => {
  expect(document.activeElement).toBe(tab(label));
  expect(tab(label).getAttribute('aria-selected')).toBe('true');
};

/** Activación manual: el foco llega a `focused` y la selección sigue en `selected`. */
const expectFocusOnly = (focused: string, selected: string) => {
  expect(document.activeElement).toBe(tab(focused));
  expect(tab(selected).getAttribute('aria-selected')).toBe('true');
  if (focused !== selected) expect(tab(focused).getAttribute('aria-selected')).toBe('false');
};

interface SampleProps {
  initial?: string;
  orientation?: 'horizontal' | 'vertical';
  disabled?: string[];
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  onValueChange?: (value: string) => void;
}

const Sample = ({
  initial = 'a',
  orientation,
  disabled = [],
  onKeyDown,
  onValueChange,
}: SampleProps) => (
  <Tabs defaultValue={initial} {...(onValueChange ? { onValueChange } : {})}>
    <TabsList
      {...(orientation ? { 'aria-orientation': orientation } : {})}
      {...(onKeyDown ? { onKeyDown } : {})}
    >
      {['a', 'b', 'c'].map((value) => (
        <TabsTrigger key={value} value={value} disabled={disabled.includes(value)}>
          {value.toUpperCase()}
        </TabsTrigger>
      ))}
    </TabsList>
    {['a', 'b', 'c'].map((value) => (
      <TabsContent key={value} value={value}>
        Panel {value}
      </TabsContent>
    ))}
  </Tabs>
);

describe('Tabs: teclado', () => {
  it.each([
    ['ArrowRight', 'A', 'B'],
    ['ArrowRight', 'C', 'A'],
    ['ArrowLeft', 'B', 'A'],
    ['ArrowLeft', 'A', 'C'],
    ['Home', 'C', 'A'],
    ['End', 'A', 'C'],
  ])('horizontal: %s desde %s lleva el foco a %s sin activarla', (key, from, to) => {
    const onValueChange = jest.fn();
    mount(<Sample initial={from.toLowerCase()} onValueChange={onValueChange} />);
    const event = press(from, key);
    expectFocusOnly(to, from);
    expect(container.querySelector('[role="tabpanel"]')?.textContent).toBe(
      `Panel ${from.toLowerCase()}`,
    );
    expect(onValueChange).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it.each([
    ['ArrowDown', 'A', 'B'],
    ['ArrowDown', 'C', 'A'],
    ['ArrowUp', 'B', 'A'],
    ['ArrowUp', 'A', 'C'],
    ['Home', 'C', 'A'],
    ['End', 'A', 'C'],
  ])('vertical: %s desde %s lleva el foco a %s sin activarla', (key, from, to) => {
    const onValueChange = jest.fn();
    mount(
      <Sample initial={from.toLowerCase()} orientation="vertical" onValueChange={onValueChange} />,
    );
    press(from, key);
    expectFocusOnly(to, from);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it.each(['Enter', ' '])(
    '%p no lo intercepta la lista: el botón activa con su clic nativo',
    (key) => {
      const onValueChange = jest.fn();
      mount(<Sample onValueChange={onValueChange} />);
      press('A', 'ArrowRight');
      const event = press('B', key);
      expect(event.defaultPrevented).toBe(false);
      // jsdom no convierte Enter/Espacio en clic; el E2E cubre la activación nativa.
      act(() => tab('B').click());
      expectActive('B');
      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange).toHaveBeenCalledWith('b');
    },
  );

  it.each<['horizontal' | 'vertical', string]>([
    ['horizontal', 'ArrowDown'],
    ['horizontal', 'ArrowUp'],
    ['vertical', 'ArrowRight'],
    ['vertical', 'ArrowLeft'],
  ])('%s: %s queda para el navegador', (orientation, key) => {
    mount(<Sample initial="b" orientation={orientation} />);
    const event = press('B', key);
    expectActive('B');
    expect(event.defaultPrevented).toBe(false);
  });

  it.each([
    ['ArrowRight', 'a', ['b'], 'A', 'C'],
    ['ArrowLeft', 'c', ['b'], 'C', 'A'],
    ['Home', 'c', ['a'], 'C', 'B'],
    ['End', 'a', ['c'], 'A', 'B'],
  ])('%s salta la pestaña deshabilitada', (key, initial, disabled, from, to) => {
    mount(<Sample initial={initial} disabled={disabled} />);
    press(from, key);
    expectFocusOnly(to, from);
  });

  it('respeta el preventDefault del consumidor', () => {
    const onKeyDown = jest.fn((event: KeyboardEvent<HTMLDivElement>) => event.preventDefault());
    mount(<Sample onKeyDown={onKeyDown} />);
    press('A', 'ArrowRight');
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expectActive('A');
  });

  it('un onKeyDown del consumidor sin preventDefault no anula la navegación', () => {
    const onKeyDown = jest.fn();
    mount(<Sample onKeyDown={onKeyDown} />);
    press('A', 'ArrowRight');
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expectFocusOnly('B', 'A');
  });

  it('el tabIndex sigue a la pestaña seleccionada, no a la enfocada', () => {
    mount(<Sample />);
    const order = () => ['A', 'B', 'C'].map((label) => tab(label).tabIndex);
    expect(order()).toEqual([0, -1, -1]);
    press('A', 'ArrowRight');
    expect(order()).toEqual([0, -1, -1]);
    act(() => tab('C').click());
    expect(order()).toEqual([-1, -1, 0]);
  });
});

describe('Tabs: lista anidada', () => {
  const outerChange = jest.fn();

  beforeEach(() => {
    outerChange.mockClear();
    mount(
      <Tabs defaultValue="a" onValueChange={outerChange}>
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <Tabs defaultValue="x">
            <TabsList aria-orientation="vertical">
              <TabsTrigger value="x">X</TabsTrigger>
              <TabsTrigger value="y">Y</TabsTrigger>
            </TabsList>
          </Tabs>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
  });

  it('la lista exterior salta las pestañas interiores', () => {
    press('A', 'ArrowRight');
    expectFocusOnly('B', 'A');
    expect(tab('X').getAttribute('aria-selected')).toBe('true');
  });

  it('la lista interior navega sin mover la exterior', () => {
    press('X', 'ArrowDown');
    expectFocusOnly('Y', 'X');
    expect(outerChange).not.toHaveBeenCalled();
  });

  it('la exterior ignora las teclas que la interior no atiende', () => {
    const event = press('X', 'ArrowRight');
    expectActive('X');
    expect(outerChange).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
