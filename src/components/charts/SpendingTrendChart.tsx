import { memo } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { SpendingTrendPoint } from '../../types'

interface SpendingTrendChartProps {
  data: SpendingTrendPoint[]
}

/** مخطط مركّب: أعمدة لمصروف كل يوم + خط للمجموع التراكمي عبر الزمن. */
export const SpendingTrendChart = memo(({ data }: SpendingTrendChartProps) => {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-400 text-sm font-medium">
        لا توجد مصاريف بعد لعرض تطوّرها عبر الزمن
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip formatter={(value: number) => `${value.toFixed(2)} ريال`} />
        <Legend wrapperStyle={{ fontSize: '11px' }} />
        <Bar dataKey="total" name="مصروف اليوم" fill="#5eead4" radius={[4, 4, 0, 0]} />
        <Line type="monotone" dataKey="cumulative" name="الإجمالي التراكمي" stroke="#0d9488" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
})
