'use client';

import Link from 'next/link';
import { ArrowUpRight, Loader2, Search, Sparkles } from 'lucide-react';
import { GlobalSearchResultItem } from './GlobalSearchResultItem';
import type { GlobalSearchGroup, GlobalSearchItem } from '@/lib/api-client';

const quickLinks: Array<{ href: string; label: string; description: string }> = [
  { href: '/dashboard', label: 'Centro de control', description: 'Vista general de la plataforma' },
  { href: '/tenants', label: 'Empresas', description: 'Consulta y administra organizaciones' },
  { href: '/users', label: 'Usuarios internos', description: 'Revisa accesos y cuentas internas' },
  {
    href: '/audit-logs',
    label: 'Historial de cambios',
    description: 'Revisa qué cambió el equipo recientemente',
  },
  { href: '/settings', label: 'Plataforma', description: 'Ajustes globales y branding' },
];

const groupDescriptions: Record<GlobalSearchGroup['type'], string> = {
  tenants: 'Empresas disponibles en la plataforma',
  users: 'Cuentas internas y responsables operativos',
  modules: 'Secciones y rutas rápidas de navegación',
};

const activeItemTypeLabels: Record<GlobalSearchItem['type'], string> = {
  tenant: 'Empresa',
  user: 'Usuario interno',
  module: 'Sección',
};

export function GlobalSearchOverlay({
  isOpen,
  query,
  isLoading,
  error,
  groups,
  activeItem,
  activeItemId,
  shortcutLabel,
  onSelect,
  onHover,
  onClose,
}: {
  isOpen: boolean;
  query: string;
  isLoading: boolean;
  error: string | null;
  groups: GlobalSearchGroup[];
  activeItem: GlobalSearchItem | null;
  activeItemId: string | null;
  shortcutLabel: string;
  onSelect: (item: GlobalSearchItem) => void;
  onHover: (item: GlobalSearchItem) => void;
  onClose: () => void;
}) {
  if (!isOpen) {
    return null;
  }

  const hasResults = groups.some((group) => group.items.length > 0);
  const trimmedQuery = query.trim();

  return (
    <div className="absolute top-full left-0 right-0 z-50 mt-3">
      <div className="overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] dark:border-dark-border-2 dark:bg-dark-surface-2">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-dark-border-2">
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Comando rápido</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Empresas, usuarios internos y secciones en una sola vista.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] text-gray-500 dark:border-dark-border-2 dark:text-gray-300">
              {shortcutLabel}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50 dark:border-dark-border-2 dark:text-gray-300 dark:hover:bg-dark-surface-3"
            >
              Esc
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-3 py-3">
          {trimmedQuery.length < 2 ? (
            <div className="space-y-4 px-2 py-2">
              <div className="rounded-2xl border border-iwana-primary-100 bg-[linear-gradient(135deg,var(--color-iwana-surface-soft),rgba(255,255,255,0.96))] px-4 py-4 shadow-[var(--shadow-iwana-soft)] dark:border-dark-border dark:bg-dark-surface-3 dark:shadow-none">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-iwana-primary-50 text-iwana-primary dark:bg-iwana-primary-900/40 dark:text-iwana-primary-100">
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-iwana-primary dark:text-white">
                      Muévete más rápido por la plataforma
                    </p>
                    <p className="text-sm text-slate-600 dark:text-gray-400">
                      Busca por nombre de empresa, correo, responsable o sección. Cuando aparezcan
                      resultados, usa las flechas para elegir y presiona Enter para abrir.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Search className="h-4 w-4" aria-hidden="true" />
                <span>Escribe al menos 2 caracteres o abre una ruta frecuente.</span>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                {quickLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="block rounded-2xl border border-gray-200 px-3 py-3 text-left text-sm text-gray-700 transition-colors hover:border-iwana-primary-200 hover:bg-gray-50 dark:border-dark-border-2 dark:text-gray-200 dark:hover:border-dark-border dark:hover:bg-dark-surface-3"
                    onClick={onClose}
                  >
                    <span className="block font-semibold">{link.label}</span>
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                      {link.description}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {isLoading ? (
            <div className="flex items-center gap-2 px-2 py-5 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Buscando coincidencias...</span>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          ) : null}

          {!isLoading && !error && trimmedQuery.length >= 2 && !hasResults ? (
            <div className="space-y-4 px-2 py-5">
              <div className="rounded-2xl border border-dashed border-iwana-primary-200 bg-iwana-surface-soft/70 px-4 py-4 dark:border-iwana-primary-800 dark:bg-dark-surface-3">
                <p className="text-sm font-semibold text-iwana-primary dark:text-white">
                  No encontramos resultados para <strong>{trimmedQuery}</strong>
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-gray-400">
                  Prueba con el nombre de la empresa, un correo, un responsable o una sección como
                  Configuración o Historial.
                </p>
              </div>
              <div className="grid gap-2 text-sm text-gray-500 dark:text-gray-400 md:grid-cols-3">
                <div className="rounded-2xl bg-gray-50 px-3 py-3 dark:bg-dark-surface-3">
                  Revisa si el nombre está completo o si falta una tilde.
                </div>
                <div className="rounded-2xl bg-gray-50 px-3 py-3 dark:bg-dark-surface-3">
                  Busca por correo cuando necesites encontrar una cuenta interna.
                </div>
                <div className="rounded-2xl bg-gray-50 px-3 py-3 dark:bg-dark-surface-3">
                  Usa las rutas frecuentes si solo quieres llegar rápido a una sección.
                </div>
              </div>
            </div>
          ) : null}

          {!isLoading && !error && hasResults ? (
            <div className="space-y-4">
              {groups.map((group) => (
                <section key={group.type} aria-label={group.label} className="space-y-2">
                  <div className="flex items-start justify-between gap-3 px-2">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-400">
                        {group.label}
                      </h3>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {groupDescriptions[group.type]}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-400">{group.total}</span>
                  </div>
                  <div role="listbox" aria-label={group.label} className="space-y-2">
                    {group.items.map((item) => (
                      <GlobalSearchResultItem
                        key={item.id}
                        item={item}
                        isActive={activeItemId === item.id}
                        onClick={() => onSelect(item)}
                        onMouseEnter={() => onHover(item)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null}
        </div>

        <div className="border-t border-gray-100 px-4 py-3 dark:border-dark-border-2">
          {activeItem ? (
            <div className="mb-3 rounded-2xl border border-iwana-primary-100 bg-iwana-primary-50/70 px-3 py-3 dark:border-iwana-primary-800/60 dark:bg-iwana-primary-900/20">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                    Seleccionado
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-iwana-primary dark:text-white">
                    {activeItem.title}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-600 dark:text-gray-400">
                    {activeItem.subtitle}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-600 shadow-[var(--shadow-iwana-card)] dark:bg-dark-surface-3 dark:text-gray-300">
                  <span>{activeItemTypeLabels[activeItem.type]}</span>
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </div>
            </div>
          ) : null}

          <div className="text-xs text-gray-500 dark:text-gray-400">
            Flechas para navegar. Enter para abrir. Esc para cerrar.
          </div>
        </div>
      </div>
    </div>
  );
}
