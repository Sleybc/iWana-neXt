'use client';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, LockKeyhole, Mail } from 'lucide-react';
import {
  AUTH_FORM_ICON_LEADING_CLASS,
  AUTH_FORM_INPUT_FOCUS_CLASS,
  AUTH_FORM_INPUT_WITH_LEADING_ICON_CLASS,
  AUTH_FORM_LABEL_CLASS,
  FormStatus,
  ModalLayer,
  Button,
  OtpInput,
  cn,
  overlayEdgeClassName,
} from '@iwana/ui';
import { SESSION_EXPIRED_EVENT, ApiError, clearTerminalSessionError } from '@/lib/api-client';
import { resolveTenantSlug } from '@/lib/tenant-resolution';
import {
  PORTAL_MODAL_DRAWER_STATE_EVENT,
  isPortalModalDrawerOpen,
  isTopMostPortalSideDrawerLayer,
  registerPortalSideDrawerLayer,
  setPortalModalDrawerState,
  unregisterPortalSideDrawerLayer,
} from '@/components/shared/portal-side-drawer-layers';
import { useAuth } from './AuthProvider';

/**
 * Evento interno para abrir el modal de recuperación desde cualquier punto de
 * la app (p. ej. el CTA «Iniciar sesión» de la alerta del drawer de
 * proveedores). Mismo mecanismo de desacople que `SESSION_EXPIRED_EVENT`: sin
 * stores globales ni contextos transversales, un CustomEvent basta.
 */
export const SESSION_RECOVERY_OPEN_EVENT = 'iwana:session-recovery-open';

/** Abre el modal de re-autenticación en sitio. Seguro en SSR (no-op). */
export function openSessionRecovery(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.dispatchEvent(new CustomEvent(SESSION_RECOVERY_OPEN_EVENT));
  } catch {
    // Best-effort: un entorno sin CustomEvent no debe romper al llamador.
  }
}

type RecoveryStep = 'credentials' | 'mfa';

/**
 * Degradación de caminos NO reutilizables dentro del modal (configuración
 * inicial de la verificación en dos pasos y cambio de contraseña temporal):
 * mensaje claro + salida explícita al flujo de página completa. Nunca un
 * dead-end silencioso.
 */
interface BlockedRecoveryPath {
  title: string;
  description: string;
  actionLabel: string;
  href: string;
}

const CREDENTIAL_ERROR_MESSAGES: Record<number, string> = {
  400: 'Falta o es inválido el identificador de la empresa.',
  401: 'Correo o contraseña incorrectos.',
  404: 'Empresa no encontrada o cuenta inexistente.',
  429: 'Demasiados intentos. Espera 1 minuto.',
  500: 'El servicio de autenticación no está disponible en este momento.',
  503: 'El servicio de autenticación no está disponible en este momento.',
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Identidad estable como dueño del estado agregado de drawers modales. */
const SESSION_RECOVERY_DRAWER_OWNER_ID = 'session-recovery-modal';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('disabled') && element.tabIndex !== -1,
  );
}

/**
 * Modal global de recuperación de sesión: se abre cuando la renovación del
 * acceso falla de forma definitiva (`SESSION_EXPIRED_EVENT`) o cuando cualquier
 * superficie llama a `openSessionRecovery()`.
 *
 * Re-autentica EN SITIO reutilizando el flujo de login del AuthProvider
 * (`login` + `completeMfaLogin`), de modo que el usuario no pierde lo que tiene
 * en pantalla (p. ej. el formulario «Nuevo proveedor»). Al éxito libera el
 * estado terminal del cliente (`clearTerminalSessionError`) y cierra SIN
 * redirigir ni recargar.
 */
