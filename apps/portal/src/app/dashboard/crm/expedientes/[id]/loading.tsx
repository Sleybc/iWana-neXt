export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="flex items-center gap-3 rounded-[24px] border border-gray-200 bg-white/95 px-5 py-4 text-sm text-gray-600 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2/95 dark:text-gray-300">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-iwana-primary dark:border-dark-surface-4 dark:border-t-iwana-secondary"></div>
        Estamos preparando la oportunidad y su trazabilidad operativa.
      </div>
    </div>
  );
}
