-- Add NC and ND resolution fields to dian_configs table
-- This migration adds resolution configuration for Credit Notes (NC) and Debit Notes (ND)

-- Add Credit Note (NC) resolution fields
ALTER TABLE dian_configs
ADD COLUMN IF NOT EXISTS credit_note_resolution_number VARCHAR(255) DEFAULT '',
ADD COLUMN IF NOT EXISTS credit_note_resolution_prefix VARCHAR(50) DEFAULT '',
ADD COLUMN IF NOT EXISTS credit_note_resolution_from INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS credit_note_resolution_to INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS credit_note_resolution_date_from TIMESTAMP,
ADD COLUMN IF NOT EXISTS credit_note_resolution_date_to TIMESTAMP;

-- Add Debit Note (ND) resolution fields
ALTER TABLE dian_configs
ADD COLUMN IF NOT EXISTS debit_note_resolution_number VARCHAR(255) DEFAULT '',
ADD COLUMN IF NOT EXISTS debit_note_resolution_prefix VARCHAR(50) DEFAULT '',
ADD COLUMN IF NOT EXISTS debit_note_resolution_from INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS debit_note_resolution_to INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS debit_note_resolution_date_from TIMESTAMP,
ADD COLUMN IF NOT EXISTS debit_note_resolution_date_to TIMESTAMP;

-- Add completion tracking for Steps 5 and 6
ALTER TABLE dian_configs
ADD COLUMN IF NOT EXISTS step5_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS step6_completed BOOLEAN DEFAULT FALSE;

-- Add comments for documentation
COMMENT ON COLUMN dian_configs.step5_completed IS 'Resolution configuration completed for Credit Notes (NC)';
COMMENT ON COLUMN dian_configs.step6_completed IS 'Resolution configuration completed for Debit Notes (ND)';
