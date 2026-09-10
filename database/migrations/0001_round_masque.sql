CREATE TABLE "shift_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid,
	"name" text NOT NULL,
	"short_code" text,
	"start_time" text,
	"end_time" text,
	"color" text,
	"is_work" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"shift_type_id" uuid,
	"date" date NOT NULL,
	"start_time" text,
	"end_time" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"shift_type_id" uuid,
	"name" text,
	"start_time" text,
	"end_time" text,
	"frequency" text DEFAULT 'weekly' NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"days_of_week" jsonb DEFAULT '[]'::jsonb,
	"start_date" date NOT NULL,
	"end_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"base_hourly_rate" numeric(10, 2),
	"base_monthly_salary" numeric(10, 2),
	"contracted_hours_per_week" numeric(5, 2),
	"night_bonus_rate" numeric(5, 2),
	"sunday_bonus_rate" numeric(5, 2),
	"holiday_bonus_rate" numeric(5, 2),
	"overtime_bonus_rate" numeric(5, 2),
	"currency" text DEFAULT 'EUR' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salary_profiles_profile_id_unique" UNIQUE("profile_id")
);
--> statement-breakpoint
ALTER TABLE "shift_types" ADD CONSTRAINT "shift_types_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_shift_type_id_shift_types_id_fk" FOREIGN KEY ("shift_type_id") REFERENCES "public"."shift_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_shifts" ADD CONSTRAINT "recurring_shifts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_shifts" ADD CONSTRAINT "recurring_shifts_shift_type_id_shift_types_id_fk" FOREIGN KEY ("shift_type_id") REFERENCES "public"."shift_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_profiles" ADD CONSTRAINT "salary_profiles_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shift_types_profile_id_idx" ON "shift_types" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "shifts_profile_id_idx" ON "shifts" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "shifts_profile_date_idx" ON "shifts" USING btree ("profile_id","date");--> statement-breakpoint
CREATE INDEX "shifts_shift_type_id_idx" ON "shifts" USING btree ("shift_type_id");--> statement-breakpoint
CREATE INDEX "recurring_shifts_profile_id_idx" ON "recurring_shifts" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "recurring_shifts_shift_type_id_idx" ON "recurring_shifts" USING btree ("shift_type_id");--> statement-breakpoint
CREATE INDEX "salary_profiles_profile_id_idx" ON "salary_profiles" USING btree ("profile_id");