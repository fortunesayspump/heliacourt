import { BatchEvmScheme } from '@circle-fin/x402-batching/client'
import { x402Client, x402HTTPClient } from '@x402/core/client'
import type { Address, Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { env } from '../config/env.js'

type X402Resource = 'price' | 'transcript' | 'receipts' | 'proof'

type CliOptions = {
  command: 'status' | 'challenge' | 'read'
  baseUrl: string
  caseId?: string
  resource: X402Resource
  privateKey?: Hex
}

const resourceOptions = new Set<X402Resource>(['price', 'transcript', 'receipts', 'proof'])

async function main() {
  if (process.argv.slice(2).some((arg) => arg === '--help' || arg === '-h')) {
    printUsage()
    return
  }

  const options = parseArgs(process.argv.slice(2))

  if (options.command === 'status') {
    await printStatus(options.baseUrl)
    return
  }

  if (!options.caseId) {
    throw new Error(`--case-id is required for ${options.command}`)
  }

  if (options.command === 'challenge') {
    await printChallenge(options)
    return
  }

  await runPaidRead(options)
}

function parseArgs(args: string[]): CliOptions {
  const [command = 'status', ...rest] = args
  if (!isCommand(command)) {
    throw new Error(`Unknown x402 command "${command}". Use status, challenge, or read.`)
  }

  const values = new Map<string, string>()
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    if (!arg.startsWith('--')) continue
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2)
    const nextValue = inlineValue ?? rest[index + 1]
    if (!inlineValue) index += 1
    if (!nextValue || nextValue.startsWith('--')) {
      throw new Error(`Missing value for --${rawKey}`)
    }
    values.set(rawKey, nextValue)
  }

  const resource = values.get('resource') ?? 'proof'
  if (!resourceOptions.has(resource as X402Resource)) {
    throw new Error(`Unsupported --resource "${resource}". Use price, transcript, receipts, or proof.`)
  }

  const privateKey = values.get('private-key') ?? process.env.X402_DEMO_PRIVATE_KEY ?? env.PRIVATE_KEY

  return {
    command,
    baseUrl: normalizeBaseUrl(values.get('base-url') ?? `http://localhost:${env.PORT}`),
    caseId: values.get('case-id'),
    resource: resource as X402Resource,
    privateKey: privateKey ? normalizePrivateKey(privateKey) : undefined,
  }
}

async function printStatus(baseUrl: string) {
  const response = await fetch(`${baseUrl}/x402/status`, { cache: 'no-store' })
  await printResponse('x402 status', response)
}

async function printChallenge(options: CliOptions) {
  const response = await fetch(resourceUrl(options), { cache: 'no-store' })
  await printResponse('x402 challenge', response, ['payment-required', 'accept-payment', 'x-payment-challenge'])
}

async function runPaidRead(options: CliOptions) {
  if (!options.privateKey) {
    throw new Error('Paid reads require --private-key, X402_DEMO_PRIVATE_KEY, or PRIVATE_KEY.')
  }

  const challengeResponse = await fetch(resourceUrl(options), { cache: 'no-store' })
  const challengeBody = await readJson(challengeResponse)
  if (challengeResponse.status !== 402) {
    console.log(JSON.stringify({
      ok: false,
      stage: 'challenge',
      status: challengeResponse.status,
      body: challengeBody,
    }, null, 2))
    return
  }

  const account = privateKeyToAccount(options.privateKey)
  const signer = {
    address: account.address as Address,
    signTypedData: (params: {
      domain: Record<string, unknown>
      types: Record<string, Array<{ name: string; type: string }>>
      primaryType: string
      message: Record<string, unknown>
    }) => account.signTypedData({
      domain: params.domain as never,
      types: params.types as never,
      primaryType: params.primaryType as never,
      message: params.message as never,
    } as never),
  }

  const coreClient = new x402Client().register('eip155:*', new BatchEvmScheme(signer) as never)
  const httpClient = new x402HTTPClient(coreClient)
  const paymentRequired = httpClient.getPaymentRequiredResponse(
    (name) => challengeResponse.headers.get(name),
    challengeBody,
  )
  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired)
  const paymentHeaders: Record<string, string> = httpClient.encodePaymentSignatureHeader(paymentPayload)
  const challengeToken = challengeResponse.headers.get('x-payment-challenge')
  if (challengeToken) paymentHeaders['x-payment-challenge'] = challengeToken

  const paidResponse = await fetch(resourceUrl(options), {
    cache: 'no-store',
    headers: paymentHeaders,
  })
  const body = await readJson(paidResponse)
  const settlement = paidResponse.ok
    ? httpClient.getPaymentSettleResponse((name) => paidResponse.headers.get(name))
    : null

  console.log(JSON.stringify({
    ok: paidResponse.ok,
    status: paidResponse.status,
    resource: options.resource,
    caseId: options.caseId,
    payer: account.address,
    settlement,
    body,
  }, null, 2))
}

async function printResponse(label: string, response: Response, headerNames: string[] = []) {
  const body = await readJson(response)
  const headers = Object.fromEntries(
    headerNames
      .map((name) => [name, response.headers.get(name)])
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )

  console.log(JSON.stringify({
    label,
    ok: response.ok,
    status: response.status,
    headers,
    body,
  }, null, 2))
}

async function readJson(response: Response) {
  return response.json().catch(async () => ({ raw: await response.text().catch(() => '') }))
}

function resourceUrl(options: CliOptions) {
  return `${options.baseUrl}/x402/${options.resource}/${encodeURIComponent(options.caseId ?? '')}`
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '')
}

function normalizePrivateKey(value: string): Hex {
  const normalized = value.trim()
  if (/^0x[a-fA-F0-9]{64}$/.test(normalized)) return normalized as Hex
  throw new Error('Private key must be a 32-byte 0x-prefixed hex string.')
}

function isCommand(value: string): value is CliOptions['command'] {
  return value === 'status' || value === 'challenge' || value === 'read'
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  console.error('')
  printUsage()
  process.exitCode = 1
})

function printUsage() {
  console.error([
    'Usage:',
    '  pnpm --dir backend x402 status [--base-url http://localhost:4000]',
    '  pnpm --dir backend x402 challenge --case-id <caseId> [--resource proof]',
    '  pnpm --dir backend x402 read --case-id <caseId> [--resource proof] --private-key 0x...',
  ].join('\n'))
}