export function SessionRecoveryModal() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const { login, completeMfaLogin } = useAuth();

  const [requestedOpen, setRequestedOpen] = useState(false);
  const [step, setStep] = useState<RecoveryStep>('credentials');
  const [blocked, setBlocked] = useState<BlockedRecoveryPath | null>(null);
  const [tenantSlug, setTenantSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const layerIdRef = useRef<number | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  if (layerIdRef.current === null) {
    layerIdRef.current = registerNextLayerId();
  }
  const layerId = layerIdRef.current;

  // En rutas de autenticación el modal no aporta nada (ya hay un login en
  // pantalla): el evento se ignora y el modal permanece cerrado.
  const isAuthRoute = pathname.startsWith('/auth');
  const open = requestedOpen && !isAuthRoute;

  useEffect(() => {
    const handleOpen = () => {
      setRequestedOpen(true);
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleOpen);
    window.addEventListener(SESSION_RECOVERY_OPEN_EVENT, handleOpen);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleOpen);
      window.removeEventListener(SESSION_RECOVERY_OPEN_EVENT, handleOpen);
    };
  }, []);

  // Estado limpio en cada apertura: la empresa se resuelve de la sesión previa
  // (el login la persiste) para no pedirla dos veces al mismo usuario.
  useEffect(() => {
    if (!open) {
      return;
    }

    setStep('credentials');
    setBlocked(null);
    setTenantSlug(resolveTenantSlug().slug);
    setEmail('');
    setPassword('');
    setTotpCode('');
    setIsSubmitting(false);
    setErrorMessage(null);
  }, [open]);

  useEffect(() => {
    if (!open) {
      unregisterPortalSideDrawerLayer(layerId);
      const previous = previousActiveElementRef.current;
      previousActiveElementRef.current = null;
      if (previous?.isConnected) {
        previous.focus();
      }
      return;
    }

    registerPortalSideDrawerLayer(layerId);

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousActiveElementRef.current = opener;

    const container = panelRef.current;
    if (!container) {
      return () => unregisterPortalSideDrawerLayer(layerId);
    }

    // Foco inicial en el primer campo del formulario (regla de accesibilidad
    // del modal de re-autenticación).
    const focusTarget = getFocusableElements(container)[0] ?? container;
    const focusFrame = window.requestAnimationFrame(() => {
      if (!isTopMostPortalSideDrawerLayer(layerId)) {
        return;
      }

      const active = document.activeElement;
      const untouched =
        active == null ||
        active === document.body ||
        active === document.documentElement ||
        active === opener;
      if (!untouched) {
        return;
      }

      focusTarget.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopMostPortalSideDrawerLayer(layerId)) {
        return;
      }

      if (event.key === 'Escape') {
        // Cierre por Escape deshabilitado a propósito: con la sesión muerta el
        // modal es la única vía de recuperación de la app. Ofrece salidas
        // explícitas (re-autenticarse aquí o ir al inicio de sesión completo),
        // así que nunca es una trampa sin alternativa.
        event.preventDefault();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const currentContainer = panelRef.current;
      if (!currentContainer) {
        return;
      }

      const elements = getFocusableElements(currentContainer);
      if (elements.length === 0) {
        event.preventDefault();
        currentContainer.focus();
        return;
      }

      const firstElement = elements[0];
      const lastElement = elements[elements.length - 1];
      const activeElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (!firstElement || !lastElement) {
        return;
      }

      if (!activeElement || !currentContainer.contains(activeElement)) {
        event.preventDefault();
        firstElement.focus();
        return;
      }

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKeyDown);
      unregisterPortalSideDrawerLayer(layerId);
    };
  }, [layerId, open]);

  // Chrome inerte bajo el velo y bloqueo de scroll, con identidad propia de
  // dueño para coexistir con drawers ya abiertos (p. ej. el de proveedores):
  // al cerrarse este modal, el bloqueo solo se retira si no quedó ningún otro.
  useEffect(() => {
    if (!open) {
      return;
    }

    setPortalModalDrawerState(SESSION_RECOVERY_DRAWER_OWNER_ID, true);
    document.body.classList.add('overflow-hidden');

    // Si un drawer de fondo se cierra mientras este modal vive, su limpieza
    // retira el bloqueo de forma incondicional: se reafirma aquí.
    const reassertScrollLock = () => {
      document.body.classList.add('overflow-hidden');
    };
    window.addEventListener(PORTAL_MODAL_DRAWER_STATE_EVENT, reassertScrollLock);

    return () => {
      setPortalModalDrawerState(SESSION_RECOVERY_DRAWER_OWNER_ID, false);
      window.removeEventListener(PORTAL_MODAL_DRAWER_STATE_EVENT, reassertScrollLock);
      document.body.classList.remove('overflow-hidden');
      if (isPortalModalDrawerOpen()) {
        document.body.classList.add('overflow-hidden');
      }
    };
  }, [open]);

  const finishRecovery = useCallback(() => {
    // Contrato congelado con el cliente (frente B): libera el estado terminal
    // para que las peticiones vuelvan a salir. Sin redirección ni recarga: el
    // usuario continúa exactamente donde estaba.
    clearTerminalSessionError();
    setRequestedOpen(false);
  }, []);

  const handleCredentialsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const tenantResolution = resolveTenantSlug(tenantSlug);
    if (!tenantResolution.slug) {
      setErrorMessage('Ingresa el identificador de la empresa.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(email, password, tenantResolution.slug);

      if (result === 'mfa_required') {
        setStep('mfa');
        return;
      }

      if (result === 'mfa_setup_required') {
        setBlocked({
          title: 'Configura la verificación en dos pasos',
          description:
            'Tu cuenta debe configurar la verificación en dos pasos antes de continuar. Al continuar saldrás de esta pantalla.',
          actionLabel: 'Configurar verificación',
          href: '/auth/mfa/setup',
        });
        return;
      }

      if (result === 'password_reset_required') {
        setBlocked({
          title: 'Cambia tu contraseña temporal',
          description:
            'Tu cuenta usa una contraseña temporal y debe actualizarla antes de continuar. Al continuar saldrás de esta pantalla.',
          actionLabel: 'Cambiar contraseña',
          href: '/auth/change-password',
        });
        return;
      }

      finishRecovery();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(
          CREDENTIAL_ERROR_MESSAGES[err.status] ?? 'Error inesperado. Intenta de nuevo.',
        );
      } else {
        setErrorMessage('Error de conexión. Verifica tu red.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMfaSubmit = async (codeToVerify: string) => {
    if (codeToVerify.length !== 6) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await completeMfaLogin(codeToVerify);

      if (result === 'password_reset_required') {
        setBlocked({
          title: 'Cambia tu contraseña temporal',
          description:
            'Tu cuenta usa una contraseña temporal y debe actualizarla antes de continuar. Al continuar saldrás de esta pantalla.',
          actionLabel: 'Cambiar contraseña',
          href: '/auth/change-password',
        });
        return;
      }

      finishRecovery();
    } catch (err) {
      setTotpCode('');
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setErrorMessage('Código incorrecto. Intenta de nuevo.');
        } else if (err.status === 429) {
          setErrorMessage('Demasiados intentos. Espera 1 minuto.');
        } else {
          setErrorMessage('No fue posible verificar el código. Intenta de nuevo.');
        }
      } else {
        setErrorMessage('Error de conexión. Verifica tu red.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTotpChange = (value: string) => {
    setTotpCode(value);
    setErrorMessage(null);
    // Paridad con el flujo de login: al sexto dígito se verifica solo.
    if (value.length === 6) {
      void handleMfaSubmit(value);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <ModalLayer align="center" className="px-4 py-6">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={cn(
          overlayEdgeClassName,
          'relative w-full max-w-md overflow-y-auto rounded-2xl border bg-white p-6 shadow-2xl outline-none dark:bg-dark-surface-2',
        )}
      >
        <p className="portal-eyebrow">Sesión</p>
        <h2 id={titleId} className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
          Vuelve a iniciar sesión
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Por seguridad, confirma tu identidad para continuar. No perderás lo que tienes en
          pantalla.
        </p>

        {blocked ? (
          <div className="mt-5 flex flex-col gap-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 dark:border-amber-900/70 dark:bg-amber-950/25">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                {blocked.title}
              </p>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-200/90">
                {blocked.description}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={isSubmitting}
                onClick={() => {
                  setBlocked(null);
                  setStep('credentials');
                  setErrorMessage(null);
                }}
              >
                Volver
              </Button>
              <Button type="button" onClick={() => router.push(blocked.href)}>
                {blocked.actionLabel}
              </Button>
            </div>
          </div>
        ) : step === 'mfa' ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleMfaSubmit(totpCode);
            }}
            className="mt-5 flex flex-col gap-4"
            noValidate
          >
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Ingresa el código de tu aplicación de autenticación para verificar tu identidad.
            </p>
            <OtpInput
              value={totpCode}
              onChange={handleTotpChange}
              error={Boolean(errorMessage)}
              disabled={isSubmitting}
              className="justify-center"
            />
            <FormStatus
              status={errorMessage ? 'error' : 'idle'}
              message={errorMessage ?? undefined}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={isSubmitting}
                onClick={() => {
                  setStep('credentials');
                  setTotpCode('');
                  setErrorMessage(null);
                }}
              >
                Volver
              </Button>
              <Button type="submit" loading={isSubmitting} disabled={totpCode.length !== 6}>
                Verificar código
              </Button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={(event) => void handleCredentialsSubmit(event)}
            className="mt-5 flex flex-col gap-4"
            noValidate
            aria-label="Formulario de inicio de sesión"
          >
            <label className="flex flex-col gap-2">
              <span className={AUTH_FORM_LABEL_CLASS}>Empresa</span>
              <div className="relative group">
                <Building2 className={AUTH_FORM_ICON_LEADING_CLASS} aria-hidden="true" />
                <input
                  type="text"
                  placeholder="ejemplo: isp-demo"
                  autoComplete="organization"
                  value={tenantSlug}
                  onChange={(event) => setTenantSlug(event.target.value)}
                  className={cn(
                    AUTH_FORM_INPUT_WITH_LEADING_ICON_CLASS,
                    AUTH_FORM_INPUT_FOCUS_CLASS,
                  )}
                />
              </div>
            </label>

            <label className="flex flex-col gap-2">
              <span className={AUTH_FORM_LABEL_CLASS}>Correo electrónico</span>
              <div className="relative group">
                <Mail className={AUTH_FORM_ICON_LEADING_CLASS} aria-hidden="true" />
                <input
                  type="email"
                  placeholder="usuario@iwananetwork.com"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={cn(
                    AUTH_FORM_INPUT_WITH_LEADING_ICON_CLASS,
                    AUTH_FORM_INPUT_FOCUS_CLASS,
                  )}
                />
              </div>
            </label>

            <label className="flex flex-col gap-2">
              <span className={AUTH_FORM_LABEL_CLASS}>Contraseña</span>
              <div className="relative group">
                <LockKeyhole className={AUTH_FORM_ICON_LEADING_CLASS} aria-hidden="true" />
                <input
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={cn(
                    AUTH_FORM_INPUT_WITH_LEADING_ICON_CLASS,
                    AUTH_FORM_INPUT_FOCUS_CLASS,
                  )}
                />
              </div>
            </label>

            <FormStatus
              status={errorMessage ? 'error' : 'idle'}
              message={errorMessage ?? undefined}
            />

            <Button type="submit" loading={isSubmitting}>
              Iniciar sesión
            </Button>

            <button
              type="button"
              className="text-sm text-gray-500 underline-offset-4 hover:text-gray-700 hover:underline dark:text-gray-400 dark:hover:text-gray-200"
              onClick={() => router.push('/auth/login')}
            >
              Ir al inicio de sesión completo
            </button>
          </form>
        )}
      </div>
    </ModalLayer>
  );
}

/** Contador de capa propia del modal: uno por instancia montada (hay una sola). */
let nextSessionRecoveryLayerId = 1;

function registerNextLayerId(): number {
  const id = nextSessionRecoveryLayerId;
  nextSessionRecoveryLayerId += 1;
  return id;
}
