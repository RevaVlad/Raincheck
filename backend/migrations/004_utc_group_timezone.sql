-- Existing local-time polls require an explicit conversion before switching to UTC.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM groups AS g
    JOIN polls AS p ON p.group_id = g.id
    WHERE g.timezone <> 'UTC'
  ) THEN
    RAISE EXCEPTION 'Cannot convert groups with existing non-UTC polls automatically';
  END IF;
END $$;

UPDATE groups SET timezone = 'UTC' WHERE timezone <> 'UTC';

ALTER TABLE groups
  ADD CONSTRAINT groups_timezone_utc CHECK (timezone = 'UTC');
