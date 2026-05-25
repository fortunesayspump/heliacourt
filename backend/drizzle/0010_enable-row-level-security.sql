CREATE OR REPLACE FUNCTION app_rls_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(current_setting('app.role', true), '');
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_rls_wallet()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(lower(COALESCE(current_setting('app.wallet', true), '')), '');
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_is_service()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app_rls_role() IN ('service', 'worker', 'admin');
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_can_read_case(target_case_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app_is_service()
    OR EXISTS (
      SELECT 1
      FROM cases
      WHERE cases.id = target_case_id
        AND (
          cases.visibility <> 'private'
          OR lower(COALESCE(cases.filer, '')) = app_rls_wallet()
        )
    )
    OR EXISTS (
      SELECT 1
      FROM case_participants
      WHERE case_participants.case_id = target_case_id
        AND lower(case_participants.wallet) = app_rls_wallet()
    );
$$;
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "case_participants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "case_follows" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "auth_challenges" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "telegram_link_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "telegram_accounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "telegram_alert_subscriptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "hearing_jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "transcript_turns" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "court_artifacts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tool_evidence" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "verdicts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "settlement_rows" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "onchain_receipts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "x402_receipts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cases" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "case_participants" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "case_follows" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "auth_challenges" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "telegram_link_requests" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "telegram_accounts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "telegram_alert_subscriptions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "hearing_jobs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "transcript_turns" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "court_artifacts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tool_evidence" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "verdicts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "settlement_rows" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "onchain_receipts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "x402_receipts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "users_service_all" ON "users" FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY "users_public_read" ON "users" FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "users_own_insert" ON "users" FOR INSERT WITH CHECK (lower(wallet) = app_rls_wallet());
--> statement-breakpoint
CREATE POLICY "users_own_update" ON "users" FOR UPDATE USING (lower(wallet) = app_rls_wallet()) WITH CHECK (lower(wallet) = app_rls_wallet());
--> statement-breakpoint
CREATE POLICY "cases_service_all" ON "cases" FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY "cases_read_visible_or_participant" ON "cases" FOR SELECT USING (
  visibility <> 'private'
  OR lower(COALESCE(filer, '')) = app_rls_wallet()
  OR EXISTS (
    SELECT 1
    FROM case_participants
    WHERE case_participants.case_id = cases.id
      AND lower(case_participants.wallet) = app_rls_wallet()
  )
);
--> statement-breakpoint
CREATE POLICY "cases_wallet_insert" ON "cases" FOR INSERT WITH CHECK (filer IS NULL OR lower(filer) = app_rls_wallet());
--> statement-breakpoint
CREATE POLICY "cases_filer_update" ON "cases" FOR UPDATE USING (lower(COALESCE(filer, '')) = app_rls_wallet()) WITH CHECK (lower(COALESCE(filer, '')) = app_rls_wallet());
--> statement-breakpoint
CREATE POLICY "case_participants_service_all" ON "case_participants" FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY "case_participants_read_allowed" ON "case_participants" FOR SELECT USING (
  lower(wallet) = app_rls_wallet()
  OR EXISTS (
    SELECT 1
    FROM cases
    WHERE cases.id = case_participants.case_id
      AND cases.visibility <> 'private'
  )
);
--> statement-breakpoint
CREATE POLICY "case_participants_wallet_insert" ON "case_participants" FOR INSERT WITH CHECK (lower(wallet) = app_rls_wallet());
--> statement-breakpoint
CREATE POLICY "case_follows_service_all" ON "case_follows" FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY "case_follows_read_allowed" ON "case_follows" FOR SELECT USING (
  lower(wallet) = app_rls_wallet()
  OR EXISTS (
    SELECT 1
    FROM cases
    WHERE cases.id = case_follows.case_id
      AND cases.visibility <> 'private'
  )
);
--> statement-breakpoint
CREATE POLICY "case_follows_wallet_insert" ON "case_follows" FOR INSERT WITH CHECK (lower(wallet) = app_rls_wallet());
--> statement-breakpoint
CREATE POLICY "case_follows_wallet_delete" ON "case_follows" FOR DELETE USING (lower(wallet) = app_rls_wallet());
--> statement-breakpoint
CREATE POLICY "auth_challenges_service_all" ON "auth_challenges" FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY "telegram_link_requests_service_all" ON "telegram_link_requests" FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY "telegram_accounts_service_all" ON "telegram_accounts" FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY "telegram_alert_subscriptions_service_all" ON "telegram_alert_subscriptions" FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY "hearing_jobs_service_all" ON "hearing_jobs" FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY "hearing_jobs_read_allowed" ON "hearing_jobs" FOR SELECT USING (app_can_read_case(case_id));
--> statement-breakpoint
CREATE POLICY "transcript_turns_service_all" ON "transcript_turns" FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY "transcript_turns_read_allowed" ON "transcript_turns" FOR SELECT USING (app_can_read_case(case_id));
--> statement-breakpoint
CREATE POLICY "court_artifacts_service_all" ON "court_artifacts" FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY "court_artifacts_read_allowed" ON "court_artifacts" FOR SELECT USING (app_can_read_case(case_id));
--> statement-breakpoint
CREATE POLICY "tool_evidence_service_all" ON "tool_evidence" FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY "tool_evidence_read_allowed" ON "tool_evidence" FOR SELECT USING (app_can_read_case(case_id));
--> statement-breakpoint
CREATE POLICY "verdicts_service_all" ON "verdicts" FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY "verdicts_read_allowed" ON "verdicts" FOR SELECT USING (app_can_read_case(case_id));
--> statement-breakpoint
CREATE POLICY "settlement_rows_service_all" ON "settlement_rows" FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY "settlement_rows_read_allowed" ON "settlement_rows" FOR SELECT USING (app_can_read_case(case_id));
--> statement-breakpoint
CREATE POLICY "onchain_receipts_service_all" ON "onchain_receipts" FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY "onchain_receipts_read_allowed" ON "onchain_receipts" FOR SELECT USING (app_can_read_case(case_id));
--> statement-breakpoint
CREATE POLICY "x402_receipts_service_all" ON "x402_receipts" FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY "x402_receipts_read_allowed" ON "x402_receipts" FOR SELECT USING (
  app_can_read_case(case_id)
  OR lower(COALESCE(payer, '')) = app_rls_wallet()
);
