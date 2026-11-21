-- ============================================================================
-- NEXUSTEKFUSION PRIVATE LIMITED — COMPLETE DATABASE SETUP SQL (PostgreSQL / Supabase)
-- Safe & Idempotent (re-runnable in Supabase SQL Editor)
-- Creates all 75 tables & foreign keys in the "web_platform" schema
-- (keeping "public.users", "public.orders", etc. untouched for KRASHIVANTRI mobile)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS "web_platform";

CREATE TABLE IF NOT EXISTS "web_platform"."admin_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" integer NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_sessions_token_hash_unique" UNIQUE("token_hash")
);

CREATE TABLE IF NOT EXISTS "web_platform"."audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_uid" text NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text DEFAULT '' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."b2b_enquiries" (
	"id" serial PRIMARY KEY NOT NULL,
	"enquiry_number" text NOT NULL,
	"user_id" integer,
	"company_name" text NOT NULL,
	"contact_person" text NOT NULL,
	"email" text NOT NULL,
	"mobile" text NOT NULL,
	"gstin" text DEFAULT '' NOT NULL,
	"requirement_category" text NOT NULL,
	"quantity" integer DEFAULT 10 NOT NULL,
	"technical_specs" text NOT NULL,
	"expected_delivery_date" text DEFAULT '' NOT NULL,
	"shipping_location" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quoted_amount_inr" integer,
	"volume_discount_percent" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'Submitted' NOT NULL,
	"razorpay_order_id" text DEFAULT '' NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"admin_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "b2b_enquiries_enquiry_number_unique" UNIQUE("enquiry_number")
);

CREATE TABLE IF NOT EXISTS "web_platform"."blogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"category" text DEFAULT 'Engineering' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"excerpt" text NOT NULL,
	"content" text NOT NULL,
	"cover_image_url" text DEFAULT '' NOT NULL,
	"seo_title" text DEFAULT '' NOT NULL,
	"seo_description" text DEFAULT '' NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"published_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blogs_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "web_platform"."booking_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"pilot_id" integer NOT NULL,
	"assigned_by" text NOT NULL,
	"assignment_status" text DEFAULT 'Offered' NOT NULL,
	"rejection_reason" text DEFAULT '' NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"responded_at" timestamp
);

CREATE TABLE IF NOT EXISTS "web_platform"."booking_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"status" text NOT NULL,
	"actor_email" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "brands_name_unique" UNIQUE("name"),
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "web_platform"."case_studies" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"technology_used" text NOT NULL,
	"applications" text NOT NULL,
	"outcomes" text NOT NULL,
	"related_services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"video_url" text DEFAULT '' NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "case_studies_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "web_platform"."cms_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"seo_title" text DEFAULT '' NOT NULL,
	"seo_description" text DEFAULT '' NOT NULL,
	"draft_content" jsonb NOT NULL,
	"published_content" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cms_pages_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "web_platform"."cms_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_key" text NOT NULL,
	"label" text DEFAULT 'Snapshot' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"discount_type" text DEFAULT 'percent' NOT NULL,
	"discount_value" integer NOT NULL,
	"min_order_inr" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);

CREATE TABLE IF NOT EXISTS "web_platform"."crm_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"company_or_college" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'website' NOT NULL,
	"stage" text DEFAULT 'New Lead' NOT NULL,
	"assigned_to" text DEFAULT '' NOT NULL,
	"estimated_value_inr" integer DEFAULT 0 NOT NULL,
	"next_follow_up_date" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."crm_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"author_email" text NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."customer_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"label" text DEFAULT 'Primary' NOT NULL,
	"address_type" text DEFAULT 'both' NOT NULL,
	"full_name" text NOT NULL,
	"mobile" text NOT NULL,
	"house_flat" text NOT NULL,
	"street_area" text NOT NULL,
	"landmark" text DEFAULT '' NOT NULL,
	"city" text NOT NULL,
	"district" text NOT NULL,
	"state" text NOT NULL,
	"pin_code" text NOT NULL,
	"country" text DEFAULT 'India' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."customer_carts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_carts_user_id_unique" UNIQUE("user_id")
);

CREATE TABLE IF NOT EXISTS "web_platform"."drone_pilots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"pilot_code" text NOT NULL,
	"full_name" text NOT NULL,
	"mobile" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"district" text NOT NULL,
	"state" text DEFAULT 'Maharashtra' NOT NULL,
	"pin_code" text DEFAULT '' NOT NULL,
	"rpc_number" text DEFAULT '' NOT NULL,
	"rpc_valid_until" text DEFAULT '' NOT NULL,
	"kyc_status" text DEFAULT 'Pending Review' NOT NULL,
	"account_status" text DEFAULT 'active' NOT NULL,
	"service_radius_km" integer DEFAULT 35 NOT NULL,
	"total_sprayed_acres" double precision DEFAULT 0 NOT NULL,
	"rating_avg" double precision DEFAULT 0 NOT NULL,
	"penalty_points" integer DEFAULT 0 NOT NULL,
	"verified_by" text DEFAULT '' NOT NULL,
	"verified_at" text DEFAULT '' NOT NULL,
	"rejection_reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "drone_pilots_pilot_code_unique" UNIQUE("pilot_code")
);

CREATE TABLE IF NOT EXISTS "web_platform"."drone_repair_bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference_number" text NOT NULL,
	"user_id" integer,
	"service_mode" text NOT NULL,
	"customer_name" text NOT NULL,
	"mobile" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"district" text DEFAULT '' NOT NULL,
	"pin_code" text DEFAULT '' NOT NULL,
	"drone_brand_model" text NOT NULL,
	"drone_type" text DEFAULT 'Agriculture' NOT NULL,
	"problem_description" text NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"video_file" jsonb DEFAULT 'null'::jsonb,
	"preferred_date" text NOT NULL,
	"preferred_time" text NOT NULL,
	"additional_info" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Booking received' NOT NULL,
	"assigned_engineer" text DEFAULT '' NOT NULL,
	"inspection_charge_inr" integer,
	"inspection_charge_confirmed" boolean DEFAULT false NOT NULL,
	"inspection_payment_status" text DEFAULT 'unpaid' NOT NULL,
	"repair_quotation_inr" integer,
	"repair_quotation_notes" text DEFAULT '' NOT NULL,
	"repair_approved" boolean DEFAULT false NOT NULL,
	"repair_payment_status" text DEFAULT 'unpaid' NOT NULL,
	"razorpay_order_id" text DEFAULT '' NOT NULL,
	"razorpay_payment_id" text DEFAULT '' NOT NULL,
	"admin_notes" text DEFAULT '' NOT NULL,
	"status_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "drone_repair_bookings_reference_number_unique" UNIQUE("reference_number")
);

