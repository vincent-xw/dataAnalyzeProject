import { describe, expect, it } from 'vitest'

import { buildChartOption } from './AnalysisChart'

describe('buildChartOption', () => {
  it('按行计数生成饼图数据，不将字符串编号转为数值', () => {
    const option = buildChartOption({ id: 'pie', type: 'pie', title: '负责人', dataset: 'result', dimension: '招聘负责人', aggregation: 'count', layout: { x: 0, y: 0, w: 12, h: 5 } }, [{ 招聘负责人: '刘胜男', 招聘需求编号: 'HC001453' }, { 招聘负责人: '刘胜男', 招聘需求编号: 'HC001454' }, { 招聘负责人: '王芳', 招聘需求编号: 'HC001455' }]) as { series: Array<{ data: Array<{ name: string; value: number }> }> }
    expect(option.series[0]?.data).toEqual([{ name: '刘胜男', value: 2 }, { name: '王芳', value: 1 }])
  })

  it('将旧规则的全字符串 metric 兼容为按行计数', () => {
    const option = buildChartOption({ id: 'legacy-pie', type: 'pie', title: '负责人', dataset: 'result', dimension: '招聘负责人', metric: '招聘需求编号', layout: { x: 0, y: 0, w: 12, h: 5 } }, [{ 招聘负责人: '刘胜男', 招聘需求编号: 'HC001453' }, { 招聘负责人: '刘胜男', 招聘需求编号: 'HC001454' }]) as { series: Array<{ data: Array<{ name: string; value: number }> }> }
    expect(option.series[0]?.data).toEqual([{ name: '刘胜男', value: 2 }])
  })

  it('按系列字段生成多组折线', () => {
    const option = buildChartOption({ id: 'line', type: 'line', title: '职位', dataset: 'result', dimension: '职位名称', aggregation: 'count', series: '招聘负责人', layout: { x: 0, y: 0, w: 12, h: 5 } }, [{ 职位名称: '教师', 招聘负责人: '刘胜男' }, { 职位名称: '教师', 招聘负责人: '王芳' }, { 职位名称: '顾问', 招聘负责人: '刘胜男' }]) as { xAxis: { data: string[] }; series: Array<{ name: string; data: number[] }> }
    expect(option.xAxis.data).toEqual(['教师', '顾问'])
    expect(option.series).toEqual([{ name: '刘胜男', type: 'line', data: [1, 1] }, { name: '王芳', type: 'line', data: [1, 0] }])
  })

  it('将空分组显示为空值，并为饼图提供人数标签、图例和提示信息', () => {
    const option = buildChartOption({ id: 'empty-pie', type: 'pie', title: '负责人', dataset: 'result', dimension: '招聘负责人', aggregation: 'count', layout: { x: 0, y: 0, w: 12, h: 5 } }, [{ 招聘负责人: '刘胜男' }, { 招聘负责人: ' ' }, { 招聘负责人: '-' }]) as { legend: { show: boolean }; tooltip: { show: boolean }; series: Array<{ label: { formatter: string }; data: Array<{ name: string; value: number }> }> }
    expect(option.series[0]?.data).toEqual([{ name: '刘胜男', value: 1 }, { name: '空值', value: 2 }])
    expect(option.legend).toEqual({ show: true })
    expect(option.tooltip).toEqual(expect.objectContaining({ show: true }))
    expect(option.series[0]?.label.formatter).toContain('{c}')
  })
})
