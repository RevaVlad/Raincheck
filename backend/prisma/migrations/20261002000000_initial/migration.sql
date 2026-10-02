create table groups (
  id uuid primary key,
  name varchar(120) not null,
  invite_code varchar(64) not null unique,
  timezone varchar(64) not null,
  created_at timestamptz not null,
  constraint groups_name_not_blank check (char_length(btrim(name)) between 1 and 120),
  constraint groups_timezone_utc check (timezone = 'UTC')
);

create table participants (
  id uuid primary key,
  group_id uuid not null references groups (id) on delete cascade,
  display_name varchar(80) not null,
  display_name_normalized varchar(80) not null,
  edit_token_hash char(64) not null unique,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint participants_group_name_unique unique (group_id, display_name_normalized),
  constraint participants_name_not_blank check (char_length(btrim(display_name)) between 1 and 80)
);

create table polls (
  id uuid primary key,
  group_id uuid not null references groups (id) on delete cascade,
  sequence_no int not null,
  title varchar(160),
  starts_on date not null,
  ends_on date not null,
  day_start time not null,
  day_end time not null,
  slot_minutes smallint not null,
  meeting_duration_minutes smallint not null,
  status text not null,
  based_on_poll_id uuid,
  created_at timestamptz not null,
  closed_at timestamptz,
  unique (group_id, sequence_no),
  unique (id, group_id),
  constraint polls_sequence_positive check (sequence_no > 0),
  constraint polls_dates_valid check (
    starts_on <= ends_on
    and (ends_on - starts_on) between 0 and 6
  ),
  constraint polls_day_window_valid check (day_start < day_end),
  constraint polls_slot_minutes_valid check (slot_minutes in (30, 60)),
  constraint polls_meeting_duration_valid check (
    meeting_duration_minutes between 30 and 240
    and meeting_duration_minutes % slot_minutes = 0
  ),
  constraint polls_meeting_fits_day_window check (
    meeting_duration_minutes <= extract(
      epoch
      from
        (day_end - day_start)
    ) / 60
  ),
  constraint polls_status_valid check (status in ('OPEN', 'CLOSED')),
  constraint polls_closed_at_consistent check (
    (
      status = 'OPEN'
      and closed_at is null
    )
    or (
      status = 'CLOSED'
      and closed_at is not null
    )
  ),
  constraint polls_based_on_same_group_fk foreign key (based_on_poll_id, group_id) references polls (id, group_id) on delete set null (based_on_poll_id)
);

create unique index polls_one_open_per_group_idx on polls (group_id)
where
  status = 'OPEN';

create index polls_group_created_idx on polls (group_id, created_at);

create table poll_responses (
  id uuid primary key,
  poll_id uuid not null references polls (id) on delete cascade,
  participant_id uuid not null references participants (id) on delete cascade,
  state text not null,
  confirmed_at timestamptz,
  updated_at timestamptz not null,
  constraint poll_responses_poll_participant_unique unique (poll_id, participant_id),
  constraint poll_responses_state_valid check (state in ('DRAFT', 'CONFIRMED')),
  constraint poll_responses_confirmation_consistent check (
    (
      state = 'DRAFT'
      and confirmed_at is null
    )
    or (
      state = 'CONFIRMED'
      and confirmed_at is not null
    )
  )
);

create index poll_responses_poll_state_idx on poll_responses (poll_id, state);

create table availability_intervals (
  id uuid primary key,
  response_id uuid not null references poll_responses (id) on delete cascade,
  local_date date not null,
  start_time time not null,
  end_time time not null,
  kind text not null,
  preference_direction text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint availability_interval_time_valid check (start_time < end_time),
  constraint availability_interval_kind_valid check (kind in ('UNAVAILABLE', 'IF_NEEDED', 'PREFERRED')),
  constraint availability_interval_direction_valid check (
    (
      kind = 'PREFERRED'
      and preference_direction is not null
      and preference_direction in ('EARLIER', 'FLAT', 'LATER')
    )
    or (
      kind <> 'PREFERRED'
      and preference_direction is null
    )
  )
);

create index availability_intervals_response_date_time_idx on availability_intervals (response_id, local_date, start_time);
