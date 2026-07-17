package com.meritbyte.postpilot.posts;

import com.meritbyte.postpilot.api.*;
import com.meritbyte.postpilot.api.ApiModels.*;
import com.meritbyte.postpilot.config.PostPilotProperties;
import com.meritbyte.postpilot.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.*;
import java.util.regex.Pattern;

@Service
public class PostService {
    private static final Pattern HASHTAG = Pattern.compile("(?<!\\S)#[\\p{L}\\p{N}_]+");
    private final PostRepository posts;
    private final MediaAssetRepository media;
    private final SocialAccountRepository accounts;
    private final PublishResultRepository results;
    private final ZoneId zone;

    public PostService(PostRepository posts, MediaAssetRepository media, SocialAccountRepository accounts,
                       PublishResultRepository results, PostPilotProperties properties) {
        this.posts = posts;
        this.media = media;
        this.accounts = accounts;
        this.results = results;
        this.zone = properties.timeZone();
    }

    @Transactional(readOnly = true)
    public List<PostDto> list(Instant from, Instant to, PostStatus status) {
        validateRange(from, to);
        return posts.search(from, to, status).stream().map(ApiMapper::post).toList();
    }

    @Transactional(readOnly = true)
    public List<PostDto> today(LocalDate date) {
        return posts.findToday(date).stream().map(ApiMapper::post).toList();
    }

    @Transactional(readOnly = true)
    public PostDto get(UUID id) { return ApiMapper.post(requireDetailed(id)); }

    @Transactional
    public PostDto create(PostRequest request) {
        PostEntity post = new PostEntity();
        apply(post, request);
        return ApiMapper.post(posts.save(post));
    }

    @Transactional
    public PostDto update(UUID id, PostRequest request) {
        PostEntity post = requireDetailed(id);
        if (results.existsByVariant_Post_Id(id)) {
            throw new ConflictException("Post has publish history; duplicate it to revise");
        }
        if (post.status == PostStatus.PUBLISHING || post.status == PostStatus.DONE || post.status == PostStatus.PARTIALLY_FAILED) {
            throw new ConflictException("Published or publishing posts are immutable; duplicate the post to revise it");
        }
        post.variants.clear();
        apply(post, request);
        post.updatedAt = Instant.now();
        return ApiMapper.post(posts.save(post));
    }

    @Transactional
    public void delete(UUID id) {
        PostEntity post = posts.findById(id).orElseThrow(() -> new NotFoundException("Post not found: " + id));
        if (results.existsByVariant_Post_Id(id)) {
            throw new ConflictException("Post has publish history; duplicate it to revise");
        }
        if (post.status == PostStatus.PUBLISHING) throw new ConflictException("A publishing post cannot be deleted");
        posts.delete(post);
    }

    @Transactional(readOnly = true)
    public List<CalendarItemDto> calendar(Instant from, Instant to) {
        Objects.requireNonNull(from, "from is required");
        Objects.requireNonNull(to, "to is required");
        validateRange(from, to);
        return posts.search(from, to, null).stream().filter(p -> p.scheduledAt != null)
                .map(p -> new CalendarItemDto(p.id, p.topic, p.scheduledAt, p.status,
                        p.variants.stream().map(v -> v.platform).distinct().toList())).toList();
    }

