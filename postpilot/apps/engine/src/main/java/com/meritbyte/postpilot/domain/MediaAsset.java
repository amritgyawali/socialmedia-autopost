package com.meritbyte.postpilot.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "media_assets")
public class MediaAsset {
    @Id public UUID id = UUID.randomUUID();
    @Column(name = "r2_key", nullable = false, unique = true) public String r2Key;
    @Column(name = "public_url", nullable = false, columnDefinition = "text") public String publicUrl;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public MediaKind kind;
    @Column(name = "content_type", nullable = false) public String contentType;
    @Column(name = "original_name") public String originalName;
    @Column(name = "size_bytes") public Long sizeBytes;
    @Column(name = "created_at", nullable = false) public Instant createdAt = Instant.now();
}
