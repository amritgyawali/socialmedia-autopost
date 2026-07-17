package com.meritbyte.postpilot.domain;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

public enum PostStatus {
    DRAFT, READY, SCHEDULED, PUBLISHING, DONE, PARTIALLY_FAILED, FAILED;
    @JsonValue public String wire() { return name().toLowerCase(Locale.ROOT); }
    @JsonCreator public static PostStatus from(String value) {
        return value == null ? null : valueOf(value.trim().toUpperCase(Locale.ROOT));
    }
}
