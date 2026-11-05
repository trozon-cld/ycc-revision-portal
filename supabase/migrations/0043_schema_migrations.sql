-- 0043: a record of the migrations each database has had. Every migration from now on ends by adding its own
-- name here; the Superadmin sees on Backup & Restore whether the database is up to the code's version.

begin;

create table schema_migrations (
  name varchar(100) primary key check (name ~ '^[0-9]{4}_[a-z0-9_]+$'),
  applied_at timestamptz not null default now()
);

-- Running this file means every earlier migration has already been run, in order.
insert into schema_migrations (name) values
  ('0002_categories'),
  ('0003_drop_stub_tables'),
  ('0004_candidate_admin_owner'),
  ('0005_activity_logs'),
  ('0006_chapters'),
  ('0007_sections'),
  ('0008_category_chapters'),
  ('0009_media'),
  ('0010_content_pages'),
  ('0011_category_groups'),
  ('0012_questions'),
  ('0013_question_picture_layout'),
  ('0014_area_choice'),
  ('0015_match_pictures'),
  ('0016_handbook_progress'),
  ('0017_user_names'),
  ('0018_category_covers'),
  ('0019_activity_switch_index'),
  ('0020_sessions_and_login_limits'),
  ('0021_tracking'),
  ('0022_practice_sessions'),
  ('0023_question_flags'),
  ('0024_db_tidy_and_login_archive'),
  ('0025_mock_attempts'),
  ('0026_practice_from_mock'),
  ('0027_faq'),
  ('0028_password_check_records'),
  ('0029_handbook_voice'),
  ('0030_language_preference'),
  ('0031_question_voice'),
  ('0032_category_listen'),
  ('0033_voice_languages'),
  ('0034_english_only_counted_phrases'),
  ('0035_category_listen_languages'),
  ('0036_voice_usage_characters'),
  ('0037_rename_test_types'),
  ('0038_test_type_position'),
  ('0039_content_source_keys'),
  ('0040_structure_lock'),
  ('0041_bulk_listen'),
  ('0042_office_network'),
  ('0043_schema_migrations');

commit;