    private void apply(PostEntity post, PostRequest request) {
        validateDistinctVariants(request.variants());
        if (request.scheduledAt() != null && !request.scheduledAt().isAfter(Instant.now())) {
            throw new IllegalArgumentException("scheduledAt must be in the future; use /publish for an immediate post");
        }
        if (request.scheduledAt() != null && request.variants().stream().anyMatch(v -> !v.platform().isSupportedForPublishing())) {
            throw new IllegalArgumentException("YouTube and TikTok are native-scheduler-only; keep those variants as drafts without scheduledAt");
        }
        if (request.scheduledAt() != null && request.variants().stream()
                .anyMatch(v -> v.platform() == Platform.INSTAGRAM && v.mediaId() == null)) {
            throw new IllegalArgumentException("Scheduled Instagram variants require mediaId; keep incomplete content as a draft");
        }
        post.topic = trimToNull(request.topic());
        post.scheduledAt = request.scheduledAt();
        post.contentDate = request.contentDate() != null ? request.contentDate() :
                (request.scheduledAt() != null ? request.scheduledAt().atZone(zone).toLocalDate() : LocalDate.now(zone));
        post.status = request.scheduledAt() == null ? PostStatus.DRAFT : PostStatus.SCHEDULED;
        for (VariantRequest input : request.variants()) {
            validateRenderedText(input);
            PostVariant variant = new PostVariant();
            variant.platform = input.platform();
            variant.title = trimToNull(input.title());
            variant.caption = input.caption().trim();
            variant.hashtags = trimToNull(input.hashtags());
            if (input.mediaId() != null) variant.media = media.findById(input.mediaId())
                    .orElseThrow(() -> new NotFoundException("Media asset not found: " + input.mediaId()));
            if (input.accountId() != null) {
                variant.account = accounts.findById(input.accountId())
                        .orElseThrow(() -> new NotFoundException("Channel not found: " + input.accountId()));
                if (variant.account.platform != variant.platform) {
                    throw new IllegalArgumentException("accountId platform does not match variant platform");
                }
                if (request.scheduledAt() != null && (variant.account.status != AccountStatus.ACTIVE ||
                        (variant.account.expiresAt != null && !variant.account.expiresAt.isAfter(Instant.now())))) {
                    throw new IllegalArgumentException("Scheduled variants require an active, unexpired accountId");
                }
            } else if (request.scheduledAt() != null) {
                List<SocialAccount> candidates = accounts
                        .findByPlatformAndStatusOrderByCreatedAtAsc(variant.platform, AccountStatus.ACTIVE).stream()
                        .filter(account -> account.expiresAt == null || account.expiresAt.isAfter(Instant.now()))
                        .toList();
                if (candidates.isEmpty()) {
                    throw new IllegalArgumentException("Scheduled " + variant.platform.wire() +
                            " variant requires a connected active accountId");
                }
                if (candidates.size() > 1) {
                    throw new IllegalArgumentException("Scheduled " + variant.platform.wire() +
                            " variant requires an explicit accountId because multiple active accounts are connected");
                }
                variant.account = candidates.getFirst();
            }
            post.addVariant(variant);
        }
    }

    private void validateRenderedText(VariantRequest input) {
        String caption = input.caption().trim();
        String hashtags = trimToNull(input.hashtags());
        String rendered = hashtags == null ? caption : caption + "\n\n" + hashtags;
        int codePoints = rendered.codePointCount(0, rendered.length());
        int limit = switch (input.platform()) {
            case X -> 280;
            case INSTAGRAM -> 2_200;
            case LINKEDIN -> 3_000;
            case FACEBOOK -> 63_206;
            default -> Integer.MAX_VALUE;
        };
        if (codePoints > limit) {
            throw new IllegalArgumentException(input.platform().wire() + " rendered text exceeds " + limit +
                    " Unicode code points (caption, separator, and hashtags combined)");
        }
        if (input.platform() == Platform.INSTAGRAM && hashtags != null && HASHTAG.matcher(hashtags).results().count() > 30) {
            throw new IllegalArgumentException("Instagram allows at most 30 hashtag tokens");
        }
    }

    private void validateDistinctVariants(List<VariantRequest> variants) {
        Set<String> keys = new HashSet<>();
        for (VariantRequest v : variants) {
            String key = v.platform() + ":" + (v.accountId() == null ? "default" : v.accountId());
            if (!keys.add(key)) throw new IllegalArgumentException("Duplicate variant for " + v.platform().wire() + " and account");
        }
    }

    private PostEntity requireDetailed(UUID id) {
        return posts.findDetailedById(id).orElseThrow(() -> new NotFoundException("Post not found: " + id));
    }
    private void validateRange(Instant from, Instant to) {
        if (from != null && to != null && !from.isBefore(to)) throw new IllegalArgumentException("from must be before to");
    }
    private String trimToNull(String value) {
        if (value == null || value.isBlank()) return null;
        return value.trim();
    }
}
