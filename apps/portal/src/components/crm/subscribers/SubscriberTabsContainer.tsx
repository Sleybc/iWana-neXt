'use client';

import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@iwana/ui';
import {
  portalModuleTabTriggerClassName,
  portalModuleTabsShellClassName,
  portalModuleTabsTrackClassName,
} from '@/components/shared/portal-ui';

export interface SubscriberTab {
  id: string;
  label: string;
  content: ReactNode;
  /** Borrador sin guardar dentro de la pestaña: punto ámbar y texto para lectores de pantalla. */
  pending?: boolean;
}

interface SubscriberTabsContainerProps {
  tabs: SubscriberTab[];
  defaultTab?: string;
  activeTab?: string;
  onActiveTabChange?: (tabId: string) => void;
}

export function SubscriberTabsContainer({
  tabs,
  defaultTab,
  activeTab: controlledActiveTab,
  onActiveTabChange,
}: SubscriberTabsContainerProps) {
  const instanceId = useId();
  const [uncontrolledActiveTab, setUncontrolledActiveTab] = useState(
    defaultTab ?? tabs[0]?.id ?? '',
  );
  const activeTab = controlledActiveTab ?? uncontrolledActiveTab;
  const currentTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const [visitedTabs, setVisitedTabs] = useState<string[]>([]);

  const currentTabId = currentTab?.id;
  const previousTabId = useRef(currentTabId);
  const focusedPanelId = useRef<string | undefined>(undefined);
  useEffect(() => {
    // Una acción dentro del panel no debe dejar el foco en contenido que acaba de ocultarse.
    if (
      previousTabId.current !== currentTabId &&
      focusedPanelId.current === previousTabId.current
    ) {
      document.getElementById(`${instanceId}-panel-${currentTabId}`)?.focus();
    }
    previousTabId.current = currentTabId;
  }, [currentTabId, instanceId]);
  // Conserva los paneles visitados y sus borradores también al navegar desde una acción del encabezado.
  useEffect(() => {
    if (currentTabId) {
      setVisitedTabs((visited) =>
        visited.includes(currentTabId) ? visited : [...visited, currentTabId],
      );
    }
  }, [currentTabId]);

  function selectTab(tabId: string) {
    if (controlledActiveTab === undefined) setUncontrolledActiveTab(tabId);
    onActiveTabChange?.(tabId);
  }

  return (
    <div
      className="min-w-0 space-y-4"
      onFocusCapture={(event) => {
        focusedPanelId.current = document
          .getElementById(`${instanceId}-panel-${currentTabId}`)
          ?.contains(event.target)
          ? currentTabId
          : undefined;
      }}
    >
      <div className={portalModuleTabsShellClassName}>
        <div
          role="tablist"
          aria-label="Secciones del suscriptor"
          className={portalModuleTabsTrackClassName}
        >
          {tabs.map((tab, index) => {
            const isActive = currentTab?.id === tab.id;
            return (
              <Button
                key={tab.id}
                id={`${instanceId}-tab-${tab.id}`}
                type="button"
                variant="ghost"
                role="tab"
                aria-selected={isActive}
                aria-controls={`${instanceId}-panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                data-state={isActive ? 'active' : 'inactive'}
                onClick={() => selectTab(tab.id)}
                onKeyDown={(event) => {
                  let nextIndex: number;
                  switch (event.key) {
                    case 'ArrowRight':
                      nextIndex = (index + 1) % tabs.length;
                      break;
                    case 'ArrowLeft':
                      nextIndex = (index - 1 + tabs.length) % tabs.length;
                      break;
                    case 'Home':
                      nextIndex = 0;
                      break;
                    case 'End':
                      nextIndex = tabs.length - 1;
                      break;
                    default:
                      return;
                  }
                  event.preventDefault();
                  const nextTab = tabs[nextIndex];
                  if (!nextTab) return;
                  selectTab(nextTab.id);
                  document.getElementById(`${instanceId}-tab-${nextTab.id}`)?.focus();
                }}
                className={portalModuleTabTriggerClassName}
              >
                {tab.label}
                {tab.pending ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="ml-1.5 inline-block h-2 w-2 rounded-full bg-amber-500"
                    />
                    <span className="sr-only"> (cambios sin guardar)</span>
                  </>
                ) : null}
              </Button>
            );
          })}
        </div>
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`${instanceId}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${instanceId}-tab-${tab.id}`}
          hidden={currentTab?.id !== tab.id}
          tabIndex={0}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary"
        >
          {currentTab?.id === tab.id || visitedTabs.includes(tab.id) ? tab.content : null}
        </div>
      ))}
    </div>
  );
}
