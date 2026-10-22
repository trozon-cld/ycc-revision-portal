-- 0033: Listen's languages and their fixed spoken phrases move from code (lib/voice/languages.ts) into the database,
-- so languages can be managed in the app (L2). English, Hindi and Punjabi are added as they were; nothing changes on screen.

-- One row per language. Only live languages are offered to candidates; staff can prepare draft ones; hidden ones
-- are kept (never deleted) with their translations and audio. English is the source and is always live.
create table voice_languages (
  code varchar(10) primary key check (code ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  name varchar(60) not null check (length(btrim(name)) > 0),
  native_name varchar(60) not null check (length(btrim(native_name)) > 0),
  -- Extra instruction sent with every translation into this language (e.g. the script to use).
  translator_note varchar(200) check (translator_note is null or length(btrim(translator_note)) > 0),
  status varchar(10) not null default 'draft' check (status in ('draft', 'live', 'hidden')),
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (code <> 'en' or status = 'live')
);

-- The fixed wording Listen reads in each language (box labels, "Question", "Option", the question-type lines).
-- {n} stands for a number in "choose" and "choose_area". Checked once by staff (L2).
create table voice_phrases (
  language varchar(10) not null references voice_languages (code),
  phrase varchar(20) not null check (phrase in ('key_point', 'remember', 'question', 'option', 'choose', 'choose_area', 'tap_area', 'match_boxes', 'boxes_are')),
  text varchar(300) not null check (length(btrim(text)) > 0),
  status varchar(10) not null default 'draft' check (status in ('draft', 'checked')),
  checked_by uuid references users (id) on delete set null,
  checked_at timestamptz,
  updated_by uuid references users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (language, phrase),
  check ((status = 'checked') = (checked_at is not null)),
  check (phrase not in ('choose', 'choose_area') or position('{n}' in text) > 0)
);

insert into voice_languages (code, name, native_name, translator_note, status) values
  ('en', 'English', 'English', null, 'live'),
  ('hi', 'Hindi', 'हिन्दी', null, 'live'),
  ('pa', 'Punjabi', 'ਪੰਜਾਬੀ', 'Use Gurmukhi script.', 'live');

-- English is checked; the Hindi and Punjabi wording still waits for a reader's check (a go-live item).
insert into voice_phrases (language, phrase, text, status, checked_at)
select v.language, v.phrase, v.text, case when v.language = 'en' then 'checked' else 'draft' end,
       case when v.language = 'en' then now() end
from (values
  ('en', 'key_point', 'Key point'),
  ('en', 'remember', 'Remember'),
  ('en', 'question', 'Question'),
  ('en', 'option', 'Option'),
  ('en', 'choose', 'Choose {n} answers'),
  ('en', 'choose_area', 'Choose one of the {n} outlined areas on the picture'),
  ('en', 'tap_area', 'Look at the picture and tap the place that answers the question'),
  ('en', 'match_boxes', 'Put each picture in the box it belongs to'),
  ('en', 'boxes_are', 'The boxes are:'),
  ('hi', 'key_point', 'मुख्य बात'),
  ('hi', 'remember', 'याद रखें'),
  ('hi', 'question', 'प्रश्न'),
  ('hi', 'option', 'विकल्प'),
  ('hi', 'choose', '{n} उत्तर चुनें'),
  ('hi', 'choose_area', 'चित्र पर बने {n} चिह्नित हिस्सों में से एक चुनें'),
  ('hi', 'tap_area', 'चित्र को देखें और उस जगह पर टैप करें जो प्रश्न का उत्तर है'),
  ('hi', 'match_boxes', 'हर चित्र को उस बॉक्स में रखें जिससे वह मेल खाता है'),
  ('hi', 'boxes_are', 'बॉक्स ये हैं:'),
  ('pa', 'key_point', 'ਮੁੱਖ ਗੱਲ'),
  ('pa', 'remember', 'ਯਾਦ ਰੱਖੋ'),
  ('pa', 'question', 'ਸਵਾਲ'),
  ('pa', 'option', 'ਵਿਕਲਪ'),
  ('pa', 'choose', '{n} ਜਵਾਬ ਚੁਣੋ'),
  ('pa', 'choose_area', 'ਤਸਵੀਰ ''ਤੇ ਬਣੇ {n} ਨਿਸ਼ਾਨ ਲੱਗੇ ਹਿੱਸਿਆਂ ਵਿੱਚੋਂ ਇੱਕ ਚੁਣੋ'),
  ('pa', 'tap_area', 'ਤਸਵੀਰ ਨੂੰ ਦੇਖੋ ਅਤੇ ਉਸ ਥਾਂ ''ਤੇ ਟੈਪ ਕਰੋ ਜੋ ਸਵਾਲ ਦਾ ਜਵਾਬ ਹੈ'),
  ('pa', 'match_boxes', 'ਹਰ ਤਸਵੀਰ ਨੂੰ ਉਸ ਡੱਬੇ ਵਿੱਚ ਰੱਖੋ ਜਿਸ ਨਾਲ ਉਹ ਮੇਲ ਖਾਂਦੀ ਹੈ'),
  ('pa', 'boxes_are', 'ਡੱਬੇ ਇਹ ਹਨ:')
) as v (language, phrase, text);

-- Translations, audio and each candidate's listening language must name a known language.
alter table page_translations add foreign key (language) references voice_languages (code);
alter table page_audio add foreign key (language) references voice_languages (code);
alter table question_translations add foreign key (language) references voice_languages (code);
alter table question_audio add foreign key (language) references voice_languages (code);
alter table users add foreign key (preferred_language) references voice_languages (code);
