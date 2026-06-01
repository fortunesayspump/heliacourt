import '../config/env.js'
import { createServer, type ServerResponse } from 'node:http'
import { getHearingQueueStats, startHearingJobWorker } from '../agents/hearings/index.js'
import { env } from '../config/env.js'

startHearingJobWorker()

const healthServerEnabled = process.env.HELIA_WORKER_HEALTH_SERVER !== 'false'
const healthPort = Number(process.env.HELIA_WORKER_HEALTH_PORT ?? process.env.PORT ?? env.PORT)
const healthServer = healthServerEnabled
  ? createServer((request, response) => {
      if (request.url?.startsWith('/health')) {
        void getHearingQueueStats()
          .then((stats) => sendJson(response, 200, {
            ok: true,
            service: 'helia-hearing-worker',
            stats,
            at: new Date().toISOString(),
          }))
          .catch((error) => sendJson(response, 200, {
            ok: true,
            service: 'helia-hearing-worker',
            stats: {
              backend: 'unavailable',
              error: error instanceof Error ? error.message : 'queue stats unavailable',
            },
            at: new Date().toISOString(),
          }))
        return
      }

      sendJson(response, 404, { error: 'not found' })
    }).listen(healthPort, '0.0.0.0', () => {
      console.log(JSON.stringify({
        service: 'helia-hearing-worker',
        event: 'health-server-listening',
        port: healthPort,
        at: new Date().toISOString(),
      }))
    })
  : undefined

setInterval(() => {
  void getHearingQueueStats()
    .then((stats) => console.log(JSON.stringify({ service: 'helia-hearing-worker', stats, at: new Date().toISOString() })))
    .catch((error) => {
      const message = error instanceof Error ? error.message : 'queue stats unavailable'
      console.error(JSON.stringify({ service: 'helia-hearing-worker', error: message, at: new Date().toISOString() }))
    })
}, 30_000)

process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT', () => shutdown('SIGINT'))

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

function shutdown(signal: string) {
  console.log(JSON.stringify({
    service: 'helia-hearing-worker',
    event: 'shutdown',
    signal,
    at: new Date().toISOString(),
  }))

  if (!healthServer) {
    process.exit(0)
    return
  }

  healthServer.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 5_000).unref()
}
