export function formatWalletError(error: unknown, fallback = 'Wallet action failed.') {
  const message = getErrorMessage(error)
  const normalized = message.toLowerCase()

  if (/(user rejected|user denied|denied transaction|rejected the request|request rejected|action_rejected|4001)/i.test(message)) {
    return 'Transaction was rejected in the wallet.'
  }
  if (/(signature|sign message|signtypeddata)/i.test(message) && /(denied|rejected|cancelled|canceled|4001)/i.test(message)) {
    return 'Signature request was rejected in the wallet.'
  }
  if (/invalid chain id|unsupported chain|unknown chain|chain .*not configured|unrecognized chain/i.test(message)) {
    return 'This wallet does not support Arc Testnet yet. Add Arc Testnet manually or use Rabby/MetaMask.'
  }
  if (/wrong chain|switch chain|chain mismatch/i.test(message)) {
    return 'Switch your wallet to Arc Testnet, then try again.'
  }
  if (/insufficient funds|exceeds the balance|gas required exceeds allowance|not enough funds/i.test(message)) {
    return 'Wallet needs enough Arc testnet USDC for this transaction.'
  }
  if (/allowance|approve/i.test(message)) {
    return 'USDC approval did not complete. Approve spending in your wallet, then try again.'
  }
  if (/network|rpc|fetch failed|timeout|timed out/i.test(message)) {
    return 'Arc network request failed. Wait a moment and try again.'
  }

  if (!message || normalized === '[object object]') return fallback
  return compactWalletMessage(message, fallback)
}

export function formatSignatureError(error: unknown, fallback = 'Wallet signature failed.') {
  const message = getErrorMessage(error)
  if (/(user rejected|user denied|rejected the request|request rejected|denied|cancelled|canceled|4001)/i.test(message)) {
    return 'Signature request was rejected in the wallet.'
  }
  if (/Request Arguments:|Contract Call:|Docs:|Version:/i.test(message)) return fallback
  return formatWalletError(error, fallback)
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const record = error as { shortMessage?: unknown; message?: unknown; details?: unknown }
    return String(record.shortMessage || record.message || record.details || (error instanceof Error ? error.message : ''))
  }
  return ''
}

function compactWalletMessage(message: string, fallback: string) {
  const firstLine = message.split('\n').map((line) => line.trim()).find(Boolean)
  if (!firstLine) return fallback
  if (firstLine.length <= 180 && !/Request Arguments:|Contract Call:|Docs:|Version:/i.test(firstLine)) return firstLine
  return fallback
}
