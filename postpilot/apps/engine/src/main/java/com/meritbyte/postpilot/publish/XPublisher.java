package com.meritbyte.postpilot.publish;

import com.fasterxml.jackson.databind.JsonNode;
import com.meritbyte.postpilot.domain.*;
import com.meritbyte.postpilot.config.PostPilotProperties;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.*;

@Component
public class XPublisher implements PlatformPublisher {
    private static final int CHUNK = 4 * 1024 * 1024;
    private final RestClient http; private final long maxBytes;
    public XPublisher(RestClient http, PostPilotProperties props) { this.http = http; this.maxBytes = props.publishing().maxInMemoryMediaBytes(); }
    @Override public Platform platform() { return Platform.X; }

    @Override public PublishedPost publish(PostVariant v, SocialAccount account, String token) {
        String text = PublisherSupport.text(v);
        if (text.codePointCount(0, text.length()) > 280)
            throw new IllegalArgumentException("X variant exceeds 280 Unicode characters; shorten it in the cockpit");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("text", text);
        if (v.media != null) {
            byte[] bytes = PublisherSupport.download(http, v.media.publicUrl, maxBytes);
            String mediaId = upload(bytes, v.media.contentType, v.media.kind, token);
            body.put("media", Map.of("media_ids", List.of(mediaId)));
        }
        JsonNode response = http.post().uri("https://api.x.com/2/tweets")
                .headers(h -> h.setBearerAuth(token)).contentType(MediaType.APPLICATION_JSON)
                .body(body).retrieve().body(JsonNode.class);
        return new PublishedPost(PublisherSupport.required(response, "data", "id"));
    }

    private String upload(byte[] bytes, String contentType, MediaKind kind, String token) {
        String category = kind == MediaKind.VIDEO ? "tweet_video" : "tweet_image";
        JsonNode initialized = http.post().uri("https://api.x.com/2/media/upload/initialize")
                .headers(h -> h.setBearerAuth(token)).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("media_category", category, "media_type", contentType, "total_bytes", bytes.length))
                .retrieve().body(JsonNode.class);
        String mediaId = PublisherSupport.required(initialized, "data", "id");
        int segment = 0;
        for (int start = 0; start < bytes.length; start += CHUNK) {
            int end = Math.min(bytes.length, start + CHUNK);
            String base64 = Base64.getEncoder().encodeToString(Arrays.copyOfRange(bytes, start, end));
            http.post().uri("https://api.x.com/2/media/upload/" + mediaId + "/append")
                    .headers(h -> h.setBearerAuth(token)).contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("media", base64, "segment_index", segment++)).retrieve().toBodilessEntity();
        }
        JsonNode finalized = http.post().uri("https://api.x.com/2/media/upload/" + mediaId + "/finalize")
                .headers(h -> h.setBearerAuth(token)).retrieve().body(JsonNode.class);
        waitForProcessing(mediaId, finalized, token);
        return mediaId;
    }

    private void waitForProcessing(String mediaId, JsonNode state, String token) {
        for (int i = 0; i < 20; i++) {
            JsonNode info = state == null ? null : state.path("data").path("processing_info");
            if (info == null || info.isMissingNode() || info.isEmpty() || "succeeded".equals(info.path("state").asText())) return;
            if ("failed".equals(info.path("state").asText())) throw new IllegalStateException("X media processing failed: " + info);
            int seconds = Math.max(1, Math.min(5, info.path("check_after_secs").asInt(1)));
            try { Thread.sleep(seconds * 1000L); } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException("X media processing interrupted"); }
            state = http.get().uri("https://api.x.com/2/media/upload?media_id=" + mediaId)
                    .headers(h -> h.setBearerAuth(token)).retrieve().body(JsonNode.class);
        }
        throw new IllegalStateException("X media processing did not finish in time");
    }
}
