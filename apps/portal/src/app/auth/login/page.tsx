// apps/portal/src/app/auth/login/page.tsx
import type { Metadata } from 'next';
import { LoginExperience } from '@/components/auth/LoginExperience';

export const metadata: Metadata = {
  title: 'Iniciar sesión — Portal Corporativo — iWana neXt',
  description: 'Acceso al portal corporativo iWana neXt',
};

export default function LoginPage() {
  return <LoginExperience />;
}
