package com.meritbyte.postpilot.connections;

import com.meritbyte.postpilot.api.ApiModels.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/oauth-apps")
public class ProviderSettingsController {
    private final ProviderSettingsService service;

    public ProviderSettingsController(ProviderSettingsService service) { this.service = service; }

    @GetMapping
    public List<OAuthAppStatus> status() { return service.status(); }

    @PutMapping("/{provider}")
    public OAuthAppStatus save(@PathVariable String provider, @RequestBody OAuthAppRequest request) {
        return service.save(provider, request.clientId(), request.clientSecret());
    }

    @DeleteMapping("/{provider}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void clear(@PathVariable String provider) { service.clear(provider); }
}
