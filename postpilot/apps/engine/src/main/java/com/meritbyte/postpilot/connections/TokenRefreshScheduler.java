package com.meritbyte.postpilot.connections;

import com.meritbyte.postpilot.domain.*;
import com.meritbyte.postpilot.notify.TelegramNotifier;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.time.*;

@Component
public class TokenRefreshScheduler {
    private final SocialAccountRepository accounts;
    private final OAuthService oauth;
    private final TelegramNotifier notifier;
    public TokenRefreshScheduler(SocialAccountRepository accounts, OAuthService oauth, TelegramNotifier notifier) {
        this.accounts = accounts; this.oauth = oauth; this.notifier = notifier;
    }

    @Scheduled(fixedDelayString = "${TOKEN_REFRESH_INTERVAL:PT1H}", initialDelayString = "PT2M")
    public void refreshExpiring() {
        Instant threshold = Instant.now().plus(Duration.ofHours(24));
        for (SocialAccount account : accounts.findAll()) {
            if (account.expiresAt == null || account.expiresAt.isAfter(threshold)) continue;
            boolean expired = account.expiresAt.isBefore(Instant.now());
            if (account.refreshTokenEnc != null && oauth.refresh(account)) continue;
            if (expired) {
                account.status = AccountStatus.EXPIRED;
                accounts.save(account);
                notifier.send("⚠️ PostPilot: " + account.platform.wire() + " token expired; reconnect " + account.displayName);
            } else {
                // Many LinkedIn grants have no refresh token. Keep the still-valid access token active.
                notifier.send("⏳ PostPilot: " + account.platform.wire() + " token for " + account.displayName +
                        " expires within 24 hours; reconnect soon");
            }
        }
    }
}
