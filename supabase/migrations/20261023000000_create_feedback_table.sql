-- Beta feedback (Profile > Send Feedback, src/lib/feedback.js).
-- Insert-only for signed-in users: no select/update/delete policy, so rows are readable only with
-- the service-role key (SQL editor, api/admin-metrics.js). Safe to re-run.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  type text not null check (type in ('bug', 'feature', 'rating')),
  message text not null default '' check (char_length(message) <= 1000),
  rating int check (rating between 1 and 5),
  page text check (char_length(page) <= 100),
  created_at timestamptz not null default now(),
  -- Mirrors validateFeedback(): bugs and feature requests need a message, and only a rating
  -- carries a star value.
  constraint feedback_message_required check (type = 'rating' or char_length(btrim(message)) > 0),
  constraint feedback_rating_only_for_ratings check (type = 'rating' or rating is null)
);

create index if not exists feedback_user_id_idx on public.feedback (user_id);
create index if not exists feedback_created_at_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;

drop policy if exists "Users can submit their own feedback" on public.feedback;
create policy "Users can submit their own feedback" on public.feedback
  for insert to authenticated
  with check (auth.uid() = user_id);
