'use client';

import Link from 'next/link';
import { Loader2, Search } from 'lucide-react';
import { GlobalSearchResultItem } from './GlobalSearchResultItem';
import type { GlobalSearchGroup, GlobalSearchItem } from '@/lib/api-client';

const quickLinks: Array<{ href: string; label: string }> = [
  { href: '/dashboard', label: 'Inicio' },
  { href: '/dashboard/commercial', label: 'Comercial' },
  { href: '/dashboard/crm', label: 'CRM' },
  { href: '/dashboard/crm/subscribers', label: 'Suscriptores' },
  { href: '/dashboard/assurance', label: 'Mesa de ayuda' },
  { href: '/dashboard/settings', label: 'Configuración' },
  { href: '/dashboard/users', label: 'Usuarios' },
];

export function GlobalSearchOverlay({
  isOpen,
  query,
  isLoading,
  error,
  groups,
  activeItemId,
  onSelect,
  onHover,
  onClose,
}: {
  isOpen: boolean;
  query: string;
  isLoading: boolean;
  error: string | null;
  groups: GlobalSearchGroup[];
  activeItemId: string | null;
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
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Búsqueda global
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Usuarios, suscriptores, oportunidades y módulos del portal.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50 dark:border-dark-border-2 dark:text-gray-300 dark:hover:bg-dark-surface-3"
          >
            Esc
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-3 py-3">
          {trimmedQuery.length < 2 ? (
            <div className="space-y-4 px-2 py-2">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Search className="h-4 w-4" aria-hidden="true" />
                <span>Escribe al menos 2 caracteres</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {quickLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-full border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-dark-border-2 dark:text-gray-200 dark:hover:bg-dark-surface-3"
                    onClick={onClose}
                  >
                    {link.label}
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
            <div className="px-2 py-5 text-sm text-gray-500 dark:text-gray-400">
              No hubo resultados para <strong>{trimmedQuery}</strong>.
            </div>
          ) : null}

          {!isLoading && !error && hasResults ? (
            <div className="space-y-4">
              {groups.map((group) => (
                <section key={group.type} aria-label={group.label} className="space-y-2">
                  <div className="flex items-center justify-between px-2">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                      {group.label}
                    </h3>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{group.total}</span>
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

        <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500 dark:border-dark-border-2 dark:text-gray-400">
          Flechas para navegar. Enter para abrir. Esc para cerrar.
        </div>
      </div>
    </div>
  );
}
