import { Wallet } from '@phosphor-icons/react/ssr'
import { WalletButton } from './WalletButton'

type WalletNoticeProps = {
  title: string
  detail: string
  action?: string
}

export function WalletNotice({ title, detail, action = 'Connect wallet' }: WalletNoticeProps) {
  return (
    <section className="wallet-notice">
      <div>
        <Wallet size={19} />
        <div>
          <span>Wallet required</span>
          <strong>{title}</strong>
          <p>{detail}</p>
        </div>
      </div>
      <WalletButton label={action} />
    </section>
  )
}
