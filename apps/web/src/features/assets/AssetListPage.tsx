import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { apiRequest, type DataAsset } from '../../api/client'

export function AssetListPage() {
  const [assets, setAssets] = useState<DataAsset[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    apiRequest<DataAsset[]>('/api/assets').then(setAssets).catch(() => setError('数据资产加载失败，请稍后重试。'))
  }, [])

  return (
    <section className="stack asset-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">数据资产</p>
          <h2>我的数据</h2>
          <p>上传表格后会直接转换为可预览、可复用的数据资产。</p>
        </div>
        <Link className="button-link" to="/assets/upload">上传新数据</Link>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {assets.length === 0 && !error ? <div className="panel empty-state"><h3>还没有可用数据</h3><p>上传一份表格后，它会直接成为可预览的数据资产。</p><Link to="/assets/upload">开始上传</Link></div> : null}
      {assets.length > 0 ? <div className="panel asset-table-wrap"><table className="asset-table"><thead><tr><th>数据名称</th><th>标签</th><th>数据量</th><th>创建时间</th><th aria-label="操作" /></tr></thead><tbody>
        {assets.map((asset) => <tr key={asset.id}><td><strong>{asset.name}</strong><small>{asset.description || '暂未填写说明'}</small></td><td><span className="tag-list">{asset.tags.length ? asset.tags.map((tag) => <span key={tag} className="tag">{tag}</span>) : <span className="muted">暂无标签</span>}</span></td><td>{asset.rowCount} 行</td><td>{new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(asset.createdAt))}</td><td><Link to={`/assets/${asset.id}`}>预览数据</Link></td></tr>)}
      </tbody></table></div> : null}
    </section>
  )
}
