CREATE TYPE "public"."reports_and_invoices_color_scheme" AS ENUM('auto', 'light', 'dark');--> statement-breakpoint
CREATE TYPE "public"."reports_and_invoices_cursor_style" AS ENUM('line', 'block');--> statement-breakpoint
CREATE TYPE "public"."reports_and_invoices_editor_keybinding" AS ENUM('emacs', 'vim');--> statement-breakpoint
CREATE TYPE "public"."reports_and_invoices_invoice_numbering_scope" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TYPE "public"."reports_and_invoices_invoice_status" AS ENUM('draft', 'issued', 'paid');--> statement-breakpoint
CREATE TYPE "public"."reports_and_invoices_primary_color" AS ENUM('blue', 'indigo', 'violet', 'grape', 'pink', 'red', 'orange', 'teal', 'green');--> statement-breakpoint
CREATE TYPE "public"."reports_and_invoices_user_role" AS ENUM('super_user', 'senior_programmer', 'developer');--> statement-breakpoint
CREATE TABLE "reports_and_invoices_customer" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"payer_id" uuid NOT NULL,
	"alias" varchar(64) NOT NULL,
	"default_hourly_rate" numeric(10, 2),
	"default_line_item_text" varchar(255),
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "customer_user_alias_unique" UNIQUE("user_id","alias")
);
--> statement-breakpoint
CREATE TABLE "reports_and_invoices_invoice_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"name" varchar(500) NOT NULL,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unit_price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"discount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"vat_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports_and_invoices_invoice_number_counter" (
	"user_id" uuid NOT NULL,
	"period" varchar(6) NOT NULL,
	"last_sequence" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_number_counter_unique" UNIQUE("user_id","period")
);
--> statement-breakpoint
CREATE TABLE "reports_and_invoices_invoice" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"payer_id" uuid NOT NULL,
	"number" varchar(20) NOT NULL,
	"variable_symbol" varchar(30),
	"constant_symbol" varchar(30),
	"issue_date" date,
	"due_date" date,
	"performance_date" date,
	"period_label" varchar(32),
	"source_year" integer,
	"source_month" integer,
	"status" "reports_and_invoices_invoice_status" DEFAULT 'draft' NOT NULL,
	"currency" varchar(3) DEFAULT 'CZK' NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "invoice_user_number_unique" UNIQUE("user_id","number")
);
--> statement-breakpoint
CREATE TABLE "reports_and_invoices_payer" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"street" varchar(255),
	"city" varchar(255),
	"zip" varchar(20),
	"ico" varchar(20),
	"dic" varchar(20),
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports_and_invoices_user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"first_name" varchar(100),
	"last_name" varchar(100),
	"role" "reports_and_invoices_user_role" DEFAULT 'developer' NOT NULL,
	"manager_id" uuid,
	"street" varchar(255),
	"city" varchar(255),
	"zip" varchar(20),
	"ico" varchar(20),
	"dic" varchar(20),
	"phone" varchar(50),
	"invoice_email" varchar(255),
	"bank_account" varchar(50),
	"bank_code" varchar(10),
	"signature_image_url" text,
	"invoice_date_rules" jsonb,
	"invoice_numbering_scope" "reports_and_invoices_invoice_numbering_scope" DEFAULT 'month' NOT NULL,
	"default_line_item_template" varchar(255),
	"default_hourly_rate" numeric(10, 2),
	"editor_keybinding" "reports_and_invoices_editor_keybinding" DEFAULT 'emacs' NOT NULL,
	"cursor_style" "reports_and_invoices_cursor_style" DEFAULT 'line' NOT NULL,
	"show_line_numbers" boolean DEFAULT true NOT NULL,
	"color_scheme" "reports_and_invoices_color_scheme" DEFAULT 'auto' NOT NULL,
	"primary_color" "reports_and_invoices_primary_color" DEFAULT 'blue' NOT NULL,
	"workdays" jsonb DEFAULT '[1,2,3,4,5]'::jsonb NOT NULL,
	"hours_per_workday" numeric(4, 2) DEFAULT '8' NOT NULL,
	"monthly_hours_goal" numeric(6, 2),
	"nextcloud_url" varchar(500),
	"nextcloud_username" varchar(255),
	"nextcloud_app_password_enc" text,
	"nextcloud_remote_path" varchar(500),
	"nextcloud_synced_periods" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "reports_and_invoices_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "reports_and_invoices_customer" ADD CONSTRAINT "reports_and_invoices_customer_user_id_reports_and_invoices_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."reports_and_invoices_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports_and_invoices_customer" ADD CONSTRAINT "reports_and_invoices_customer_payer_id_reports_and_invoices_payer_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."reports_and_invoices_payer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports_and_invoices_invoice_item" ADD CONSTRAINT "reports_and_invoices_invoice_item_invoice_id_reports_and_invoices_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."reports_and_invoices_invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports_and_invoices_invoice_number_counter" ADD CONSTRAINT "reports_and_invoices_invoice_number_counter_user_id_reports_and_invoices_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."reports_and_invoices_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports_and_invoices_invoice" ADD CONSTRAINT "reports_and_invoices_invoice_user_id_reports_and_invoices_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."reports_and_invoices_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports_and_invoices_invoice" ADD CONSTRAINT "reports_and_invoices_invoice_payer_id_reports_and_invoices_payer_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."reports_and_invoices_payer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports_and_invoices_payer" ADD CONSTRAINT "reports_and_invoices_payer_user_id_reports_and_invoices_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."reports_and_invoices_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports_and_invoices_user" ADD CONSTRAINT "reports_and_invoices_user_manager_id_reports_and_invoices_user_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."reports_and_invoices_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_user_idx" ON "reports_and_invoices_customer" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "customer_payer_idx" ON "reports_and_invoices_customer" USING btree ("payer_id");--> statement-breakpoint
CREATE INDEX "invoice_item_invoice_idx" ON "reports_and_invoices_invoice_item" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_user_idx" ON "reports_and_invoices_invoice" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invoice_payer_idx" ON "reports_and_invoices_invoice" USING btree ("payer_id");--> statement-breakpoint
CREATE INDEX "payer_user_idx" ON "reports_and_invoices_payer" USING btree ("user_id");