import type { FastifyInstance } from 'fastify'
import { listHearingJobs } from '../agents/hearing-jobs.js'
import { buildTelegramBotReply } from '../integrations/telegram.js'

type TelegramUpdate = {
  message?: {
    chat?: { id?: number | string }
    text?: string
  }
}

export async function telegramRoutes(app: FastifyInstance) {
  app.post('/telegram/webhook', async (request, reply) => {
    const update = request.body as TelegramUpdate
    const chatId = update.message?.chat?.id
    const text = update.message?.text

    if (!chatId || !text) return { ok: true }

    const jobs = (await listHearingJobs()).filter((job) => (job.marketCase.visibility ?? 'public') === 'public')
    const responseText = buildTelegramBotReply(text, jobs)
    await sendTelegramReply(String(chatId), responseText)

    return { ok: true }
  })

  app.get('/telegram/commands', async () => ({
    commands: [
      { command: 'cases', description: 'Latest public cases' },
      { command: 'case', description: 'Case status and verdict' },
      { command: 'transcript', description: 'Latest transcript turns' },
      { command: 'receipts', description: 'Arc receipt summary' },
      { command: 'file', description: 'Prepare a filing from a market URL' },
    ],
  }))
}

async function sendTelegramReply(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  })

  if (!response.ok) {
    throw new Error(`telegram reply failed: ${response.status}`)
  }
}
