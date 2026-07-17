package com.meritbyte.postpilot.schedule;

import com.meritbyte.postpilot.domain.*;
import com.meritbyte.postpilot.publish.PublishService;
import com.meritbyte.postpilot.config.PostPilotProperties;
import org.slf4j.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.*;
import java.util.*;

@Component
public class PublishScheduler {
    private static final Logger log = LoggerFactory.getLogger(PublishScheduler.class);
    private final PostRepository posts;
    private final PublishResultRepository results;
    private final PublishService publishing;
    private final int maxAttempts;
    public PublishScheduler(PostRepository posts, PublishResultRepository results, PublishService publishing, PostPilotProperties properties) {
        this.posts = posts; this.results = results; this.publishing = publishing;
        this.maxAttempts = Math.max(1, properties.publishing().maxAttempts());
    }

    @Scheduled(fixedDelayString = "${SCHEDULER_INTERVAL:PT15S}", initialDelayString = "PT10S")
    public void publishDue() {
        Instant now = Instant.now();
        for (PostEntity post : posts.findByScheduledAtLessThanEqualAndStatusIn(now, List.of(PostStatus.SCHEDULED))) {
            try { publishing.publishPost(post.id); }
            catch (Exception e) { log.error("Scheduled post {} failed to dispatch: {}", post.id, e.getMessage()); }
        }
    }

    @Scheduled(fixedDelayString = "${RETRY_INTERVAL:PT15S}", initialDelayString = "PT20S")
    public void retryDue() {
        recoverStaleAttempts();
        for (PublishResultEntity queued : results.findByStatusAndPostedAtBefore(PublishStatus.QUEUED, Instant.now().minus(Duration.ofMinutes(1)))) {
            publishing.dispatchResult(queued.id);
        }
        Set<UUID> variants = new LinkedHashSet<>();
        for (PublishResultEntity r : results.findByStatusAndNextAttemptAtLessThanEqualAndAttemptLessThan(
                PublishStatus.FAILED, Instant.now(), maxAttempts)) {
            variants.add(r.variant.id);
        }
        for (UUID id : variants) {
            try { publishing.retryVariant(id); }
            catch (Exception e) { log.error("Retry for variant {} failed to dispatch: {}", id, e.getMessage()); }
        }
    }

    void recoverStaleAttempts() {
        for (PublishResultEntity result : results.findByStatusAndPostedAtBefore(PublishStatus.POSTING, Instant.now().minus(Duration.ofMinutes(10)))) {
            publishing.recoverStaleResult(result.id);
        }
    }
}
