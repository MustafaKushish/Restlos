-- Restlos Nachbarschafts-Börse: Datenbank bei Supabase (Region Frankfurt).
-- Einmal komplett in Supabase → SQL Editor einfügen und „Run“ drücken. Mehrfaches Ausführen schadet nicht.
--
-- Was hier festgelegt ist (und sich von der App aus nicht umgehen lässt):
--   * Jeder sieht nur, was nicht abgelaufen und nicht ausgeblendet ist. Private Nachrichten gibt es nicht.
--   * Nur Stadt und Straße – keine Hausnummer, keine Telefonnummer, keine E-Mail, keine Links, keine Kontodaten.
--   * Angebote verschwinden nach 3 Tagen, Nachrichten nach 7 Tagen, Meldungen nach 30 Tagen.
--   * Jeder kann nur eigene Beiträge ändern oder löschen. Ab 3 Meldungen ist ein Beitrag sofort unsichtbar.
--   * Höchstens 20 Beiträge pro Stunde und 6 Angebote pro Tag je Gerät.

create extension if not exists pgcrypto;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  kind text not null check (kind in ('angebot', 'nachricht')),
  city text not null check (char_length(city) between 2 and 60),
  street text check (street is null or char_length(street) between 2 and 60),
  title text check (title is null or char_length(title) between 2 and 80),
  body text not null check (char_length(body) between 1 and 500),
  nickname text not null default 'Nachbar:in' check (char_length(nickname) between 1 and 30),
  reply_to uuid references public.posts (id) on delete cascade,
  status text not null default 'offen' check (status in ('offen', 'reserviert', 'vergeben')),
  report_count int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  check (kind = 'nachricht' or title is not null)
);
create index if not exists posts_city on public.posts (city, created_at);
create index if not exists posts_user on public.posts (user_id, created_at);

