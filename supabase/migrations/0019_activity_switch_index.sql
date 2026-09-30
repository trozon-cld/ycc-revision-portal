-- Delta for a DB with 0018 applied. Index only: an admin's Activity page finds their candidates'
-- category switches without reading the whole log.

begin;

create index activity_logs_switch_target_idx on activity_logs (target_id, created_at desc)
  where action = 'candidate.category_switched';

commit;
