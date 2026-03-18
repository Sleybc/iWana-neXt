import Link from 'next/link';
import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel';

/**
 * La API actual no expone un flujo self-service de recuperación para usuarios de plataforma.
 * Esta pantalla evita un enlace roto y deja explícita la ruta operativa aprobada hoy.
 */
export default function PlatformForgotPasswordPage() {
  return (
    <main className="relative min-h-screen w-full flex flex-col lg:flex-row overflow-hidden bg-[#181818]">
      <LoginBrandPanel
        title="Recuperación administrada"
        subtitle="El acceso de plataforma se gestiona por un canal controlado para SYSTEM_ADMIN e IWANA_SUPPORT."
      />

      <div className="w-full lg:w-1/2 bg-[#181818] flex items-center justify-center p-6 lg:p-12 relative">
        <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#A5C330_1px,transparent_1px)] bg-[length:32px_32px]" />

        <section className="w-full max-w-[520px] rounded-2xl bg-white p-8 lg:p-12 shadow-2xl relative z-10">
          <div className="space-y-4">
            <h1 className="text-3xl font-bold text-[#181818]">Solicita soporte de acceso</h1>
            <p className="text-slate-500">
              El módulo actual no publica recuperación autoservicio para cuentas de plataforma. Para
              restablecer el acceso, usa el canal corporativo autorizado de soporte iWana y valida
              el incidente con el equipo responsable.
            </p>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Mantener este flujo fuera del autoservicio evita exponer recuperación sobre usuarios
              del schema público sin un contrato backend aprobado.
            </div>
          </div>

          <div className="mt-8 flex gap-3">
            <Link
              href="/auth/login"
              className="inline-flex items-center justify-center rounded-xl bg-[#A5C330] px-5 py-3 text-sm font-bold text-[#181818] hover:bg-[#94b126] transition-colors"
            >
              Volver al login
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-medium text-slate-600 hover:border-slate-300 hover:text-slate-800 transition-colors"
            >
              Ir al inicio
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
