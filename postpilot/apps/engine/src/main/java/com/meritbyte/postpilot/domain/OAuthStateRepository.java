package com.meritbyte.postpilot.domain;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.Instant;
import java.util.*;
public interface OAuthStateRepository extends JpaRepository<OAuthState, UUID> {
    Optional<OAuthState> findByStateHash(String stateHash);
    long deleteByExpiresAtBefore(Instant cutoff);
}
