package com.meritbyte.postpilot.domain;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface MediaAssetRepository extends JpaRepository<MediaAsset, UUID> {
    Optional<MediaAsset> findByR2Key(String r2Key);
}
