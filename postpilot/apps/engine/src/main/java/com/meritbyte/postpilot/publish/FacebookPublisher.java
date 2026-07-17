package com.meritbyte.postpilot.publish;

import com.fasterxml.jackson.databind.JsonNode;
import com.meritbyte.postpilot.config.PostPilotProperties;
import com.meritbyte.postpilot.domain.*;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;

@Component
public class FacebookPublisher implements PlatformPublisher {
    private final RestClient http; private final String version;
    public FacebookPublisher(RestClient http, PostPilotProperties props) {
        this.http = http; this.version = props.oauth().meta().apiVersion();
    }
    @Override public Platform platform() { return Platform.FACEBOOK; }
    @Override public PublishedPost publish(PostVariant v, SocialAccount account, String token) {
        var form = new LinkedMultiValueMap<String, String>();
        form.add("access_token", token);
        String path;
        if (v.media == null) {
            path = "feed"; form.add("message", PublisherSupport.text(v));
        } else if (v.media.kind == MediaKind.IMAGE) {
            path = "photos"; form.add("url", v.media.publicUrl); form.add("caption", PublisherSupport.text(v));
        } else {
            path = "videos"; form.add("file_url", v.media.publicUrl); form.add("description", PublisherSupport.text(v));
        }
        JsonNode response = http.post().uri("https://graph.facebook.com/" + version + "/" + account.externalId + "/" + path)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(JsonNode.class);
        String id = response != null && response.hasNonNull("post_id") ? response.path("post_id").asText() :
                PublisherSupport.required(response, "id");
        return new PublishedPost(id);
    }
}
