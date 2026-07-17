CREATE TABLE social_accounts (
    id UUID PRIMARY KEY,
    platform VARCHAR(32) NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    access_token_enc BYTEA NOT NULL,
    refresh_token_enc BYTEA,
    expires_at TIMESTAMPTZ,
    scopes TEXT,
    token_type VARCHAR(32),
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    metadata_json TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_social_account UNIQUE (platform, external_id)
);

CREATE TABLE media_assets (
    id UUID PRIMARY KEY,
    r2_key VARCHAR(1024) NOT NULL UNIQUE,
    public_url TEXT NOT NULL,
    kind VARCHAR(16) NOT NULL,
    content_type VARCHAR(255) NOT NULL,
    original_name VARCHAR(512),
    size_bytes BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE posts (
    id UUID PRIMARY KEY,
    topic VARCHAR(500),
    scheduled_at TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE post_variants (
    id UUID PRIMARY KEY,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    platform VARCHAR(32) NOT NULL,
    social_account_id UUID REFERENCES social_accounts(id),
    title VARCHAR(500),
    caption TEXT NOT NULL,
    hashtags TEXT,
    media_id UUID REFERENCES media_assets(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_variant_account ON post_variants(post_id, platform, COALESCE(social_account_id, '00000000-0000-0000-0000-000000000000'));

CREATE TABLE publish_results (
    id BIGSERIAL PRIMARY KEY,
    variant_id UUID NOT NULL REFERENCES post_variants(id) ON DELETE CASCADE,
    attempt INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL,
    platform_post_id TEXT,
    error TEXT,
    posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    next_attempt_at TIMESTAMPTZ,
    idempotency_key VARCHAR(255) NOT NULL,
    CONSTRAINT uq_result_attempt UNIQUE(variant_id, attempt)
);
CREATE INDEX ix_results_retry ON publish_results(status, next_attempt_at);
CREATE INDEX ix_posts_schedule ON posts(status, scheduled_at);

CREATE TABLE oauth_states (
    id UUID PRIMARY KEY,
    state_hash VARCHAR(64) NOT NULL UNIQUE,
    platform VARCHAR(32) NOT NULL,
    code_verifier TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
