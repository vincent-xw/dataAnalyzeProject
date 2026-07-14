import type { Env } from '../../index'
import type { TaskMessage } from '../plans/service'
import { executeTask } from './executor'
import { TaskExecutionError } from './normalize'

type TaskExecutor = (taskId: string, env: Env['Bindings']) => Promise<unknown>

export function toTaskError(error: unknown): TaskExecutionError {
  if (error instanceof TaskExecutionError) return error
  return new TaskExecutionError(
    'UNEXPECTED_INFRASTRUCTURE_ERROR',
    '执行环境发生未分类错误',
    true,
  )
}

export async function markTaskFailed(
  taskId: string,
  error: TaskExecutionError,
  env: Env['Bindings'],
) {
  const errorObjectKey = `data-analyze/tasks/${taskId}/errors/execution.json`
  const now = new Date().toISOString()
  await env.DATA_BUCKET.put(
    errorObjectKey,
    JSON.stringify({ code: error.code, message: error.message, retryable: error.retryable }),
    { httpMetadata: { contentType: 'application/json' } },
  )
  await env.DB.prepare(
    `UPDATE processing_tasks
     SET status = 'failed', error_object_key = ?, completed_at = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(errorObjectKey, now, now, taskId)
    .run()
}

export async function consumeTaskMessage(
  message: Message<TaskMessage>,
  env: Env['Bindings'],
  executor: TaskExecutor = executeTask,
) {
  try {
    await executor(message.body.taskId, env)
    message.ack()
  } catch (error) {
    const taskError = toTaskError(error)
    // 只有明确标记的暂时性基础设施错误，且消息尚未达到第三次尝试时才重试。
    if (taskError.retryable && message.attempts < 3) {
      message.retry()
      return
    }
    await markTaskFailed(message.body.taskId, taskError, env)
    message.ack()
  }
}

export async function consumeTaskBatch(
  batch: MessageBatch<TaskMessage>,
  env: Env['Bindings'],
) {
  await Promise.all(batch.messages.map((message) => consumeTaskMessage(message, env)))
}
