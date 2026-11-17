-- Apply once to an existing Supabase project. No service key belongs in this file.
begin;

create table public.clothing_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  metadata jsonb not null check (jsonb_typeof(metadata) = 'object'),
  photo_asset_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table public.clothing_assets (
  user_id uuid not null,
  item_id uuid not null,
  id uuid not null,
  original_key text not null unique,
  cutout_key text unique,
  thumbnail_key text unique,
  status text not null default 'queued' check (status in ('queued','processing','ready','failed')),
  pipeline_version text not null default 'birefnet-lite-alpha-lanczos-v1',
  width integer check (width > 0), height integer check (height > 0),
  warning text check (warning is null or warning = 'low_resolution'),
  error_code text,
  attempts integer not null default 0 check (attempts between 0 and 3),
  lease_token uuid, lease_expires_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (user_id, id), unique (user_id, item_id, id),
  foreign key (user_id, item_id) references public.clothing_items(user_id, id) on delete cascade,
  check (original_key = user_id::text || '/' || item_id::text || '/' || id::text || '/original.png'),
  check (status <> 'ready' or (cutout_key is not null and thumbnail_key is not null and width is not null and height is not null))
);
alter table public.clothing_items add constraint current_photo_same_owner_and_item
  foreign key (user_id, id, photo_asset_id) references public.clothing_assets(user_id, item_id, id)
  deferrable initially deferred;
create index clothing_items_owner_created on public.clothing_items(user_id, created_at desc);
create index clothing_assets_queue on public.clothing_assets(status, lease_expires_at, created_at);
alter table public.clothing_items enable row level security;
alter table public.clothing_assets enable row level security;
create policy wardrobe_owner on public.clothing_items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy asset_owner_read on public.clothing_assets for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.clothing_items, public.clothing_assets from anon, authenticated;
grant select, delete on public.clothing_items to authenticated;
grant insert (user_id, id, metadata), update (metadata, updated_at) on public.clothing_items to authenticated;
grant select on public.clothing_assets to authenticated;
grant all on public.clothing_items, public.clothing_assets to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('wardrobe-images','wardrobe-images',false,67108864,array['image/png','image/webp'])
on conflict(id) do nothing;
-- Fail rather than silently change a bucket that may already belong to another feature.
do $$ begin
  if exists(select 1 from storage.buckets where id='wardrobe-images' and public) then
    raise exception 'wardrobe-images must be private; review existing bucket before migrating';
  end if;
end $$;
create policy wardrobe_photo_owner_read on storage.objects for select to authenticated
  using (bucket_id='wardrobe-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy wardrobe_original_owner_upload on storage.objects for insert to authenticated
  with check (bucket_id='wardrobe-images' and (storage.foldername(name))[1]=(select auth.uid())::text
    and array_length(storage.foldername(name),1)=3 and storage.filename(name)='original.png');
create policy wardrobe_photo_owner_delete on storage.objects for delete to authenticated
  using (bucket_id='wardrobe-images' and (storage.foldername(name))[1]=(select auth.uid())::text);

create function public.enqueue_clothing_photo(p_item_id uuid, p_asset_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_key text;
begin
  if v_user is null or not exists(select 1 from public.clothing_items where user_id=v_user and id=p_item_id) then
    raise exception 'Item not found' using errcode='P0002';
  end if;
  v_key := v_user::text || '/' || p_item_id::text || '/' || p_asset_id::text || '/original.png';
  if not exists(select 1 from storage.objects where bucket_id='wardrobe-images' and name=v_key) then
    raise exception 'Original upload missing';
  end if;
  insert into public.clothing_assets(user_id,item_id,id,original_key) values(v_user,p_item_id,p_asset_id,v_key)
    on conflict(user_id,id) do nothing;
  if not exists(select 1 from public.clothing_assets where user_id=v_user and item_id=p_item_id and id=p_asset_id) then
    raise exception 'Asset conflict';
  end if;
  update public.clothing_items set photo_asset_id=p_asset_id, updated_at=now() where user_id=v_user and id=p_item_id;
  return p_asset_id;
end $$;

create function public.retry_clothing_photo(p_item_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.clothing_assets a set status='queued', attempts=0, error_code=null, lease_token=null, lease_expires_at=null, updated_at=now()
    from public.clothing_items i where i.user_id=auth.uid() and i.id=p_item_id and a.user_id=i.user_id
    and a.item_id=i.id and a.id=i.photo_asset_id and a.status='failed';
  return found;
end $$;

create function public.claim_clothing_photo() returns setof public.clothing_assets
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Worker only'; end if;
  update public.clothing_assets set status='failed', error_code='lease_expired', lease_token=null, lease_expires_at=null, updated_at=now()
    where status='processing' and lease_expires_at < now() and attempts >= 3;
  return query with next_job as (
    select user_id,id from public.clothing_assets
    where attempts < 3 and (status='queued' or (status='processing' and lease_expires_at < now()))
    order by created_at for update skip locked limit 1
  ) update public.clothing_assets a set status='processing', attempts=a.attempts+1,
    lease_token=gen_random_uuid(), lease_expires_at=now()+interval '10 minutes', updated_at=now()
    from next_job j where a.user_id=j.user_id and a.id=j.id returning a.*;
end $$;

create function public.complete_clothing_photo(p_asset_id uuid, p_lease_token uuid, p_width integer, p_height integer, p_warning text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Worker only'; end if;
  update public.clothing_assets set status='ready',
    cutout_key=user_id::text||'/'||item_id::text||'/'||id::text||'/runs/'||p_lease_token::text||'/cutout.webp',
    thumbnail_key=user_id::text||'/'||item_id::text||'/'||id::text||'/runs/'||p_lease_token::text||'/thumbnail.webp',
    width=p_width, height=p_height, warning=p_warning, error_code=null, lease_expires_at=null, updated_at=now()
    where id=p_asset_id and status='processing' and lease_token=p_lease_token;
  return found;
end $$;

create function public.fail_clothing_photo(p_asset_id uuid, p_lease_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Worker only'; end if;
  update public.clothing_assets set status=case when attempts < 3 then 'queued' else 'failed' end,
    error_code='processing_failed', lease_token=null, lease_expires_at=null, updated_at=now()
    where id=p_asset_id and status='processing' and lease_token=p_lease_token;
  return found;
end $$;

revoke all on function public.enqueue_clothing_photo(uuid,uuid), public.retry_clothing_photo(uuid),
  public.claim_clothing_photo(), public.complete_clothing_photo(uuid,uuid,integer,integer,text),
  public.fail_clothing_photo(uuid,uuid) from public, anon, authenticated;
grant execute on function public.enqueue_clothing_photo(uuid,uuid), public.retry_clothing_photo(uuid) to authenticated;
grant execute on function public.claim_clothing_photo(), public.complete_clothing_photo(uuid,uuid,integer,integer,text), public.fail_clothing_photo(uuid,uuid) to service_role;
commit;
