package com.meritbyte.postpilot.media;

import com.meritbyte.postpilot.api.*;
import com.meritbyte.postpilot.config.PostPilotProperties;
import com.meritbyte.postpilot.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.*;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.web.util.UriUtils;

import static com.meritbyte.postpilot.api.ApiModels.*;

@Service
public class MediaService implements AutoCloseable {
    private static final Pattern CONTENT_TYPE = Pattern.compile("^(image|video)/[a-zA-Z0-9.+-]+$");
    private final PostPilotProperties.R2 config;
    private final MediaAssetRepository repository;
    private final S3Presigner presigner;
    private final S3Client client;

    public MediaService(PostPilotProperties properties, MediaAssetRepository repository) {
        this.config = properties.r2();
        this.repository = repository;
        if (configured()) {
            var credentials = StaticCredentialsProvider.create(
                    AwsBasicCredentials.create(config.accessKeyId(), config.secretAccessKey()));
            URI endpoint = URI.create("https://" + config.accountId() + ".r2.cloudflarestorage.com");
            this.presigner = S3Presigner.builder().endpointOverride(endpoint).region(Region.US_EAST_1)
                    .credentialsProvider(credentials).build();
            this.client = S3Client.builder().endpointOverride(endpoint).region(Region.US_EAST_1)
                    .credentialsProvider(credentials).httpClientBuilder(UrlConnectionHttpClient.builder())
                    .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build()).build();
        } else {
            this.presigner = null;
            this.client = null;
        }
    }

    public PresignResponse presign(PresignRequest request) {
        requireConfigured();
        validateContentType(request.contentType());
        if (request.size() > config.maxUploadBytes()) {
            throw new IllegalArgumentException("File exceeds R2_MAX_UPLOAD_BYTES (" + config.maxUploadBytes() + ")");
        }
        String safeName = request.filename().replaceAll("[^a-zA-Z0-9._-]", "_");
        if (safeName.length() > 160) safeName = safeName.substring(safeName.length() - 160);
        String key = DateTimeFormatter.ofPattern("uuuu/MM/dd").withZone(ZoneOffset.UTC).format(Instant.now()) +
                "/" + UUID.randomUUID() + "-" + safeName;
        PutObjectRequest put = PutObjectRequest.builder().bucket(config.bucket()).key(key)
                .contentType(request.contentType()).contentLength(request.size()).build();
        var signed = presigner.presignPutObject(PutObjectPresignRequest.builder()
                .signatureDuration(config.presignTtl()).putObjectRequest(put).build());
        return new PresignResponse(signed.url().toString(), key, publicUrl(key), config.presignTtl().toSeconds());
    }

    @Transactional
    public MediaDto complete(CompleteMediaRequest request) {
        requireConfigured();
        validateContentType(request.contentType());
        String expected = publicUrl(request.key());
        if (!expected.equals(request.publicUrl())) {
            throw new IllegalArgumentException("publicUrl does not match the configured R2 public URL for this key");
        }
        return repository.findByR2Key(request.key()).map(ApiMapper::media).orElseGet(() -> {
            HeadObjectResponse head;
            try {
                head = client.headObject(HeadObjectRequest.builder().bucket(config.bucket()).key(request.key()).build());
            } catch (S3Exception e) {
                throw new ConflictException("R2 object is not available; finish the PUT upload before calling complete");
            }
            String actualType = head.contentType() == null ? request.contentType() : head.contentType();
            if (!actualType.equalsIgnoreCase(request.contentType())) {
                throw new ConflictException("Uploaded object content type does not match the completion request");
            }
            if (head.contentLength() > config.maxUploadBytes()) {
                throw new ConflictException("Uploaded object exceeds R2_MAX_UPLOAD_BYTES and cannot be registered");
            }
            MediaAsset asset = new MediaAsset();
            asset.r2Key = request.key();
            asset.publicUrl = expected;
            asset.kind = actualType.toLowerCase(Locale.ROOT).startsWith("video/") ? MediaKind.VIDEO : MediaKind.IMAGE;
            asset.contentType = actualType;
            asset.originalName = request.originalName();
            asset.sizeBytes = head.contentLength();
            return ApiMapper.media(repository.save(asset));
        });
    }

    @Transactional
    public MediaDto registerExternal(ExternalMediaRequest request) {
        requireConfigured();
        validateContentType(request.contentType());
        URI uri;
        try { uri = URI.create(request.publicUrl()); }
        catch (Exception e) { throw new IllegalArgumentException("publicUrl must be a valid HTTPS URL"); }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null)
            throw new IllegalArgumentException("External media must use an R2 public HTTPS URL");
        URI allowedBase;
        try { allowedBase = URI.create(config.publicBaseUrl()); }
        catch (Exception e) { throw new ConfigurationException("R2_PUBLIC_BASE_URL is not a valid URL"); }
        int effectivePort = uri.getPort() == -1 ? 443 : uri.getPort();
        int allowedPort = allowedBase.getPort() == -1 ? 443 : allowedBase.getPort();
        if (uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null ||
                effectivePort != 443 || allowedPort != 443 || allowedBase.getHost() == null ||
                !allowedBase.getHost().equalsIgnoreCase(uri.getHost())) {
            throw new IllegalArgumentException("External media URL must exactly match R2_PUBLIC_BASE_URL on HTTPS port 443 without query or fragment");
        }
        String basePath = Optional.ofNullable(allowedBase.getRawPath()).orElse("").replaceAll("/+$", "");
        String rawPath = Optional.ofNullable(uri.getRawPath()).orElse("");
        String prefix = basePath + "/";
        if (!rawPath.startsWith(prefix) || rawPath.length() == prefix.length()) {
            throw new IllegalArgumentException("External media URL is outside the configured R2 public path");
        }
        String key;
        try {
            key = UriUtils.decode(rawPath.substring(prefix.length()), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalArgumentException("External media URL contains an invalid encoded R2 object key");
        }
        if (key.isBlank() || Arrays.stream(key.split("/", -1)).anyMatch(part -> part.isBlank() || part.equals(".") || part.equals(".."))) {
            throw new IllegalArgumentException("External media URL contains an invalid R2 object key");
        }
        HeadObjectResponse head;
        try {
            head = client.headObject(HeadObjectRequest.builder().bucket(config.bucket()).key(key).build());
        } catch (S3Exception e) {
            throw new ConflictException("R2 object is not available in the configured bucket");
        }
        String actualType = head.contentType();
        if (actualType == null || !actualType.equalsIgnoreCase(request.contentType())) {
            throw new ConflictException("R2 object Content-Type does not match the registration request");
        }
        if (head.contentLength() > config.maxUploadBytes()) {
            throw new ConflictException("R2 object exceeds R2_MAX_UPLOAD_BYTES and cannot be registered");
        }
        return repository.findByR2Key(key).map(ApiMapper::media).orElseGet(() -> {
            MediaAsset asset = new MediaAsset(); asset.r2Key = key; asset.publicUrl = publicUrl(key);
            asset.contentType = actualType; asset.originalName = request.originalName(); asset.sizeBytes = head.contentLength();
            asset.kind = actualType.toLowerCase(Locale.ROOT).startsWith("video/") ? MediaKind.VIDEO : MediaKind.IMAGE;
            return ApiMapper.media(repository.save(asset));
        });
    }

    private void validateContentType(String value) {
        if (!CONTENT_TYPE.matcher(value).matches()) {
            throw new IllegalArgumentException("Only image/* and video/* media can be uploaded");
        }
    }

    private String publicUrl(String key) {
        String base = config.publicBaseUrl().replaceAll("/+$", "");
        return base + "/" + key;
    }

    private boolean configured() {
        return nonBlank(config.accountId()) && nonBlank(config.accessKeyId()) && nonBlank(config.secretAccessKey()) &&
                nonBlank(config.bucket()) && nonBlank(config.publicBaseUrl());
    }
    private boolean nonBlank(String s) { return s != null && !s.isBlank(); }
    private void requireConfigured() {
        if (!configured()) throw new ConfigurationException("R2 is not configured; set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_BASE_URL");
    }

    @Override public void close() {
        if (presigner != null) presigner.close();
        if (client != null) client.close();
    }
}