create table if not exists public.reports (
  post_id uuid not null references public.posts (id) on delete cascade,
  reporter uuid not null default auth.uid(),
  reason text check (reason is null or char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (post_id, reporter)
);

-- Texte prüfen: dieselben Regeln wie in js/neighbors.js (checkText).
create or replace function public.restlos_check_text(t text) returns void
language plpgsql immutable as $$
declare plain text := regexp_replace(coalesce(t, ''), '\m\d{1,2}\.\d{1,2}\.(\d{2,4})?|\m\d{1,2}:\d{2}\M', ' – ', 'g');
begin
  if plain ~* '[a-z]{2}\d{2}( ?[a-z0-9]{4}){3,}' then raise exception 'restlos:kontakt'; end if;
  if plain ~ '\d([[:space:]/.()-]*\d){6,}' then raise exception 'restlos:telefon'; end if;
  if t ~* '[^[:space:]@]+@[^[:space:]@]+\.[a-z]{2,}'
     or t ~* '(https?://|www\.|\m[a-z0-9-]+\.(de|com|net|org|eu|me|io|info|at|ch)\M)' then
    raise exception 'restlos:kontakt';
  end if;
end $$;

create or replace function public.restlos_before_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Diese Felder setzt nur die Datenbank selbst.
  new.user_id := auth.uid();
  new.created_at := now();
  new.report_count := 0;
  new.hidden := false;
  new.status := 'offen';
  new.expires_at := now() + case when new.kind = 'angebot' then interval '3 days' else interval '7 days' end;
  new.city := btrim(regexp_replace(new.city, '\s+', ' ', 'g'));
  new.street := nullif(btrim(regexp_replace(coalesce(new.street, ''), '\s+', ' ', 'g')), '');
  new.nickname := coalesce(nullif(btrim(new.nickname), ''), 'Nachbar:in');
  if new.user_id is null then raise exception 'restlos:anmeldung'; end if;
  -- Keine Hausnummer: Straßen dürfen nicht auf eine Zahl enden („Hauptstraße 12“), „Straße des 17. Juni“ geht.
  if new.city ~ '\d' or new.street ~ '\d+[[:space:]]*[a-zA-Z]?[[:space:]]*$' then raise exception 'restlos:hausnummer'; end if;
  if new.nickname ~ '\d{3,}' then raise exception 'restlos:telefon'; end if;
  perform public.restlos_check_text(new.title);
  perform public.restlos_check_text(new.body);
  perform public.restlos_check_text(new.nickname);
  if new.reply_to is not null then
    -- Antworten gehören in dieselbe Stadt wie das Angebot.
    select p.city into new.city from public.posts p where p.id = new.reply_to and not p.hidden;
    if new.city is null then raise exception 'restlos:weg'; end if;
    new.kind := 'nachricht';
    new.title := null;
  end if;
  if (select count(*) from public.posts where user_id = new.user_id and created_at > now() - interval '1 hour') >= 20
     or (new.kind = 'angebot' and (select count(*) from public.posts where user_id = new.user_id and kind = 'angebot' and created_at > now() - interval '1 day') >= 6) then
    raise exception 'restlos:zu-viel';
  end if;
  return new;
end $$;

drop trigger if exists restlos_before_post on public.posts;
create trigger restlos_before_post before insert on public.posts
  for each row execute function public.restlos_before_post();

-- Ändern darf man nur den Status (zu verschenken / reserviert / vergeben) – siehe „grant update (status)“ unten.

-- Meldungen: ab 3 verschiedenen Meldungen ist ein Beitrag sofort unsichtbar.
create or replace function public.restlos_after_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.posts set report_count = (select count(*) from public.reports where post_id = new.post_id),
    hidden = hidden or (select count(*) from public.reports where post_id = new.post_id) >= 3
  where id = new.post_id;
  return new;
end $$;
drop trigger if exists restlos_after_report on public.reports;
create trigger restlos_after_report after insert on public.reports
  for each row execute function public.restlos_after_report();

create or replace function public.restlos_before_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.reporter := auth.uid();
  new.created_at := now();
  if new.reporter is null or exists (select 1 from public.posts where id = new.post_id and user_id = new.reporter) then
    raise exception 'restlos:eigener-beitrag';
  end if;
  return new;
end $$;
drop trigger if exists restlos_before_report on public.reports;
create trigger restlos_before_report before insert on public.reports
  for each row execute function public.restlos_before_report();

-- Zugriffsregeln
alter table public.posts enable row level security;
alter table public.reports enable row level security;
revoke all on public.posts, public.reports from anon, authenticated;
grant select, insert, delete on public.posts to authenticated;
grant update (status) on public.posts to authenticated;
grant insert on public.reports to authenticated;

drop policy if exists "lesen" on public.posts;
create policy "lesen" on public.posts for select to authenticated
  using ((not hidden and expires_at > now()) or user_id = auth.uid());
drop policy if exists "schreiben" on public.posts;
create policy "schreiben" on public.posts for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "status" on public.posts;
create policy "status" on public.posts for update to authenticated using (user_id = auth.uid() and kind = 'angebot') with check (user_id = auth.uid());
drop policy if exists "loeschen" on public.posts;
create policy "loeschen" on public.posts for delete to authenticated using (user_id = auth.uid());
drop policy if exists "melden" on public.reports;
create policy "melden" on public.reports for insert to authenticated with check (reporter = auth.uid());
-- Meldungen kann niemand über die App lesen (nur du im Supabase-Dashboard).

-- Städte mit offenen Angeboten (für die Auswahl in der App)
create or replace function public.staedte() returns table (stadt text, angebote bigint)
language sql stable security definer set search_path = public as $$
  select city, count(*) from public.posts
  where kind = 'angebot' and status <> 'vergeben' and not hidden and expires_at > now()
  group by city order by count(*) desc, city limit 50
$$;
revoke all on function public.staedte() from public, anon;
grant execute on function public.staedte() to authenticated;

-- Aufräumen: stündlich alles Abgelaufene endgültig löschen (pg_cron ist bei Supabase dabei).
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'restlos-aufraeumen';
select cron.schedule('restlos-aufraeumen', '17 * * * *', $$
  delete from public.posts where expires_at < now();
  delete from public.reports where created_at < now() - interval '30 days';
$$);
