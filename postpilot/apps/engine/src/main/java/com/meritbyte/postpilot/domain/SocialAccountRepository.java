package com.meritbyte.postpilot.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;

public interface SocialAccountRepository extends JpaRepository<SocialAccount, UUID> {
    List<SocialAccount> findAllByOrderByPlatformAscDisplayNameAsc();
    List<SocialAccount> findByPlatformAndStatusOrderByCreatedAtAsc(Platform platform, AccountStatus status);
    Optional<SocialAccount> findByPlatformAndExternalId(Platform platform, String externalId);
}
