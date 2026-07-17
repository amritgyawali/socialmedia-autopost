package com.meritbyte.postpilot.domain;

import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.Instant;
import java.util.*;

public interface PublishResultRepository extends JpaRepository<PublishResultEntity, Long> {
    boolean existsByVariant_Post_Id(UUID postId);
    boolean existsByVariant_IdAndStatus(UUID variantId, PublishStatus status);
    Optional<PublishResultEntity> findFirstByVariant_IdOrderByAttemptDesc(UUID variantId);
    List<PublishResultEntity> findByVariant_Post_IdOrderByVariant_IdAscAttemptDesc(UUID postId);
    List<PublishResultEntity> findByStatusAndPostedAtBefore(PublishStatus status, Instant before);
    @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from PublishResultEntity r where r.id = :id")
    Optional<PublishResultEntity> findLockedDetailedById(@Param("id") Long id);
    @EntityGraph(attributePaths = {"variant", "variant.post"})
    List<PublishResultEntity> findByStatusAndNextAttemptAtLessThanEqualAndAttemptLessThan(PublishStatus status, Instant at, int maxAttempt);
    @EntityGraph(attributePaths = {"variant", "variant.post"})
    @Query("select r from PublishResultEntity r where (:platform is null or r.variant.platform = :platform) and (:status is null or r.status = :status) order by r.postedAt desc")
    Page<PublishResultEntity> logs(@Param("platform") Platform platform, @Param("status") PublishStatus status, Pageable pageable);
}
