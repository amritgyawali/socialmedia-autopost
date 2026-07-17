package com.meritbyte.postpilot.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.time.ZoneId;
import java.util.List;

@ConfigurationProperties(prefix = "postpilot")
public record PostPilotProperties(
        ZoneId timeZone,
        Security security,
        Vault vault,
        R2 r2,
        OAuth oauth,
        Telegram telegram,
        Publishing publishing
) {
    public record Security(String bearerSecret, boolean allowRawBearer, String issuer, String audience,
                           Duration maxJwtLifetime, List<String> allowedOrigins) {}
    public record Vault(String key) {}
    public record R2(String accountId, String accessKeyId, String secretAccessKey,
                     String bucket, String publicBaseUrl, Duration presignTtl, long maxUploadBytes) {}
    public record OAuth(String redirectBase, String cockpitUrl, Provider meta, Provider linkedin, Provider x) {
        public record Provider(String clientId, String clientSecret, String apiVersion) {}
    }
    public record Telegram(String botToken, String chatId) {}
    public record Publishing(int maxAttempts, Duration httpTimeout, Duration instagramPollInterval,
                             Duration instagramPollTimeout, long maxInMemoryMediaBytes) {}
}
