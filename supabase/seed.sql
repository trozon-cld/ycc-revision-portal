-- Only Superadmin is seeded here; Superadmin creates Admins and Admins
-- create Candidates via the UI. To rotate the password, regenerate the
-- hash (npm run hash -- "password") and re-run this file.

insert into users (email, password_hash, role, access_start_at, access_expires_at, is_blocked)
values ('REPLACE_WITH_EMAIL', 'REPLACE_WITH_BCRYPT_HASH', 'superadmin', null, null, false)
on conflict (email) do update set password_hash = excluded.password_hash;

-- Test areas and test types (renameable by the Superadmin). Each only seeds an empty table.
insert into test_areas (position, name)
select position, name
from (values (1, 'General'), (2, 'Specialist')) as seed (position, name)
where not exists (select 1 from test_areas);

insert into test_types (name, test_area_id)
select seed.name, a.id
from (values
  (1, 'Operative'),
  (2, 'Supervisory'),
  (2, 'Demolition'),
  (2, 'Plumbing (JIB)'),
  (2, 'Highway works'),
  (2, 'Specialist working at height'),
  (2, 'Lifts and escalators'),
  (2, 'Tunnelling'),
  (2, 'Heating and plumbing services'),
  (2, 'Pipefitting and welding'),
  (2, 'Ductwork'),
  (2, 'Refrigeration and air conditioning'),
  (2, 'Services and facilities maintenance')
) as seed (area_position, name)
join test_areas a on a.position = seed.area_position
where not exists (select 1 from test_types);

-- Sections and chapters, all renameable. Each only seeds an empty table.
insert into sections (position, title)
select position, title
from (values
  (1, 'Working environment'),
  (2, 'Occupational health'),
  (3, 'Safety'),
  (4, 'High risk activities'),
  (5, 'Specialist activities')
) as seed (position, title)
where not exists (select 1 from sections);

insert into chapters (section_id, position, title)
select s.id, seed.position, seed.title
from (values
  (1, 1, 'General responsibilities'),
  (1, 2, 'Accident reporting and recording'),
  (1, 3, 'First aid and emergency procedures'),
  (1, 4, 'Personal protective equipment'),
  (1, 5, 'Environmental awareness and waste control'),
  (2, 1, 'Dust and fumes (respiratory hazards)'),
  (2, 2, 'Noise and vibration'),
  (2, 3, 'Health and welfare'),
  (2, 4, 'Manual handling'),
  (3, 1, 'Safety signs'),
  (3, 2, 'Fire prevention and control'),
  (3, 3, 'Electrical safety, tools and equipment'),
  (4, 1, 'Site transport and lifting operations'),
  (4, 2, 'Working at height'),
  (4, 3, 'Excavations and confined spaces'),
  (4, 4, 'Hazardous substances'),
  (5, 1, 'Supervisory'),
  (5, 2, 'Demolition'),
  (5, 3, 'Plumbing (JIB)'),
  (5, 4, 'Highway works'),
  (5, 5, 'Specialist working at height'),
  (5, 6, 'Lifts and escalators'),
  (5, 7, 'Tunnelling'),
  (5, 8, 'Heating and plumbing services'),
  (5, 9, 'Pipefitting and welding'),
  (5, 10, 'Ductwork'),
  (5, 11, 'Refrigeration and air conditioning'),
  (5, 12, 'Services and facilities maintenance')
) as seed (section_position, position, title)
join sections s on s.position = seed.section_position
where not exists (select 1 from chapters);

-- Every test type's book: the core chapters (sections A–D) and, in section E, the chapter named like the test type.
insert into test_type_chapters (test_type_id, chapter_id)
select t.id, c.id
from test_types t
join chapters c on true
join sections s on s.id = c.section_id
where (s.position <= 4 or c.title = t.name)
  and not exists (select 1 from test_type_chapters);

-- Starter General queries (hidden), as migration 0027 adds them.
insert into faq_items (position, question, answer)
select * from (values
(1, 'How do I log in, and what if I forget my password?',
 E'Log in with the email address and password your Admin gave you.\n\nIf you forget your password, please ask your Admin to set a new one for you.'),
(2, 'When does my access end?',
 E'Your Home page shows the date your revision access ends. Please complete your study and mock tests before this date.\n\nIf you need more time, please ask your Admin.'),
(3, 'How do I change category?',
 E'If your group has more than one category, tap Change category on your Home page and choose another one.\n\nYour progress is kept separately for each category, so you can switch back at any time. You can’t change category while a mock test is in progress.'),
(4, 'What is the difference between Prepare, Practice and Mock test?',
 E'Prepare is the Handbook: read it chapter by chapter, with questions along the way.\n\nPractice lets you answer questions with no time limit and see the answer straight away.\n\nMock test is like the real test: up to 50 questions in 45 minutes, with your results at the end.'),
(5, 'What happens if the mock test time runs out or I lose my connection?',
 E'Your answers are saved as you go. If you lose your connection or close the page, you can carry on from where you left off, on any device, while there is time left.\n\nThe timer keeps running while you are away. When the time runs out, the test ends and is marked using the answers you have given.'),
(6, 'What does “Flag for review” do?',
 E'It marks a question you want to come back to.\n\nIn Practice, you can later practise just your flagged questions. In a mock test, flags are shown on the review screen before you submit, so you can check those questions again.'),
(7, 'What does my readiness score mean?',
 E'Your readiness score appears on My progress after your first mock test. It is worked out from your latest mock test score, your average mock test score, how much of the Handbook you have done and how many of your practised chapters are not weak areas.\n\nIt is a guide to help you prepare, not a prediction of your official result.'),
(8, 'Who do I contact for help?',
 E'Your Admin can help with your login, your access dates and your category. You can also use the support details on this page.')
) as starter (position, question, answer)
where not exists (select 1 from faq_items);
