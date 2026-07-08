import { memo, useMemo } from 'react'
import { Sankey, Tooltip, ResponsiveContainer, Rectangle, Layer } from 'recharts'
import type { Settlement } from '../../types'

interface SettlementFlowChartProps {
  settlements: Settlement[]
}

// عقدة Sankey مخصّصة — تعرض اسم العضو بجانب المستطيل (التنسيق الافتراضي لا يدعم
// النص العربي بشكل جيد داخل الشكل نفسه لضيق المساحة).
function SettlementNode(props: any) {
  const { x, y, width, height, index, payload } = props
  const isOut = x < 150 // تقريب: العقد اليمنى (المصدر/المدينون) أقرب لبداية المحور
  return (
    <Layer key={`node-${index}`}>
      <Rectangle x={x} y={y} width={width} height={height} fill="#0d9488" fillOpacity={0.8} />
      <text
        x={isOut ? x - 6 : x + width + 6}
        y={y + height / 2}
        textAnchor={isOut ? 'end' : 'start'}
        dominantBaseline="middle"
        fontSize={11}
        fill="#334155"
      >
        {payload.name}
      </text>
    </Layer>
  )
}

/**
 * مخطط تدفّق (Sankey) يوضّح "من يدفع لمن" بناءً على التحويلات المقترحة
 * (calculateSettlements). Recharts's Sankey يتطلب عقد/روابط بفهارس رقمية
 * (index-based)، لذا نبني خريطة اسم→فهرس لكل عضو ظاهر في التحويلات فقط
 * (وليس كل المسافرين) لتفادي عقد معزولة بلا روابط.
 */
export const SettlementFlowChart = memo(({ settlements }: SettlementFlowChartProps) => {
  const sankeyData = useMemo(() => {
    const nameToIndex = new Map<string, number>()
    const nodes: Array<{ name: string }> = []

    const indexOf = (name: string) => {
      let idx = nameToIndex.get(name)
      if (idx === undefined) {
        idx = nodes.length
        nodes.push({ name })
        nameToIndex.set(name, idx)
      }
      return idx
    }

    const links = settlements.map(s => ({
      source: indexOf(`${s.fromName} (مدين)`),
      target: indexOf(`${s.toName} (دائن)`),
      value: s.amount,
    }))

    return { nodes, links }
  }, [settlements])

  if (settlements.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-400 text-sm font-medium text-center px-4">
        لا توجد تحويلات مقترحة حالياً — كل الأرصدة متزنة تقريباً 🎉
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, sankeyData.nodes.length * 45)}>
      <Sankey
        data={sankeyData}
        node={<SettlementNode />}
        nodePadding={30}
        margin={{ top: 8, right: 90, left: 90, bottom: 8 }}
        link={{ stroke: '#5eead4' }}
      >
        <Tooltip formatter={(value: number) => `${value.toFixed(2)} ريال`} />
      </Sankey>
    </ResponsiveContainer>
  )
})
