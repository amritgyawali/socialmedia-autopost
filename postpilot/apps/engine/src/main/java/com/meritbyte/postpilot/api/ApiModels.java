package com.meritbyte.postpilot.api;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.meritbyte.postpilot.domain.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class ApiModels {
    private ApiModels() {}

    public record ChannelDto(UUID id, Platform platform, String externalId, String displayName,
                             AccountStatus status, Instant expiresAt, String reconnectUrl, String scopes) {}

    public record MediaDto(UUID id, String key, String publicUrl, MediaKind kind, String contentType,
                           String originalName, Long size, Instant createdAt) {}

    public record VariantDto(UUID id, Platform platform, UUID accountId, String title, String caption,
                             String hashtags, UUID mediaId, MediaDto media) {}

    public record PostDto(UUID id, String topic, LocalDate contentDate, Instant scheduledAt, PostStatus status,
                          List<VariantDto> variants, Instant createdAt, Instant updatedAt) {}

    public record VariantRequest(
            @NotNull Platform platform,
            UUID accountId,
            @Size(max = 500) String title,
            @NotBlank @Size(max = 100000) String caption,
            @Size(max = 10000) String hashtags,
            UUID mediaId) {}

    public record PostRequest(
            @Size(max = 500) String topic,
            LocalDate contentDate,
            Instant scheduledAt,
            @NotEmpty @Size(max = 10) List<@Valid VariantRequest> variants) {}

    public record PublishResultDto(long id, UUID postId, UUID variantId, Platform platform, int attempt,
                                   PublishStatus status, String platformPostId, String error,
                                   Instant postedAt, Instant nextAttemptAt, boolean retryable) {}

    public record LogsPage(List<PublishResultDto> items, int page, int size, long total, int totalPages) {}

    public record CalendarItemDto(UUID id, String topic, Instant scheduledAt, PostStatus status,
                                  List<Platform> platforms) {}

    public record PresignRequest(
            @NotBlank @JsonAlias("fileName") String filename,
            @NotBlank String contentType,
            @Positive @JsonAlias("sizeBytes") long size) {}

    public record PresignResponse(String uploadUrl, String key, String publicUrl, long expiresInSeconds) {}

    public record CompleteMediaRequest(
            @NotBlank String key,
            @NotBlank String publicUrl,
            @NotBlank String contentType,
            @Size(max = 512) String originalName,
            @PositiveOrZero Long size) {}

    public record ExternalMediaRequest(
            @NotBlank String publicUrl,
            @NotBlank String contentType,
            @Size(max = 512) String originalName) {}

    public record OAuthStartResponse(String url) {}
    public record OAuthCallbackResponse(String status, Platform platform, int accountsConnected, String message) {}
}
