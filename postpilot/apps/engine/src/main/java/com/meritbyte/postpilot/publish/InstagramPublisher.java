package com.meritbyte.postpilot.publish;

import com.fasterxml.jackson.databind.JsonNode;
import com.meritbyte.postpilot.config.PostPilotProperties;
import com.meritbyte.postpilot.domain.*;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;
import java.time.*;

@Component
public class InstagramPublisher implements PlatformPublisher {
    private final RestClient http; private final String version; private final Duration pollInterval; private final Duration pollTimeout;
    public InstagramPublisher(RestClient http, PostPilotProperties props) {
        this.http = http; this.version = props.oauth().meta().apiVersion();
        this.pollInterval = props.publishing().instagramPollInterval(); this.pollTimeout = props.publishing().instagramPollTimeout();
    }
    @Override public Platform platform() { return Platform.INSTAGRAM; }
    @Override public PublishedPost publish(PostVariant v, SocialAccount account, String token) {
        if (v.media == null) throw new IllegalArgumentException("Instagram publishing requires an image or video");
        var create = new LinkedMultiValueMap<String, String>();
        create.add("access_token", token); create.add("caption", PublisherSupport.text(v));
        if (v.media.kind == MediaKind.IMAGE) create.add("image_url", v.media.publicUrl);
        else { create.add("video_url", v.media.publicUrl); create.add("media_type", "REELS"); }
        JsonNode created = http.post().uri("https://graph.facebook.com/" + version + "/" + account.externalId + "/media")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(create).retrieve().body(JsonNode.class);
        String container = PublisherSupport.required(created, "id");
        waitUntilReady(container, token);
        var publish = new LinkedMultiValueMap<String, String>();
        publish.add("creation_id", container); publish.add("access_token", token);
        JsonNode posted = http.post().uri("https://graph.facebook.com/" + version + "/" + account.externalId + "/media_publish")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(publish).retrieve().body(JsonNode.class);
        return new PublishedPost(PublisherSupport.required(posted, "id"));
    }
    private void waitUntilReady(String container, String token) {
        Instant deadline = Instant.now().plus(pollTimeout);
        while (Instant.now().isBefore(deadline)) {
            String url = UriComponentsBuilder.fromUriString("https://graph.facebook.com/" + version + "/" + container)
                    .queryParam("fields", "status_code").queryParam("access_token", token).build().encode().toUriString();
            JsonNode result = http.get().uri(url).retrieve().body(JsonNode.class);
            String status = result == null ? "" : result.path("status_code").asText();
            if ("FINISHED".equals(status)) return;
            if ("ERROR".equals(status) || "EXPIRED".equals(status))
                throw new IllegalStateException("Instagram media container ended in " + status);
            try { Thread.sleep(pollInterval); } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException("Instagram publish interrupted"); }
        }
        throw new IllegalStateException("Instagram media container was not ready after " + pollTimeout);
    }
}
