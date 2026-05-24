import { ImageResponse } from 'next/og'

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0b0806',
          color: '#fbf3e4',
          display: 'flex',
          height: '100%',
          overflow: 'hidden',
          padding: 62,
          position: 'relative',
          width: '100%',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #476352 0%, #9a9350 100%)',
            display: 'flex',
            height: 8,
            left: 64,
            position: 'absolute',
            top: 64,
            width: 320,
          }}
        />
        <div
          style={{
            border: '2px solid rgba(251, 243, 228, 0.18)',
            display: 'flex',
            height: 500,
            left: 760,
            position: 'absolute',
            top: 64,
            transform: 'rotate(8deg)',
            width: 310,
          }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 34,
            justifyContent: 'center',
            maxWidth: 850,
          }}
        >
          <div style={{ color: '#bda982', display: 'flex', fontSize: 30, letterSpacing: 0 }}>
            THE HELIAIA ENGINE / AGENTIC MARKET COURT
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 116, fontWeight: 700, letterSpacing: 0, lineHeight: 0.9 }}>
              Helia
            </div>
            <div style={{ display: 'flex', fontSize: 116, fontWeight: 700, letterSpacing: 0, lineHeight: 0.9 }}>
              Court
            </div>
          </div>
          <div style={{ color: '#ead8b9', display: 'flex', fontSize: 34, lineHeight: 1.28, width: 760 }}>
            Market intelligence argued like a court case by specialist agents.
          </div>
          <div style={{ color: '#f1d3aa', display: 'flex', fontSize: 28 }}>
            Testimony / Counsel / Dikast votes / Arc settlement
          </div>
        </div>
      </div>
    ),
    size,
  )
}
