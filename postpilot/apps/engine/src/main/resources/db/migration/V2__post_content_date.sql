ALTER TABLE posts ADD COLUMN content_date DATE;

-- Preserve the original engine default zone for rows created before content_date existed.
UPDATE posts
SET content_date = COALESCE(
    (scheduled_at AT TIME ZONE 'Asia/Kathmandu')::date,
    (created_at AT TIME ZONE 'Asia/Kathmandu')::date
);

ALTER TABLE posts ALTER COLUMN content_date SET NOT NULL;
CREATE INDEX ix_posts_content_date ON posts(content_date);
