import { memo } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { CategoryTotal } from '../../types'

interface CategoryPieChartProps {
  data: CategoryTotal[]
}

// ألوان ثابتة (لا تعتمد على متغيرات CSS) — متناسقة مع هوية التطبيق (teal/rose/amber...)
const COLORS = ['#0d9488', '#f43f5e', '#f59e0b', '#6366f1', '#0ea5e9', '#84cc16', '#a855f7']

/** رسم دائري (Pie) يوضّح توزيع إجمالي المصاريف حسب الفئة. */
export const CategoryPieChart = memo(({ data }: CategoryPieChartProps) => {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-400 text-sm font-medium">
        لا توجد مصاريف بعد لعرض توزيعها حسب الفئة
      </div>
    )
  }

  const total = data.reduce((s, d) => s + d.total, 0)

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          nameKey="category"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={2}
        >
          {data.map((entry, i) => (
            <Cell key={entry.category} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number, name: string) => [
            `${value.toFixed(2)} ريال (${((value / total) * 100).toFixed(0)}%)`,
            name,
          ]}
        />
        <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '11px' }} />
      </PieChart>
    </ResponsiveContainer>
  )
})