CREATE TABLE IF NOT EXISTS "web_platform"."farmer_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"farmer_id" integer NOT NULL,
	"doc_type" text NOT NULL,
	"doc_number_masked" text DEFAULT '' NOT NULL,
	"file_name" text NOT NULL,
	"storage_path" text NOT NULL,
	"verification_status" text DEFAULT 'Pending' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."farmer_farms" (
	"id" serial PRIMARY KEY NOT NULL,
	"farmer_id" integer NOT NULL,
	"farm_name" text NOT NULL,
	"crop_type" text DEFAULT '' NOT NULL,
	"area_acres" double precision DEFAULT 1 NOT NULL,
	"village" text DEFAULT '' NOT NULL,
	"district" text DEFAULT '' NOT NULL,
	"state" text DEFAULT 'Maharashtra' NOT NULL,
	"pin_code" text DEFAULT '' NOT NULL,
	"center_lat" double precision NOT NULL,
	"center_lng" double precision NOT NULL,
	"boundary_geo_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."farmer_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_ref" text NOT NULL,
	"booking_id" integer NOT NULL,
	"farmer_id" integer NOT NULL,
	"user_id" integer,
	"amount_inr" integer NOT NULL,
	"amount_paise" integer DEFAULT 0 NOT NULL,
	"razorpay_order_id" text DEFAULT '' NOT NULL,
	"razorpay_payment_id" text DEFAULT '' NOT NULL,
	"razorpay_signature" text DEFAULT '' NOT NULL,
	"mode" text DEFAULT 'test_mode' NOT NULL,
	"status" text DEFAULT 'verified' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "farmer_payments_payment_ref_unique" UNIQUE("payment_ref")
);

CREATE TABLE IF NOT EXISTS "web_platform"."farmer_refunds" (
	"id" serial PRIMARY KEY NOT NULL,
	"refund_ref" text NOT NULL,
	"booking_id" integer NOT NULL,
	"farmer_payment_id" integer,
	"amount_inr" integer NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"processed_by" text DEFAULT '' NOT NULL,
	"provider_refund_id" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "farmer_refunds_refund_ref_unique" UNIQUE("refund_ref")
);

CREATE TABLE IF NOT EXISTS "web_platform"."farmer_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"farmer_id" integer NOT NULL,
	"action" text NOT NULL,
	"previous_status" text NOT NULL,
	"new_status" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"reviewed_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."farmers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"farmer_code" text NOT NULL,
	"full_name" text NOT NULL,
	"mobile" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"village" text DEFAULT '' NOT NULL,
	"taluka" text DEFAULT '' NOT NULL,
	"district" text NOT NULL,
	"state" text DEFAULT 'Maharashtra' NOT NULL,
	"pin_code" text DEFAULT '' NOT NULL,
	"aadhaar_last4" text DEFAULT '' NOT NULL,
	"kyc_status" text DEFAULT 'Pending Review' NOT NULL,
	"account_status" text DEFAULT 'active' NOT NULL,
	"total_land_acres" double precision DEFAULT 0 NOT NULL,
	"crops_grown" text DEFAULT '' NOT NULL,
	"admin_notes" text DEFAULT '' NOT NULL,
	"verified_by" text DEFAULT '' NOT NULL,
	"verified_at" text DEFAULT '' NOT NULL,
	"rejection_reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "farmers_farmer_code_unique" UNIQUE("farmer_code")
);

CREATE TABLE IF NOT EXISTS "web_platform"."inventory_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"delta_qty" integer NOT NULL,
	"previous_qty" integer NOT NULL,
	"new_qty" integer NOT NULL,
	"reason" text DEFAULT 'Manual Adjustment' NOT NULL,
	"actor_email" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_number" text NOT NULL,
	"user_id" integer,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"doc_type" text DEFAULT 'Proforma Invoice' NOT NULL,
	"amount_inr" integer NOT NULL,
	"gst_inr" integer DEFAULT 0 NOT NULL,
	"payload" jsonb NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);

CREATE TABLE IF NOT EXISTS "web_platform"."media_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'Company Branding' NOT NULL,
	"thumbnail_url" text DEFAULT '' NOT NULL,
	"media_kind" text DEFAULT 'image' NOT NULL,
	"url" text NOT NULL,
	"mime_type" text DEFAULT 'image/jpeg' NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"alt_text" text DEFAULT '' NOT NULL,
	"folder" text DEFAULT 'general' NOT NULL,
	"uploaded_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."newsletter_subscribers" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"source" text DEFAULT 'footer' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_subscribers_email_unique" UNIQUE("email")
);

CREATE TABLE IF NOT EXISTS "web_platform"."notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"link" text DEFAULT '/my-account' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."operation_evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"booking_id" integer NOT NULL,
	"pilot_id" integer NOT NULL,
	"evidence_phase" text DEFAULT 'pre_spray' NOT NULL,
	"media_type" text DEFAULT 'image' NOT NULL,
	"file_name" text NOT NULL,
	"storage_path" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"caption" text DEFAULT '' NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."operation_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_code" text NOT NULL,
	"booking_id" integer NOT NULL,
	"pilot_id" integer NOT NULL,
	"farmer_id" integer NOT NULL,
	"farm_id" integer,
	"status" text DEFAULT 'Ready' NOT NULL,
	"started_at" timestamp,
	"paused_at" timestamp,
	"resumed_at" timestamp,
	"completed_at" timestamp,
	"inside_geofence_on_start" boolean DEFAULT false NOT NULL,
	"geofence_distance_meters" double precision DEFAULT 0 NOT NULL,
	"completed_area_acres" double precision DEFAULT 0 NOT NULL,
	"pause_reason" text DEFAULT '' NOT NULL,
	"pilot_notes" text DEFAULT '' NOT NULL,
	"farmer_confirmed" boolean DEFAULT false NOT NULL,
	"farmer_dispute_reason" text DEFAULT '' NOT NULL,
	"farmer_confirmed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "operation_sessions_session_code_unique" UNIQUE("session_code")
);

CREATE TABLE IF NOT EXISTS "web_platform"."operation_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"verification_status" text DEFAULT 'Pending' NOT NULL,
	"verified_area_acres" double precision DEFAULT 0 NOT NULL,
	"dispute_notes" text DEFAULT '' NOT NULL,
	"verified_by" text DEFAULT '' NOT NULL,
	"verified_at" timestamp
);

CREATE TABLE IF NOT EXISTS "web_platform"."payment_clearance_certificates" (
	"id" serial PRIMARY KEY NOT NULL,
	"certificate_number" text NOT NULL,
	"project_id" integer NOT NULL,
	"enquiry_id" integer NOT NULL,
	"quotation_id" integer,
	"user_id" integer NOT NULL,
	"total_amount_inr" integer NOT NULL,
	"advance_paid_inr" integer NOT NULL,
	"final_paid_inr" integer NOT NULL,
	"balance_inr" integer DEFAULT 0 NOT NULL,
	"payment_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"issued_by" text DEFAULT 'NexusTekFusion Accounts' NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_clearance_certificates_certificate_number_unique" UNIQUE("certificate_number")
);

CREATE TABLE IF NOT EXISTS "web_platform"."payment_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"receipt_number" text NOT NULL,
	"payment_ref" text NOT NULL,
	"user_id" integer,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"payment_stage" text DEFAULT '' NOT NULL,
	"amount_inr" integer NOT NULL,
	"amount_paise" integer DEFAULT 0 NOT NULL,
	"razorpay_payment_id" text DEFAULT '' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_receipts_receipt_number_unique" UNIQUE("receipt_number")
);

