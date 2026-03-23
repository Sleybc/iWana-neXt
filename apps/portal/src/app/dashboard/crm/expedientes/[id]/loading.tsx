export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center gap-3 text-sm text-gray-500 dark:text-gray-400">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-iwana-primary dark:border-dark-surface-4 dark:border-t-iwana-secondary"></div>
      Cargando oportunidad...
    </div>
  );
}
