import { NextResponse } from 'next/server'
import { fetchBackendJson } from '../../../lib/backend-proxy'

type JsonRpcRequest = {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: {
    id?: string
    question?: string
    context?: string
    links?: string[]
    imageUrl?: string
    type?: 'crypto-market' | 'prediction-market' | 'macro' | 'real-world-event'
    filer?: `0x${string}`
    message?: {
      content?: string
      parts?: Array<{ type?: string; text?: string }>
    }
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'Helia Court A2A',
    protocol: 'A2A',
    version: '0.1.0',
    endpoint: 'https://app.heliacourt.xyz/api/a2a',
    agentCard: 'https://app.heliacourt.xyz/.well-known/agent-card.json',
    methods: ['message/send', 'tasks/send', 'tasks/get'],
  })
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as JsonRpcRequest
  const id = body.id ?? null

  if (body.jsonrpc !== '2.0') {
    return jsonRpcError(id, -32600, 'jsonrpc must be "2.0"')
  }

  if (body.method === 'message/send' || body.method === 'tasks/send') {
    const question = getQuestion(body.params)
    if (!question) return jsonRpcError(id, -32602, 'question or message content is required')

    const { response, payload } = await fetchBackendJson('/agents/hearing/jobs', {
      method: 'POST',
      body: {
        id: body.params?.id,
        question,
        context: body.params?.context,
        links: body.params?.links,
        imageUrl: body.params?.imageUrl,
        type: body.params?.type ?? 'prediction-market',
        filer: body.params?.filer,
      },
      jsonFallback: { error: 'No hearing job data returned.' },
      unavailableMessage: 'Hearing job data is unavailable.',
    })

    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: {
        status: response.status,
        task: payload,
      },
    }, { status: response.ok ? 200 : response.status })
  }

  if (body.method === 'tasks/get') {
    const jobId = body.params?.id?.trim()
    if (!jobId) return jsonRpcError(id, -32602, 'params.id is required')

    const { response, payload } = await fetchBackendJson(`/agents/hearing/jobs/${encodeURIComponent(jobId)}`, {
      jsonFallback: { error: 'No hearing job data returned.' },
      unavailableMessage: 'Hearing job data is unavailable.',
    })

    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: payload,
    }, { status: response.ok ? 200 : response.status })
  }

  return jsonRpcError(id, -32601, 'method not found')
}

function getQuestion(params: JsonRpcRequest['params']) {
  const direct = params?.question?.trim()
  if (direct) return direct

  const content = params?.message?.content?.trim()
  if (content) return content

  return params?.message?.parts
    ?.map((part) => part.type === 'text' ? part.text?.trim() : undefined)
    .filter(Boolean)
    .join('\n')
    .trim()
}

function jsonRpcError(id: JsonRpcRequest['id'], code: number, message: string) {
  return NextResponse.json({
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message },
  }, { status: code === -32601 ? 404 : 400 })
}
