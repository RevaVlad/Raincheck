ALTER TABLE "polls"
ADD COLUMN "time_zone" VARCHAR(64);

UPDATE "polls"
SET
  "time_zone" = 'UTC';

ALTER TABLE "polls"
ALTER COLUMN "time_zone"
SET NOT NULL;

ALTER TABLE "groups"
DROP CONSTRAINT "groups_timezone_utc";

ALTER TABLE "groups"
DROP COLUMN "timezone";

ALTER TABLE "availability_intervals"
ADD COLUMN "start_at" TIMESTAMPTZ(6),
ADD COLUMN "end_at" TIMESTAMPTZ(6);

UPDATE "availability_intervals"
SET
  "start_at" = ("local_date" + "start_time") AT TIME ZONE 'UTC',
  "end_at" = ("local_date" + "end_time") AT TIME ZONE 'UTC';

ALTER TABLE "availability_intervals"
ALTER COLUMN "start_at"
SET NOT NULL,
ALTER COLUMN "end_at"
SET NOT NULL,
DROP CONSTRAINT "availability_interval_time_valid",
ADD CONSTRAINT "availability_interval_time_valid" CHECK ("start_at" < "end_at");

DROP INDEX "availability_intervals_response_date_time_idx";

ALTER TABLE "availability_intervals"
DROP COLUMN "local_date",
DROP COLUMN "start_time",
DROP COLUMN "end_time";

CREATE INDEX "availability_intervals_response_start_at_idx" ON "availability_intervals" ("response_id", "start_at");
