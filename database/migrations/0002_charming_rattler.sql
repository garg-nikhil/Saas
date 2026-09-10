CREATE TABLE "nurse_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"profession" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nurse_profiles_profile_id_unique" UNIQUE("profile_id")
);
--> statement-breakpoint
ALTER TABLE "nurse_profiles" ADD CONSTRAINT "nurse_profiles_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nurse_profiles_profile_id_idx" ON "nurse_profiles" USING btree ("profile_id");