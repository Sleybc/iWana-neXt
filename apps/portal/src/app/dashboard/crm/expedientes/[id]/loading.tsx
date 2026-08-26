export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-24 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
      <div className="h-40 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
      <div className="h-96 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
    </div>
  );
}
