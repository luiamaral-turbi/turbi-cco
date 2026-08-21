export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="rounded-[10px] border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
      Carregando {label}…
    </div>
  );
}

export function ErrorBlock({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-[10px] border border-danger/40 bg-danger-soft p-6">
      <p className="text-sm font-semibold text-danger">{title}</p>
      <p className="mt-1 text-xs text-danger/90">{message}</p>
    </div>
  );
}

export function NoticeBlock({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-card p-6">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
