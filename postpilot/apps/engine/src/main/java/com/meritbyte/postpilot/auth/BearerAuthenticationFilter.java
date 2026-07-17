package com.meritbyte.postpilot.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.meritbyte.postpilot.config.PostPilotProperties;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;

public class BearerAuthenticationFilter extends OncePerRequestFilter {
    private final byte[] secret;
    private final ObjectMapper mapper;
    private final PostPilotProperties.Security config;

    public BearerAuthenticationFilter(PostPilotProperties properties, ObjectMapper mapper) {
        String configured = properties.security().bearerSecret();
        if (configured == null || configured.length() < 32) {
            throw new IllegalStateException("COCKPIT_JWT_SECRET must contain at least 32 characters");
        }
        this.secret = configured.getBytes(StandardCharsets.UTF_8);
        this.mapper = mapper;
        this.config = properties.security();
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return request.getMethod().equals("OPTIONS") || path.equals("/actuator/health") ||
                path.equals("/actuator/health/liveness") || path.equals("/actuator/health/readiness") ||
                (path.startsWith("/api/v1/oauth/") && path.endsWith("/callback"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        String token = header != null && header.startsWith("Bearer ") ? header.substring(7).trim() : null;
        if (token == null || !((config.allowRawBearer() && isRawSecret(token)) || isValidJwt(token))) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            mapper.writeValue(response.getOutputStream(), Map.of(
                    "type", "about:blank", "title", "Unauthorized", "status", 401,
                    "detail", "A valid cockpit bearer secret or HS256 JWT is required"));
            return;
        }
        var auth = new UsernamePasswordAuthenticationToken("cockpit", token,
                List.of(new SimpleGrantedAuthority("ROLE_COCKPIT")));
        SecurityContextHolder.getContext().setAuthentication(auth);
        try { chain.doFilter(request, response); }
        finally { SecurityContextHolder.clearContext(); }
    }

    private boolean isRawSecret(String token) {
        return MessageDigest.isEqual(secret, token.getBytes(StandardCharsets.UTF_8));
    }

    private boolean isValidJwt(String token) {
        try {
            String[] parts = token.split("\\.", -1);
            if (parts.length != 3) return false;
            Base64.Decoder decoder = Base64.getUrlDecoder();
            JsonNode header = mapper.readTree(decoder.decode(parts[0]));
            if (!"HS256".equals(header.path("alg").asText())) return false;
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            byte[] expected = mac.doFinal((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
            if (!MessageDigest.isEqual(expected, decoder.decode(parts[2]))) return false;
            JsonNode payload = mapper.readTree(decoder.decode(parts[1]));
            long now = Instant.now().getEpochSecond();
            long exp = payload.path("exp").asLong(0);
            long iat = payload.path("iat").asLong(0);
            boolean audience = payload.path("aud").isTextual()
                    ? config.audience().equals(payload.path("aud").asText())
                    : payload.path("aud").isArray() && contains(payload.path("aud"), config.audience());
            boolean role = "cockpit".equals(payload.path("role").asText()) || contains(payload.path("roles"), "cockpit");
            return config.issuer().equals(payload.path("iss").asText()) && audience && role &&
                    iat > 0 && iat <= now + 30 && exp >= now && exp > iat &&
                    exp - iat <= config.maxJwtLifetime().toSeconds() &&
                    (!payload.has("nbf") || payload.path("nbf").asLong() <= now + 30);
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean contains(JsonNode array, String value) {
        if (!array.isArray()) return false;
        for (JsonNode item : array) if (value.equals(item.asText())) return true;
        return false;
    }
}
