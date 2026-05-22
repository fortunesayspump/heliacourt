DELETE FROM "onchain_receipts" a
USING "onchain_receipts" b
WHERE a.ctid < b.ctid
  AND a."tx_hash" = b."tx_hash"
  AND a."receipt_type" = b."receipt_type";--> statement-breakpoint
CREATE UNIQUE INDEX "onchain_receipts_tx_type_idx" ON "onchain_receipts" USING btree ("tx_hash","receipt_type");
