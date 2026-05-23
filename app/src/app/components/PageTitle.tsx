import type { CSSProperties, ReactNode } from 'react'
import { FadeImageLayer, type FadeImageSource } from './FadeImageLayer'

type PageTitleProps = {
  eyebrow: string
  title: string
  description?: string
  actions?: ReactNode
  imageSrc?: string
  imageSrcs?: FadeImageSource[]
  imagePosition?: string
  tone?: 'light' | 'dark'
  className?: string
}

export function PageTitle({
  eyebrow,
  title,
  description,
  actions,
  imageSrc,
  imageSrcs,
  imagePosition = 'center',
  tone = 'dark',
  className,
}: PageTitleProps) {
  const imageStyle = {
    '--page-title-position': imagePosition,
  } as CSSProperties
  const titleImages = imageSrcs?.length ? imageSrcs : imageSrc ? [{ src: imageSrc, position: imagePosition }] : []
  const firstImageSrc = typeof titleImages[0] === 'string' ? titleImages[0] : titleImages[0]?.src

  return (
    <header className={`workspace-header compact-header page-title page-title-${tone}${className ? ` ${className}` : ''}`} style={imageStyle}>
      {firstImageSrc ? <FadeImageLayer src={firstImageSrc} sources={titleImages} position={imagePosition} /> : null}
      <div className="page-title-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description ? <p className="header-copy">{description}</p> : null}
      </div>
      <div className="page-title-visual" aria-hidden="true" />
      <div className="header-actions page-title-actions">{actions}</div>
    </header>
  )
}
