import { Button, Table, Tag, Tooltip, type TableProps } from 'antd'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { apiRequest, type DataAsset } from '../../api/client'

const tagColors = ['blue', 'cyan', 'geekblue', 'purple', 'magenta', 'green', 'gold', 'orange'] as const

function getTagColor(tag: string): (typeof tagColors)[number] {
  const hash = Array.from(tag).reduce((total, character) => total + character.charCodeAt(0), 0)
  return tagColors[hash % tagColors.length]!
}

const assetColumns: NonNullable<TableProps<DataAsset>['columns']> = [
  {
    title: '数据名称',
    dataIndex: 'name',
    render: (name: string, asset) => {
      const description = asset.description || '暂未填写说明'
      return <div className="asset-name-cell"><strong>{name}</strong><Tooltip title={description}><span className="asset-description">{description}</span></Tooltip></div>
    },
  },
  {
    title: '标签',
    dataIndex: 'tags',
    render: (tags: string[]) => tags.length ? tags.map((tag) => <Tag color={getTagColor(tag)} key={tag}>{tag}</Tag>) : <span className="muted">暂无标签</span>,
  },
  { title: '数据量', dataIndex: 'rowCount', render: (rowCount: number) => `${rowCount} 行` },
  { title: '创建时间', dataIndex: 'createdAt', render: (createdAt: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(createdAt)) },
  { title: '操作', key: 'action', render: (_, asset) => <Link to={`/assets/${asset.id}`}>预览数据</Link> },
]

export function AssetListPage() {
  const navigate = useNavigate()
  const [assets, setAssets] = useState<DataAsset[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiRequest<DataAsset[]>('/api/assets').then(setAssets).catch(() => setError('数据资产加载失败，请稍后重试。')).finally(() => setLoading(false))
  }, [])

  return (
    <section className="stack asset-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">数据资产</p>
          <h2>我的数据</h2>
          <p>上传表格后会直接转换为可预览、可复用的数据资产。</p>
        </div>
        <Button type="primary" onClick={() => navigate('/assets/upload')}>上传新数据</Button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <Table columns={assetColumns} dataSource={assets} loading={loading} pagination={false} rowKey="id" />
    </section>
  )
}
