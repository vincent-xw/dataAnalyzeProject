import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import type { ScriptDecision, ScriptMetadata } from '@data-analyze/contracts'

import { apiRequest } from '../../api/client'

type PlanView = {
  id: string
  decision: ScriptDecision
  scriptMetadata: ScriptMetadata | null
  confirmationStatus: 'pending' | 'confirmed'
}

type PlanConfirmationProps = {
  plan: PlanView
  onConfirm?: (parameters: Record<string, unknown>) => Promise<void> | void
  onTaskCreated?: (taskId: string) => void
}

function PlanConfirmationContent({ plan, onConfirm, onTaskCreated }: PlanConfirmationProps) {
  const initialParameters = plan.decision.supported ? plan.decision.parameters : {}
  const [parameters, setParameters] = useState<Record<string, unknown>>(initialParameters)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!plan.decision.supported) {
    return (
      <section className="panel stack">
        <h2>当前需求不受支持</h2>
        <p>{plan.decision.reason}</p>
        <ul>{plan.decision.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
    )
  }

  const metadata = plan.scriptMetadata
  if (!metadata) return <p className="error">精确脚本版本已失效，无法确认执行。</p>

  async function confirm() {
    setSubmitting(true)
    setError('')
    try {
      if (onConfirm) {
        await onConfirm(parameters)
      } else {
        const task = await apiRequest<{ taskId: string }>(`/api/plans/${plan.id}/confirm`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ parameters }),
        })
        onTaskCreated?.(task.taskId)
      }
    } catch {
      setError('计划确认失败，脚本版本、字段或参数可能已经失效')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="panel stack">
      <h2>确认加工计划</h2>
      <h3>{plan.decision.scriptId}@{plan.decision.scriptVersion}</h3>
      <p>{plan.decision.reason}</p>
      <h4>限制</h4>
      {plan.decision.limitations.length > 0 ? <ul>{plan.decision.limitations.map((item) => <li key={item}>{item}</li>)}</ul> : <p>模型未声明额外限制</p>}
      <h4>输入字段</h4>
      <p>{metadata.inputFields.map((field) => `${field.name}:${field.type}`).join('、')}</p>
      <h4>输出字段</h4>
      <p>{metadata.outputFields.map((field) => `${field.name}:${field.type}`).join('、')}</p>
      <fieldset className="stack">
        <legend>脚本参数</legend>
        {Object.entries(metadata.parameterSchema.properties).map(([name, property]) => {
          if (property.type === 'boolean') {
            return <label key={name}><input type="checkbox" checked={parameters[name] === true} onChange={(event) => setParameters((current) => ({ ...current, [name]: event.target.checked }))} />{property.description}</label>
          }
          if (property.enum) {
            return <label key={name}>{property.description}<select value={String(parameters[name] ?? '')} onChange={(event) => setParameters((current) => ({ ...current, [name]: property.type === 'number' ? Number(event.target.value) : event.target.value }))}>{property.enum.map((value) => <option key={String(value)} value={String(value)}>{String(value)}</option>)}</select></label>
          }
          return <label key={name}>{property.description}<input type={property.type === 'number' ? 'number' : 'text'} value={String(parameters[name] ?? '')} onChange={(event) => setParameters((current) => ({ ...current, [name]: property.type === 'number' ? Number(event.target.value) : event.target.value }))} /></label>
        })}
      </fieldset>
      {error && <p className="error">{error}</p>}
      <button type="button" disabled={plan.confirmationStatus !== 'pending' || submitting} onClick={confirm}>确认并执行</button>
    </section>
  )
}

function RoutedPlanConfirmationPage() {
  const { planId } = useParams()
  const navigate = useNavigate()
  const [plan, setPlan] = useState<PlanView | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!planId) return
    apiRequest<PlanView>(`/api/plans/${planId}`).then(setPlan).catch(() => setError('执行计划加载失败'))
  }, [planId])
  if (error) return <p className="error">{error}</p>
  if (!plan) return <p>正在加载执行计划…</p>
  return <PlanConfirmationContent plan={plan} onTaskCreated={(taskId) => navigate(`/tasks/${taskId}`)} />
}

export function PlanConfirmationPage(props: PlanConfirmationProps | Record<string, never>) {
  return hasPlanProps(props) ? <PlanConfirmationContent {...props} /> : <RoutedPlanConfirmationPage />
}

function hasPlanProps(
  props: PlanConfirmationProps | Record<string, never>,
): props is PlanConfirmationProps {
  return 'plan' in props
}
