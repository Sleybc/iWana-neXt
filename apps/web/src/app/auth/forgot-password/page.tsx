import Link from 'next/link';
import { PlatformAuthExperience } from '@/components/auth/PlatformAuthExperience';

/**
 * La API actual no expone un flujo self-service de recuperación para usuarios de plataforma.
 * Esta pantalla evita un enlace roto y deja explícita la ruta operativa aprobada hoy.
 */
export default function PlatformForgotPasswordPage() {
  return (
    <PlatformAuthExperience
      ariaLabel="Recuperación de acceso administrada"
      shellTestId="platform-forgot-password-shell"
      asideAccent="Recuperación administrada"
      asideDescription="El acceso de plataforma se restablece por un canal controlado para proteger la operación interna."
      panelClassName="max-w-[520px]"
      intro={
        <>
          <p className="portal-eyebrow mb-3">Seguridad de acceso</p>
          <h2 className="mb-2 text-3xl font-bold text-iwana-primary dark:text-white">
            Coordina el restablecimiento con un administrador
          </h2>
          <p className="text-base text-slate-600 dark:text-gray-400">
            Esta consola no ofrece recuperación autoservicio. Si perdiste tu contraseña o no puedes
            completar el ingreso, solicita apoyo por el canal interno autorizado para que un
            administrador de plataforma o soporte valide tu identidad y gestione el
            restablecimiento.
          </p>
        </>
      }
      form={
        <div className="space-y-4">
          <div className="rounded-2xl border border-iwana-primary-100 bg-iwana-surface-soft px-4 py-4 text-sm text-slate-700 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300">
            <p className="font-semibold text-iwana-primary dark:text-white">
              Qué debes hacer ahora
            </p>
            <ul className="mt-3 space-y-2">
              <li>Usa el canal interno autorizado para reportar el bloqueo.</li>
              <li>
                Comparte tu correo corporativo y explica si olvidaste la contraseña o si el ingreso
                falló.
              </li>
              <li>
                Espera la confirmación del equipo responsable antes de intentar ingresar de nuevo.
              </li>
            </ul>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            Mantenemos este proceso administrado para proteger cuentas con alcance operativo y
            trazabilidad centralizada.
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
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-800 dark:border-dark-border dark:text-gray-300 dark:hover:border-dark-border-2 dark:hover:text-white"
            >
              Ir al inicio
            </Link>
          </div>
        </div>
      }
    />
  );
}
