package com.meritbyte.postpilot.domain;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

public enum MediaKind {
    IMAGE, VIDEO;
    @JsonValue public String wire() { return name().toLowerCase(Locale.ROOT); }
    @JsonCreator public static MediaKind from(String value) {
        return value == null ? null : valueOf(value.trim().toUpperCase(Locale.ROOT));
    }
}
