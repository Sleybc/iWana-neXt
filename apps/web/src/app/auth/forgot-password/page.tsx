import Link from 'next/link';
import { LoginBrandPanel } from '@/components/auth/LoginBrandPanel';

/**
 * La API actual no expone un flujo self-service de recuperación para usuarios de plataforma.
 * Esta pantalla evita un enlace roto y deja explícita la ruta operativa aprobada hoy.
 */
export default function PlatformForgotPasswordPage() {
  return (
    <main className="relative flex min-h-screen w-full flex-col overflow-hidden bg-iwana-primary lg:flex-row">
      <LoginBrandPanel
        title="Recuperación administrada"
        subtitle="El acceso de plataforma se restablece por un canal controlado para proteger la operación interna."
      />

      <div className="relative flex w-full items-center justify-center bg-iwana-primary p-6 lg:w-1/2 lg:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(var(--color-iwana-secondary)_1px,transparent_1px)] bg-[length:32px_32px] opacity-5" />

        <section className="relative z-10 w-full max-w-[520px] rounded-[28px] bg-white p-8 shadow-[0_24px_90px_rgba(15,23,42,0.25)] lg:p-12">
          <div className="space-y-4">
            <p className="portal-eyebrow">Seguridad de acceso</p>
            <h1 className="text-3xl font-bold text-iwana-primary">
              Coordina el restablecimiento con un administrador
            </h1>
            <p className="text-slate-600">
              Esta consola no ofrece recuperación autoservicio. Si perdiste tu contraseña o no
              puedes completar el ingreso, solicita apoyo por el canal interno autorizado para que
              un administrador de plataforma o soporte valide tu identidad y gestione el
              restablecimiento.
            </p>
            <div className="rounded-2xl border border-iwana-primary-100 bg-iwana-surface-soft px-4 py-4 text-sm text-slate-700">
              <p className="font-semibold text-iwana-primary">Qué debes hacer ahora</p>
              <ul className="mt-3 space-y-2">
                <li>Usa el canal interno autorizado para reportar el bloqueo.</li>
                <li>Comparte tu correo corporativo y explica si olvidaste la contraseña o si el ingreso falló.</li>
                <li>Espera la confirmación del equipo responsable antes de intentar ingresar de nuevo.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Mantenemos este proceso administrado para proteger cuentas con alcance operativo y
              trazabilidad centralizada.
            </div>
          </div>

          <div className="mt-8 flex gap-3">
            <Link
              href="/auth/login"
              className="inline-flex items-center justify-center rounded-2xl bg-iwana-secondary px-5 py-3 text-sm font-bold text-iwana-primary transition-colors hover:bg-iwana-secondary-600"
            >
              Volver al login
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-800"
            >
              Ir al inicio
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
