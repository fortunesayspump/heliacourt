export type TelegramUpdate = {
  message?: {
    message_id?: number
    chat?: { id?: number | string; type?: string; title?: string; username?: string; first_name?: string }
    from?: { id?: number | string; username?: string; first_name?: string }
    text?: string
  }
  callback_query?: {
    id?: string
    data?: string
    from?: { id?: number | string; username?: string; first_name?: string }
    message?: {
      message_id?: number
      chat?: { id?: number | string; type?: string; title?: string; username?: string; first_name?: string }
    }
  }
}

export type TelegramInlineKeyboard = Array<Array<{
  text: string
  callback_data?: string
  url?: string
}>>

export type TelegramReply = {
  text: string
  parseMode?: 'Markdown' | 'HTML'
  replyMarkup?: {
    inline_keyboard: TelegramInlineKeyboard
  }
}
