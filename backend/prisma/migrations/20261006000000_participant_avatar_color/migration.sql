ALTER TABLE "participants"
ADD COLUMN "avatar_color" VARCHAR(6);

UPDATE "participants"
SET
  "avatar_color" = 'gray';

ALTER TABLE "participants"
ALTER COLUMN "avatar_color"
SET NOT NULL;

ALTER TABLE "participants"
ADD CONSTRAINT "participants_avatar_color_valid" CHECK (
  "avatar_color" IN (
    'green',
    'blue',
    'purple',
    'rose',
    'yellow',
    'gray'
  )
);