CREATE TABLE IF NOT EXISTS "web_platform"."payment_refunds" (
	"id" serial PRIMARY KEY NOT NULL,
	"refund_ref" text NOT NULL,
	"payment_id" integer,
	"entity_type" text DEFAULT 'store_order' NOT NULL,
	"entity_id" integer DEFAULT 0 NOT NULL,
	"razorpay_payment_id" text NOT NULL,
	"razorpay_refund_id" text DEFAULT '' NOT NULL,
	"amount_inr" integer NOT NULL,
	"amount_paise" integer NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"initiated_by" text DEFAULT '' NOT NULL,
	"notes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_refunds_refund_ref_unique" UNIQUE("refund_ref")
);

CREATE TABLE IF NOT EXISTS "web_platform"."payment_webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"provider" text DEFAULT 'razorpay' NOT NULL,
	"event_type" text NOT NULL,
	"razorpay_order_id" text DEFAULT '' NOT NULL,
	"razorpay_payment_id" text DEFAULT '' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processing_status" text DEFAULT 'processed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_webhook_events_event_id_unique" UNIQUE("event_id")
);

CREATE TABLE IF NOT EXISTS "web_platform"."payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_ref" text NOT NULL,
	"user_id" integer,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"payment_stage" text DEFAULT '' NOT NULL,
	"razorpay_order_id" text DEFAULT '' NOT NULL,
	"razorpay_payment_id" text DEFAULT '' NOT NULL,
	"razorpay_signature" text DEFAULT '' NOT NULL,
	"amount_inr" integer NOT NULL,
	"amount_paise" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"mode" text DEFAULT 'test_mode' NOT NULL,
	"status" text DEFAULT 'verified' NOT NULL,
	"error_code" text DEFAULT '' NOT NULL,
	"failure_reason" text DEFAULT '' NOT NULL,
	"refund_status" text DEFAULT 'none' NOT NULL,
	"refunded_amount_inr" integer DEFAULT 0 NOT NULL,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payments_payment_ref_unique" UNIQUE("payment_ref")
);

CREATE TABLE IF NOT EXISTS "web_platform"."pcb_enquiries" (
	"id" serial PRIMARY KEY NOT NULL,
	"enquiry_number" text NOT NULL,
	"user_id" integer,
	"customer_name" text NOT NULL,
	"email" text NOT NULL,
	"mobile" text NOT NULL,
	"board_dimensions_mm" text NOT NULL,
	"board_length_mm" double precision DEFAULT 0 NOT NULL,
	"board_width_mm" double precision DEFAULT 0 NOT NULL,
	"layer_count" integer DEFAULT 2 NOT NULL,
	"board_quantity" integer DEFAULT 5 NOT NULL,
	"copper_thickness" text DEFAULT '1 oz (35 µm)' NOT NULL,
	"pcb_thickness" text DEFAULT '1.6 mm' NOT NULL,
	"solder_mask_color" text DEFAULT 'Green' NOT NULL,
	"assembly_required" boolean DEFAULT false NOT NULL,
	"surface_finish" text DEFAULT 'HASL Lead-Free' NOT NULL,
	"delivery_location" text DEFAULT '' NOT NULL,
	"required_delivery_date" text DEFAULT '' NOT NULL,
	"special_instructions" text DEFAULT '' NOT NULL,
	"gerber_analysis_status" text DEFAULT 'analyzed' NOT NULL,
	"gerber_notes" text DEFAULT '' NOT NULL,
	"pricing_breakdown" jsonb DEFAULT 'null'::jsonb,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quoted_amount_inr" integer,
	"file_approval_status" text DEFAULT 'Pending Review' NOT NULL,
	"rejection_reason" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Order received' NOT NULL,
	"razorpay_order_id" text DEFAULT '' NOT NULL,
	"razorpay_payment_id" text DEFAULT '' NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"tracking_courier" text DEFAULT '' NOT NULL,
	"tracking_id" text DEFAULT '' NOT NULL,
	"admin_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pcb_enquiries_enquiry_number_unique" UNIQUE("enquiry_number")
);

CREATE TABLE IF NOT EXISTS "web_platform"."penalties" (
	"id" serial PRIMARY KEY NOT NULL,
	"penalty_number" text NOT NULL,
	"target_type" text DEFAULT 'pilot' NOT NULL,
	"target_id" integer NOT NULL,
	"booking_id" integer,
	"reason_category" text NOT NULL,
	"description" text NOT NULL,
	"evidence_summary" text DEFAULT '' NOT NULL,
	"amount_inr" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"appeal_status" text DEFAULT 'None' NOT NULL,
	"imposed_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "penalties_penalty_number_unique" UNIQUE("penalty_number")
);

CREATE TABLE IF NOT EXISTS "web_platform"."penalty_appeals" (
	"id" serial PRIMARY KEY NOT NULL,
	"penalty_id" integer NOT NULL,
	"appellant_user_id" integer,
	"explanation" text NOT NULL,
	"attachment_path" text DEFAULT '' NOT NULL,
	"decision" text DEFAULT 'Pending' NOT NULL,
	"decision_notes" text DEFAULT '' NOT NULL,
	"reviewed_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);

CREATE TABLE IF NOT EXISTS "web_platform"."pilot_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"pilot_id" integer NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"gps_permission_granted" boolean DEFAULT false NOT NULL,
	"current_lat" double precision,
	"current_lng" double precision,
	"accuracy_meters" double precision,
	"speed_mps" double precision,
	"heading_deg" double precision,
	"battery_percent" integer,
	"last_location_at" timestamp,
	"status" text DEFAULT 'offline' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pilot_availability_pilot_id_unique" UNIQUE("pilot_id")
);

CREATE TABLE IF NOT EXISTS "web_platform"."pilot_bank_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"pilot_id" integer NOT NULL,
	"account_holder_name" text NOT NULL,
	"bank_name" text NOT NULL,
	"account_number_masked" text NOT NULL,
	"account_number_enc" text DEFAULT '' NOT NULL,
	"ifsc_code" text NOT NULL,
	"upi_id" text DEFAULT '' NOT NULL,
	"verification_status" text DEFAULT 'Pending' NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."pilot_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"pilot_id" integer NOT NULL,
	"doc_type" text NOT NULL,
	"doc_number_masked" text DEFAULT '' NOT NULL,
	"file_name" text NOT NULL,
	"storage_path" text NOT NULL,
	"verification_status" text DEFAULT 'Pending' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."pilot_drones" (
	"id" serial PRIMARY KEY NOT NULL,
	"pilot_id" integer NOT NULL,
	"drone_model" text NOT NULL,
	"uin_number" text NOT NULL,
	"tank_capacity_liters" double precision DEFAULT 10 NOT NULL,
	"spray_width_meters" double precision DEFAULT 4 NOT NULL,
	"verification_status" text DEFAULT 'Pending' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."pilot_earning_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"ledger_ref" text NOT NULL,
	"pilot_id" integer NOT NULL,
	"booking_id" integer,
	"entry_type" text DEFAULT 'spraying_earning' NOT NULL,
	"gross_amount_inr" integer DEFAULT 0 NOT NULL,
	"commission_inr" integer DEFAULT 0 NOT NULL,
	"penalty_deduction_inr" integer DEFAULT 0 NOT NULL,
	"net_amount_inr" integer NOT NULL,
	"status" text DEFAULT 'accrued' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pilot_earning_ledger_ledger_ref_unique" UNIQUE("ledger_ref")
);

