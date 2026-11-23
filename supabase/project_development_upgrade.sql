-- =============================================================================
-- Project Development Services Upgrade: PostgreSQL / Supabase Migration
-- Idempotent DDL for all 8 required tables, RLS policies & 3 Storage Buckets
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS web_platform;

-- 1. projects
CREATE TABLE IF NOT EXISTS web_platform.projects (
  id SERIAL PRIMARY KEY,
  project_code TEXT NOT NULL UNIQUE,
  enquiry_id INTEGER NOT NULL,
  quotation_id INTEGER,
  user_id INTEGER,
  customer_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  budget_inr INTEGER NOT NULL DEFAULT 0,
  technical_requirements TEXT NOT NULL DEFAULT '',
  technical_notes TEXT NOT NULL DEFAULT '',
  design_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  assigned_engineer TEXT NOT NULL DEFAULT 'Engineering Team',
  status TEXT NOT NULL DEFAULT 'Awaiting Advance Payment',
  progress_percent INTEGER NOT NULL DEFAULT 0,
  start_date TEXT NOT NULL DEFAULT '',
  estimated_completion_date TEXT NOT NULL DEFAULT '',
  total_amount_inr INTEGER NOT NULL DEFAULT 0,
  paid_amount_inr INTEGER NOT NULL DEFAULT 0,
  balance_amount_inr INTEGER NOT NULL DEFAULT 0,
  payment_clearance_status TEXT NOT NULL DEFAULT 'Pending',
  handover_unlocked BOOLEAN NOT NULL DEFAULT FALSE,
  handover_method TEXT NOT NULL DEFAULT 'digital',
  handover_exception_authorized BOOLEAN NOT NULL DEFAULT FALSE,
  handover_exception_reason TEXT NOT NULL DEFAULT '',
  handover_exception_by TEXT NOT NULL DEFAULT '',
  handover_exception_at TEXT NOT NULL DEFAULT '',
  customer_acknowledged_at TEXT NOT NULL DEFAULT '',
  customer_acknowledged_by TEXT NOT NULL DEFAULT '',
  completion_certificate_number TEXT NOT NULL DEFAULT '',
  completed_at TEXT NOT NULL DEFAULT '',
  completion_proof JSONB NOT NULL DEFAULT '[]'::jsonb,
  milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
  updates JSONB NOT NULL DEFAULT '[]'::jsonb,
  deliverables JSONB NOT NULL DEFAULT '[]'::jsonb,
  tracking_courier TEXT NOT NULL DEFAULT '',
  tracking_id TEXT NOT NULL DEFAULT '',
  tracking_url TEXT NOT NULL DEFAULT '',
  archived_at TIMESTAMPTZ,
  archived_reason TEXT NOT NULL DEFAULT '',
  archived_by TEXT NOT NULL DEFAULT '',
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. project_payments
CREATE TABLE IF NOT EXISTS web_platform.project_payments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL UNIQUE REFERENCES web_platform.projects(id) ON DELETE CASCADE,
  enquiry_id INTEGER,
  quotation_id INTEGER,
  user_id INTEGER,
  customer_id TEXT NOT NULL DEFAULT '',
  project_code TEXT NOT NULL DEFAULT '',
  total_amount_inr INTEGER NOT NULL DEFAULT 0,
  paid_amount_inr INTEGER NOT NULL DEFAULT 0,
  pending_amount_inr INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pending',
  currency TEXT NOT NULL DEFAULT 'INR',
  created_by TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. payment_installments
CREATE TABLE IF NOT EXISTS web_platform.payment_installments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES web_platform.projects(id) ON DELETE CASCADE,
  project_payment_id INTEGER REFERENCES web_platform.project_payments(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  milestone_name TEXT NOT NULL DEFAULT '',
  percentage INTEGER NOT NULL DEFAULT 50,
  amount_inr INTEGER NOT NULL DEFAULT 0,
  paid_amount_inr INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pending',
  due_date TEXT NOT NULL DEFAULT '',
  due_trigger TEXT NOT NULL DEFAULT 'before_commencement',
  razorpay_payment_link_id TEXT NOT NULL DEFAULT '',
  payment_link_url TEXT NOT NULL DEFAULT '',
  razorpay_order_id TEXT NOT NULL DEFAULT '',
  razorpay_payment_id TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT '',
  paid_at TIMESTAMPTZ,
  last_reminder_at TIMESTAMPTZ,
  reminder_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. payment_reminders
CREATE TABLE IF NOT EXISTS web_platform.payment_reminders (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES web_platform.projects(id) ON DELETE CASCADE,
  installment_id INTEGER REFERENCES web_platform.payment_installments(id) ON DELETE CASCADE,
  user_id INTEGER,
  recipient_email TEXT NOT NULL,
  installment_number INTEGER NOT NULL DEFAULT 1,
  amount_inr INTEGER NOT NULL DEFAULT 0,
  reminder_type TEXT NOT NULL DEFAULT 'automatic',
  channel TEXT NOT NULL DEFAULT 'email',
  delivery_status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT NOT NULL DEFAULT '',
  sent_by TEXT NOT NULL DEFAULT 'system',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. project_agreements
CREATE TABLE IF NOT EXISTS web_platform.project_agreements (
  id SERIAL PRIMARY KEY,
  agreement_number TEXT NOT NULL UNIQUE,
  project_id INTEGER REFERENCES web_platform.projects(id) ON DELETE SET NULL,
  enquiry_id INTEGER,
  project_code TEXT NOT NULL DEFAULT '',
  enquiry_number TEXT NOT NULL DEFAULT '',
  user_id INTEGER,
  customer_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  version_label TEXT NOT NULL DEFAULT 'v1.0',
  status TEXT NOT NULL DEFAULT 'Awaiting Acceptance',
  storage_bucket TEXT NOT NULL DEFAULT 'project-agreements',
  storage_path TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  signed_pdf_bucket TEXT NOT NULL DEFAULT 'project-agreements',
  signed_pdf_path TEXT NOT NULL DEFAULT '',
  signed_file_name TEXT NOT NULL DEFAULT '',
  uploaded_by TEXT NOT NULL DEFAULT '',
  signed_by_customer TEXT NOT NULL DEFAULT '',
  signed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  accepted_by_name TEXT NOT NULL DEFAULT '',
  accepted_by_email TEXT NOT NULL DEFAULT '',
  acceptance_ip TEXT NOT NULL DEFAULT '',
  acceptance_user_agent TEXT NOT NULL DEFAULT '',
  acceptance_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  agreement_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ,
  awaiting_acceptance_at TIMESTAMPTZ,
  company_stamp_asset_id INTEGER,
  company_signature_asset_id INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  archived_reason TEXT NOT NULL DEFAULT '',
  archived_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE web_platform.project_agreements ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE web_platform.project_agreements ADD COLUMN IF NOT EXISTS accepted_by_name TEXT NOT NULL DEFAULT '';
ALTER TABLE web_platform.project_agreements ADD COLUMN IF NOT EXISTS accepted_by_email TEXT NOT NULL DEFAULT '';
ALTER TABLE web_platform.project_agreements ADD COLUMN IF NOT EXISTS acceptance_ip TEXT NOT NULL DEFAULT '';
ALTER TABLE web_platform.project_agreements ADD COLUMN IF NOT EXISTS acceptance_user_agent TEXT NOT NULL DEFAULT '';
ALTER TABLE web_platform.project_agreements ADD COLUMN IF NOT EXISTS acceptance_record JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE web_platform.project_agreements ADD COLUMN IF NOT EXISTS agreement_data JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE web_platform.project_agreements ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ;
ALTER TABLE web_platform.project_agreements ADD COLUMN IF NOT EXISTS awaiting_acceptance_at TIMESTAMPTZ;
ALTER TABLE web_platform.project_agreements ADD COLUMN IF NOT EXISTS company_stamp_asset_id INTEGER;
ALTER TABLE web_platform.project_agreements ADD COLUMN IF NOT EXISTS company_signature_asset_id INTEGER;

-- 6. agreement_settings
CREATE TABLE IF NOT EXISTS web_platform.agreement_settings (
  id SERIAL PRIMARY KEY,
  company_name TEXT NOT NULL DEFAULT 'NEXUSTEKFUSION PRIVATE LIMITED',
  company_logo_url TEXT NOT NULL DEFAULT '/assets/aistudio/image_1a5ac752.png',
  company_address TEXT NOT NULL DEFAULT 'Amravati, Maharashtra, India',
  contact_email TEXT NOT NULL DEFAULT 'support@nexustekfusion.com',
  contact_phone TEXT NOT NULL DEFAULT '+91-9876543210',
  gstin TEXT NOT NULL DEFAULT '',
  cin TEXT NOT NULL DEFAULT '',
  default_scope_template TEXT NOT NULL DEFAULT 'Design, engineering, firmware/software development, hardware integration, testing, and documentation as specified in the approved project scope.',
  default_timeline_text TEXT NOT NULL DEFAULT '4-6 weeks from confirmation of First Installment (50% Advance Payment).',
  advance_payment_terms TEXT NOT NULL DEFAULT '50% of the total project cost must be paid before project commencement. Project remains in Awaiting Advance Payment status until cleared.',
  second_payment_terms TEXT NOT NULL DEFAULT 'Remaining 50% of the total project cost is payable at the agreed second payment milestone / prior to final handover.',
  terms_and_conditions TEXT NOT NULL DEFAULT '1. Work starts strictly after 50% advance clearance and customer agreement acceptance.',
  cancellation_refund_policy TEXT NOT NULL DEFAULT 'Advance payment covers procured components and allocated engineering hours.',
  signatory_name TEXT NOT NULL DEFAULT 'Authorized Signatory',
  signatory_designation TEXT NOT NULL DEFAULT 'Director / Engineering Lead',
  stamp_asset_id INTEGER,
  signature_asset_id INTEGER,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. project_attachments
CREATE TABLE IF NOT EXISTS web_platform.project_attachments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES web_platform.projects(id) ON DELETE CASCADE,
  enquiry_id INTEGER,
  user_id INTEGER,
  customer_id TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_bucket TEXT NOT NULL DEFAULT 'project-attachments',
  storage_path TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'supporting_document',
  uploaded_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. payment_transactions
CREATE TABLE IF NOT EXISTS web_platform.payment_transactions (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES web_platform.projects(id) ON DELETE CASCADE,
  project_payment_id INTEGER REFERENCES web_platform.project_payments(id) ON DELETE CASCADE,
  installment_id INTEGER REFERENCES web_platform.payment_installments(id) ON DELETE SET NULL,
  installment_number INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER,
  customer_id TEXT NOT NULL DEFAULT '',
  amount_inr INTEGER NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'razorpay_checkout',
  transaction_ref TEXT NOT NULL,
  razorpay_order_id TEXT NOT NULL DEFAULT '',
  razorpay_payment_id TEXT NOT NULL DEFAULT '',
  razorpay_signature TEXT NOT NULL DEFAULT '',
  payment_link_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Paid',
  failure_reason TEXT NOT NULL DEFAULT '',
  recorded_by TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS Enablement (service_role bypasses; authenticated read own records)
ALTER TABLE web_platform.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_platform.project_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_platform.payment_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_platform.payment_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_platform.project_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_platform.agreement_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_platform.project_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_platform.payment_transactions ENABLE ROW LEVEL SECURITY;

-- Private Supabase Storage Buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('project-attachments', 'project-attachments', FALSE) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('project-agreements', 'project-agreements', FALSE) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('company-assets', 'company-assets', FALSE) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('payment-receipts', 'payment-receipts', FALSE) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('project-invoices', 'project-invoices', FALSE) ON CONFLICT (id) DO NOTHING;

-- 9. document_settings (A4 Letterhead, Company Stamp & Signature placement)
CREATE TABLE IF NOT EXISTS web_platform.document_settings (
  id SERIAL PRIMARY KEY,
  letterhead_file_path TEXT NOT NULL DEFAULT '',
  letterhead_file_name TEXT NOT NULL DEFAULT '',
  letterhead_mime_type TEXT NOT NULL DEFAULT '',
  stamp_file_path TEXT NOT NULL DEFAULT '',
  stamp_file_name TEXT NOT NULL DEFAULT '',
  stamp_mime_type TEXT NOT NULL DEFAULT '',
  signature_file_path TEXT NOT NULL DEFAULT '',
  signature_file_name TEXT NOT NULL DEFAULT '',
  signature_mime_type TEXT NOT NULL DEFAULT '',
  storage_bucket TEXT NOT NULL DEFAULT 'company-assets',
  stamp_position JSONB NOT NULL DEFAULT '{"preset":"bottom-left","xMm":22,"yMm":238}'::jsonb,
  stamp_size JSONB NOT NULL DEFAULT '{"widthMm":30,"heightMm":30}'::jsonb,
  signature_position JSONB NOT NULL DEFAULT '{"preset":"bottom-right","xMm":140,"yMm":244}'::jsonb,
  signature_size JSONB NOT NULL DEFAULT '{"widthMm":48,"heightMm":20}'::jsonb,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE web_platform.document_settings ENABLE ROW LEVEL SECURITY;

-- Extend payment_receipts for PDF cloud storage tracking
ALTER TABLE web_platform.payment_receipts ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES web_platform.projects(id) ON DELETE SET NULL;
ALTER TABLE web_platform.payment_receipts ADD COLUMN IF NOT EXISTS installment_id INTEGER;
ALTER TABLE web_platform.payment_receipts ADD COLUMN IF NOT EXISTS storage_bucket TEXT NOT NULL DEFAULT 'payment-receipts';
ALTER TABLE web_platform.payment_receipts ADD COLUMN IF NOT EXISTS pdf_storage_path TEXT NOT NULL DEFAULT '';
ALTER TABLE web_platform.payment_receipts ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ;

