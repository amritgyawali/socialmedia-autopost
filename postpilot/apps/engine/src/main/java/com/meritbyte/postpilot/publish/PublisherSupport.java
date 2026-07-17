package com.meritbyte.postpilot.publish;

import com.fasterxml.jackson.databind.JsonNode;
import com.meritbyte.postpilot.domain.PostVariant;
import org.springframework.web.client.RestClient;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

final class PublisherSupport {
    private PublisherSupport() {}
    static String text(PostVariant v) {
        String caption = v.caption == null ? "" : v.caption.trim();
        String tags = v.hashtags == null ? "" : v.hashtags.trim();
        return tags.isEmpty() ? caption : caption + "\n\n" + tags;
    }
    static String required(JsonNode node, String... path) {
        JsonNode current = node;
        for (String part : path) current = current == null ? null : current.path(part);
        if (current == null || current.isMissingNode() || current.isNull() || current.asText().isBlank())
            throw new IllegalStateException("Platform response omitted " + String.join(".", path));
        return current.asText();
    }
    static byte[] download(RestClient http, String url, long maximumBytes) {
        return http.get().uri(url).exchange((request, response) -> {
            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new IllegalStateException("Media URL returned HTTP " + response.getStatusCode().value());
            }
            long declared = response.getHeaders().getContentLength();
            if (declared > maximumBytes) throw mediaTooLarge();
            try (InputStream input = response.getBody(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[64 * 1024];
                long total = 0;
                int read;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > maximumBytes) throw mediaTooLarge();
                    output.write(buffer, 0, read);
                }
                if (total == 0) throw new IllegalStateException("Media URL returned an empty object");
                return output.toByteArray();
            }
        });
    }

    private static IllegalArgumentException mediaTooLarge() {
        return new IllegalArgumentException("Media exceeds PUBLISH_MAX_IN_MEMORY_MEDIA_BYTES; reduce the asset or implement streaming upload for this deployment");
    }
}