CREATE TABLE IF NOT EXISTS "web_platform"."pilot_location_updates" (
	"id" serial PRIMARY KEY NOT NULL,
	"pilot_id" integer NOT NULL,
	"booking_id" integer,
	"session_id" integer,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"accuracy_meters" double precision,
	"speed_mps" double precision,
	"heading_deg" double precision,
	"source" text DEFAULT 'device_gps' NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."pilot_payouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"payout_ref" text NOT NULL,
	"pilot_id" integer NOT NULL,
	"amount_inr" integer NOT NULL,
	"amount_paise" integer DEFAULT 0 NOT NULL,
	"bank_account_masked" text DEFAULT '' NOT NULL,
	"payout_provider" text DEFAULT 'manual_bank_reference' NOT NULL,
	"provider_payout_id" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Pending Approval' NOT NULL,
	"failure_reason" text DEFAULT '' NOT NULL,
	"approved_by" text DEFAULT '' NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pilot_payouts_payout_ref_unique" UNIQUE("payout_ref")
);

CREATE TABLE IF NOT EXISTS "web_platform"."pilot_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"pilot_id" integer NOT NULL,
	"action" text NOT NULL,
	"previous_status" text NOT NULL,
	"new_status" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"reviewed_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."printing_file_download_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"printing_order_id" integer NOT NULL,
	"order_number" text DEFAULT '' NOT NULL,
	"user_id" integer,
	"actor_email" text NOT NULL,
	"actor_role" text DEFAULT 'customer' NOT NULL,
	"file_kind" text DEFAULT 'original' NOT NULL,
	"file_name" text DEFAULT '' NOT NULL,
	"access_granted" boolean DEFAULT false NOT NULL,
	"denial_reason" text DEFAULT '' NOT NULL,
	"ip_address" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."printing_machines" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"technology" text DEFAULT 'FDM' NOT NULL,
	"build_volume_x" integer DEFAULT 256 NOT NULL,
	"build_volume_y" integer DEFAULT 256 NOT NULL,
	"build_volume_z" integer DEFAULT 256 NOT NULL,
	"hourly_rate_inr" integer DEFAULT 120 NOT NULL,
	"min_order_inr" integer DEFAULT 250 NOT NULL,
	"wastage_percent" integer DEFAULT 8 NOT NULL,
	"labour_fee_inr" integer DEFAULT 60 NOT NULL,
	"finishing_fee_inr" integer DEFAULT 120 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."printing_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"technology" text DEFAULT 'FDM' NOT NULL,
	"density_gcm3" double precision DEFAULT 1.24 NOT NULL,
	"rate_per_gram_inr" double precision DEFAULT 6 NOT NULL,
	"available_colors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"layer_heights_mm" jsonb DEFAULT '[0.1,0.15,0.2,0.3]'::jsonb NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."printing_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"user_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_format" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"file_storage_path" text NOT NULL,
	"file_version" text DEFAULT 'v1' NOT NULL,
	"storage_bucket" text DEFAULT '' NOT NULL,
	"bounding_box_mm" jsonb NOT NULL,
	"volume_cm3" double precision DEFAULT 0 NOT NULL,
	"estimated_weight_g" double precision DEFAULT 0 NOT NULL,
	"estimated_print_minutes" integer DEFAULT 0 NOT NULL,
	"technology" text NOT NULL,
	"printer_name" text DEFAULT '' NOT NULL,
	"material_name" text NOT NULL,
	"color_name" text NOT NULL,
	"layer_height_mm" double precision NOT NULL,
	"infill_percent" integer NOT NULL,
	"wall_count" integer DEFAULT 3 NOT NULL,
	"print_speed_mm_s" integer DEFAULT 60 NOT NULL,
	"nozzle_diameter_mm" double precision DEFAULT 0.4 NOT NULL,
	"build_orientation" text DEFAULT 'Auto Optimal' NOT NULL,
	"scale_percent" integer DEFAULT 100 NOT NULL,
	"support_enabled" boolean DEFAULT true NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"finishing_option" text DEFAULT 'Standard As-Printed' NOT NULL,
	"special_instructions" text DEFAULT '' NOT NULL,
	"customer_parameters" jsonb DEFAULT 'null'::jsonb,
	"confirmed_parameters" jsonb DEFAULT 'null'::jsonb,
	"pricing_breakdown" jsonb NOT NULL,
	"total_inr" integer NOT NULL,
	"delivery_address" jsonb NOT NULL,
	"slicing_status" text DEFAULT 'Slicing Completed' NOT NULL,
	"order_status" text DEFAULT 'New Order' NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"refund_status" text DEFAULT 'none' NOT NULL,
	"payment_verified_at" timestamp,
	"customer_download_enabled" boolean DEFAULT true NOT NULL,
	"razorpay_order_id" text DEFAULT '' NOT NULL,
	"razorpay_payment_id" text DEFAULT '' NOT NULL,
	"tracking_courier" text DEFAULT '' NOT NULL,
	"tracking_id" text DEFAULT '' NOT NULL,
	"tracking_url" text DEFAULT '' NOT NULL,
	"production_notes" text DEFAULT '' NOT NULL,
	"production_photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "printing_orders_order_number_unique" UNIQUE("order_number")
);

CREATE TABLE IF NOT EXISTS "web_platform"."3d_printing_production_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"printing_order_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_format" text NOT NULL,
	"file_size_bytes" integer DEFAULT 0 NOT NULL,
	"file_storage_path" text NOT NULL,
	"storage_bucket" text DEFAULT '' NOT NULL,
	"file_kind" text DEFAULT 'sliced_gcode' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"uploaded_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."product_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"store_scope" text DEFAULT 'general' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_categories_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "web_platform"."product_enquiries" (
	"id" serial PRIMARY KEY NOT NULL,
	"enquiry_number" text NOT NULL,
	"user_id" integer,
	"full_name" text NOT NULL,
	"mobile" text NOT NULL,
	"email" text NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"district" text DEFAULT '' NOT NULL,
	"organization_or_farm_name" text DEFAULT '' NOT NULL,
	"interested_product" text NOT NULL,
	"product_slug" text DEFAULT '' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"intended_application" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'New' NOT NULL,
	"assigned_staff" text DEFAULT '' NOT NULL,
	"internal_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_enquiries_enquiry_number_unique" UNIQUE("enquiry_number")
);

