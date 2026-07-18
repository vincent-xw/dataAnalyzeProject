import { Hono } from 'hono'
import { z } from 'zod'
import type { Env } from '../../index'
import { AnalysisDisplaySettingsService, SystemPromptService } from './service'
const ContentSchema = z.object({ content: z.string().trim().min(100).max(20_000) }).strict()
const AnalysisDisplaySettingsSchema = z.object({ chartsPerRow: z.union([z.literal(1), z.literal(2), z.literal(3)]), defaultRowHeight: z.number().int().min(240).max(800) }).strict()
export const settingsRoutes = new Hono<Env>()
settingsRoutes.get('/analysis-prompt', async (c) => c.json(await new SystemPromptService(c.env).current()))
settingsRoutes.get('/analysis-prompt/versions', async (c) => c.json(await new SystemPromptService(c.env).versions()))
settingsRoutes.put('/analysis-prompt', async (c) => { const body = ContentSchema.safeParse(await c.req.json().catch(() => null)); if (!body.success) return c.json({ code: 'INVALID_PROMPT', message: '提示词长度必须在 100 到 20000 字之间' }, 400); return c.json(await new SystemPromptService(c.env).save(body.data.content, c.get('authenticatedUser').email)) })
settingsRoutes.post('/analysis-prompt/restore-default', async (c) => c.json(await new SystemPromptService(c.env).restoreDefault()))
settingsRoutes.post('/analysis-prompt/versions/:id/activate', async (c) => { const prompt = await new SystemPromptService(c.env).activate(c.req.param('id')); return prompt ? c.json(prompt) : c.json({ code: 'PROMPT_VERSION_NOT_FOUND', message: '提示词版本不存在' }, 404) })
settingsRoutes.get('/analysis-display', async (c) => c.json(await new AnalysisDisplaySettingsService(c.env).current()))
settingsRoutes.put('/analysis-display', async (c) => { const body = AnalysisDisplaySettingsSchema.safeParse(await c.req.json().catch(() => null)); if (!body.success) return c.json({ code: 'INVALID_ANALYSIS_DISPLAY_SETTINGS', message: '图表展示配置无效' }, 400); return c.json(await new AnalysisDisplaySettingsService(c.env).save(body.data, c.get('authenticatedUser').email)) })
