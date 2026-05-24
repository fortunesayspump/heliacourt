import '../config/env.js'
import { getHearingQueueStats, startHearingJobWorker } from '../agents/hearings/index.js'

startHearingJobWorker()

setInterval(() => {
  void getHearingQueueStats()
    .then((stats) => console.log(JSON.stringify({ service: 'helia-hearing-worker', stats, at: new Date().toISOString() })))
    .catch((error) => {
      const message = error instanceof Error ? error.message : 'queue stats unavailable'
      console.error(JSON.stringify({ service: 'helia-hearing-worker', error: message, at: new Date().toISOString() }))
    })
}, 30_000)
