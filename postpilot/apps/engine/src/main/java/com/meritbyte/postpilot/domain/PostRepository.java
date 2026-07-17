package com.meritbyte.postpilot.domain;

import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

public interface PostRepository extends JpaRepository<PostEntity, UUID> {
    @EntityGraph(attributePaths = {"variants", "variants.media", "variants.account"})
    @Query("select distinct p from PostEntity p where (:from is null or p.scheduledAt >= :from) and (:to is null or p.scheduledAt < :to) and (:status is null or p.status = :status) order by p.scheduledAt asc, p.createdAt desc")
    List<PostEntity> search(@Param("from") Instant from, @Param("to") Instant to, @Param("status") PostStatus status);

    @EntityGraph(attributePaths = {"variants", "variants.media", "variants.account"})
    @Query("select distinct p from PostEntity p where p.contentDate = :date " +
            "order by coalesce(p.scheduledAt, p.createdAt) asc")
    List<PostEntity> findToday(@Param("date") LocalDate date);

    @EntityGraph(attributePaths = {"variants", "variants.media", "variants.account"})
    @Query("select p from PostEntity p where p.id = :id")
    Optional<PostEntity> findDetailedById(@Param("id") UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from PostEntity p where p.id = :id")
    Optional<PostEntity> findDetailedForUpdate(@Param("id") UUID id);

    List<PostEntity> findByScheduledAtLessThanEqualAndStatusIn(Instant now, Collection<PostStatus> statuses);
}
