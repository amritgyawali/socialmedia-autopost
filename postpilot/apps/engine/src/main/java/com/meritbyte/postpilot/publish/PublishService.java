package com.meritbyte.postpilot.publish;

import com.meritbyte.postpilot.api.*;
import com.meritbyte.postpilot.api.ApiModels.PublishResultDto;
import com.meritbyte.postpilot.config.PostPilotProperties;
import com.meritbyte.postpilot.domain.*;
import com.meritbyte.postpilot.notify.TelegramNotifier;
import com.meritbyte.postpilot.vault.TokenVault;
import org.slf4j.*;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientResponseException;

import java.io.IOException;
import java.time.*;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class PublishService {
    private static final Logger log = LoggerFactory.getLogger(PublishService.class);
    private final PostRepository posts;
    private final PostVariantRepository variants;
    private final PublishResultRepository results;
    private final SocialAccountRepository accounts;
    private final TokenVault vault;
    private final TelegramNotifier notifier;
    private final Map<Platform, PlatformPublisher> publishers;
    private final AsyncTaskExecutor executor;
    private final TransactionTemplate tx;
    private final int maxAttempts;

    public PublishService(PostRepository posts, PostVariantRepository variants, PublishResultRepository results,
                          SocialAccountRepository accounts, TokenVault vault, TelegramNotifier notifier,
                          List<PlatformPublisher> publishers, AsyncTaskExecutor executor,
                          PlatformTransactionManager transactionManager, PostPilotProperties properties) {
        this.posts = posts; this.variants = variants; this.results = results; this.accounts = accounts;
        this.vault = vault; this.notifier = notifier; this.executor = executor;
        this.publishers = publishers.stream().collect(Collectors.toUnmodifiableMap(PlatformPublisher::platform, Function.identity()));
        this.tx = new TransactionTemplate(transactionManager);
        this.maxAttempts = Math.max(1, properties.publishing().maxAttempts());
    }

    /** Queues all non-successful variants and returns immediately. The cockpit polls /results. */
    public List<PublishResultDto> publishPost(UUID postId) {
        QueueBatch batch = tx.execute(status -> queuePost(postId));
        batch.resultIds().forEach(this::dispatchResult);
        return batch.response();
    }

    /** Queues one automatic retry and returns immediately; used by the retry scheduler. */
    public PublishResultDto retryVariant(UUID variantId) {
        PublishResultDto queued = tx.execute(status -> queueVariant(variantId));
        if (queued.status() == PublishStatus.QUEUED) dispatchResult(queued.id());
        return queued;
    }

    public void dispatchResult(long resultId) {
        executor.execute(() -> processQueued(resultId));
    }

    /** A worker that disappeared after invoking an adapter has an unknowable provider outcome. */
    public void recoverStaleResult(long resultId) {
        tx.executeWithoutResult(status -> finish(resultId, null, PublishFailure.outcomeUnknown(
                "Publishing worker stopped before recording the provider response")));
    }

    public List<PublishResultDto> latestResults(UUID postId) {
        return tx.execute(status -> {
            if (!posts.existsById(postId)) throw new NotFoundException("Post not found: " + postId);
            var all = results.findByVariant_Post_IdOrderByVariant_IdAscAttemptDesc(postId);
            Set<UUID> seen = new HashSet<>();
            return all.stream().filter(r -> seen.add(r.variant.id)).map(ApiMapper::result).toList();
        });
    }

    private QueueBatch queuePost(UUID postId) {
        PostEntity post = posts.findDetailedForUpdate(postId).orElseThrow(() -> new NotFoundException("Post not found: " + postId));
        if (post.variants.isEmpty()) throw new ConflictException("Post has no variants");
        List<Long> dispatch = new ArrayList<>();
        List<PublishResultDto> response = new ArrayList<>();
        for (PostVariant variant : post.variants) {
            // This is the user/scheduled-post entry point. A user may always make a new
            // deliberate attempt after checking a previous terminal/unknown outcome.
            PublishResultEntity queued = queueEntity(variant, false);
            response.add(ApiMapper.result(queued));
            if (queued.status == PublishStatus.QUEUED) dispatch.add(queued.id);
        }
        post.status = response.stream().allMatch(r -> r.status() == PublishStatus.SUCCESS) ? PostStatus.DONE : PostStatus.PUBLISHING;
        post.updatedAt = Instant.now(); posts.save(post);
        return new QueueBatch(List.copyOf(dispatch), List.copyOf(response));
    }

    private PublishResultDto queueVariant(UUID variantId) {
        PostVariant variant = variants.findDetailedById(variantId)
                .orElseThrow(() -> new NotFoundException("Post variant not found: " + variantId));
        PublishResultEntity queued = queueEntity(variant, true);
        if (queued.status == PublishStatus.QUEUED) {
            variant.post.status = PostStatus.PUBLISHING; variant.post.updatedAt = Instant.now(); posts.save(variant.post);
        }
        return ApiMapper.result(queued);
    }

    private PublishResultEntity queueEntity(PostVariant variant, boolean automatic) {
        Optional<PublishResultEntity> latest = results.findFirstByVariant_IdOrderByAttemptDesc(variant.id);
        if (latest.filter(r -> r.status == PublishStatus.SUCCESS || r.status == PublishStatus.POSTING || r.status == PublishStatus.QUEUED).isPresent()) {
            return latest.get();
        }
        int attempt = latest.map(r -> r.attempt + 1).orElse(1);
        if (!mayQueueAttempt(attempt, maxAttempts, automatic)) return latest.orElseThrow();
        latest.ifPresent(r -> { r.nextAttemptAt = null; results.save(r); });
        PublishResultEntity queued = new PublishResultEntity();
        queued.variant = variant; queued.attempt = attempt; queued.status = PublishStatus.QUEUED;
        queued.idempotencyKey = variant.post.id + ":" + variant.id;
        queued.postedAt = Instant.now();
        return results.saveAndFlush(queued);
    }

    private void processQueued(long resultId) {
        PublishJob job;
        try {
            job = tx.execute(status -> prepare(resultId));
        } catch (Exception e) {
            log.error("Could not prepare publish result {}: {}", resultId, e.getMessage());
            return;
        }
        if (job == null) return;
        String platformPostId = null;
        PublishFailure failure = job.preparationError() == null ? null : PublishFailure.terminal(job.preparationError());
        if (failure == null) {
            try {
                PlatformPublisher.PublishedPost published = job.publisher().publish(job.variant(), job.account(), job.accessToken());
                platformPostId = published.id();
            } catch (Exception e) {
                AccountStatus accountStatus = classifyAccountStatus(e);
                if (accountStatus != null) updateConnectionHealth(job.account(), accountStatus);
                failure = classifyAdapterFailure(e);
                log.warn("{} publish attempt failed for variant {}: {}", job.variant().platform, job.variant().id, failure.message());
            }
        }
        String finalPlatformPostId = platformPostId;
        PublishFailure finalFailure = failure;
        PostStatus terminal = tx.execute(status -> finish(resultId, finalPlatformPostId, finalFailure));
        if (terminal == PostStatus.DONE || terminal == PostStatus.FAILED || terminal == PostStatus.PARTIALLY_FAILED) {
            sendSummary(job.postId());
        }
    }

    private PublishJob prepare(long resultId) {
        PublishResultEntity result = results.findLockedDetailedById(resultId).orElse(null);
        if (result == null || result.status != PublishStatus.QUEUED) return null;
        result.status = PublishStatus.POSTING; result.postedAt = Instant.now(); results.save(result);
        PostVariant variant = result.variant;
        // Initialize the associations required by an adapter before this job leaves the transaction.
        UUID ignoredPostId = variant.post.id;
        if (variant.media != null) { UUID ignoredMediaId = variant.media.id; }
        if (variant.account != null) { UUID ignoredAccountId = variant.account.id; }
        if (!variant.platform.isSupportedForPublishing()) {
            return PublishJob.error(resultId, variant, "Automated publishing is disabled: " + variant.platform.wire() +
                    " is native-scheduler-only in PostPilot v1 until platform audit/verification");
        }
        PlatformPublisher publisher = publishers.get(variant.platform);
        if (publisher == null) return PublishJob.error(resultId, variant, "No publishing adapter is installed for " + variant.platform.wire());
        SocialAccount account;
        try { account = resolveAccount(variant); }
        catch (Exception e) { return PublishJob.error(resultId, variant, safeError(e)); }
        if (account.status != AccountStatus.ACTIVE) return PublishJob.error(resultId, variant,
                "Connected " + variant.platform.wire() + " account is " + account.status.wire() + "; reconnect it first");
        if (account.expiresAt != null && account.expiresAt.isBefore(Instant.now())) return PublishJob.error(resultId, variant,
                "Connected " + variant.platform.wire() + " token expired; reconnect the account or wait for token refresh");
        try {
            return new PublishJob(resultId, variant.post.id, variant, account, vault.decrypt(account.accessTokenEnc), publisher, null);
        } catch (Exception e) {
            return PublishJob.error(resultId, variant, safeError(e));
        }
    }

    private PostStatus finish(long resultId, String platformPostId, PublishFailure failure) {
        PublishResultEntity result = results.findLockedDetailedById(resultId).orElseThrow();
        if (result.status != PublishStatus.POSTING) return result.variant.post.status;
        result.postedAt = Instant.now();
        if (failure == null) {
            result.status = PublishStatus.SUCCESS; result.platformPostId = platformPostId;
            result.error = null; result.nextAttemptAt = null;
        } else {
            result.status = PublishStatus.FAILED; result.error = failure.message();
            result.nextAttemptAt = failure.autoRetry() && result.attempt < maxAttempts
                    ? Instant.now().plus(backoff(result.attempt)) : null;
        }
        results.save(result);
        return refreshPostStatus(result.variant.post.id);
    }

    private SocialAccount resolveAccount(PostVariant variant) {
        if (variant.account != null) return variant.account;
        List<SocialAccount> candidates = accounts.findByPlatformAndStatusOrderByCreatedAtAsc(variant.platform, AccountStatus.ACTIVE);
        if (candidates.isEmpty()) throw new IllegalStateException("No active " + variant.platform.wire() +
                " account is connected; configure platform credentials and complete OAuth in Connections first");
        if (candidates.size() > 1) throw new IllegalStateException("Multiple active " + variant.platform.wire() +
                " accounts are connected; select an accountId for this variant before publishing");
        SocialAccount selected = candidates.getFirst();
        // Bind a legacy/null selection before invoking the adapter so any later manual or
        // automatic attempt cannot silently switch to a different connected account.
        variant.account = selected;
        variants.save(variant);
        return selected;
    }

    private PostStatus refreshPostStatus(UUID postId) {
        PostEntity post = posts.findDetailedForUpdate(postId).orElseThrow();
        int successes = 0; boolean pending = false; int exhausted = 0;
        for (PostVariant variant : post.variants) {
            Optional<PublishResultEntity> r = results.findFirstByVariant_IdOrderByAttemptDesc(variant.id);
            if (r.isEmpty() || r.get().status == PublishStatus.POSTING || r.get().status == PublishStatus.QUEUED) pending = true;
            else if (r.get().status == PublishStatus.SUCCESS) successes++;
            else if (r.get().nextAttemptAt != null && r.get().attempt < maxAttempts) pending = true;
            else exhausted++;
        }
        if (successes == post.variants.size()) post.status = PostStatus.DONE;
        else if (pending) post.status = PostStatus.PUBLISHING;
        else if (successes > 0) post.status = PostStatus.PARTIALLY_FAILED;
        else if (exhausted > 0) post.status = PostStatus.FAILED;
        post.updatedAt = Instant.now(); posts.save(post);
        return post.status;
    }

    private void sendSummary(UUID postId) {
        List<PublishResultDto> latest = latestResults(postId);
        long success = latest.stream().filter(r -> r.status() == PublishStatus.SUCCESS).count();
        notifier.send((success == latest.size() ? "✅" : "⚠️") + " PostPilot posted " + success + "/" + latest.size() + " variants");
    }
    private Duration backoff(int failedAttempt) {
        return switch (failedAttempt) { case 1 -> Duration.ofSeconds(30); case 2 -> Duration.ofMinutes(2); default -> Duration.ofMinutes(10); };
    }
    static boolean mayQueueAttempt(int attempt, int maxAttempts, boolean automatic) {
        return !automatic || attempt <= maxAttempts;
    }

    static PublishFailure classifyAdapterFailure(Exception e) {
        String message = safeError(e);
        RestClientResponseException response = findCause(e, RestClientResponseException.class);
        if (response != null && response.getStatusCode().value() == 429) {
            return PublishFailure.retryable(message);
        }
        if (response != null && response.getStatusCode().is5xxServerError()) {
            return PublishFailure.outcomeUnknown(message);
        }
        if (findCause(e, ResourceAccessException.class) != null || findCause(e, IOException.class) != null) {
            return PublishFailure.outcomeUnknown(message);
        }
        // Definite provider rejections and local adapter errors are terminal. Retrying
        // automatically is unsafe because an adapter may already have performed a create.
        return PublishFailure.terminal(message);
    }

    static AccountStatus classifyAccountStatus(Exception e) {
        RestClientResponseException response = findCause(e, RestClientResponseException.class);
        if (response == null) return null;
        int status = response.getStatusCode().value();
        if (status == 401) return AccountStatus.EXPIRED;
        if (status != 403) return null;
        String body = response.getResponseBodyAsString().toLowerCase(Locale.ROOT);
        boolean authorizationFailure = List.of("token", "oauth", "scope", "permission", "authorization",
                        "authentication", "credential")
                .stream().anyMatch(body::contains);
        return authorizationFailure ? AccountStatus.ERROR : null;
    }

    private void updateConnectionHealth(SocialAccount attempted, AccountStatus status) {
        boolean changed = Boolean.TRUE.equals(tx.execute(transaction -> accounts.findById(attempted.id).map(account -> {
            account.status = status;
            account.updatedAt = Instant.now();
            accounts.save(account);
            return true;
        }).orElse(false)));
        if (changed) {
            notifier.send("PostPilot: " + attempted.platform.wire() + " authorization was rejected for " +
                    attempted.displayName + "; reconnect the account in Connections");
        }
    }

    private static <T extends Throwable> T findCause(Throwable error, Class<T> type) {
        Throwable current = error;
        while (current != null) {
            if (type.isInstance(current)) return type.cast(current);
            if (current.getCause() == current) break;
            current = current.getCause();
        }
        return null;
    }

    private static String safeError(Exception e) {
        RestClientResponseException response = findCause(e, RestClientResponseException.class);
        if (response != null) {
            int status = response.getStatusCode().value();
            return "Provider returned HTTP " + status + explainStatus(status);
        }
        if (findCause(e, ResourceAccessException.class) != null || findCause(e, IOException.class) != null) {
            return "Provider network request failed";
        }
        Throwable root = e; while (root.getCause() != null && root.getCause() != root) root = root.getCause();
        String message = root.getMessage(); if (message == null || message.isBlank()) message = root.getClass().getSimpleName();
        message = message.replaceAll("(?i)(access_token|client_secret|refresh_token)=[^&\\s]+", "$1=[redacted]");
        return message.length() > 4000 ? message.substring(0, 4000) : message;
    }

    /** Operator-facing hint for the provider statuses that otherwise look like silent no-ops. */
    private static String explainStatus(int status) {
        return switch (status) {
            case 401 -> " — the access token was rejected; reconnect the account in Connections";
            case 402 -> " — this platform's API plan does not permit posting (X requires paid API access at developer.x.com)";
            case 403 -> " — the app is missing a permission/scope this action requires";
            case 429 -> " — rate limited by the platform; PostPilot retries automatically";
            default -> "";
        };
    }

    private record QueueBatch(List<Long> resultIds, List<PublishResultDto> response) {}
    record PublishFailure(String message, boolean autoRetry) {
        private static final String UNKNOWN = "outcome unknown—verify platform before manual retry";
        static PublishFailure retryable(String message) { return new PublishFailure(message, true); }
        static PublishFailure terminal(String message) { return new PublishFailure(message, false); }
        static PublishFailure outcomeUnknown(String detail) {
            String message = detail == null || detail.isBlank() ? UNKNOWN : detail + "; " + UNKNOWN;
            return new PublishFailure(message, false);
        }
    }
    private record PublishJob(long resultId, UUID postId, PostVariant variant, SocialAccount account,
                              String accessToken, PlatformPublisher publisher, String preparationError) {
        static PublishJob error(long id, PostVariant variant, String error) {
            return new PublishJob(id, variant.post.id, variant, null, null, null, error);
        }
    }
}
