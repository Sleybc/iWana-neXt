'use client';

import { useState } from 'react';
import { ContactAttemptsPanel } from './ContactAttemptsPanel';
import { ConsentsPanel } from './ConsentsPanel';
import { CoverageChecksPanel } from './CoverageChecksPanel';

type TabId = 'contact' | 'consents' | 'coverage';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  { id: 'contact', label: 'Contacto', icon: null },
  { id: 'consents', label: 'Consentimientos', icon: null },
  { id: 'coverage', label: 'Cobertura', icon: null },
];

interface ExpedienteTabsContainerProps {
  expedienteId: string;
}

export function ExpedienteTabsContainer({ expedienteId }: ExpedienteTabsContainerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('contact');

  return (
    <div className="space-y-4">
      <div className="border-b border-gray-200 dark:border-dark-border">
        <nav className="-mb-px flex gap-6" aria-label="Tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-iwana-primary text-iwana-primary dark:border-iwana-primary-300 dark:text-iwana-primary-300'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-dark-border dark:hover:text-gray-300'
              }`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="space-y-6">
        {activeTab === 'contact' && (
          <section aria-label="Panel de contacto">
            <ContactAttemptsPanel expedienteId={expedienteId} />
          </section>
        )}
        {activeTab === 'consents' && (
          <section aria-label="Panel de consentimientos">
            <ConsentsPanel expedienteId={expedienteId} />
          </section>
        )}
        {activeTab === 'coverage' && (
          <section aria-label="Panel de cobertura">
            <CoverageChecksPanel expedienteId={expedienteId} />
          </section>
        )}
      </div>
    </div>
  );
}
