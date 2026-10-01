-- Enforce poll rules that the initial schema left to application validation.
ALTER TABLE polls
  ADD CONSTRAINT polls_meeting_fits_day_window
  CHECK (meeting_duration_minutes <= EXTRACT(EPOCH FROM (day_end - day_start)) / 60);

-- A previous poll must belong to the same persistent group. Retain the
-- original delete behavior by clearing only based_on_poll_id.
ALTER TABLE polls
  ADD CONSTRAINT polls_id_group_unique UNIQUE (id, group_id);

ALTER TABLE polls
  DROP CONSTRAINT polls_based_on_poll_id_fkey;

ALTER TABLE polls
  ADD CONSTRAINT polls_based_on_same_group_fk
  FOREIGN KEY (based_on_poll_id, group_id)
  REFERENCES polls (id, group_id)
  ON DELETE SET NULL (based_on_poll_id);
