-- ============================================
-- 007: Fix foreign key constraints on accounts
-- Add ON DELETE CASCADE so company deletion doesn't fail
-- ============================================

-- classification_results: account_id
ALTER TABLE classification_results
  DROP CONSTRAINT classification_results_account_id_fkey,
  ADD CONSTRAINT classification_results_account_id_fkey
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;

-- classification_results: confirmed_account_id
ALTER TABLE classification_results
  DROP CONSTRAINT classification_results_confirmed_account_id_fkey,
  ADD CONSTRAINT classification_results_confirmed_account_id_fkey
    FOREIGN KEY (confirmed_account_id) REFERENCES accounts(id) ON DELETE SET NULL;

-- classification_rules: account_id
ALTER TABLE classification_rules
  DROP CONSTRAINT classification_rules_account_id_fkey,
  ADD CONSTRAINT classification_rules_account_id_fkey
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