CREATE TABLE IF NOT EXISTS "web_platform"."product_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"author_name" text NOT NULL,
	"rating" integer NOT NULL,
	"comment" text NOT NULL,
	"verified_purchase" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."products" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"brand" text DEFAULT 'NexusTekFusion' NOT NULL,
	"product_type" text DEFAULT 'simple' NOT NULL,
	"model_number" text DEFAULT '' NOT NULL,
	"subcategory" text DEFAULT '' NOT NULL,
	"short_description" text DEFAULT '' NOT NULL,
	"store_scope" text DEFAULT 'general' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"technical_specs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"price_inr" integer NOT NULL,
	"discount_price_inr" integer,
	"gst_percent" integer DEFAULT 18 NOT NULL,
	"stock_qty" integer DEFAULT 0 NOT NULL,
	"dimensions" text DEFAULT '' NOT NULL,
	"weight_grams" integer DEFAULT 0 NOT NULL,
	"shipping_weight_grams" integer DEFAULT 0 NOT NULL,
	"delivery_info" text DEFAULT '' NOT NULL,
	"material" text DEFAULT '' NOT NULL,
	"available_colors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"available_variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"production_time_days" integer DEFAULT 2 NOT NULL,
	"warranty_info" text DEFAULT '' NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"gallery_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"datasheet_url" text DEFAULT '' NOT NULL,
	"brochure_url" text DEFAULT '' NOT NULL,
	"model_3d_url" text DEFAULT '' NOT NULL,
	"seo_title" text DEFAULT '' NOT NULL,
	"seo_description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"published_at" timestamp,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"compatibility" text DEFAULT '' NOT NULL,
	"package_contents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"applications" text DEFAULT '' NOT NULL,
	"product_faqs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"related_product_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bought_together_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"video_url" text DEFAULT '' NOT NULL,
	"low_stock_threshold" integer DEFAULT 5 NOT NULL,
	"is_bestseller" boolean DEFAULT false NOT NULL,
	"is_new_arrival" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"hsn_code" text DEFAULT '8807' NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku"),
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "web_platform"."project_acceptances" (
	"id" serial PRIMARY KEY NOT NULL,
	"enquiry_id" integer NOT NULL,
	"quotation_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"accepted_by_email" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"accepted_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."project_delivery_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"courier_name" text DEFAULT '' NOT NULL,
	"tracking_number" text DEFAULT '' NOT NULL,
	"tracking_url" text DEFAULT '' NOT NULL,
	"dispatch_date" text DEFAULT '' NOT NULL,
	"expected_delivery_date" text DEFAULT '' NOT NULL,
	"actual_delivery_date" text DEFAULT '' NOT NULL,
	"dispatch_notes" text DEFAULT '' NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."project_email_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"project_id" integer,
	"enquiry_id" integer,
	"recipient_email" text NOT NULL,
	"event_type" text NOT NULL,
	"subject" text NOT NULL,
	"body_preview" text DEFAULT '' NOT NULL,
	"provider" text DEFAULT 'none' NOT NULL,
	"delivery_status" text DEFAULT 'not_configured' NOT NULL,
	"provider_message_id" text DEFAULT '' NOT NULL,
	"error_message" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."project_enquiries" (
	"id" serial PRIMARY KEY NOT NULL,
	"enquiry_number" text NOT NULL,
	"user_id" integer NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"customer_phone" text NOT NULL,
	"whatsapp_number" text DEFAULT '' NOT NULL,
	"company_or_college" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"customer_category" text DEFAULT 'Student' NOT NULL,
	"project_title" text NOT NULL,
	"engineering_branch" text NOT NULL,
	"engineering_domain" text DEFAULT '' NOT NULL,
	"academic_level" text DEFAULT 'Industrial / Commercial' NOT NULL,
	"project_category" text NOT NULL,
	"project_type" text NOT NULL,
	"project_description" text NOT NULL,
	"problem_statement" text DEFAULT '' NOT NULL,
	"objective" text DEFAULT '' NOT NULL,
	"expected_working" text DEFAULT '' NOT NULL,
	"required_features" text DEFAULT '' NOT NULL,
	"expected_functionality" text DEFAULT '' NOT NULL,
	"required_technologies" text DEFAULT '' NOT NULL,
	"hardware_requirements" text DEFAULT '' NOT NULL,
	"software_requirements" text DEFAULT '' NOT NULL,
	"components_required" text DEFAULT '' NOT NULL,
	"expected_output" text DEFAULT '' NOT NULL,
	"expected_deliverables" text DEFAULT '' NOT NULL,
	"target_completion_date" text DEFAULT '' NOT NULL,
	"estimated_budget" text DEFAULT '' NOT NULL,
	"complexity_level" text DEFAULT 'Intermediate' NOT NULL,
	"prototype_requirements" text DEFAULT '' NOT NULL,
	"preferred_communication_method" text DEFAULT 'WhatsApp & Dashboard' NOT NULL,
	"requires_physical_prototype" boolean DEFAULT true NOT NULL,
	"requires_web_or_mobile_app" boolean DEFAULT false NOT NULL,
	"requires_documentation" boolean DEFAULT true NOT NULL,
	"accepted_terms" boolean DEFAULT true NOT NULL,
	"accepted_privacy_policy" boolean DEFAULT true NOT NULL,
	"special_requirements" text DEFAULT '' NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"billing_address" jsonb NOT NULL,
	"delivery_address" jsonb NOT NULL,
	"address_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'Submitted – Under Review' NOT NULL,
	"assigned_engineer" text DEFAULT '' NOT NULL,
	"internal_notes" text DEFAULT '' NOT NULL,
	"rejection_reason" text DEFAULT '' NOT NULL,
	"clarification_notes" text DEFAULT '' NOT NULL,
	"course_department" text DEFAULT '' NOT NULL,
	"team_type" text DEFAULT 'Individual' NOT NULL,
	"team_count" integer DEFAULT 1 NOT NULL,
	"budget_min_inr" integer,
	"budget_max_inr" integer,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_enquiries_enquiry_number_unique" UNIQUE("enquiry_number")
);

CREATE TABLE IF NOT EXISTS "web_platform"."project_handover_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'source_code' NOT NULL,
	"file_name" text NOT NULL,
	"storage_path" text NOT NULL,
	"file_size_bytes" integer DEFAULT 0 NOT NULL,
	"version_label" text DEFAULT 'v1.0' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"download_token" text NOT NULL,
	"token_expires_at" timestamp NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"last_downloaded_at" timestamp,
	"uploaded_by" text DEFAULT '' NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_handover_documents_download_token_unique" UNIQUE("download_token")
);

