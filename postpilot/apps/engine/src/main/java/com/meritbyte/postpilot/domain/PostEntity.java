package com.meritbyte.postpilot.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "posts")
public class PostEntity {
    @Id public UUID id = UUID.randomUUID();
    public String topic;
    @Column(name = "content_date", nullable = false) public LocalDate contentDate;
    @Column(name = "scheduled_at") public Instant scheduledAt;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public PostStatus status = PostStatus.DRAFT;
    @Column(name = "created_at", nullable = false) public Instant createdAt = Instant.now();
    @Column(name = "updated_at", nullable = false) public Instant updatedAt = Instant.now();
    @OneToMany(mappedBy = "post", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("createdAt ASC")
    public List<PostVariant> variants = new ArrayList<>();

    public void addVariant(PostVariant variant) {
        variant.post = this;
        variants.add(variant);
    }
    @PreUpdate public void touch() { updatedAt = Instant.now(); }
}
