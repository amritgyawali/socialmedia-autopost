package com.meritbyte.postpilot.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "oauth_provider_settings")
public class OAuthProviderSetting {
    @Id public String provider;
    @Column(name = "client_id", nullable = false, columnDefinition = "text") public String clientId;
    @Column(name = "client_secret_enc") public byte[] clientSecretEnc;
    @Column(name = "updated_at", nullable = false) public Instant updatedAt = Instant.now();
}
