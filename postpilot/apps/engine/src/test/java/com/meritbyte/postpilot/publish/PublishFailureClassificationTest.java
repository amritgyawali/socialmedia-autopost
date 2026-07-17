package com.meritbyte.postpilot.publish;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import com.meritbyte.postpilot.domain.AccountStatus;

import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class PublishFailureClassificationTest {
    @Test
    void timeoutAndServerErrorHaveUnknownOutcomeAndNeverAutoRetry() {
        var timeout = PublishService.classifyAdapterFailure(
                new ResourceAccessException("timed out", new SocketTimeoutException("read timed out")));
        var serverError = PublishService.classifyAdapterFailure(HttpServerErrorException.create(
                HttpStatus.BAD_GATEWAY, "Bad Gateway", HttpHeaders.EMPTY, new byte[0], StandardCharsets.UTF_8));

        assertThat(timeout.autoRetry()).isFalse();
        assertThat(timeout.message()).contains("outcome unknown—verify platform before manual retry");
        assertThat(serverError.autoRetry()).isFalse();
        assertThat(serverError.message()).contains("outcome unknown—verify platform before manual retry");
    }

    @Test
    void onlyExplicitRateLimitIsEligibleForAutomaticRetry() {
        var rateLimit = PublishService.classifyAdapterFailure(HttpClientErrorException.create(
                HttpStatus.TOO_MANY_REQUESTS, "Too Many Requests", HttpHeaders.EMPTY, new byte[0], StandardCharsets.UTF_8));
        var rejection = PublishService.classifyAdapterFailure(HttpClientErrorException.create(
                HttpStatus.BAD_REQUEST, "Bad Request", HttpHeaders.EMPTY, new byte[0], StandardCharsets.UTF_8));

        assertThat(rateLimit.autoRetry()).isTrue();
        assertThat(rejection.autoRetry()).isFalse();
    }

    @Test
    void automaticCapDoesNotBlockAUserInitiatedAttempt() {
        assertThat(PublishService.mayQueueAttempt(4, 3, true)).isFalse();
        assertThat(PublishService.mayQueueAttempt(4, 3, false)).isTrue();
    }

    @Test
    void classifiesOnlyDefiniteAuthorizationFailuresAsConnectionHealthProblems() {
        var unauthorized = HttpClientErrorException.create(HttpStatus.UNAUTHORIZED, "Unauthorized",
                HttpHeaders.EMPTY, new byte[0], StandardCharsets.UTF_8);
        var permission = HttpClientErrorException.create(HttpStatus.FORBIDDEN, "Forbidden", HttpHeaders.EMPTY,
                "{\"message\":\"insufficient permission for this token\"}".getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8);
        var contentPolicy = HttpClientErrorException.create(HttpStatus.FORBIDDEN, "Forbidden", HttpHeaders.EMPTY,
                "{\"message\":\"content violates community policy\"}".getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8);

        assertThat(PublishService.classifyAccountStatus(unauthorized)).isEqualTo(AccountStatus.EXPIRED);
        assertThat(PublishService.classifyAccountStatus(permission)).isEqualTo(AccountStatus.ERROR);
        assertThat(PublishService.classifyAccountStatus(contentPolicy)).isNull();
    }
}
