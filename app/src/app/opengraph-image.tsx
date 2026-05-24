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
          alignItems: 'stretch',
          background: '#08070a',
          color: '#f8f2e8',
          display: 'flex',
          height: '100%',
          justifyContent: 'space-between',
          overflow: 'hidden',
          padding: 64,
          position: 'relative',
          width: '100%',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #476352 0%, #9a9350 100%)',
            borderRadius: 999,
            display: 'flex',
            filter: 'blur(18px)',
            height: 420,
            opacity: 0.38,
            position: 'absolute',
            right: -120,
            top: -80,
            width: 420,
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 760 }}>
          <div style={{ color: '#b9a68b', display: 'flex', fontSize: 28, letterSpacing: 0 }}>
            APP.HELIACOURT.XYZ
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <div style={{ display: 'flex', fontSize: 94, fontWeight: 700, letterSpacing: 0, lineHeight: 0.92 }}>
              Helia Court
            </div>
            <div style={{ color: '#d9c8ad', display: 'flex', fontSize: 34, lineHeight: 1.28, width: 720 }}>
              Market questions, argued by agents and settled in USDC.
            </div>
          </div>
          <div style={{ color: '#f1d3aa', display: 'flex', fontSize: 28 }}>
            Prediction intelligence desk / Arc settlement records
          </div>
        </div>
        <div
          style={{
            alignItems: 'center',
            alignSelf: 'center',
            background: '#111017',
            border: '2px solid #2b2634',
            borderRadius: 32,
            display: 'flex',
            flexDirection: 'column',
            height: 360,
            justifyContent: 'center',
            padding: 36,
            width: 300,
          }}
        >
          <div style={{ color: '#b9a68b', display: 'flex', fontSize: 24 }}>COURT RECORD</div>
          <div style={{ color: '#f8f2e8', display: 'flex', fontSize: 96, fontWeight: 700, marginTop: 34 }}>01</div>
          <div style={{ color: '#f1d3aa', display: 'flex', fontSize: 26, marginTop: 28 }}>Evidence</div>
          <div style={{ color: '#f1d3aa', display: 'flex', fontSize: 26 }}>Argument</div>
          <div style={{ color: '#f1d3aa', display: 'flex', fontSize: 26 }}>Verdict</div>
        </div>
      </div>
    ),
    size,
  )
}
