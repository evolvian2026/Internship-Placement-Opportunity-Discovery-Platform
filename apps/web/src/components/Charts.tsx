'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

/**
 * Charts.
 *
 * The palette is fixed and readable in both themes; the bar list is plain CSS
 * because a horizontal ranked list does not need a charting library.
 */

const PALETTE = ['#2563eb', '#0891b2', '#7c3aed', '#059669', '#d97706', '#dc2626', '#4f46e5', '#0d9488'];

export interface Datum {
  name: string;
  count: number;
}

export function BarList({ data, max }: { data: Datum[]; max?: number }) {
  if (data.length === 0) return <p className="py-6 text-center text-sm text-subtle">No data yet.</p>;

  const highest = max ?? Math.max(...data.map((d) => d.count), 1);

  return (
    <ol className="space-y-2">
      {data.map((item, index) => (
        <li key={item.name}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate capitalize text-muted">{item.name}</span>
            <span className="shrink-0 font-medium tabular-nums">{item.count.toLocaleString('en-IN')}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(item.count / highest) * 100}%`,
                backgroundColor: PALETTE[index % PALETTE.length],
              }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function DonutChart({ data }: { data: Datum[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) return <p className="py-6 text-center text-sm text-subtle">No data yet.</p>;

  return (
    <div className="flex items-center gap-4">
      <div className="h-32 w-32 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="name" innerRadius={38} outerRadius={62} paddingAngle={2} stroke="none">
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: 'rgb(var(--surface))',
                border: '1px solid rgb(var(--border))',
                borderRadius: 8,
                fontSize: 12,
                color: 'rgb(var(--fg))',
              }}
              formatter={(value: number) => [value.toLocaleString('en-IN'), 'Opportunities']}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="min-w-0 flex-1 space-y-2">
        {data.map((entry, index) => (
          <li key={entry.name} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: PALETTE[index % PALETTE.length] }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-muted">{entry.name}</span>
            <span className="shrink-0 font-medium tabular-nums">
              {Math.round((entry.count / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
