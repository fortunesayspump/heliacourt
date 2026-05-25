import { z } from 'zod'

const walletSchema = z.custom<`0x${string}`>((value) => typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value))
const txHashSchema = z.custom<`0x${string}`>((value) => typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value))

export const createCaseSchema = z.object({
  id: z.string().trim().min(1).optional(),
  question: z.string().trim().min(1),
  context: z.string().trim().optional(),
  links: z.array(z.string().trim().url()).min(1),
  imageUrl: z.string().trim().url().optional(),
  type: z.enum(['crypto-market', 'prediction-market', 'macro', 'real-world-event']).optional(),
  parentCaseId: z.string().trim().min(1).optional(),
  filingKind: z.enum(['original', 'fresh-hearing', 'private-fork']).default('original'),
  filer: walletSchema.optional(),
  visibility: z.enum(['public', 'unlisted', 'private']).default('public'),
  payerVisibility: z.enum(['public', 'private']).default('private'),
  onchain: z.object({
    chainId: z.string().trim().min(1),
    escrowAddress: walletSchema,
    caseId: z.string().trim().min(1),
    txHash: txHashSchema,
    budgetUsdc: z.string().trim().min(1),
    questionHash: txHashSchema,
    metadataURI: z.string().trim().optional(),
  }),
})

export const adminSeedCasesSchema = z.object({
  cases: z.array(z.object({
    id: z.string().trim().min(1).optional(),
    question: z.string().trim().min(1),
    context: z.string().trim().optional(),
    links: z.array(z.string().trim().url()).min(1),
    imageUrl: z.string().trim().url().optional(),
    type: z.enum(['crypto-market', 'prediction-market', 'macro', 'real-world-event']).default('prediction-market'),
    visibility: z.enum(['public', 'unlisted', 'private']).default('public'),
    payerVisibility: z.enum(['public', 'private']).default('private'),
    createdAt: z.string().datetime().optional(),
  })).min(1).max(50),
})

export const signedCaseAccessSchema = z.object({
  wallet: walletSchema,
  auth: z.object({
    message: z.string().min(1),
    signature: z.custom<`0x${string}`>((value) => typeof value === 'string' && /^0x[a-fA-F0-9]+$/.test(value)),
  }),
})

export const followCaseSchema = signedCaseAccessSchema.extend({
  following: z.boolean().default(true),
})

export const caseAccessChallengeSchema = z.object({
  wallet: walletSchema,
})

export const addFundingReceiptSchema = z.object({
  wallet: walletSchema,
  chainId: z.string().trim().min(1),
  txHash: txHashSchema,
  amountUsdc: z.string().trim().min(1).optional(),
})

export const cancelCaseReceiptSchema = z.object({
  wallet: walletSchema,
  chainId: z.string().trim().min(1),
  txHash: txHashSchema,
  refundUsdc: z.string().trim().min(1).optional(),
})
