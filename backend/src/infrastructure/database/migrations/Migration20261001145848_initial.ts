import { Migration } from '@mikro-orm/migrations';

export class Migration20261001145848_initial extends Migration {

  override name = 'Migration20261001145848_initial';

  override up(): void | Promise<void> {
    this.addSql(`create table "groups" ("id" uuid not null, "name" varchar(120) not null, "invite_code" varchar(64) not null, "timezone" varchar(64) not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "groups" add constraint "groups_invite_code_unique" unique ("invite_code");`);
    this.addSql(`alter table "groups" add constraint "groups_name_not_blank" check (char_length(btrim(name)) between 1 and 120);`);
    this.addSql(`alter table "groups" add constraint "groups_timezone_utc" check (timezone = 'UTC');`);

    this.addSql(`create table "participants" ("id" uuid not null, "group_id" uuid not null, "display_name" varchar(80) not null, "display_name_normalized" varchar(80) not null, "edit_token_hash" char(64) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "participants" add constraint "participants_edit_token_hash_unique" unique ("edit_token_hash");`);
    this.addSql(`alter table "participants" add constraint "participants_group_name_unique" unique ("group_id", "display_name_normalized");`);
    this.addSql(`alter table "participants" add constraint "participants_name_not_blank" check (char_length(btrim(display_name)) between 1 and 80);`);

    this.addSql(`create table "polls" ("id" uuid not null, "group_id" uuid not null, "sequence_no" int not null, "title" varchar(160) null, "starts_on" date not null, "ends_on" date not null, "day_start" time not null, "day_end" time not null, "slot_minutes" smallint not null, "meeting_duration_minutes" smallint not null, "status" text not null, "based_on_poll_id" uuid null, "created_at" timestamptz not null, "closed_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "polls_group_created_idx" on "polls" ("group_id", "created_at");`);
    this.addSql(`alter table "polls" add constraint "polls_group_sequence_unique" unique ("group_id", "sequence_no");`);
    this.addSql(`alter table "polls" add constraint "polls_id_group_unique" unique ("id", "group_id");`);
    this.addSql(`create unique index "polls_one_open_per_group_idx" on "polls" ("group_id") where status = 'OPEN';`);
    this.addSql(`alter table "polls" add constraint "polls_sequence_positive" check (sequence_no > 0);`);
    this.addSql(`alter table "polls" add constraint "polls_dates_valid" check (starts_on <= ends_on and (ends_on - starts_on) between 0 and 6);`);
    this.addSql(`alter table "polls" add constraint "polls_day_window_valid" check (day_start < day_end);`);
    this.addSql(`alter table "polls" add constraint "polls_slot_minutes_valid" check (slot_minutes in (30, 60));`);
    this.addSql(`alter table "polls" add constraint "polls_meeting_duration_valid" check (meeting_duration_minutes between 30 and 240 and meeting_duration_minutes % slot_minutes = 0);`);
    this.addSql(`alter table "polls" add constraint "polls_meeting_fits_day_window" check (meeting_duration_minutes <= extract(epoch from (day_end - day_start)) / 60);`);
    this.addSql(`alter table "polls" add constraint "polls_status_valid" check (status in ('OPEN', 'CLOSED'));`);
    this.addSql(`alter table "polls" add constraint "polls_closed_at_consistent" check ((status = 'OPEN' and closed_at is null) or (status = 'CLOSED' and closed_at is not null));`);
    this.addSql(`alter table "polls" add constraint "polls_status_check" check ("status" in ('OPEN', 'CLOSED'));`);

    this.addSql(`create table "poll_responses" ("id" uuid not null, "poll_id" uuid not null, "participant_id" uuid not null, "state" text not null, "confirmed_at" timestamptz null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "poll_responses_poll_state_idx" on "poll_responses" ("poll_id", "state");`);
    this.addSql(`alter table "poll_responses" add constraint "poll_responses_poll_participant_unique" unique ("poll_id", "participant_id");`);
    this.addSql(`alter table "poll_responses" add constraint "poll_responses_state_valid" check (state in ('DRAFT', 'CONFIRMED'));`);
    this.addSql(`alter table "poll_responses" add constraint "poll_responses_confirmation_consistent" check ((state = 'DRAFT' and confirmed_at is null) or (state = 'CONFIRMED' and confirmed_at is not null));`);
    this.addSql(`alter table "poll_responses" add constraint "poll_responses_state_check" check ("state" in ('DRAFT', 'CONFIRMED'));`);

    this.addSql(`create table "availability_intervals" ("id" uuid not null, "response_id" uuid not null, "local_date" date not null, "start_time" time not null, "end_time" time not null, "kind" text not null, "preference_direction" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "availability_intervals_response_date_time_idx" on "availability_intervals" ("response_id", "local_date", "start_time");`);
    this.addSql(`alter table "availability_intervals" add constraint "availability_interval_time_valid" check (start_time < end_time);`);
    this.addSql(`alter table "availability_intervals" add constraint "availability_interval_kind_valid" check (kind in ('UNAVAILABLE', 'IF_NEEDED', 'PREFERRED'));`);
    this.addSql(`alter table "availability_intervals" add constraint "availability_interval_direction_valid" check ((kind = 'PREFERRED' and preference_direction is not null and preference_direction in ('EARLIER', 'FLAT', 'LATER')) or (kind <> 'PREFERRED' and preference_direction is null));`);
    this.addSql(`alter table "availability_intervals" add constraint "availability_intervals_kind_check" check ("kind" in ('UNAVAILABLE', 'IF_NEEDED', 'PREFERRED'));`);
    this.addSql(`alter table "availability_intervals" add constraint "availability_intervals_preference_direction_check" check ("preference_direction" in ('EARLIER', 'FLAT', 'LATER'));`);

    this.addSql(`alter table "participants" add constraint "participants_group_id_foreign" foreign key ("group_id") references "groups" ("id") on delete cascade;`);

    this.addSql(`alter table "polls" add constraint "polls_group_id_foreign" foreign key ("group_id") references "groups" ("id") on delete cascade;`);
    this.addSql(`alter table "polls" add constraint "polls_based_on_same_group_fk" foreign key ("based_on_poll_id", "group_id") references "polls" ("id", "group_id") on delete set null ("based_on_poll_id");`);

    this.addSql(`alter table "poll_responses" add constraint "poll_responses_poll_id_foreign" foreign key ("poll_id") references "polls" ("id") on delete cascade;`);
    this.addSql(`alter table "poll_responses" add constraint "poll_responses_participant_id_foreign" foreign key ("participant_id") references "participants" ("id") on delete cascade;`);

    this.addSql(`alter table "availability_intervals" add constraint "availability_intervals_response_id_foreign" foreign key ("response_id") references "poll_responses" ("id") on delete cascade;`);
  }

  override down(): void {
    this.addSql('drop table if exists "availability_intervals" cascade;');
    this.addSql('drop table if exists "poll_responses" cascade;');
    this.addSql('drop table if exists "polls" cascade;');
    this.addSql('drop table if exists "participants" cascade;');
    this.addSql('drop table if exists "groups" cascade;');
  }

}
