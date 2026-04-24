-- Seed: global default categories (trip_id is null)
-- Idempotent: only inserts when the global default with that name doesn't already exist.

insert into public.categories (name, emoji, color, sort_order, trip_id, created_by)
select v.name, v.emoji, v.color, v.sort_order, null, null
from (values
    ('Food',       '🍽️', '#FDCB6E', 0),
    ('Transport',  '🚗', '#74B9FF', 1),
    ('Hotel',      '🏨', '#6C5CE7', 2),
    ('Flight',     '✈️', '#A29BFE', 3),
    ('Coffee',     '☕', '#C08B5C', 4),
    ('Shopping',   '🛍️', '#FF8ED4', 5),
    ('Activities', '🎫', '#00B894', 6),
    ('Other',      '📦', '#5C6078', 7)
) as v(name, emoji, color, sort_order)
where not exists (
    select 1 from public.categories c
    where c.trip_id is null and c.name = v.name
);
