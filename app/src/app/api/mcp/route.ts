import { NextResponse } from 'next/server'
import { fetchBackendJson } from '../../../lib/backend-proxy'

type JsonRpcRequest = {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: {
    name?: string
    arguments?: {
      id?: string
      question?: string
      context?: string
      links?: string[]
      imageUrl?: string
      type?: 'crypto-market' | 'prediction-market' | 'macro' | 'real-world-event'
      filer?: `0x${string}`
      jobId?: string
    }
  }
}

const tools = [
  {
    name: 'helia_queue_hearing',
    description: 'Queue a Helia Court multi-agent forecasting hearing for a prediction-market, macro, crypto, or real-world-event question.',
    inputSchema: {
      type: 'object',
      required: ['question'],
      properties: {
        question: { type: 'string' },
        context: { type: 'string' },
        links: { type: 'array', items: { type: 'string' } },
        imageUrl: { type: 'string' },
        type: { type: 'string', enum: ['crypto-market', 'prediction-market', 'macro', 'real-world-event'] },
        filer: { type: 'string' },
      },
    },
  },
  {
    name: 'helia_get_hearing_job',
    description: 'Fetch the status and result of a queued Helia Court hearing job.',
    inputSchema: {
      type: 'object',
      required: ['jobId'],
      properties: {
        jobId: { type: 'string' },
      },
    },
  },
]

export async function GET() {
  return NextResponse.json({
    name: 'helia-court-mcp',
    protocol: 'MCP',
    version: '2025-06-18',
    endpoint: 'https://app.heliacourt.xyz/api/mcp',
    transport: 'streamable-http',
    tools: tools.map((tool) => ({ name: tool.name, description: tool.description })),
  })
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as JsonRpcRequest
  const id = body.id ?? null

  if (body.jsonrpc !== '2.0') {
    return jsonRpcError(id, -32600, 'jsonrpc must be "2.0"')
  }

  if (body.method === 'initialize') {
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2025-06-18',
        serverInfo: { name: 'helia-court-mcp', version: '0.1.0' },
        capabilities: { tools: {} },
      },
    })
  }

  if (body.method === 'tools/list') {
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: { tools },
    })
  }

  if (body.method === 'tools/call') {
    if (body.params?.name === 'helia_queue_hearing') {
      const args = body.params.arguments
      const question = args?.question?.trim()
      if (!question) return jsonRpcError(id, -32602, 'question is required')

      const { response, payload } = await fetchBackendJson('/agents/hearing/jobs', {
        method: 'POST',
        body: {
          id: args?.id,
          question,
          context: args?.context,
          links: args?.links,
          imageUrl: args?.imageUrl,
          type: args?.type ?? 'prediction-market',
          filer: args?.filer,
        },
        jsonFallback: { error: 'No hearing job data returned.' },
        unavailableMessage: 'Hearing job data is unavailable.',
      })

      return toolResult(id, payload, response.ok ? 200 : response.status)
    }

    if (body.params?.name === 'helia_get_hearing_job') {
      const jobId = body.params.arguments?.jobId?.trim()
      if (!jobId) return jsonRpcError(id, -32602, 'jobId is required')

      const { response, payload } = await fetchBackendJson(`/agents/hearing/jobs/${encodeURIComponent(jobId)}`, {
        jsonFallback: { error: 'No hearing job data returned.' },
        unavailableMessage: 'Hearing job data is unavailable.',
      })

      return toolResult(id, payload, response.ok ? 200 : response.status)
    }

    return jsonRpcError(id, -32602, 'unknown tool name')
  }

  return jsonRpcError(id, -32601, 'method not found')
}

function toolResult(id: JsonRpcRequest['id'], payload: unknown, status: number) {
  return NextResponse.json({
    jsonrpc: '2.0',
    id: id ?? null,
    result: {
      content: [{
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      }],
    },
  }, { status })
}

function jsonRpcError(id: JsonRpcRequest['id'], code: number, message: string) {
  return NextResponse.json({
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message },
  }, { status: code === -32601 ? 404 : 400 })
}
