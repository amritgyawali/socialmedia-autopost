package com.meritbyte.postpilot.domain;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

public enum AccountStatus {
    ACTIVE, EXPIRED, ERROR;
    @JsonValue public String wire() { return name().toLowerCase(Locale.ROOT); }
}