CREATE TABLE IF NOT EXISTS "web_platform"."project_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"enquiry_id" integer NOT NULL,
	"project_id" integer,
	"user_id" integer NOT NULL,
	"sender_email" text NOT NULL,
	"sender_name" text NOT NULL,
	"sender_role" text DEFAULT 'customer' NOT NULL,
	"message" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."project_payment_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer,
	"project_id" integer,
	"quotation_id" integer NOT NULL,
	"stage_name" text NOT NULL,
	"stage_order" integer DEFAULT 1 NOT NULL,
	"percent" integer DEFAULT 50 NOT NULL,
	"amount_inr" integer NOT NULL,
	"amount_paise" integer DEFAULT 0 NOT NULL,
	"due_trigger" text DEFAULT 'on_acceptance' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_ref" text DEFAULT '' NOT NULL,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."project_payment_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer,
	"enquiry_id" integer NOT NULL,
	"quotation_id" integer NOT NULL,
	"plan_type" text DEFAULT '50_50_split' NOT NULL,
	"advance_percent" integer DEFAULT 50 NOT NULL,
	"final_percent" integer DEFAULT 50 NOT NULL,
	"allow_full_payment" boolean DEFAULT true NOT NULL,
	"is_override" boolean DEFAULT false NOT NULL,
	"override_reason" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."project_quotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"enquiry_id" integer NOT NULL,
	"quotation_number" text DEFAULT '' NOT NULL,
	"revision_number" integer DEFAULT 1 NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hardware_cost_inr" integer DEFAULT 0 NOT NULL,
	"software_cost_inr" integer DEFAULT 0 NOT NULL,
	"design_dev_charges_inr" integer DEFAULT 0 NOT NULL,
	"testing_charges_inr" integer DEFAULT 0 NOT NULL,
	"documentation_charges_inr" integer DEFAULT 0 NOT NULL,
	"delivery_charges_inr" integer DEFAULT 0 NOT NULL,
	"discount_inr" integer DEFAULT 0 NOT NULL,
	"gst_inr" integer DEFAULT 0 NOT NULL,
	"total_amount_inr" integer NOT NULL,
	"total_amount_paise" integer DEFAULT 0 NOT NULL,
	"advance_percent" integer DEFAULT 50 NOT NULL,
	"advance_amount_inr" integer NOT NULL,
	"advance_amount_paise" integer DEFAULT 0 NOT NULL,
	"balance_amount_inr" integer NOT NULL,
	"balance_amount_paise" integer DEFAULT 0 NOT NULL,
	"cost_categories" jsonb DEFAULT '{"development":0,"hardware":0,"sensors":0,"pcb":0,"mechanical":0,"printing3d":0,"software":0,"aiMl":0,"iot":0,"droneRobotics":0,"testing":0,"documentation":0,"delivery":0,"other":0}'::jsonb NOT NULL,
	"technical_scope" text DEFAULT '' NOT NULL,
	"validity_days" integer DEFAULT 15 NOT NULL,
	"estimated_duration" text DEFAULT '' NOT NULL,
	"estimated_delivery_date" text DEFAULT '' NOT NULL,
	"payment_terms" text DEFAULT '50% Advance, 50% Balance before Handover' NOT NULL,
	"payment_due_date" text DEFAULT '' NOT NULL,
	"terms_and_conditions" text DEFAULT '' NOT NULL,
	"allow_full_payment" boolean DEFAULT true NOT NULL,
	"plan_override_reason" text DEFAULT '' NOT NULL,
	"plan_override_by" text DEFAULT '' NOT NULL,
	"paid_amount_inr" integer DEFAULT 0 NOT NULL,
	"paid_amount_paise" integer DEFAULT 0 NOT NULL,
	"approved_by_admin" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"status" text DEFAULT 'Draft' NOT NULL,
	"customer_feedback" text DEFAULT '' NOT NULL,
	"razorpay_order_id" text DEFAULT '' NOT NULL,
	"razorpay_payment_id" text DEFAULT '' NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "web_platform"."project_work_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_order_number" text NOT NULL,
	"project_id" integer NOT NULL,
	"enquiry_id" integer NOT NULL,
	"quotation_id" integer,
	"user_id" integer NOT NULL,
	"assigned_engineer" text DEFAULT '' NOT NULL,
	"estimated_completion_date" text DEFAULT '' NOT NULL,
	"scope_summary" text DEFAULT '' NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_work_orders_work_order_number_unique" UNIQUE("work_order_number")
);

CREATE TABLE IF NOT EXISTS "web_platform"."projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_code" text NOT NULL,
	"enquiry_id" integer NOT NULL,
	"quotation_id" integer,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"assigned_engineer" text DEFAULT 'Engineering Team' NOT NULL,
	"status" text DEFAULT 'Advance Payment Received' NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"start_date" text DEFAULT '' NOT NULL,
	"estimated_completion_date" text DEFAULT '' NOT NULL,
	"total_amount_inr" integer DEFAULT 0 NOT NULL,
	"paid_amount_inr" integer DEFAULT 0 NOT NULL,
	"balance_amount_inr" integer DEFAULT 0 NOT NULL,
	"payment_clearance_status" text DEFAULT 'Pending' NOT NULL,
	"handover_unlocked" boolean DEFAULT false NOT NULL,
	"handover_method" text DEFAULT 'digital' NOT NULL,
	"handover_exception_authorized" boolean DEFAULT false NOT NULL,
	"handover_exception_reason" text DEFAULT '' NOT NULL,
	"handover_exception_by" text DEFAULT '' NOT NULL,
	"handover_exception_at" text DEFAULT '' NOT NULL,
	"customer_acknowledged_at" text DEFAULT '' NOT NULL,
	"customer_acknowledged_by" text DEFAULT '' NOT NULL,
	"completion_certificate_number" text DEFAULT '' NOT NULL,
	"completed_at" text DEFAULT '' NOT NULL,
	"completion_proof" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"milestones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deliverables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tracking_courier" text DEFAULT '' NOT NULL,
	"tracking_id" text DEFAULT '' NOT NULL,
	"tracking_url" text DEFAULT '' NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "projects_project_code_unique" UNIQUE("project_code")
);

CREATE TABLE IF NOT EXISTS "web_platform"."service_bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_number" text NOT NULL,
	"farmer_id" integer NOT NULL,
	"farm_id" integer,
	"assigned_pilot_id" integer,
	"crop_type" text NOT NULL,
	"spray_type" text DEFAULT 'Fertilizer & Pesticide Spraying' NOT NULL,
	"chemical_provided_by" text DEFAULT 'Farmer' NOT NULL,
	"booked_area_acres" double precision NOT NULL,
	"rate_per_acre_inr" integer NOT NULL,
	"total_amount_inr" integer NOT NULL,
	"total_amount_paise" integer DEFAULT 0 NOT NULL,
	"platform_commission_percent" integer DEFAULT 15 NOT NULL,
	"pilot_payout_inr" integer DEFAULT 0 NOT NULL,
	"preferred_date" text NOT NULL,
	"preferred_slot" text DEFAULT 'Morning (6 AM - 10 AM)' NOT NULL,
	"farm_lat" double precision NOT NULL,
	"farm_lng" double precision NOT NULL,
	"farm_boundary" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"booking_status" text DEFAULT 'Booking Requested' NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"farmer_notes" text DEFAULT '' NOT NULL,
	"admin_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "service_bookings_booking_number_unique" UNIQUE("booking_number")
);

CREATE TABLE IF NOT EXISTS "web_platform"."site_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "site_settings_key_unique" UNIQUE("key")
);

CREATE TABLE IF NOT EXISTS "web_platform"."store_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"user_id" integer NOT NULL,
	"billing_address" jsonb NOT NULL,
	"shipping_address" jsonb NOT NULL,
	"items" jsonb NOT NULL,
	"subtotal_inr" integer NOT NULL,
	"discount_inr" integer DEFAULT 0 NOT NULL,
	"shipping_inr" integer DEFAULT 0 NOT NULL,
	"gst_inr" integer DEFAULT 0 NOT NULL,
	"total_inr" integer NOT NULL,
	"coupon_code" text DEFAULT '' NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"refund_status" text DEFAULT 'none' NOT NULL,
	"order_status" text DEFAULT 'Order Placed' NOT NULL,
	"status_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cancelled_reason" text DEFAULT '' NOT NULL,
	"cancelled_at" timestamp,
	"razorpay_order_id" text DEFAULT '' NOT NULL,
	"razorpay_payment_id" text DEFAULT '' NOT NULL,
	"tracking_courier" text DEFAULT '' NOT NULL,
	"tracking_id" text DEFAULT '' NOT NULL,
	"tracking_url" text DEFAULT '' NOT NULL,
	"dispatch_date" text DEFAULT '' NOT NULL,
	"expected_delivery_date" text DEFAULT '' NOT NULL,
	"internal_notes" text DEFAULT '' NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "store_orders_order_number_unique" UNIQUE("order_number")
);

