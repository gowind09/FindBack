-- Grant President rank to the already-registered account.
update public.user_roles
set role = 'president'
where user_id = (
    select id
    from auth.users
    where lower(email) = 'govindpandit295@gmail.com'
    limit 1
);
