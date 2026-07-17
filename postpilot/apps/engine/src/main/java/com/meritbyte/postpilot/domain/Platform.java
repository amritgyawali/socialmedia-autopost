package com.meritbyte.postpilot.domain;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Locale;

public enum Platform {
    FACEBOOK, INSTAGRAM, X, LINKEDIN, YOUTUBE, TIKTOK;

    @JsonValue
    public String wire() { return name().toLowerCase(Locale.ROOT); }

    @JsonCreator
    public static Platform from(String value) {
        if (value == null) return null;
        return valueOf(value.trim().toUpperCase(Locale.ROOT));
    }

    public boolean isSupportedForPublishing() {
        return this == FACEBOOK || this == INSTAGRAM || this == LINKEDIN || this == X;
    }
}
