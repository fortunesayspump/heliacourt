import { env } from '../../config/env.js'
import type { TelegramReply } from './types.js'

export async function sendTelegramReply(chatId: string, reply: TelegramReply | string) {
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token) return
  const normalized = typeof reply === 'string' ? { text: reply } : reply

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: normalized.text,
      parse_mode: normalized.parseMode,
      disable_web_page_preview: true,
      reply_markup: normalized.replyMarkup,
    }),
  })

  if (!response.ok) {
    throw new Error(`telegram reply failed: ${response.status}`)
  }
}

export async function editTelegramMessage(chatId: string, messageId: number, reply: TelegramReply) {
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token) return

  const response = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: reply.text,
      parse_mode: reply.parseMode,
      disable_web_page_preview: true,
      reply_markup: reply.replyMarkup,
    }),
  })

  if (!response.ok) {
    throw new Error(`telegram edit failed: ${response.status}`)
  }
}

export async function deleteTelegramMessage(chatId: string, messageId: number) {
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token) return

  const response = await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  })

  if (!response.ok) {
    throw new Error(`telegram delete failed: ${response.status}`)
  }
}

export async function answerTelegramCallback(callbackId?: string) {
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token || !callbackId) return

  const response = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId }),
  })

  if (!response.ok) {
    throw new Error(`telegram callback answer failed: ${response.status}`)
  }
}
