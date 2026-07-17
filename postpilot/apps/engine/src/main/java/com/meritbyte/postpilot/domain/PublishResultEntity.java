package com.meritbyte.postpilot.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "publish_results", uniqueConstraints = @UniqueConstraint(columnNames = {"variant_id", "attempt"}))
public class PublishResultEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @ManyToOne(optional = false) @JoinColumn(name = "variant_id") public PostVariant variant;
    @Column(nullable = false) public int attempt;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public PublishStatus status;
    @Column(name = "platform_post_id", columnDefinition = "text") public String platformPostId;
    @Column(columnDefinition = "text") public String error;
    @Column(name = "posted_at", nullable = false) public Instant postedAt = Instant.now();
    @Column(name = "next_attempt_at") public Instant nextAttemptAt;
    @Column(name = "idempotency_key", nullable = false) public String idempotencyKey;
}
