import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { apiRequest } from '../../api/client'

type TaskDetail = {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  retryCount: number
  summary: Record<string, unknown> | null
  error: { code: string; message: string; retryable: boolean } | null
}

export function TaskDetailPage() {
  const { taskId } = useParams()
  const [task, setTask] = useState<TaskDetail | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!taskId) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined

    async function poll() {
      try {
        const value = await apiRequest<TaskDetail>(`/api/tasks/${taskId}`)
        if (!active) return
        setTask(value)
        if (value.status !== 'succeeded' && value.status !== 'failed') {
          timer = setTimeout(poll, 2_000)
        }
      } catch {
        if (active) setLoadError('任务状态加载失败')
      }
    }

    void poll()
    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [taskId])

  if (loadError) return <p className="error">{loadError}</p>
  if (!task) return <p>正在读取任务状态…</p>
  return (
    <section className="panel stack">
      <h2>数据加工任务</h2>
      <p>状态：{task.status}</p>
      <p>执行次数：{task.retryCount}</p>
      {task.summary ? <pre>{JSON.stringify(task.summary, null, 2)}</pre> : null}
      {task.error ? <p className="error">{task.error.code}：{task.error.message}</p> : null}
    </section>
  )
}
