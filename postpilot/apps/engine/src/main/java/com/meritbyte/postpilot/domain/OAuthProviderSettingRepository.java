package com.meritbyte.postpilot.domain;

import org.springframework.data.jpa.repository.JpaRepository;

public interface OAuthProviderSettingRepository extends JpaRepository<OAuthProviderSetting, String> {
}
