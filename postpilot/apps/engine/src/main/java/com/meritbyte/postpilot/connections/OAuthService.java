package com.meritbyte.postpilot.connections;

import com.fasterxml.jackson.databind.*;
import com.meritbyte.postpilot.api.*;
import com.meritbyte.postpilot.api.ApiModels.*;
import com.meritbyte.postpilot.config.PostPilotProperties;
import com.meritbyte.postpilot.domain.*;
import com.meritbyte.postpilot.vault.TokenVault;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;

@Service
public class OAuthService {
    private final PostPilotProperties properties;
    private final OAuthStateRepository states;
    private final SocialAccountRepository accounts;
    private final TokenVault vault;
    private final RestClient http;
    private final ObjectMapper mapper;
    private final SecureRandom random = new SecureRandom();

    public OAuthService(PostPilotProperties properties, OAuthStateRepository states,
                        SocialAccountRepository accounts, TokenVault vault, RestClient http, ObjectMapper mapper) {
        this.properties = properties; this.states = states; this.accounts = accounts;
        this.vault = vault; this.http = http; this.mapper = mapper;
    }

    @Transactional
    public OAuthStartResponse start(Platform platform) {
        requireSupported(platform);
        requireProviderConfigured(platform);
        String rawState = randomUrlToken(32);
        OAuthState state = new OAuthState();
        state.platform = platform;
        state.stateHash = sha256(rawState);
        state.expiresAt = Instant.now().plus(Duration.ofMinutes(10));
        if (platform == Platform.X) state.codeVerifier = randomUrlToken(64);
        states.save(state);
        return new OAuthStartResponse(authorizationUrl(platform, rawState, state.codeVerifier));
    }

    public OAuthCallbackResponse callback(Platform platform, String code, String rawState, String providerError) {
        requireSupported(platform);
        if (providerError != null) throw new IllegalArgumentException("OAuth provider returned: " + providerError);
        if (code == null || code.isBlank() || rawState == null || rawState.isBlank()) {
            throw new IllegalArgumentException("OAuth callback requires code and state");
        }
        OAuthState state = states.findByStateHash(sha256(rawState))
                .orElseThrow(() -> new IllegalArgumentException("OAuth state is invalid or already used"));
        states.delete(state);
        if (state.platform != platform || state.expiresAt.isBefore(Instant.now())) {
            throw new IllegalArgumentException("OAuth state has expired or does not match the platform");
        }
        int connected = switch (platform) {
            case FACEBOOK, INSTAGRAM -> connectMeta(code, platform);
            case LINKEDIN -> connectLinkedIn(code);
            case X -> connectX(code, state.codeVerifier);
            default -> 0;
        };
        return new OAuthCallbackResponse("connected", platform, connected,
                connected + " account" + (connected == 1 ? "" : "s") + " connected");
    }

    public boolean refresh(SocialAccount account) {
        if (account.refreshTokenEnc == null) return false;
        try {
            return switch (account.platform) {
                case X -> refreshX(account);
                case LINKEDIN -> refreshLinkedIn(account);
                default -> false;
            };
        } catch (Exception e) {
            // Refresh starts before expiry. A transient provider outage must not disable a
            // still-valid access token; publishing can continue until its actual expiry.
            account.status = account.expiresAt != null && !account.expiresAt.isAfter(Instant.now())
                    ? AccountStatus.EXPIRED
                    : AccountStatus.ACTIVE;
            accounts.save(account);
            return false;
        }
    }

    private int connectMeta(String code, Platform callbackPlatform) {
        var provider = properties.oauth().meta();
        var form = form("client_id", provider.clientId(), "client_secret", provider.clientSecret(),
                "redirect_uri", callbackUrl(callbackPlatform), "code", code);
        JsonNode token = postForm("https://graph.facebook.com/" + provider.apiVersion() + "/oauth/access_token", form);
        String userToken = required(token, "access_token");
        try {
            String exchangeUrl = UriComponentsBuilder.fromUriString("https://graph.facebook.com/" + provider.apiVersion() + "/oauth/access_token")
                    .queryParam("grant_type", "fb_exchange_token").queryParam("client_id", provider.clientId())
                    .queryParam("client_secret", provider.clientSecret()).queryParam("fb_exchange_token", userToken)
                    .build().encode().toUriString();
            JsonNode longToken = http.get().uri(exchangeUrl).retrieve().body(JsonNode.class);
            if (longToken != null && longToken.hasNonNull("access_token")) userToken = longToken.path("access_token").asText();
        } catch (Exception ignored) { /* short-lived token still allows the initial page-token exchange */ }

        String url = UriComponentsBuilder.fromUriString("https://graph.facebook.com/" + provider.apiVersion() + "/me/accounts")
                .queryParam("fields", "id,name,access_token,instagram_business_account{id,username,name}")
                .queryParam("access_token", userToken).build().encode().toUriString();
        JsonNode response = http.get().uri(url).retrieve().body(JsonNode.class);
        JsonNode pages = response == null ? null : response.path("data");
        if (pages == null || !pages.isArray()) throw new IllegalStateException("Meta did not return any managed Pages");
        int count = 0;
        for (JsonNode page : pages) {
            String pageId = required(page, "id");
            String pageToken = required(page, "access_token");
            upsert(Platform.FACEBOOK, pageId, page.path("name").asText("Facebook Page"), pageToken,
                    null, null, "pages_manage_posts,pages_read_engagement", null);
            count++;
            JsonNode ig = page.path("instagram_business_account");
            if (ig.hasNonNull("id")) {
                String name = ig.path("username").asText(ig.path("name").asText("Instagram"));
                upsert(Platform.INSTAGRAM, ig.path("id").asText(), name, pageToken,
                        null, null, "instagram_basic,instagram_content_publish", "{\"facebookPageId\":\"" + pageId + "\"}");
                count++;
            }
        }
        return count;
    }

