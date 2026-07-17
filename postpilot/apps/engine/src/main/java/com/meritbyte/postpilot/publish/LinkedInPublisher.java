package com.meritbyte.postpilot.publish;

import com.fasterxml.jackson.databind.JsonNode;
import com.meritbyte.postpilot.config.PostPilotProperties;
import com.meritbyte.postpilot.domain.*;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;

@Component
public class LinkedInPublisher implements PlatformPublisher {
    private final RestClient http; private final String version; private final long maxBytes;
    private final Duration pollInterval; private final Duration pollTimeout;
    public LinkedInPublisher(RestClient http, PostPilotProperties props) {
        this.http = http; this.version = props.oauth().linkedin().apiVersion();
        this.maxBytes = props.publishing().maxInMemoryMediaBytes();
        this.pollInterval = props.publishing().instagramPollInterval();
        this.pollTimeout = props.publishing().instagramPollTimeout();
    }
    @Override public Platform platform() { return Platform.LINKEDIN; }

    @Override public PublishedPost publish(PostVariant v, SocialAccount account, String token) {
        String author = account.externalId.startsWith("urn:li:") ? account.externalId : "urn:li:person:" + account.externalId;
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("author", author);
        body.put("commentary", PublisherSupport.text(v));
        body.put("visibility", "PUBLIC");
        body.put("distribution", Map.of("feedDistribution", "MAIN_FEED", "targetEntities", List.of(), "thirdPartyDistributionChannels", List.of()));
        body.put("lifecycleState", "PUBLISHED");
        body.put("isReshareDisabledByAuthor", false);
        if (v.media != null) {
            byte[] bytes = PublisherSupport.download(http, v.media.publicUrl, maxBytes);
            String urn = v.media.kind == MediaKind.IMAGE ? uploadImage(author, token, bytes, v.media.contentType)
                    : uploadVideo(author, token, bytes, v.media.contentType);
            var media = new LinkedHashMap<String, Object>();
            media.put("id", urn);
            if (v.title != null) media.put("title", v.title);
            body.put("content", Map.of("media", media));
        }
        ResponseEntity<Void> response = http.post().uri("https://api.linkedin.com/rest/posts")
                .headers(h -> linkedinHeaders(h, token)).contentType(MediaType.APPLICATION_JSON)
                .body(body).retrieve().toBodilessEntity();
        String id = response.getHeaders().getFirst("x-restli-id");
        if (id == null || id.isBlank()) throw new IllegalStateException("LinkedIn response omitted x-restli-id");
        return new PublishedPost(id);
    }

    private String uploadImage(String owner, String token, byte[] bytes, String contentType) {
        JsonNode initialized = http.post().uri("https://api.linkedin.com/rest/images?action=initializeUpload")
                .headers(h -> linkedinHeaders(h, token)).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("initializeUploadRequest", Map.of("owner", owner))).retrieve().body(JsonNode.class);
        String uploadUrl = PublisherSupport.required(initialized, "value", "uploadUrl");
        String image = PublisherSupport.required(initialized, "value", "image");
        http.put().uri(uploadUrl).headers(h -> h.setBearerAuth(token)).contentType(MediaType.parseMediaType(contentType))
                .body(bytes).retrieve().toBodilessEntity();
        waitUntilAvailable("images", image, owner, token);
        return image;
    }

    private String uploadVideo(String owner, String token, byte[] bytes, String contentType) {
        JsonNode initialized = http.post().uri("https://api.linkedin.com/rest/videos?action=initializeUpload")
                .headers(h -> linkedinHeaders(h, token)).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("initializeUploadRequest", Map.of("owner", owner, "fileSizeBytes", bytes.length,
                        "uploadCaptions", false, "uploadThumbnail", false))).retrieve().body(JsonNode.class);
        String video = PublisherSupport.required(initialized, "value", "video");
        String uploadToken = initialized.path("value").path("uploadToken").asText("");
        JsonNode instructions = initialized.path("value").path("uploadInstructions");
        if (!instructions.isArray() || instructions.isEmpty()) throw new IllegalStateException("LinkedIn returned no video upload instructions");
        List<String> partIds = new ArrayList<>();
        for (JsonNode instruction : instructions) {
            int first = Math.toIntExact(instruction.path("firstByte").asLong());
            int last = Math.toIntExact(Math.min(bytes.length - 1L, instruction.path("lastByte").asLong()));
            byte[] part = Arrays.copyOfRange(bytes, first, last + 1);
            ResponseEntity<Void> uploaded = http.put().uri(PublisherSupport.required(instruction, "uploadUrl"))
                    .contentType(MediaType.parseMediaType(contentType)).contentLength(part.length)
                    .body(part).retrieve().toBodilessEntity();
            String etag = uploaded.getHeaders().getETag();
            if (etag == null) etag = uploaded.getHeaders().getFirst("ETag");
            if (etag == null) throw new IllegalStateException("LinkedIn video part upload omitted ETag");
            partIds.add(etag.replace("\"", ""));
        }
        http.post().uri("https://api.linkedin.com/rest/videos?action=finalizeUpload")
                .headers(h -> linkedinHeaders(h, token)).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("finalizeUploadRequest", Map.of("video", video, "uploadToken", uploadToken, "uploadedPartIds", partIds)))
                .retrieve().toBodilessEntity();
        waitUntilAvailable("videos", video, owner, token);
        return video;
    }

    private void waitUntilAvailable(String resource, String urn, String owner, String token) {
        Instant deadline = Instant.now().plus(pollTimeout);
        URI statusUri = URI.create("https://api.linkedin.com/rest/" + resource + "/" +
                URLEncoder.encode(urn, StandardCharsets.UTF_8).replace("+", "%20"));
        while (Instant.now().isBefore(deadline)) {
            JsonNode asset = http.get().uri(statusUri).headers(h -> {
                h.setBearerAuth(token);
                h.set("X-Restli-Protocol-Version", "2.0.0");
                // LinkedIn documents w_member_social as write-only for versioned image GETs.
                // The legacy/unversioned image GET accepts that scope for member-owned images.
                if (!("images".equals(resource) && owner.startsWith("urn:li:person:"))) {
                    h.set("LinkedIn-Version", version);
                }
            }).retrieve().body(JsonNode.class);
            String status = asset == null ? "" : asset.path("status").asText("");
            if ("AVAILABLE".equals(status)) return;
            if ("PROCESSING_FAILED".equals(status)) {
                String reason = asset.path("processingFailureReason").asText("LinkedIn media processing failed");
                throw new IllegalStateException("LinkedIn media processing failed: " + reason);
            }
            try {
                Thread.sleep(pollInterval);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("LinkedIn media processing poll was interrupted");
            }
        }
        throw new IllegalStateException("LinkedIn media was not AVAILABLE after " + pollTimeout);
    }

    private void linkedinHeaders(HttpHeaders headers, String token) {
        headers.setBearerAuth(token);
        headers.set("LinkedIn-Version", version);
        headers.set("X-Restli-Protocol-Version", "2.0.0");
    }
}
