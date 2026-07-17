package com.meritbyte.postpilot.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.meritbyte.postpilot.config.PostPilotProperties;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class BearerAuthenticationFilterTest {
    private static final String SECRET = "test-shared-secret-that-is-at-least-32-bytes";
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void acceptsStrictCockpitJwt() throws Exception {
        BearerAuthenticationFilter filter = filter(false);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/channels");
        request.addHeader("Authorization", "Bearer " + jwt("postpilot-web", "postpilot-engine", "cockpit", 300));
        MockHttpServletResponse response = new MockHttpServletResponse();
        boolean[] called = {false};
        filter.doFilter(request, response, (req, res) -> called[0] = true);
        assertThat(called[0]).isTrue();
    }

    @Test
    void rejectsWrongAudienceAndRawSecretByDefault() throws Exception {
        BearerAuthenticationFilter filter = filter(false);
        for (String token : List.of(SECRET, jwt("postpilot-web", "wrong", "cockpit", 300))) {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/channels");
            request.addHeader("Authorization", "Bearer " + token);
            MockHttpServletResponse response = new MockHttpServletResponse();
            filter.doFilter(request, response, (req, res) -> {});
            assertThat(response.getStatus()).isEqualTo(401);
        }
    }

    @Test
    void rawSecretCompatibilityIsExplicit() throws Exception {
        BearerAuthenticationFilter filter = filter(true);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/channels");
        request.addHeader("Authorization", "Bearer " + SECRET);
        MockHttpServletResponse response = new MockHttpServletResponse();
        boolean[] called = {false};
        filter.doFilter(request, response, (req, res) -> called[0] = true);
        assertThat(called[0]).isTrue();
    }

    private BearerAuthenticationFilter filter(boolean raw) {
        PostPilotProperties properties = mock(PostPilotProperties.class);
        when(properties.security()).thenReturn(new PostPilotProperties.Security(SECRET, raw,
                "postpilot-web", "postpilot-engine", Duration.ofMinutes(15), List.of()));
        return new BearerAuthenticationFilter(properties, mapper);
    }

    private String jwt(String issuer, String audience, String role, long lifetime) throws Exception {
        long now = Instant.now().getEpochSecond();
        String header = b64(mapper.writeValueAsBytes(Map.of("alg", "HS256", "typ", "JWT")));
        String payload = b64(mapper.writeValueAsBytes(Map.of("iss", issuer, "aud", audience,
                "role", role, "iat", now, "exp", now + lifetime)));
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return header + "." + payload + "." + b64(mac.doFinal((header + "." + payload).getBytes(StandardCharsets.US_ASCII)));
    }
    private String b64(byte[] bytes) { return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
}
