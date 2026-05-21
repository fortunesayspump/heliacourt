import { index, jsonb, pgTable, real, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  wallet: text('wallet').primaryKey(),
  username: text('username'),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('users_username_idx').on(table.username),
])

export const cases = pgTable('cases', {
  id: text('id').primaryKey(),
  question: text('question').notNull(),
  context: text('context'),
  links: jsonb('links').$type<string[]>(),
  type: text('type').notNull(),
  filer: text('filer'),
  visibility: text('visibility').notNull().default('public'),
  payerVisibility: text('payer_visibility').notNull().default('private'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

export const caseParticipants = pgTable('case_participants', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  wallet: text('wallet').notNull().references(() => users.wallet, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('case_participants_case_idx').on(table.caseId),
  index('case_participants_wallet_idx').on(table.wallet),
  uniqueIndex('case_participants_case_wallet_role_idx').on(table.caseId, table.wallet, table.role),
])

export const authChallenges = pgTable('auth_challenges', {
  id: text('id').primaryKey(),
  wallet: text('wallet').notNull().references(() => users.wallet, { onDelete: 'cascade' }),
  nonce: text('nonce').notNull(),
  message: text('message').notNull(),
  purpose: text('purpose').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('auth_challenges_wallet_idx').on(table.wallet),
  uniqueIndex('auth_challenges_nonce_idx').on(table.nonce),
])

export const hearingJobs = pgTable('hearing_jobs', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  marketCase: jsonb('market_case').notNull(),
  result: jsonb('result'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('hearing_jobs_case_idx').on(table.caseId),
  index('hearing_jobs_status_idx').on(table.status),
  index('hearing_jobs_updated_idx').on(table.updatedAt),
])

export const transcriptTurns = pgTable('transcript_turns', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull().references(() => hearingJobs.id, { onDelete: 'cascade' }),
  caseId: text('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').notNull(),
  agentName: text('agent_name').notNull(),
  seat: text('seat').notNull(),
  kind: text('kind').notNull(),
  stage: text('stage').notNull(),
  message: text('message').notNull(),
  replyToId: text('reply_to_id'),
  requestedAgentId: text('requested_agent_id'),
  request: text('request'),
  artifactId: text('artifact_id'),
  confidence: real('confidence'),
  tags: jsonb('tags').$type<string[]>(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('transcript_turns_job_idx').on(table.jobId),
  index('transcript_turns_case_idx').on(table.caseId),
  index('transcript_turns_created_idx').on(table.createdAt),
])

export const courtArtifacts = pgTable('court_artifacts', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull().references(() => hearingJobs.id, { onDelete: 'cascade' }),
  caseId: text('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').notNull(),
  type: text('type').notNull(),
  summary: text('summary').notNull(),
  confidence: real('confidence'),
  costUsd: real('cost_usd').notNull(),
  runMode: text('run_mode'),
  modelProvider: text('model_provider'),
  model: text('model'),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('court_artifacts_job_idx').on(table.jobId),
  index('court_artifacts_case_idx').on(table.caseId),
  index('court_artifacts_type_idx').on(table.type),
])

export const toolEvidence = pgTable('tool_evidence', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull().references(() => hearingJobs.id, { onDelete: 'cascade' }),
  caseId: text('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  artifactId: text('artifact_id').references(() => courtArtifacts.id, { onDelete: 'cascade' }),
  capability: text('capability').notNull(),
  provider: text('provider').notNull(),
  query: text('query').notNull(),
  status: text('status').notNull(),
  relevance: text('relevance'),
  observations: jsonb('observations').$type<string[]>().notNull(),
  sources: jsonb('sources').notNull(),
  error: text('error'),
  payload: jsonb('payload').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('tool_evidence_job_idx').on(table.jobId),
  index('tool_evidence_case_idx').on(table.caseId),
  index('tool_evidence_artifact_idx').on(table.artifactId),
])

export const verdicts = pgTable('verdicts', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull().references(() => hearingJobs.id, { onDelete: 'cascade' }),
  caseId: text('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  artifactId: text('artifact_id').notNull().references(() => courtArtifacts.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),
  confidence: real('confidence'),
  recordHash: text('record_hash'),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('verdicts_case_idx').on(table.caseId),
  index('verdicts_job_idx').on(table.jobId),
])

export const settlementRows = pgTable('settlement_rows', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull().references(() => hearingJobs.id, { onDelete: 'cascade' }),
  caseId: text('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  artifactId: text('artifact_id').references(() => courtArtifacts.id, { onDelete: 'cascade' }),
  item: text('item').notNull(),
  amount: text('amount').notNull(),
  status: text('status').notNull(),
  recordHash: text('record_hash'),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('settlement_rows_case_idx').on(table.caseId),
  index('settlement_rows_job_idx').on(table.jobId),
])

export const onchainReceipts = pgTable('onchain_receipts', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  jobId: text('job_id').references(() => hearingJobs.id, { onDelete: 'set null' }),
  chainId: text('chain_id').notNull(),
  txHash: text('tx_hash').notNull(),
  receiptType: text('receipt_type').notNull(),
  recordHash: text('record_hash'),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('onchain_receipts_case_idx').on(table.caseId),
  index('onchain_receipts_tx_idx').on(table.txHash),
])
