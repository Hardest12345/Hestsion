\set ON_ERROR_STOP on
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
insert into public.clothing_items(user_id,id,metadata) values(auth.uid(),'33333333-3333-4333-8333-333333333333','{}');
insert into storage.objects(bucket_id,name) values('wardrobe-images',auth.uid()::text||'/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/original.png');
select public.enqueue_clothing_photo('33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444');
do $$ begin
  if (select count(*) from public.clothing_assets) <> 1 then raise exception 'A cannot read own asset'; end if;
  begin perform public.claim_clothing_photo(); raise exception 'Authenticated user claimed a worker job'; exception when insufficient_privilege then null; end;
  begin update public.clothing_assets set status='ready'; raise exception 'User modified worker state'; exception when insufficient_privilege then null; end;
end $$;
\echo 'PASS: owner can upload/enqueue; worker-only operations denied'

select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
  if exists(select 1 from public.clothing_items) or exists(select 1 from public.clothing_assets) or exists(select 1 from storage.objects) then raise exception 'B can see A data'; end if;
  begin insert into public.clothing_items(user_id,id,metadata) values('11111111-1111-4111-8111-111111111111',gen_random_uuid(),'{}'); raise exception 'B inserted A item'; exception when insufficient_privilege then null; end;
  begin insert into storage.objects(bucket_id,name) values('wardrobe-images','11111111-1111-4111-8111-111111111111/x/y/original.png'); raise exception 'B uploaded into A folder'; exception when insufficient_privilege then null; end;
  begin perform public.enqueue_clothing_photo('33333333-3333-4333-8333-333333333333',gen_random_uuid()); raise exception 'B enqueued A photo'; exception when no_data_found then null; end;
end $$;
insert into public.clothing_items(user_id,id,metadata) values(auth.uid(),'55555555-5555-4555-8555-555555555555','{}');
insert into storage.objects(bucket_id,name) values('wardrobe-images',auth.uid()::text||'/55555555-5555-4555-8555-555555555555/66666666-6666-4666-8666-666666666666/original.png');
select public.enqueue_clothing_photo('55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666');
\echo 'PASS: B cannot read, reference, enqueue, or upload as A'

reset role;
do $$ begin
  begin
    update public.clothing_items set photo_asset_id='66666666-6666-4666-8666-666666666666' where user_id='11111111-1111-4111-8111-111111111111';
    set constraints all immediate;
    raise exception 'Cross-owner asset FK accepted';
  exception when foreign_key_violation then null;
  end;
end $$;
\echo 'PASS: composite FK rejects cross-owner photo even with RLS bypass'

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$ declare job public.clothing_assets; accepted boolean; begin
  select * into job from public.claim_clothing_photo();
  if job.status <> 'processing' or job.attempts <> 1 or job.lease_token is null then raise exception 'Worker claim failed'; end if;
  accepted := public.complete_clothing_photo(job.id,gen_random_uuid(),128,160,null);
  if accepted then raise exception 'Wrong lease accepted'; end if;
  accepted := public.complete_clothing_photo(job.id,job.lease_token,128,160,'low_resolution');
  if not accepted then raise exception 'Correct lease rejected'; end if;
  if not exists(select 1 from public.clothing_assets where id=job.id and status='ready' and cutout_key like '%/runs/%/cutout.webp') then raise exception 'Ready state missing'; end if;
end $$;
\echo 'PASS: worker lease gate and completion'

reset role;
set constraints all deferred;
delete from public.clothing_items where user_id='11111111-1111-4111-8111-111111111111';
set constraints all immediate;
do $$ begin if exists(select 1 from public.clothing_assets where user_id='11111111-1111-4111-8111-111111111111') then raise exception 'Assets did not cascade'; end if; end $$;
\echo 'PASS: delete cascades without orphan database asset rows'
rollback;
