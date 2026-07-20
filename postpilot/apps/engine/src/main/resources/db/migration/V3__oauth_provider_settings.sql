-- OAuth provider app credentials managed from the cockpit UI. A row here wins
-- over the matching environment variables; the secret is AES-GCM encrypted with
-- the same vault key as social tokens. client_secret_enc is nullable because X
-- supports public PKCE clients without a secret.
create table oauth_provider_settings (
    provider text primary key check (provider in ('meta', 'linkedin', 'x')),
    client_id text not null,
    client_secret_enc bytea,
    updated_at timestamptz not null default now()
);
