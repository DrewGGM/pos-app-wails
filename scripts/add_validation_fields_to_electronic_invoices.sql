-- Add DIAN validation tracking fields to electronic_invoices table
-- This migration adds fields for tracking DIAN validation status

-- Modify UUID to be nullable
ALTER TABLE electronic_invoices ALTER COLUMN uuid DROP NOT NULL;

-- Add new fields
ALTER TABLE electronic_invoices
ADD COLUMN IF NOT EXISTS zip_key VARCHAR(255) DEFAULT '',
ADD COLUMN IF NOT EXISTS is_valid BOOLEAN,
ADD COLUMN IF NOT EXISTS validation_message TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS validation_checked_at TIMESTAMP;

-- Update Status field to support new states
COMMENT ON COLUMN electronic_invoices.status IS 'Invoice status: pending, sent, validating, accepted, rejected';
COMMENT ON COLUMN electronic_invoices.zip_key IS 'DIAN ZIP key for status verification';
COMMENT ON COLUMN electronic_invoices.is_valid IS 'DIAN validation result (null=not checked, true=valid, false=invalid)';
COMMENT ON COLUMN electronic_invoices.validation_message IS 'DIAN validation message or error';
COMMENT ON COLUMN electronic_invoices.validation_checked_at IS 'Last time DIAN validation was checked';
