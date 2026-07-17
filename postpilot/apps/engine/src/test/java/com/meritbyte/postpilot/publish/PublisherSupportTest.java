package com.meritbyte.postpilot.publish;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class PublisherSupportTest {
    @Test
    void abortsAResponseAsSoonAsItExceedsTheConfiguredBound() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://media.example.test/large.bin"))
                .andRespond(withSuccess(new byte[]{1, 2, 3, 4}, MediaType.APPLICATION_OCTET_STREAM));

        assertThatThrownBy(() -> PublisherSupport.download(builder.build(),
                "https://media.example.test/large.bin", 3))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("PUBLISH_MAX_IN_MEMORY_MEDIA_BYTES");
        server.verify();
    }
}
