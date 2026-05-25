'use client'

import { useAppKit } from '@reown/appkit/react'
import { DotsThreeVertical, Plus, ShieldCheck, UserCircle, Wallet } from '@phosphor-icons/react/ssr'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { appKitProjectId, arcTestnet } from '../../../lib/arc'
import { getConnectedChainId, isArcTestnetChainId } from '../../../lib/chains'

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
      label={label}
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
  const activeChainId = useChainId()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const connectedChainId = getConnectedChainId(chainId, activeChainId)
  const isWrongChain = isConnected && !isArcTestnetChainId(connectedChainId)

  useEffect(() => {
    if (!menuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

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
      <div className="wallet-menu" ref={menuRef}>
        <button className={className} type="button" onClick={() => setMenuOpen((value) => !value)}>
          {showIcon ? <Wallet size={16} /> : null}
          {connectedLabel ?? shortAddress(address)}
          <DotsThreeVertical size={15} />
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
            <button type="button" onClick={() => {
              setMenuOpen(false)
              disconnect()
            }}>
              <Wallet size={15} />
              Disconnect
            </button>
            <div className="wallet-menu-network">
              <img alt="" src="https://www.google.com/s2/favicons?domain=arc.network&sz=64" />
              <div>
                <span>Network</span>
                <strong>{isArcTestnetChainId(connectedChainId) ? arcTestnet.name : `Chain ${connectedChainId ?? 'unknown'}`}</strong>
              </div>
            </div>
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
  const activeChainId = useChainId()
  const { connectAsync, connectors, error, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const [attempted, setAttempted] = useState(false)
  const [localError, setLocalError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const connector = useMemo(
    () => connectors.find((item) => item.type === 'injected') ?? connectors[0],
    [connectors],
  )
  const connectedChainId = getConnectedChainId(chainId, activeChainId)
  const isWrongChain = isConnected && !isArcTestnetChainId(connectedChainId)
  const hasError = attempted && (Boolean(error) || Boolean(localError))

  useEffect(() => {
    if (!menuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

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
      <div className="wallet-menu" ref={menuRef}>
        <button className={className} type="button" onClick={() => setMenuOpen((value) => !value)}>
          {showIcon ? <Wallet size={16} /> : null}
          {connectedLabel ?? shortAddress(address)}
          <DotsThreeVertical size={15} />
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
            <button type="button" onClick={() => {
              setMenuOpen(false)
              disconnect()
            }}>
              <Wallet size={15} />
              Disconnect
            </button>
            <div className="wallet-menu-network">
              <img alt="" src="https://www.google.com/s2/favicons?domain=arc.network&sz=64" />
              <div>
                <span>Network</span>
                <strong>{isArcTestnetChainId(connectedChainId) ? arcTestnet.name : `Chain ${connectedChainId ?? 'unknown'}`}</strong>
              </div>
            </div>
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
      {isPending ? 'Connecting...' : label}
    </button>
  )
}
