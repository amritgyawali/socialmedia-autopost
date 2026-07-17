package com.meritbyte.postpilot.connections;

import com.meritbyte.postpilot.api.ApiModels.ChannelDto;
import com.meritbyte.postpilot.domain.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api/v1")
public class ChannelController {
    private final SocialAccountRepository accounts;
    public ChannelController(SocialAccountRepository accounts) { this.accounts = accounts; }

    @GetMapping("/channels")
    @Transactional
    public List<ChannelDto> channels() {
        List<SocialAccount> all = accounts.findAllByOrderByPlatformAscDisplayNameAsc();
        for (SocialAccount a : all) {
            if (a.expiresAt != null && a.expiresAt.isBefore(Instant.now()) && a.status == AccountStatus.ACTIVE) {
                a.status = AccountStatus.EXPIRED;
            }
        }
        return all.stream().map(a -> new ChannelDto(a.id, a.platform, a.externalId, a.displayName,
                a.status, a.expiresAt, "/api/v1/oauth/" + a.platform.wire() + "/start", a.scopes)).toList();
    }

    @GetMapping("/platforms")
    public List<Map<String, Object>> platforms() {
        return Arrays.stream(Platform.values()).map(p -> Map.<String, Object>of(
                "platform", p.wire(),
                "publishingMode", p.isSupportedForPublishing() ? "api" : "native_scheduler",
                "supported", p.isSupportedForPublishing(),
                "message", p.isSupportedForPublishing() ? "Automated publishing is supported" :
                        "v1 intentionally uses the platform's native scheduler until app audit/verification is approved"
        )).toList();
    }
}
