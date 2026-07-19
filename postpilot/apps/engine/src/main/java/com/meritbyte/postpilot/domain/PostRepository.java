package com.meritbyte.postpilot.domain;

import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

public interface PostRepository extends JpaRepository<PostEntity, UUID> {
    // PostgreSQL cannot infer a type for a bare "? is null" comparison, so the nullable
    // bounds are cast explicitly. The status filter uses "in :statuses" (callers pass every
    // status when unfiltered) to keep an untyped enum parameter out of the SQL entirely.
    @EntityGraph(attributePaths = {"variants", "variants.media", "variants.account"})
    @Query("select p from PostEntity p where (cast(:from as Instant) is null or p.scheduledAt >= :from) " +
            "and (cast(:to as Instant) is null or p.scheduledAt < :to) " +
            "and p.status in :statuses order by p.scheduledAt asc, p.createdAt desc")
    List<PostEntity> search(@Param("from") Instant from, @Param("to") Instant to,
                            @Param("statuses") Collection<PostStatus> statuses);

    // No "distinct": Hibernate 6 already de-duplicates fetch-joined roots, and passing
    // DISTINCT to PostgreSQL breaks the coalesce() ordering (which is not in the select list).
    @EntityGraph(attributePaths = {"variants", "variants.media", "variants.account"})
    @Query("select p from PostEntity p where p.contentDate = :date " +
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
