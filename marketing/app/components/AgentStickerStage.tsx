'use client'

import { useEffect, useRef } from 'react'

type AgentSticker = {
  name: string
  role: string
  image: string
}

export function AgentStickerStage({ agents }: { agents: readonly AgentSticker[] }) {
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const centerStage = () => {
      stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2)
    }

    const frame = window.requestAnimationFrame(centerStage)
    const timer = window.setTimeout(centerStage, 250)
    window.addEventListener('resize', centerStage)

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      window.removeEventListener('resize', centerStage)
    }
  }, [])

  return (
    <div ref={stageRef} className="agent-sticker-stage" aria-label="Featured Helia Court agents">
      {agents.map((agent) => (
        <article className="agent-sticker" key={agent.name}>
          <img alt="" src={agent.image} />
          <span>
            <strong>{agent.name}</strong>
            <small>{agent.role}</small>
          </span>
        </article>
      ))}
    </div>
  )
}
