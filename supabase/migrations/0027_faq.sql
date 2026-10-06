-- E7-1: General queries (FAQ) and support contact details, edited by the Superadmin.

create table faq_items (
  id uuid primary key default gen_random_uuid(),
  position integer not null check (position > 0),
  question varchar(200) not null check (btrim(question) <> ''),
  answer text not null check (btrim(answer) <> '' and char_length(answer) <= 3000),
  -- draft = hidden from candidates; published = shown.
  status varchar(10) not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint faq_items_position_key unique (position) deferrable initially deferred
);

-- One row only. Every field is optional; candidates see only the ones filled in.
create table support_contact (
  id boolean primary key default true check (id),
  email varchar(255),
  phone varchar(40),
  hours varchar(120),
  note varchar(500),
  updated_at timestamptz not null default now()
);

insert into support_contact default values;

-- Starter questions about using the portal, hidden until the Superadmin edits and shows them.
insert into faq_items (position, question, answer) values
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
 E'Your Admin can help with your login, your access dates and your category. You can also use the support details on this page.');
