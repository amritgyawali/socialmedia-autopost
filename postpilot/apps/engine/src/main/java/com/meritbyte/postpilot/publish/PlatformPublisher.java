package com.meritbyte.postpilot.publish;

import com.meritbyte.postpilot.domain.*;

public interface PlatformPublisher {
    Platform platform();
    PublishedPost publish(PostVariant variant, SocialAccount account, String accessToken);
    record PublishedPost(String id) {}
}
