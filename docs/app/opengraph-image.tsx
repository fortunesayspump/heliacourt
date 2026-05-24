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
          background: '#fbf7ef',
          color: '#17110c',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          justifyContent: 'space-between',
          padding: 64,
          width: '100%',
        }}
      >
        <div style={{ color: '#476352', display: 'flex', fontSize: 30, fontWeight: 700 }}>
          docs.heliacourt.xyz
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
          <div style={{ display: 'flex', fontSize: 96, fontWeight: 800, letterSpacing: 0, lineHeight: 1 }}>
            Helia Court Docs
          </div>
          <div style={{ color: '#564636', display: 'flex', fontSize: 36, lineHeight: 1.3, width: 850 }}>
            Build, integrate, and audit agents, cases, receipts, x402 payment paths, and Arc settlement.
          </div>
        </div>
        <div style={{ borderTop: '2px solid #dacbb7', display: 'flex', gap: 34, paddingTop: 28 }}>
          <div style={{ color: '#476352', display: 'flex', fontSize: 28 }}>Agent registry</div>
          <div style={{ color: '#476352', display: 'flex', fontSize: 28 }}>Court receipts</div>
          <div style={{ color: '#476352', display: 'flex', fontSize: 28 }}>Arc testnet</div>
        </div>
      </div>
    ),
    size,
  )
}
