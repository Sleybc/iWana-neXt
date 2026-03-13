// apps/portal/src/app/dashboard/layout.tsx
import type { ReactNode } from 'react';

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <aside
        className="hidden lg:flex w-[240px] flex-col flex-shrink-0 h-screen sticky top-0"
        style={{ backgroundColor: '#17163A' }}
      >
        <div
          className="flex items-center gap-3 px-5 py-4 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(165,195,48,0.2)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#A5C330" />
            </svg>
          </div>
          <span className="text-white font-bold text-sm">iWana neXt</span>
        </div>
        <nav className="flex-1 px-3 py-4">
          <ul className="space-y-1">
            {[
              { href: '/dashboard', label: 'Inicio' },
              { href: '/services', label: 'Servicios' },
              { href: '/billing', label: 'Facturación' },
              { href: '/support', label: 'Soporte' },
              { href: '/profile', label: 'Mi perfil' },
            ].map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors"
                  style={{ color: 'rgba(255,255,255,0.7)' }}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="flex-1 flex flex-col overflow-auto">{children}</div>
    </div>
  );
}
