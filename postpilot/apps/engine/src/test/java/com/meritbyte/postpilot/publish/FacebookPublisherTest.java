package com.meritbyte.postpilot.publish;

import com.meritbyte.postpilot.config.PostPilotProperties;
import com.meritbyte.postpilot.domain.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class FacebookPublisherTest {
    @Test
    void sendsPageFeedRequestAndReturnsPlatformId() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        PostPilotProperties props = mock(PostPilotProperties.class);
        PostPilotProperties.OAuth oauth = mock(PostPilotProperties.OAuth.class);
        when(props.oauth()).thenReturn(oauth);
        when(oauth.meta()).thenReturn(new PostPilotProperties.OAuth.Provider("id", "secret", "v25.0"));
        FacebookPublisher publisher = new FacebookPublisher(builder.build(), props);
        server.expect(requestTo("https://graph.facebook.com/v25.0/page-1/feed"))
                .andExpect(method(org.springframework.http.HttpMethod.POST))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_FORM_URLENCODED))
                .andExpect(content().string(org.hamcrest.Matchers.allOf(
                        org.hamcrest.Matchers.containsString("message=Hello"),
                        org.hamcrest.Matchers.containsString("access_token=token"))))
                .andRespond(withSuccess("{\"id\":\"page-1_42\"}", MediaType.APPLICATION_JSON));
        PostVariant variant = new PostVariant(); variant.caption = "Hello"; variant.platform = Platform.FACEBOOK;
        SocialAccount account = new SocialAccount(); account.externalId = "page-1";
        assertThat(publisher.publish(variant, account, "token").id()).isEqualTo("page-1_42");
        server.verify();
    }
}