    private int connectLinkedIn(String code) {
        var provider = properties.oauth().linkedin();
        JsonNode token = postForm("https://www.linkedin.com/oauth/v2/accessToken", form(
                "grant_type", "authorization_code", "code", code, "client_id", provider.clientId(),
                "client_secret", provider.clientSecret(), "redirect_uri", callbackUrl(Platform.LINKEDIN)));
        String access = required(token, "access_token");
        String refresh = text(token, "refresh_token");
        Instant expires = expires(token, "expires_in");
        JsonNode user = http.get().uri("https://api.linkedin.com/v2/userinfo")
                .headers(h -> h.setBearerAuth(access)).retrieve().body(JsonNode.class);
        if (user == null) throw new IllegalStateException("LinkedIn userinfo response was empty");
        String externalId = required(user, "sub");
        String name = user.path("name").asText(user.path("given_name").asText("LinkedIn member"));
        upsert(Platform.LINKEDIN, externalId, name, access, refresh, expires,
                token.path("scope").asText("openid profile w_member_social"), null);
        return 1;
    }

    private int connectX(String code, String verifier) {
        var provider = properties.oauth().x();
        var form = form("grant_type", "authorization_code", "code", code,
                "redirect_uri", callbackUrl(Platform.X), "client_id", provider.clientId(), "code_verifier", verifier);
        JsonNode token = postFormWithOptionalBasic("https://api.x.com/2/oauth2/token", form,
                provider.clientId(), provider.clientSecret());
        String access = required(token, "access_token");
        JsonNode user = http.get().uri("https://api.x.com/2/users/me?user.fields=name,username")
                .headers(h -> h.setBearerAuth(access)).retrieve().body(JsonNode.class);
        JsonNode data = user == null ? null : user.path("data");
        if (data == null || data.isMissingNode()) throw new IllegalStateException("X user response was empty");
        upsert(Platform.X, required(data, "id"), data.path("username").asText(data.path("name").asText("X account")),
                access, text(token, "refresh_token"), expires(token, "expires_in"),
                token.path("scope").asText("tweet.read tweet.write users.read media.write offline.access"), null);
        return 1;
    }

    private boolean refreshX(SocialAccount account) {
        var provider = properties.oauth().x();
        JsonNode token = postFormWithOptionalBasic("https://api.x.com/2/oauth2/token", form(
                "grant_type", "refresh_token", "refresh_token", vault.decrypt(account.refreshTokenEnc),
                "client_id", provider.clientId()), provider.clientId(), provider.clientSecret());
        applyRefreshedToken(account, token);
        return true;
    }

    private boolean refreshLinkedIn(SocialAccount account) {
        var provider = properties.oauth().linkedin();
        JsonNode token = postForm("https://www.linkedin.com/oauth/v2/accessToken", form(
                "grant_type", "refresh_token", "refresh_token", vault.decrypt(account.refreshTokenEnc),
                "client_id", provider.clientId(), "client_secret", provider.clientSecret()));
        applyRefreshedToken(account, token);
        return true;
    }

    private void applyRefreshedToken(SocialAccount account, JsonNode token) {
        account.accessTokenEnc = vault.encrypt(required(token, "access_token"));
        String rotatedRefresh = text(token, "refresh_token");
        if (rotatedRefresh != null) account.refreshTokenEnc = vault.encrypt(rotatedRefresh);
        account.expiresAt = expires(token, "expires_in");
        account.status = AccountStatus.ACTIVE;
        accounts.save(account);
    }

