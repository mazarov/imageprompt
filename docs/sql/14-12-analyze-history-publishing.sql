-- Publish selected analyze-history photos as public prompt cards.
-- Apply before deploying the analyze-history publish endpoint.

alter table public.analyze_history
  add column if not exists ugc_card_id uuid
  references public.prompt_cards (id) on delete set null;

create index if not exists analyze_history_ugc_card_id_idx
  on public.analyze_history (ugc_card_id)
  where ugc_card_id is not null;

comment on column public.analyze_history.ugc_card_id is
  'Draft or published prompt card created by an admin from this analyzed photo.';
