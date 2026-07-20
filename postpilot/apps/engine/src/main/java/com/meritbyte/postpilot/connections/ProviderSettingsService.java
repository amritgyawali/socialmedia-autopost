package com.meritbyte.postpilot.connections;

import com.meritbyte.postpilot.api.ApiModels.OAuthAppStatus;
import com.meritbyte.postpilot.config.PostPilotProperties;
import com.meritbyte.postpilot.domain.*;
import com.meritbyte.postpilot.vault.TokenVault;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/**
 * OAuth provider app credentials, editable from the cockpit. A database row
 * (secret encrypted with the vault key) takes precedence over the matching
 * environment variables so first-time setup never needs SSH or a restart.
 */
@Service
public class ProviderSettingsService {
    public static final List<String> PROVIDERS = List.of("meta", "linkedin", "x");

    public record ResolvedProvider(String clientId, String clientSecret, String apiVersion) {}

    private final OAuthProviderSettingRepository settings;
    private final PostPilotProperties properties;
    private final TokenVault vault;

    public ProviderSettingsService(OAuthProviderSettingRepository settings,
                                   PostPilotProperties properties, TokenVault vault) {
        this.settings = settings; this.properties = properties; this.vault = vault;
    }

    public static String groupFor(Platform platform) {
        return switch (platform) {
            case FACEBOOK, INSTAGRAM -> "meta";
            case LINKEDIN -> "linkedin";
            case X -> "x";
            default -> null;
        };
    }

    @Transactional(readOnly = true)
    public ResolvedProvider resolve(Platform platform) {
        String group = groupFor(platform);
        if (group == null) throw new IllegalArgumentException(platform.wire() + " has no OAuth provider app");
        var env = envProvider(group);
        return settings.findById(group)
                .filter(row -> row.clientId != null && !row.clientId.isBlank())
                .map(row -> new ResolvedProvider(row.clientId,
                        row.clientSecretEnc == null ? null : vault.decrypt(row.clientSecretEnc), env.apiVersion()))
                .orElseGet(() -> new ResolvedProvider(env.clientId(), env.clientSecret(), env.apiVersion()));
    }

    @Transactional(readOnly = true)
    public List<OAuthAppStatus> status() {
        return PROVIDERS.stream().map(this::statusFor).toList();
    }

    @Transactional
    public OAuthAppStatus save(String provider, String clientId, String clientSecret) {
        requireKnown(provider);
        if (clientId == null || clientId.isBlank()) throw new IllegalArgumentException("Client ID is required");
        if (!"x".equals(provider) && (clientSecret == null || clientSecret.isBlank())) {
            throw new IllegalArgumentException("Client secret is required for " + provider);
        }
        OAuthProviderSetting row = settings.findById(provider).orElseGet(() -> {
            OAuthProviderSetting created = new OAuthProviderSetting();
            created.provider = provider;
            return created;
        });
        row.clientId = clientId.trim();
        row.clientSecretEnc = clientSecret == null || clientSecret.isBlank() ? null : vault.encrypt(clientSecret.trim());
        row.updatedAt = Instant.now();
        settings.save(row);
        return statusFor(provider);
    }

    @Transactional
    public void clear(String provider) {
        requireKnown(provider);
        settings.deleteById(provider);
    }

    private OAuthAppStatus statusFor(String provider) {
        var row = settings.findById(provider).filter(item -> item.clientId != null && !item.clientId.isBlank());
        if (row.isPresent()) {
            return new OAuthAppStatus(provider, true, "app", hint(row.get().clientId));
        }
        var env = envProvider(provider);
        boolean envConfigured = env.clientId() != null && !env.clientId().isBlank();
        return new OAuthAppStatus(provider, envConfigured, envConfigured ? "env" : "none",
                envConfigured ? hint(env.clientId()) : null);
    }

    private PostPilotProperties.OAuth.Provider envProvider(String provider) {
        return switch (provider) {
            case "meta" -> properties.oauth().meta();
            case "linkedin" -> properties.oauth().linkedin();
            case "x" -> properties.oauth().x();
            default -> throw new IllegalArgumentException("Unknown OAuth provider: " + provider);
        };
    }

    private void requireKnown(String provider) {
        if (!PROVIDERS.contains(provider)) throw new IllegalArgumentException("Unknown OAuth provider: " + provider);
    }

    private String hint(String clientId) {
        return clientId.length() <= 4 ? clientId : clientId.substring(clientId.length() - 4);
    }
}
