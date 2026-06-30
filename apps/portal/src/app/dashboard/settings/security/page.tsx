import { redirect } from 'next/navigation';

export default function SecuritySettingsPage() {
  redirect('/dashboard/settings/access#politicas-de-autenticacion');
}
