-- 0034: "Choose {n} answers" and "Choose one of the {n} outlined areas…" become English only. Other languages get
-- that sentence translated with each Multiple answers / Choose the area question, so the words fit the number.
-- Hindi and Punjabi translations of those questions made before this show as out of date (translate them again).
delete from voice_phrases where language <> 'en' and phrase in ('choose', 'choose_area');
alter table voice_phrases add constraint voice_phrases_counted_english_only check (language = 'en' or phrase not in ('choose', 'choose_area'));
