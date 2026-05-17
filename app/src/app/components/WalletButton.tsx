'use client'

import { useAppKit } from '@reown/appkit/react'
import { CaretDown, Plus, Gear, ShieldCheck, UserCircle, Wallet } from '@phosphor-icons/react/ssr'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { appKitProjectId, arcTestnet } from '../../lib/arc'

type WalletButtonProps = {
  label?: string
  connectedLabel?: string
  className?: string
  showIcon?: boolean
}

function shortAddress(address: `0x${string}`) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function WalletButton({
  label = 'Connect',
  connectedLabel,
  className,
  showIcon = true,
}: WalletButtonProps) {
  if (appKitProjectId) {
    return (
      <AppKitWalletButton
        className={className}
        connectedLabel={connectedLabel}
        label={label}
        showIcon={showIcon}
      />
    )
  }

  return (
    <InjectedWalletButton
      className={className}
      connectedLabel={connectedLabel}
      label="Set up modal"
      showIcon={showIcon}
    />
  )
}

function AppKitWalletButton({
  label = 'Connect',
  connectedLabel,
  className,
  showIcon = true,
}: WalletButtonProps) {
  const { open } = useAppKit()
  const { address, chainId, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const [menuOpen, setMenuOpen] = useState(false)
  const isWrongChain = isConnected && chainId !== arcTestnet.id

  if (isConnected && address && isWrongChain) {
    return (
      <button className={className} type="button" onClick={() => switchChain({ chainId: arcTestnet.id })}>
        {showIcon ? <ShieldCheck size={16} /> : null}
        {isSwitching ? 'Switching...' : 'Switch to Arc'}
      </button>
    )
  }

  if (isConnected && address) {
    return (
      <div className="wallet-menu">
        <button className={className} type="button" onClick={() => setMenuOpen((value) => !value)}>
          {showIcon ? <Wallet size={16} /> : null}
          {connectedLabel ?? shortAddress(address)}
          <CaretDown size={15} />
        </button>
        {menuOpen ? (
          <div className="wallet-menu-panel">
            <Link href="/cases/new" onClick={() => setMenuOpen(false)}>
              <Plus size={15} />
              New case
            </Link>
            <Link href="/profile" onClick={() => setMenuOpen(false)}>
              <UserCircle size={15} />
              Profile
            </Link>
            <Link href="/settings" onClick={() => setMenuOpen(false)}>
              <Gear size={15} />
              Gear
            </Link>
            <button type="button" onClick={() => disconnect()}>
              <Wallet size={15} />
              Disconnect
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <button className={className} type="button" onClick={() => open()}>
      {showIcon ? <Wallet size={16} /> : null}
      {label}
    </button>
  )
}

function InjectedWalletButton({
  label = 'Connect',
  connectedLabel,
  className,
  showIcon = true,
}: WalletButtonProps) {
  const { address, chainId, isConnected } = useAccount()
  const { connectAsync, connectors, error, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const [attempted, setAttempted] = useState(false)
  const [localError, setLocalError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const connector = useMemo(
    () => connectors.find((item) => item.type === 'injected') ?? connectors[0],
    [connectors],
  )
  const isWrongChain = isConnected && chainId !== arcTestnet.id
  const hasError = attempted && (Boolean(error) || Boolean(localError))

  const handleConnect = async () => {
    setAttempted(true)
    setLocalError('')

    if (!connector) {
      setLocalError('Add NEXT_PUBLIC_REOWN_PROJECT_ID to enable the wallet modal.')
      return
    }

    const hasBrowserWallet =
      typeof window !== 'undefined' && Boolean((window as Window & { ethereum?: unknown }).ethereum)

    if (!hasBrowserWallet) {
      setLocalError('Add NEXT_PUBLIC_REOWN_PROJECT_ID for the wallet modal, or open this app in a wallet browser.')
      return
    }

    try {
      await connectAsync({ connector })
    } catch (connectError) {
      setLocalError(connectError instanceof Error ? connectError.message : 'Wallet connection failed.')
    }
  }

  if (isConnected && address && isWrongChain) {
    return (
      <button className={className} type="button" onClick={() => switchChain({ chainId: arcTestnet.id })}>
        {showIcon ? <ShieldCheck size={16} /> : null}
        {isSwitching ? 'Switching...' : 'Switch to Arc'}
      </button>
    )
  }

  if (isConnected && address) {
    return (
      <div className="wallet-menu">
        <button className={className} type="button" onClick={() => setMenuOpen((value) => !value)}>
          {showIcon ? <Wallet size={16} /> : null}
          {connectedLabel ?? shortAddress(address)}
          <CaretDown size={15} />
        </button>
        {menuOpen ? (
          <div className="wallet-menu-panel">
            <Link href="/cases/new" onClick={() => setMenuOpen(false)}>
              <Plus size={15} />
              New case
            </Link>
            <Link href="/profile" onClick={() => setMenuOpen(false)}>
              <UserCircle size={15} />
              Profile
            </Link>
            <Link href="/settings" onClick={() => setMenuOpen(false)}>
              <Gear size={15} />
              Gear
            </Link>
            <button type="button" onClick={() => disconnect()}>
              <Wallet size={15} />
              Disconnect
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <button
      className={className}
      type="button"
      disabled={isPending}
      title={hasError ? localError || error?.message : undefined}
      onClick={handleConnect}
    >
      {showIcon ? <Wallet size={16} /> : null}
      {isPending ? 'Connecting...' : hasError ? 'No wallet found' : label}
    </button>
  )
}