CREATE TABLE IF NOT EXISTS "web_platform"."support_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_number" text NOT NULL,
	"user_id" integer,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"mobile" text DEFAULT '' NOT NULL,
	"subject" text NOT NULL,
	"service_category" text DEFAULT 'General' NOT NULL,
	"message" text NOT NULL,
	"attachment_path" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Open' NOT NULL,
	"assigned_staff" text DEFAULT '' NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_ticket_number_unique" UNIQUE("ticket_number")
);

CREATE TABLE IF NOT EXISTS "web_platform"."team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug_key" text NOT NULL,
	"full_name" text NOT NULL,
	"designation" text NOT NULL,
	"department" text DEFAULT 'Engineering & Innovation' NOT NULL,
	"professional_category" text DEFAULT 'Engineering & Innovation' NOT NULL,
	"profile_photo_url" text DEFAULT '' NOT NULL,
	"photo_alt" text DEFAULT '' NOT NULL,
	"short_biography" text DEFAULT '' NOT NULL,
	"detailed_biography" text DEFAULT '' NOT NULL,
	"qualifications" text DEFAULT '' NOT NULL,
	"experience" text DEFAULT '' NOT NULL,
	"responsibilities" text DEFAULT '' NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"linkedin_url" text DEFAULT '' NOT NULL,
	"display_order" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_slug_key_unique" UNIQUE("slug_key")
);

CREATE TABLE IF NOT EXISTS "web_platform"."users" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" text NOT NULL,
	"email" text NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"mobile" text DEFAULT '' NOT NULL,
	"company_or_college" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'customer' NOT NULL,
	"password_hash" text DEFAULT '' NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"email_confirmed_at" text DEFAULT '' NOT NULL,
	"phone_confirmed_at" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_uid_unique" UNIQUE("uid")
);

CREATE TABLE IF NOT EXISTS "web_platform"."website_banners" (
	"id" serial PRIMARY KEY NOT NULL,
	"banner_key" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"placement" text DEFAULT 'homepage_promo' NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"video_url" text DEFAULT '' NOT NULL,
	"cta_label" text DEFAULT 'Explore' NOT NULL,
	"cta_link" text DEFAULT '/krashivantri' NOT NULL,
	"sort_order" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "website_banners_banner_key_unique" UNIQUE("banner_key")
);

CREATE TABLE IF NOT EXISTS "web_platform"."wishlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "web_platform"."admin_sessions" ADD CONSTRAINT "admin_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."b2b_enquiries" ADD CONSTRAINT "b2b_enquiries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."booking_assignments" ADD CONSTRAINT "booking_assignments_booking_id_service_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "web_platform"."service_bookings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."booking_assignments" ADD CONSTRAINT "booking_assignments_pilot_id_drone_pilots_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "web_platform"."drone_pilots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."booking_status_history" ADD CONSTRAINT "booking_status_history_booking_id_service_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "web_platform"."service_bookings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."customer_addresses" ADD CONSTRAINT "customer_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."customer_carts" ADD CONSTRAINT "customer_carts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."drone_pilots" ADD CONSTRAINT "drone_pilots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."drone_repair_bookings" ADD CONSTRAINT "drone_repair_bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."farmer_documents" ADD CONSTRAINT "farmer_documents_farmer_id_farmers_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "web_platform"."farmers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."farmer_farms" ADD CONSTRAINT "farmer_farms_farmer_id_farmers_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "web_platform"."farmers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."farmer_payments" ADD CONSTRAINT "farmer_payments_booking_id_service_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "web_platform"."service_bookings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."farmer_payments" ADD CONSTRAINT "farmer_payments_farmer_id_farmers_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "web_platform"."farmers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."farmer_payments" ADD CONSTRAINT "farmer_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."farmer_refunds" ADD CONSTRAINT "farmer_refunds_booking_id_service_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "web_platform"."service_bookings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."farmer_refunds" ADD CONSTRAINT "farmer_refunds_farmer_payment_id_farmer_payments_id_fk" FOREIGN KEY ("farmer_payment_id") REFERENCES "web_platform"."farmer_payments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."farmer_verifications" ADD CONSTRAINT "farmer_verifications_farmer_id_farmers_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "web_platform"."farmers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."farmers" ADD CONSTRAINT "farmers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "web_platform"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."operation_evidence" ADD CONSTRAINT "operation_evidence_session_id_operation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "web_platform"."operation_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."operation_evidence" ADD CONSTRAINT "operation_evidence_booking_id_service_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "web_platform"."service_bookings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."operation_evidence" ADD CONSTRAINT "operation_evidence_pilot_id_drone_pilots_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "web_platform"."drone_pilots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."operation_sessions" ADD CONSTRAINT "operation_sessions_booking_id_service_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "web_platform"."service_bookings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."operation_sessions" ADD CONSTRAINT "operation_sessions_pilot_id_drone_pilots_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "web_platform"."drone_pilots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."operation_sessions" ADD CONSTRAINT "operation_sessions_farmer_id_farmers_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "web_platform"."farmers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."operation_sessions" ADD CONSTRAINT "operation_sessions_farm_id_farmer_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "web_platform"."farmer_farms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."operation_verifications" ADD CONSTRAINT "operation_verifications_booking_id_service_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "web_platform"."service_bookings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."operation_verifications" ADD CONSTRAINT "operation_verifications_session_id_operation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "web_platform"."operation_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."payment_clearance_certificates" ADD CONSTRAINT "payment_clearance_certificates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "web_platform"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."payment_clearance_certificates" ADD CONSTRAINT "payment_clearance_certificates_enquiry_id_project_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "web_platform"."project_enquiries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."payment_clearance_certificates" ADD CONSTRAINT "payment_clearance_certificates_quotation_id_project_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "web_platform"."project_quotations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."payment_clearance_certificates" ADD CONSTRAINT "payment_clearance_certificates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."payment_receipts" ADD CONSTRAINT "payment_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."payment_refunds" ADD CONSTRAINT "payment_refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "web_platform"."payments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."pcb_enquiries" ADD CONSTRAINT "pcb_enquiries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."penalties" ADD CONSTRAINT "penalties_booking_id_service_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "web_platform"."service_bookings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."penalty_appeals" ADD CONSTRAINT "penalty_appeals_penalty_id_penalties_id_fk" FOREIGN KEY ("penalty_id") REFERENCES "web_platform"."penalties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."penalty_appeals" ADD CONSTRAINT "penalty_appeals_appellant_user_id_users_id_fk" FOREIGN KEY ("appellant_user_id") REFERENCES "web_platform"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."pilot_availability" ADD CONSTRAINT "pilot_availability_pilot_id_drone_pilots_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "web_platform"."drone_pilots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."pilot_bank_accounts" ADD CONSTRAINT "pilot_bank_accounts_pilot_id_drone_pilots_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "web_platform"."drone_pilots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."pilot_documents" ADD CONSTRAINT "pilot_documents_pilot_id_drone_pilots_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "web_platform"."drone_pilots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."pilot_drones" ADD CONSTRAINT "pilot_drones_pilot_id_drone_pilots_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "web_platform"."drone_pilots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."pilot_earning_ledger" ADD CONSTRAINT "pilot_earning_ledger_pilot_id_drone_pilots_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "web_platform"."drone_pilots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."pilot_earning_ledger" ADD CONSTRAINT "pilot_earning_ledger_booking_id_service_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "web_platform"."service_bookings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."pilot_location_updates" ADD CONSTRAINT "pilot_location_updates_pilot_id_drone_pilots_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "web_platform"."drone_pilots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."pilot_payouts" ADD CONSTRAINT "pilot_payouts_pilot_id_drone_pilots_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "web_platform"."drone_pilots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."pilot_verifications" ADD CONSTRAINT "pilot_verifications_pilot_id_drone_pilots_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "web_platform"."drone_pilots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."printing_file_download_logs" ADD CONSTRAINT "printing_file_download_logs_printing_order_id_printing_orders_id_fk" FOREIGN KEY ("printing_order_id") REFERENCES "web_platform"."printing_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."printing_file_download_logs" ADD CONSTRAINT "printing_file_download_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."printing_orders" ADD CONSTRAINT "printing_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."3d_printing_production_files" ADD CONSTRAINT "3d_printing_production_files_printing_order_id_printing_orders_id_fk" FOREIGN KEY ("printing_order_id") REFERENCES "web_platform"."printing_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."product_enquiries" ADD CONSTRAINT "product_enquiries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."product_reviews" ADD CONSTRAINT "product_reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "web_platform"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."product_reviews" ADD CONSTRAINT "product_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "web_platform"."product_categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_acceptances" ADD CONSTRAINT "project_acceptances_enquiry_id_project_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "web_platform"."project_enquiries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_acceptances" ADD CONSTRAINT "project_acceptances_quotation_id_project_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "web_platform"."project_quotations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_acceptances" ADD CONSTRAINT "project_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_delivery_records" ADD CONSTRAINT "project_delivery_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "web_platform"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_email_notifications" ADD CONSTRAINT "project_email_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_email_notifications" ADD CONSTRAINT "project_email_notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "web_platform"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_email_notifications" ADD CONSTRAINT "project_email_notifications_enquiry_id_project_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "web_platform"."project_enquiries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_enquiries" ADD CONSTRAINT "project_enquiries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_handover_documents" ADD CONSTRAINT "project_handover_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "web_platform"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_handover_documents" ADD CONSTRAINT "project_handover_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_messages" ADD CONSTRAINT "project_messages_enquiry_id_project_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "web_platform"."project_enquiries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_messages" ADD CONSTRAINT "project_messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "web_platform"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_messages" ADD CONSTRAINT "project_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_payment_milestones" ADD CONSTRAINT "project_payment_milestones_plan_id_project_payment_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "web_platform"."project_payment_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_payment_milestones" ADD CONSTRAINT "project_payment_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "web_platform"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_payment_milestones" ADD CONSTRAINT "project_payment_milestones_quotation_id_project_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "web_platform"."project_quotations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_payment_plans" ADD CONSTRAINT "project_payment_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "web_platform"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_payment_plans" ADD CONSTRAINT "project_payment_plans_enquiry_id_project_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "web_platform"."project_enquiries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_payment_plans" ADD CONSTRAINT "project_payment_plans_quotation_id_project_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "web_platform"."project_quotations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_quotations" ADD CONSTRAINT "project_quotations_enquiry_id_project_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "web_platform"."project_enquiries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_work_orders" ADD CONSTRAINT "project_work_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "web_platform"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_work_orders" ADD CONSTRAINT "project_work_orders_enquiry_id_project_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "web_platform"."project_enquiries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_work_orders" ADD CONSTRAINT "project_work_orders_quotation_id_project_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "web_platform"."project_quotations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."project_work_orders" ADD CONSTRAINT "project_work_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."projects" ADD CONSTRAINT "projects_enquiry_id_project_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "web_platform"."project_enquiries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."projects" ADD CONSTRAINT "projects_quotation_id_project_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "web_platform"."project_quotations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."service_bookings" ADD CONSTRAINT "service_bookings_farmer_id_farmers_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "web_platform"."farmers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."service_bookings" ADD CONSTRAINT "service_bookings_farm_id_farmer_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "web_platform"."farmer_farms"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."service_bookings" ADD CONSTRAINT "service_bookings_assigned_pilot_id_drone_pilots_id_fk" FOREIGN KEY ("assigned_pilot_id") REFERENCES "web_platform"."drone_pilots"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."store_orders" ADD CONSTRAINT "store_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."wishlists" ADD CONSTRAINT "wishlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_platform"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "web_platform"."wishlists" ADD CONSTRAINT "wishlists_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "web_platform"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- PART 1: ANDROID APP CORE TABLES (public.*)
-- ============================================================================

