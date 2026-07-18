import { Hono } from 'hono'

import type { Env } from '../../index'

type TaskStatusRow = {
  id: string
  dataset_version_id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  retry_count: number
  result_summary_object_key: string | null
  error_object_key: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  updated_at: string
}

export const taskRoutes = new Hono<Env>()

taskRoutes.get('/:id', async (context) => {
  const task = await context.env.DB.prepare(
    `SELECT pt.id, ep.dataset_version_id, pt.status, pt.retry_count, pt.result_summary_object_key, pt.error_object_key,
            pt.created_at, pt.started_at, pt.completed_at, pt.updated_at
     FROM processing_tasks pt
     JOIN execution_plans ep ON ep.id = pt.plan_id
     WHERE pt.id = ?`,
  )
    .bind(context.req.param('id'))
    .first<TaskStatusRow>()
  if (!task) return context.json({ code: 'TASK_NOT_FOUND', message: '处理任务不存在' }, 404)

  let summary: unknown = null
  let error: unknown = null
  if (task.status === 'succeeded') {
    if (!task.result_summary_object_key) {
      return context.json({ code: 'TASK_SUMMARY_MISSING', message: '成功任务缺少摘要' }, 500)
    }
    const object = await context.env.DATA_BUCKET.get(task.result_summary_object_key)
    if (!object) return context.json({ code: 'TASK_SUMMARY_MISSING', message: '任务摘要不存在' }, 500)
    summary = await object.json()
  }
  if (task.status === 'failed') {
    if (!task.error_object_key) {
      return context.json({ code: 'TASK_ERROR_MISSING', message: '失败任务缺少错误报告' }, 500)
    }
    const object = await context.env.DATA_BUCKET.get(task.error_object_key)
    if (!object) return context.json({ code: 'TASK_ERROR_MISSING', message: '任务错误报告不存在' }, 500)
    error = await object.json()
  }

  return context.json({
    id: task.id,
    datasetVersionId: task.dataset_version_id,
    status: task.status,
    retryCount: task.retry_count,
    summary,
    error,
    createdAt: task.created_at,
    startedAt: task.started_at,
    completedAt: task.completed_at,
    updatedAt: task.updated_at,
  })
})
