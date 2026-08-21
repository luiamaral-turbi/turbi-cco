import { cn } from "@/lib/utils";

type Props = {
  title: string;
  value: string;
  target?: string;
  caption?: string;
  status?: boolean | null;
};

export function HeroCard({ title, value, target, caption, status }: Props) {
  return (
    <div
      className={cn(
        "rounded-[10px] border border-border bg-card p-5",
        status === true && "border-success/40 bg-success-soft",
        status === false && "border-danger/40 bg-danger-soft",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p
        className={cn(
          "mt-2 text-3xl font-semibold tabular-nums text-foreground",
          status === true && "text-success",
          status === false && "text-danger",
        )}
      >
        {value}
      </p>
      {target ? <p className="mt-1 text-sm text-muted-foreground">Meta: {target}</p> : null}
      {caption ? <p className="mt-2 text-xs text-muted-foreground">{caption}</p> : null}
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[10px] border border-border bg-card p-5">
      <header className="mb-4">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}
