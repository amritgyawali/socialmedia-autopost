package com.meritbyte.postpilot.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "post_variants")
public class PostVariant {
    @Id public UUID id = UUID.randomUUID();
    @ManyToOne(optional = false) @JoinColumn(name = "post_id") public PostEntity post;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public Platform platform;
    @ManyToOne @JoinColumn(name = "social_account_id") public SocialAccount account;
    public String title;
    @Column(nullable = false, columnDefinition = "text") public String caption;
    @Column(columnDefinition = "text") public String hashtags;
    @ManyToOne @JoinColumn(name = "media_id") public MediaAsset media;
    @Column(name = "created_at", nullable = false) public Instant createdAt = Instant.now();
}
