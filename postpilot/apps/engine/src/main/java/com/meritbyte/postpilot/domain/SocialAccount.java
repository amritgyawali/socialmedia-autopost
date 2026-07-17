package com.meritbyte.postpilot.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "social_accounts", uniqueConstraints = @UniqueConstraint(columnNames = {"platform", "external_id"}))
public class SocialAccount {
    @Id public UUID id = UUID.randomUUID();
    @Enumerated(EnumType.STRING) @Column(nullable = false) public Platform platform;
    @Column(name = "external_id", nullable = false) public String externalId;
    @Column(name = "display_name", nullable = false) public String displayName;
    @Column(name = "access_token_enc", nullable = false) public byte[] accessTokenEnc;
    @Column(name = "refresh_token_enc") public byte[] refreshTokenEnc;
    @Column(name = "expires_at") public Instant expiresAt;
    @Column(columnDefinition = "text") public String scopes;
    @Column(name = "token_type") public String tokenType;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public AccountStatus status = AccountStatus.ACTIVE;
    @Column(name = "metadata_json", columnDefinition = "text") public String metadataJson;
    @Column(name = "created_at", nullable = false) public Instant createdAt = Instant.now();
    @Column(name = "updated_at", nullable = false) public Instant updatedAt = Instant.now();

    @PreUpdate public void touch() { updatedAt = Instant.now(); }
}
