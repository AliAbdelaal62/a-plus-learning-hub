create type public.app_role as enum ('admin','coordinator','accountant','teacher');
create type public.record_status as enum ('active','inactive');
create type public.subject_type as enum ('live','recorded','project');
create type public.lesson_status as enum ('completed','cancelled','rescheduled','no_show');

create table public.teachers(
  id uuid primary key default gen_random_uuid(),
  name text not null, phone text, email text, specialty text,
  currency text not null default 'EGP', hourly_rate numeric(12,2),
  status public.record_status not null default 'active', notes text,
  created_at timestamptz not null default now());
create table public.students(
  id uuid primary key default gen_random_uuid(),
  name text not null, university text, country text, major text, level text,
  currency text not null default 'EGP', phone text, email text,
  status public.record_status not null default 'active', notes text,
  created_at timestamptz not null default now());
create table public.subjects(
  id uuid primary key default gen_random_uuid(),
  name text not null, type public.subject_type not null default 'live',
  university text, level text,
  teacher_id uuid references public.teachers(id) on delete set null,
  teacher_currency text, teacher_rate numeric(12,2),
  student_currency text, student_rate numeric(12,2),
  created_at timestamptz not null default now());
create table public.subject_students(
  subject_id uuid not null references public.subjects(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  primary key(subject_id, student_id));
create table public.timetable_entries(
  id uuid primary key default gen_random_uuid(),
  recurring boolean not null default false,
  date date, weekday smallint check (weekday between 0 and 6),
  start_time time not null, end_time time not null,
  teacher_id uuid references public.teachers(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  student_id uuid references public.students(id) on delete set null,
  notes text, created_at timestamptz not null default now(),
  constraint tt_when check ((recurring and weekday is not null) or (not recurring and date is not null)));
create table public.lessons(
  id uuid primary key default gen_random_uuid(),
  date date not null,
  teacher_id uuid not null references public.teachers(id),
  student_id uuid not null references public.students(id),
  subject_id uuid not null references public.subjects(id),
  hours numeric(6,2) not null check (hours > 0),
  status public.lesson_status not null default 'completed',
  teacher_rate numeric(12,2), teacher_currency text,
  student_rate numeric(12,2), student_currency text,
  start_time time, end_time time, notes text,
  created_at timestamptz not null default now());
create index on public.lessons(date); create index on public.lessons(teacher_id); create index on public.lessons(student_id);

create table public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text, email text,
  teacher_id uuid references public.teachers(id) on delete set null,
  created_at timestamptz not null default now());
create table public.user_roles(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null, unique(user_id, role));

grant select, insert, update, delete on public.teachers, public.students, public.subjects, public.subject_students, public.timetable_entries, public.lessons to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant all on public.teachers, public.students, public.subjects, public.subject_students, public.timetable_entries, public.lessons, public.profiles, public.user_roles to service_role;

create or replace function public.has_role(_user_id uuid, _role public.app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role=_role) $$;
create or replace function public.is_staff(_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id) $$;
create or replace function public.can_edit(_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role in ('admin','coordinator')) $$;
create or replace function public.my_teacher_id() returns uuid
language sql stable security definer set search_path = public as $$
  select teacher_id from public.profiles where id = auth.uid() $$;
create or replace function public.is_teacher_only(_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id,'teacher') and not exists(select 1 from public.user_roles where user_id=_user_id and role <> 'teacher') $$;

alter table public.teachers enable row level security;
alter table public.students enable row level security;
alter table public.subjects enable row level security;
alter table public.subject_students enable row level security;
alter table public.timetable_entries enable row level security;
alter table public.lessons enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

-- reference tables: any team member reads; admin/coordinator write
create policy "staff read" on public.teachers for select to authenticated using (public.is_staff(auth.uid()));
create policy "editors write" on public.teachers for all to authenticated using (public.can_edit(auth.uid())) with check (public.can_edit(auth.uid()));
create policy "staff read" on public.students for select to authenticated using (public.is_staff(auth.uid()));
create policy "editors write" on public.students for all to authenticated using (public.can_edit(auth.uid())) with check (public.can_edit(auth.uid()));
create policy "staff read" on public.subjects for select to authenticated using (public.is_staff(auth.uid()));
create policy "editors write" on public.subjects for all to authenticated using (public.can_edit(auth.uid())) with check (public.can_edit(auth.uid()));
create policy "staff read" on public.subject_students for select to authenticated using (public.is_staff(auth.uid()));
create policy "editors write" on public.subject_students for all to authenticated using (public.can_edit(auth.uid())) with check (public.can_edit(auth.uid()));

-- lessons & schedule: teachers see only their own
create policy "read" on public.timetable_entries for select to authenticated using (
  public.is_staff(auth.uid()) and (not public.is_teacher_only(auth.uid()) or teacher_id = public.my_teacher_id()));
create policy "editors write" on public.timetable_entries for all to authenticated using (public.can_edit(auth.uid())) with check (public.can_edit(auth.uid()));
create policy "read" on public.lessons for select to authenticated using (
  public.is_staff(auth.uid()) and (not public.is_teacher_only(auth.uid()) or teacher_id = public.my_teacher_id()));
create policy "editors write" on public.lessons for all to authenticated using (public.can_edit(auth.uid())) with check (public.can_edit(auth.uid()));

create policy "own or admin read" on public.profiles for select to authenticated using (id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own name" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and teacher_id is not distinct from public.my_teacher_id());
create policy "admin update" on public.profiles for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "own or admin read" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

-- first account becomes admin; later accounts wait for an admin to assign a role
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)), new.email);
  if not exists (select 1 from public.user_roles where role='admin') then
    insert into public.user_roles(user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- admin-only role management (keeps at least one admin)
create or replace function public.set_user_role(_user_id uuid, _role public.app_role, _teacher_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Administrator access required'; end if;
  if public.has_role(_user_id,'admin') and _role <> 'admin' and (select count(*) from public.user_roles where role='admin') <= 1 then
    raise exception 'The last administrator cannot be demoted'; end if;
  if _role = 'teacher' and _teacher_id is null then raise exception 'Link this account to a teacher'; end if;
  delete from public.user_roles where user_id=_user_id;
  insert into public.user_roles(user_id, role) values (_user_id, _role);
  update public.profiles set teacher_id = case when _role='teacher' then _teacher_id else null end where id=_user_id;
end $$;
create or replace function public.remove_user_access(_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Administrator access required'; end if;
  if public.has_role(_user_id,'admin') and (select count(*) from public.user_roles where role='admin') <= 1 then
    raise exception 'The last administrator cannot be removed'; end if;
  delete from public.user_roles where user_id=_user_id;
end $$;
revoke execute on function public.set_user_role, public.remove_user_access from public, anon;
grant execute on function public.set_user_role, public.remove_user_access to authenticated;