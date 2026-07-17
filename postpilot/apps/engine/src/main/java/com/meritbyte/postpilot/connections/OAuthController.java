package com.meritbyte.postpilot.connections;

import com.meritbyte.postpilot.api.ApiModels.*;
import com.meritbyte.postpilot.domain.Platform;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import org.springframework.web.util.UriComponentsBuilder;
import com.meritbyte.postpilot.config.PostPilotProperties;
import org.slf4j.*;
import java.net.URI;

@RestController
@RequestMapping("/api/v1/oauth/{platform}")
public class OAuthController {
    private final OAuthService service;
    private final String cockpitUrl;
    private static final Logger log = LoggerFactory.getLogger(OAuthController.class);
    public OAuthController(OAuthService service, PostPilotProperties properties) {
        this.service = service; this.cockpitUrl = properties.oauth().cockpitUrl();
    }

    @GetMapping("/start")
    public OAuthStartResponse start(@PathVariable Platform platform) { return service.start(platform); }

    @GetMapping("/callback")
    public ResponseEntity<Void> callback(@PathVariable Platform platform,
                                          @RequestParam(required = false) String code,
                                          @RequestParam(required = false) String state,
                                          @RequestParam(required = false, name = "error") String error) {
        try {
            OAuthCallbackResponse connected = service.callback(platform, code, state, error);
            return redirect(platform, "success", connected.accountsConnected());
        } catch (Exception e) {
            // Provider exceptions may echo query parameters such as Meta access tokens.
            log.warn("{} OAuth callback failed ({})", platform, e.getClass().getSimpleName());
            return redirect(platform, "error", null);
        }
    }

    private ResponseEntity<Void> redirect(Platform platform, String outcome, Integer count) {
        var builder = UriComponentsBuilder.fromUriString(cockpitUrl.replaceAll("/+$", "") + "/connections")
                .queryParam("oauth", outcome).queryParam("platform", platform.wire());
        if (count != null) builder.queryParam("accounts", count);
        return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(builder.build().encode().toUriString())).build();
    }
}
