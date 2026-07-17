package com.meritbyte.postpilot.domain;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.*;
public interface PostVariantRepository extends JpaRepository<PostVariant, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from PostVariant v where v.id = :id")
    Optional<PostVariant> findDetailedById(@Param("id") UUID id);
}
