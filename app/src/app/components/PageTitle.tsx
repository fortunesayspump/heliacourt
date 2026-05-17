import type { CSSProperties, ReactNode } from 'react'
import { FadeImageLayer } from './FadeImageLayer'

type PageTitleProps = {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
  imageSrc?: string
  imagePosition?: string
  tone?: 'light' | 'dark'
}

export function PageTitle({
  eyebrow,
  title,
  description,
  actions,
  imageSrc = '/assets/ancient-athenian-juries.jpg',
  imagePosition = 'center',
  tone = 'dark',
}: PageTitleProps) {
  const imageStyle = {
    '--page-title-position': imagePosition,
  } as CSSProperties

  return (
    <header className={`workspace-header compact-header page-title page-title-${tone}`} style={imageStyle}>
      <FadeImageLayer src={imageSrc} position={imagePosition} />
      <div className="page-title-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="header-copy">{description}</p>
      </div>
      <div className="page-title-visual" aria-hidden="true" />
      <div className="header-actions page-title-actions">{actions}</div>
    </header>
  )
}