    void upsert(Platform platform, String externalId, String displayName, String access, String refresh,
                Instant expiresAt, String scopes, String metadata) {
        SocialAccount account = accounts.findByPlatformAndExternalId(platform, externalId).orElseGet(SocialAccount::new);
        account.platform = platform; account.externalId = externalId; account.displayName = displayName;
        account.accessTokenEnc = vault.encrypt(access);
        // A new authorization grant replaces the old credential set. Keeping an old
        // refresh token when the provider omits one can resurrect a revoked credential.
        account.refreshTokenEnc = refresh == null ? null : vault.encrypt(refresh);
        account.expiresAt = expiresAt; account.scopes = scopes; account.tokenType = "Bearer";
        account.status = AccountStatus.ACTIVE; account.metadataJson = metadata; account.updatedAt = Instant.now();
        accounts.save(account);
    }

    private String authorizationUrl(Platform platform, String state, String verifier) {
        return switch (platform) {
            case FACEBOOK, INSTAGRAM -> UriComponentsBuilder.fromUriString("https://www.facebook.com/" + properties.oauth().meta().apiVersion() + "/dialog/oauth")
                    .queryParam("client_id", properties.oauth().meta().clientId()).queryParam("redirect_uri", callbackUrl(platform))
                    .queryParam("state", state).queryParam("response_type", "code")
                    .queryParam("scope", "pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish")
                    .build().encode().toUriString();
            case LINKEDIN -> UriComponentsBuilder.fromUriString("https://www.linkedin.com/oauth/v2/authorization")
                    .queryParam("response_type", "code").queryParam("client_id", properties.oauth().linkedin().clientId())
                    .queryParam("redirect_uri", callbackUrl(platform)).queryParam("state", state)
                    .queryParam("scope", "openid profile w_member_social").build().encode().toUriString();
            case X -> UriComponentsBuilder.fromUriString("https://x.com/i/oauth2/authorize")
                    .queryParam("response_type", "code").queryParam("client_id", properties.oauth().x().clientId())
                    .queryParam("redirect_uri", callbackUrl(platform)).queryParam("scope", "tweet.read tweet.write users.read media.write offline.access")
                    .queryParam("state", state).queryParam("code_challenge", sha256Base64(verifier))
                    .queryParam("code_challenge_method", "S256").build().encode().toUriString();
            default -> throw new IllegalArgumentException("Unsupported OAuth platform");
        };
    }

    private String callbackUrl(Platform platform) {
        return properties.oauth().redirectBase().replaceAll("/+$", "") + "/api/v1/oauth/" + platform.wire() + "/callback";
    }

    private JsonNode postForm(String url, LinkedMultiValueMap<String, String> body) {
        return http.post().uri(url).contentType(MediaType.APPLICATION_FORM_URLENCODED).body(body)
                .retrieve().body(JsonNode.class);
    }
    private JsonNode postFormWithOptionalBasic(String url, LinkedMultiValueMap<String, String> body, String id, String secret) {
        var request = http.post().uri(url).contentType(MediaType.APPLICATION_FORM_URLENCODED);
        if (secret != null && !secret.isBlank()) request.headers(h -> h.setBasicAuth(id, secret));
        return request.body(body).retrieve().body(JsonNode.class);
    }
    private LinkedMultiValueMap<String, String> form(String... values) {
        var map = new LinkedMultiValueMap<String, String>();
        for (int i = 0; i < values.length; i += 2) if (values[i + 1] != null) map.add(values[i], values[i + 1]);
        return map;
    }
    private String required(JsonNode node, String field) {
        if (node == null || !node.hasNonNull(field) || node.path(field).asText().isBlank())
            throw new IllegalStateException("OAuth provider response is missing " + field);
        return node.path(field).asText();
    }
    private String text(JsonNode node, String field) { return node != null && node.hasNonNull(field) ? node.path(field).asText() : null; }
    private Instant expires(JsonNode node, String field) {
        long seconds = node == null ? 0 : node.path(field).asLong(0);
        return seconds > 0 ? Instant.now().plusSeconds(seconds) : null;
    }
    private void requireSupported(Platform platform) {
        if (platform == null || !platform.isSupportedForPublishing())
            throw new IllegalArgumentException((platform == null ? "Unknown" : platform.wire()) + " OAuth is native-scheduler-only in PostPilot v1");
    }
    private void requireProviderConfigured(Platform platform) {
        var provider = platform == Platform.LINKEDIN ? properties.oauth().linkedin() :
                platform == Platform.X ? properties.oauth().x() : properties.oauth().meta();
        if (provider.clientId() == null || provider.clientId().isBlank() ||
                (platform != Platform.X && (provider.clientSecret() == null || provider.clientSecret().isBlank()))) {
            throw new ConfigurationException(platform.wire() + " OAuth credentials are not configured");
        }
    }
    private String randomUrlToken(int bytes) { byte[] b = new byte[bytes]; random.nextBytes(b); return Base64.getUrlEncoder().withoutPadding().encodeToString(b); }
    private String sha256(String value) { return HexFormat.of().formatHex(digest(value)); }
    private String sha256Base64(String value) { return Base64.getUrlEncoder().withoutPadding().encodeToString(digest(value)); }
    private byte[] digest(String value) {
        try { return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
}
