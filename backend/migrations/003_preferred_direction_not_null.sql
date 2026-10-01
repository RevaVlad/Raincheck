-- Rows accepted by the original CHECK used the domain's default direction.
UPDATE availability_intervals
   SET preference_direction = 'FLAT'
 WHERE kind = 'PREFERRED' AND preference_direction IS NULL;

ALTER TABLE availability_intervals
    DROP CONSTRAINT availability_interval_direction_valid;

ALTER TABLE availability_intervals
    ADD CONSTRAINT availability_interval_direction_valid CHECK (
        (
            kind = 'PREFERRED'
            AND preference_direction IS NOT NULL
            AND preference_direction IN ('EARLIER', 'FLAT', 'LATER')
        )
        OR
        (
            kind <> 'PREFERRED'
            AND preference_direction IS NULL
        )
    );
