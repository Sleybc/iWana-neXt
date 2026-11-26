import Link from 'next/link';
import { buttonVariants } from '@iwana/ui';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import { settingsSectionPanelClassName } from './settings-shell';

const COPY = PLATFORM_UI_COPY.profileNavigation;

export function SecuritySettings() {
  return (
    <section className={settingsSectionPanelClassName} aria-labelledby="platform-security-heading">
      <h2
        id="platform-security-heading"
        className="text-base font-semibold text-iwana-primary dark:text-white"
      >
        {COPY.securityTitle}
      </h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{COPY.securityHelp}</p>
      <Link
        href="/profile#profile-security-heading"
        className={buttonVariants({ variant: 'outline', className: 'mt-4 min-h-11' })}
      >
        {COPY.securityLink}
      </Link>
    </section>
  );
}
