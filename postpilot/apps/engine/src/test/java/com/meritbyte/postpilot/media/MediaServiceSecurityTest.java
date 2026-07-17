package com.meritbyte.postpilot.media;

import com.meritbyte.postpilot.api.ApiModels.ExternalMediaRequest;
import com.meritbyte.postpilot.api.ApiModels.PresignRequest;
import com.meritbyte.postpilot.config.PostPilotProperties;
import com.meritbyte.postpilot.domain.MediaAssetRepository;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.regex.Pattern;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class MediaServiceSecurityTest {
    @Test
    void externalImportRejectsHostOutsideConfiguredR2PublicOriginBeforeFetching() {
        PostPilotProperties props = mock(PostPilotProperties.class);
        when(props.r2()).thenReturn(new PostPilotProperties.R2("account", "access", "secret",
                "bucket", "https://media.example.test", Duration.ofMinutes(15), 10_000_000));
        try (MediaService service = new MediaService(props, mock(MediaAssetRepository.class))) {
            assertThatThrownBy(() -> service.registerExternal(new ExternalMediaRequest(
                    "https://attacker.example/image.jpg", "image/jpeg", "image.jpg")))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("exactly match R2_PUBLIC_BASE_URL");
        }
    }

    @Test
    void browserPresignRequiresNoChecksumOrCustomHeader() {
        PostPilotProperties props = mock(PostPilotProperties.class);
        when(props.r2()).thenReturn(new PostPilotProperties.R2("account", "access", "secret",
                "bucket", "https://media.example.test", Duration.ofMinutes(15), 26_214_400));
        try (MediaService service = new MediaService(props, mock(MediaAssetRepository.class))) {
            var response = service.presign(new PresignRequest("image.jpg", "image/jpeg", 3));
            String query = URI.create(response.uploadUrl()).getRawQuery();
            String signedHeaders = Pattern.compile("(?:^|&)X-Amz-SignedHeaders=([^&]+)", Pattern.CASE_INSENSITIVE)
                    .matcher(query).results().findFirst()
                    .map(match -> URLDecoder.decode(match.group(1), StandardCharsets.UTF_8)).orElseThrow();

            assertThat(response.uploadUrl().toLowerCase()).doesNotContain("checksum");
            assertThat(signedHeaders.split(";")).allMatch(Set.of("host", "content-length", "content-type")::contains);
        }
    }

    @Test
    void externalRegistrationRejectsQueryStringsBeforeAnyR2Lookup() {
        PostPilotProperties props = mock(PostPilotProperties.class);
        when(props.r2()).thenReturn(new PostPilotProperties.R2("account", "access", "secret",
                "bucket", "https://media.example.test", Duration.ofMinutes(15), 26_214_400));
        try (MediaService service = new MediaService(props, mock(MediaAssetRepository.class))) {
            assertThatThrownBy(() -> service.registerExternal(new ExternalMediaRequest(
                    "https://media.example.test/image.jpg?redirect=1", "image/jpeg", "image.jpg")))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("without query or fragment");
        }
    }
}
