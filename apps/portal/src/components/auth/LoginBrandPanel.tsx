// apps/portal/src/components/auth/LoginBrandPanel.tsx

/**
 * Panel izquierdo del login del portal de suscriptores.
 * Gradiente ligeramente más accesible que el admin.
 */
export function LoginBrandPanel() {
  return (
    <div
      className="hidden lg:flex lg:w-2/5 flex-col justify-between p-10 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #17163A 0%, #534FD4 100%)' }}
    >
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, #A5C330 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(165,195,48,0.2)' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#A5C330" />
            <path d="M2 17l10 5 10-5" stroke="#A5C330" strokeWidth="2" strokeLinecap="round" />
            <path d="M2 12l10 5 10-5" stroke="#A5C330" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <span className="text-white font-bold text-xl">iWana neXt</span>
      </div>

      <div className="relative z-10 flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold text-white leading-tight">Conecta tu mundo</h1>
          <p className="mt-3 text-base" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Accede a tu portal de suscriptor y gestiona tus servicios de conectividad
          </p>
        </div>
        <div
          className="rounded-2xl p-5"
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-[#A5C330]" aria-hidden="true" />
            <span className="text-sm font-medium text-white">Tu conexión te espera</span>
          </div>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Gestiona tu plan, consulta facturas y reporta incidencias desde un solo lugar.
          </p>
        </div>
      </div>

      <div className="relative z-10">
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          © 2026 iWana Technologies
        </p>
      </div>
    </div>
  );
}