create table if not exists public.users (
    id text primary key,
    phone text unique not null,
    name text not null,
    role text not null check (role in ('admin', 'pilot', 'farmer')),
    created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create table if not exists public.farmer_profiles (
    user_id text primary key references public.users(id) on delete cascade,
    farmer_id_number text not null,
    coins integer not null default 0
);

create table if not exists public.pilot_profiles (
    user_id text primary key references public.users(id) on delete cascade,
    drone_type text not null default 'quadcopter',
    tank_capacity double precision not null default 10,
    license_document_uri text not null default '',
    is_license_verified boolean not null default false,
    bank_upi_id text not null default '',
    wallet_balance double precision not null default 0,
    is_online boolean not null default false,
    rating_average double precision not null default 5.0,
    rating_count integer not null default 0,
    current_lat double precision,
    current_lng double precision,
    location_updated_at bigint not null default 0
);

create table if not exists public.orders (
    id text primary key,
    farmer_id text not null references public.users(id) on delete cascade,
    assigned_pilot_id text references public.users(id),
    field_polygon_coordinates jsonb not null,
    acres_to_spray double precision not null,
    location_address text not null,
    total_amount double precision not null,
    admin_commission double precision not null,
    pilot_earnings double precision not null,
    payment_method text not null check (payment_method in ('online', 'cash')),
    payment_status text not null check (payment_status in ('pending', 'paid')),
    order_status text not null check (order_status in ('pending', 'accepted', 'in_progress', 'completed', 'cancelled')),
    pilot_eta_minutes integer not null default 15,
    initial_eta_minutes integer not null default 15,
    distance_km double precision,
    field_center_lat double precision not null default 0,
    field_center_lng double precision not null default 0,
    accepted_at bigint,
    pilot_rating integer,
    razorpay_payment_id text,
    created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create index if not exists idx_orders_farmer on public.orders(farmer_id);
create index if not exists idx_orders_pilot on public.orders(assigned_pilot_id);
create index if not exists idx_orders_status on public.orders(order_status);
create index if not exists idx_orders_payment_status on public.orders(payment_status);

create table if not exists public.farm_boundaries (
    id uuid primary key default uuid_generate_v4(),
    farmer_id text not null,
    farm_name text not null,
    polygon_coordinates jsonb not null,
    area_acres numeric(10, 2) not null,
    area_hectares numeric(10, 2) not null,
    center_lat double precision not null,
    center_lng double precision not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_farm_boundaries_farmer on public.farm_boundaries(farmer_id);

create table if not exists public.operator_locations (
    id text primary key,
    name text not null,
    role_type text not null check (role_type in ('drone_operator', 'drone_mitra')),
    lat double precision not null,
    lng double precision not null,
    drone_type text not null default 'quadcopter',
    is_available boolean not null default true,
    heading_degrees real not null default 0,
    updated_at timestamptz not null default now()
);
