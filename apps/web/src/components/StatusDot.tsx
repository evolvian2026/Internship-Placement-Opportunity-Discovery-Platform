/** Coloured status indicator used across the admin ingestion views. */
export function StatusDot({ status }: { status: string }) {
  const tone =
    status === 'SUCCESS' ? 'bg-success' :
    status === 'WARNING' ? 'bg-warning' :
    status === 'FAILED' ? 'bg-danger' :
    status === 'RUNNING' ? 'bg-info' : 'bg-subtle';

  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className={`h-2 w-2 rounded-full ${tone}`} aria-hidden="true" />
      <span className="capitalize text-muted">{status.toLowerCase()}</span>
    </span>
  );
}
