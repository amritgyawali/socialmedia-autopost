package com.meritbyte.postpilot.media;

import com.meritbyte.postpilot.api.ApiModels.*;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/media")
public class MediaController {
    private final MediaService service;
    public MediaController(MediaService service) { this.service = service; }

    @PostMapping("/presign") public PresignResponse presign(@Valid @RequestBody PresignRequest request) {
        return service.presign(request);
    }
    @PostMapping("/complete") public MediaDto complete(@Valid @RequestBody CompleteMediaRequest request) {
        return service.complete(request);
    }
    @PostMapping("/register-external") @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    public MediaDto registerExternal(@Valid @RequestBody ExternalMediaRequest request) {
        return service.registerExternal(request);
    }
}
