package com.meritbyte.postpilot.publish;

import com.meritbyte.postpilot.config.PostPilotProperties;
import com.meritbyte.postpilot.domain.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class LinkedInPublisherTest {
    @Test
    void waitsForImageAvailabilityBeforeCreatingPost() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        String imageUrn = "urn:li:image:test-image";
        String statusUrl = "https://api.linkedin.com/rest/images/urn%3Ali%3Aimage%3Atest-image";

        server.expect(once(), requestTo("https://media.example.test/image.jpg"))
                .andRespond(withSuccess(new byte[]{1, 2, 3}, MediaType.IMAGE_JPEG));
        server.expect(once(), requestTo("https://api.linkedin.com/rest/images?action=initializeUpload"))
                .andRespond(withSuccess("{\"value\":{\"uploadUrl\":\"https://upload.example.test/image\",\"image\":\"" + imageUrn + "\"}}", MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("https://upload.example.test/image"))
                .andRespond(withSuccess());
        server.expect(once(), requestTo(statusUrl))
                .andExpect(headerDoesNotExist("LinkedIn-Version"))
                .andExpect(header("X-Restli-Protocol-Version", "2.0.0"))
                .andRespond(withSuccess("{\"status\":\"PROCESSING\"}", MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo(statusUrl))
                .andRespond(withSuccess("{\"status\":\"AVAILABLE\"}", MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("https://api.linkedin.com/rest/posts"))
                .andRespond(withStatus(HttpStatus.CREATED).header("x-restli-id", "urn:li:share:42"));

        LinkedInPublisher publisher = new LinkedInPublisher(builder.build(), properties());
        SocialAccount account = new SocialAccount(); account.externalId = "member-1";
        MediaAsset media = new MediaAsset(); media.kind = MediaKind.IMAGE; media.contentType = "image/jpeg";
        media.publicUrl = "https://media.example.test/image.jpg";
        PostVariant variant = new PostVariant(); variant.platform = Platform.LINKEDIN; variant.caption = "Hello"; variant.media = media;

        assertThat(publisher.publish(variant, account, "token").id()).isEqualTo("urn:li:share:42");
        server.verify();
    }

    private PostPilotProperties properties() {
        PostPilotProperties properties = mock(PostPilotProperties.class);
        PostPilotProperties.OAuth oauth = mock(PostPilotProperties.OAuth.class);
        when(properties.oauth()).thenReturn(oauth);
        when(oauth.linkedin()).thenReturn(new PostPilotProperties.OAuth.Provider("id", "secret", "202601"));
        when(properties.publishing()).thenReturn(new PostPilotProperties.Publishing(
                3, Duration.ofSeconds(2), Duration.ofMillis(1), Duration.ofSeconds(1), 1024));
        return properties;
    }
}
