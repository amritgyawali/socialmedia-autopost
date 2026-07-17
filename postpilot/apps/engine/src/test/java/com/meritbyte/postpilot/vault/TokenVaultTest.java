package com.meritbyte.postpilot.vault;

import com.meritbyte.postpilot.config.PostPilotProperties;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class TokenVaultTest {
    @Test
    void encryptsWithRandomNonceAndAuthenticatesCiphertext() {
        PostPilotProperties props = mock(PostPilotProperties.class);
        when(props.vault()).thenReturn(new PostPilotProperties.Vault("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="));
        TokenVault vault = new TokenVault(props);
        byte[] first = vault.encrypt("secret-token");
        byte[] second = vault.encrypt("secret-token");

        assertThat(first).isNotEqualTo(second);
        assertThat(vault.decrypt(first)).isEqualTo("secret-token");
        first[first.length - 1] ^= 1;
        assertThatThrownBy(() -> vault.decrypt(first)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void rejectsWrongKeyLength() {
        PostPilotProperties props = mock(PostPilotProperties.class);
        when(props.vault()).thenReturn(new PostPilotProperties.Vault("dG9vLXNob3J0"));
        assertThatThrownBy(() -> new TokenVault(props)).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("base64-encoded 32-byte");
    }
}
