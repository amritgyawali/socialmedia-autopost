package com.meritbyte.postpilot.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "oauth_states")
public class OAuthState {
    @Id public UUID id = UUID.randomUUID();
    @Column(name = "state_hash", nullable = false, unique = true) public String stateHash;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public Platform platform;
    @Column(name = "code_verifier", columnDefinition = "text") public String codeVerifier;
    @Column(name = "expires_at", nullable = false) public Instant expiresAt;
    @Column(name = "created_at", nullable = false) public Instant createdAt = Instant.now();
}
