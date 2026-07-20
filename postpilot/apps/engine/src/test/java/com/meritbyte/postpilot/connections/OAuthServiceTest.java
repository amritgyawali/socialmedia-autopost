package com.meritbyte.postpilot.connections;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.meritbyte.postpilot.config.PostPilotProperties;
import com.meritbyte.postpilot.domain.AccountStatus;
import com.meritbyte.postpilot.domain.OAuthStateRepository;
import com.meritbyte.postpilot.domain.Platform;
import com.meritbyte.postpilot.domain.SocialAccount;
import com.meritbyte.postpilot.domain.SocialAccountRepository;
import com.meritbyte.postpilot.vault.TokenVault;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;

class OAuthServiceTest {
    @Test
    void keepsAccountActiveWhenRefreshFailsBeforeAccessTokenExpires() {
        Fixture fixture = fixture();
        SocialAccount account = fixture.account(Instant.now().plusSeconds(3_600));

        assertThat(fixture.service.refresh(account)).isFalse();

        assertThat(account.status).isEqualTo(AccountStatus.ACTIVE);
        verify(fixture.accounts).save(account);
        fixture.server.verify();
    }

    @Test
    void marksAccountExpiredWhenRefreshFailsAfterAccessTokenExpires() {
        Fixture fixture = fixture();
        SocialAccount account = fixture.account(Instant.now().minusSeconds(1));

        assertThat(fixture.service.refresh(account)).isFalse();

        assertThat(account.status).isEqualTo(AccountStatus.EXPIRED);
        verify(fixture.accounts).save(account);
        fixture.server.verify();
    }

    @Test
    void reconnectWithoutRefreshTokenClearsThePreviouslyStoredCredential() {
        PostPilotProperties properties = mock(PostPilotProperties.class);
        ProviderSettingsService providerSettings = mock(ProviderSettingsService.class);
        OAuthStateRepository states = mock(OAuthStateRepository.class);
        SocialAccountRepository accounts = mock(SocialAccountRepository.class);
        TokenVault vault = mock(TokenVault.class);
        SocialAccount existing = new SocialAccount();
        existing.refreshTokenEnc = new byte[]{9};
        when(accounts.findByPlatformAndExternalId(Platform.LINKEDIN, "member-1")).thenReturn(Optional.of(existing));
        when(vault.encrypt("new-access")).thenReturn(new byte[]{1});
        OAuthService service = new OAuthService(properties, providerSettings, states, accounts, vault,
                RestClient.create(), new ObjectMapper());

        service.upsert(Platform.LINKEDIN, "member-1", "Member", "new-access", null,
                Instant.now().plusSeconds(3_600), "w_member_social", null);

        assertThat(existing.refreshTokenEnc).isNull();
        verify(accounts).save(existing);
    }

    private Fixture fixture() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://api.x.com/2/oauth2/token"))
                .andRespond(withServerError().contentType(MediaType.APPLICATION_JSON));

        PostPilotProperties properties = mock(PostPilotProperties.class);
        ProviderSettingsService providerSettings = mock(ProviderSettingsService.class);
        when(providerSettings.resolve(Platform.X))
                .thenReturn(new ProviderSettingsService.ResolvedProvider("client-id", "client-secret", null));
        OAuthStateRepository states = mock(OAuthStateRepository.class);
        SocialAccountRepository accounts = mock(SocialAccountRepository.class);
        TokenVault vault = mock(TokenVault.class);
        when(vault.decrypt(any(byte[].class))).thenReturn("refresh-token");

        OAuthService service = new OAuthService(properties, providerSettings, states, accounts, vault,
                builder.build(), new ObjectMapper());
        return new Fixture(service, accounts, server);
    }

    private record Fixture(OAuthService service, SocialAccountRepository accounts,
                           MockRestServiceServer server) {
        SocialAccount account(Instant expiresAt) {
            SocialAccount account = new SocialAccount();
            account.platform = Platform.X;
            account.externalId = "x-account";
            account.displayName = "X account";
            account.accessTokenEnc = new byte[]{1};
            account.refreshTokenEnc = new byte[]{2};
            account.expiresAt = expiresAt;
            account.status = AccountStatus.ACTIVE;
            return account;
        }
    }
}
