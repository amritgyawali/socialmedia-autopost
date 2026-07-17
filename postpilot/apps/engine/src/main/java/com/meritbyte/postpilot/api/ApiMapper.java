package com.meritbyte.postpilot.api;

import com.meritbyte.postpilot.domain.*;
import java.util.*;

import static com.meritbyte.postpilot.api.ApiModels.*;

public final class ApiMapper {
    private ApiMapper() {}

    public static MediaDto media(MediaAsset m) {
        return m == null ? null : new MediaDto(m.id, m.r2Key, m.publicUrl, m.kind, m.contentType,
                m.originalName, m.sizeBytes, m.createdAt);
    }

    public static VariantDto variant(PostVariant v) {
        return new VariantDto(v.id, v.platform, v.account == null ? null : v.account.id, v.title,
                v.caption, v.hashtags, v.media == null ? null : v.media.id, media(v.media));
    }

    public static PostDto post(PostEntity p) {
        return new PostDto(p.id, p.topic, p.contentDate, p.scheduledAt, p.status,
                p.variants.stream().map(ApiMapper::variant).toList(), p.createdAt, p.updatedAt);
    }

    public static PublishResultDto result(PublishResultEntity r) {
        return new PublishResultDto(r.id == null ? 0 : r.id, r.variant.post.id, r.variant.id, r.variant.platform, r.attempt,
                r.status, r.platformPostId, r.error, r.postedAt, r.nextAttemptAt, r.nextAttemptAt != null);
    }
}
