import type { ReactNode } from "react";

type DataItem = Record<string, string | number>;

export function ResponsiveContainer({ children }: { children: ReactNode; width?: string | number; height?: string | number }) {
  return <div className="w-full h-full">{children}</div>;
}

export function BarChart({ data, children }: { data: DataItem[]; children?: ReactNode }) {
  const chartPalette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
  return (
    <div className="space-y-3">
      {data.map((item, idx) => {
        const name = String(item.name ?? "");
        const value = Number(item.count ?? 0);
        const max = Math.max(1, ...data.map((entry) => Number(entry.count ?? 0)));
        return (
          <div key={`${name}-${idx}`} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text)]">{name}</span>
              <span className="text-[var(--chart-label,var(--muted))]">{value}</span>
            </div>
            <div className="h-2 rounded-full bg-[var(--surface-raised)]">
              <div className="h-2 rounded-full" style={{ width: `${(value / max) * 100}%`, background: chartPalette[idx % chartPalette.length] }} />
            </div>
          </div>
        );
      })}
      {children}
    </div>
  );
}

export function XAxis(_props: Record<string, unknown>) { return null; }
export function YAxis(_props: Record<string, unknown>) { return null; }
export function Tooltip(_props: Record<string, unknown>) { return null; }
export function Bar(_props: Record<string, unknown>) { return null; }
