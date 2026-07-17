package com.meritbyte.postpilot;

import com.meritbyte.postpilot.domain.*;
import com.meritbyte.postpilot.vault.TokenVault;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"SCHEDULER_INTERVAL=PT1H", "RETRY_INTERVAL=PT1H", "TOKEN_REFRESH_INTERVAL=PT1H"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PostApiIntegrationTest {
    private static final String AUTH = "Bearer test-shared-secret-that-is-at-least-32-bytes";
    @Autowired MockMvc mvc;
    @Autowired SocialAccountRepository accounts;
    @Autowired TokenVault vault;

    @Test
    void protectsApiButLeavesHealthPublic() throws Exception {
        mvc.perform(get("/api/v1/channels")).andExpect(status().isUnauthorized());
        mvc.perform(get("/actuator/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
    }

    @Test
    void createsUpdatesAndListsPostsUsingWireContract() throws Exception {
        ensureAccount(Platform.FACEBOOK, "page-1");
        ensureAccount(Platform.LINKEDIN, "member-1");
        String body = """
                {"topic":"Launch","scheduledAt":"2030-05-04T02:15:00Z","variants":[
                  {"platform":"facebook","caption":"Hello Facebook","hashtags":"#launch"},
                  {"platform":"linkedin","title":"Launch","caption":"Hello LinkedIn"}
                ]}
                """;
        String response = mvc.perform(post("/api/v1/posts").header("Authorization", AUTH)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("scheduled"))
                .andExpect(jsonPath("$.contentDate").value("2030-05-04"))
                .andExpect(jsonPath("$.variants", hasSize(2))).andReturn().getResponse().getContentAsString();
        String id = new com.fasterxml.jackson.databind.ObjectMapper().readTree(response).path("id").asText();

        mvc.perform(get("/api/v1/posts").header("Authorization", AUTH).param("status", "scheduled"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[*].id", hasItem(id)));
        mvc.perform(get("/api/v1/calendar").header("Authorization", AUTH)
                        .param("from", "2030-05-01T00:00:00Z").param("to", "2030-06-01T00:00:00Z"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].platforms", containsInAnyOrder("facebook", "linkedin")));
        mvc.perform(put("/api/v1/posts/" + id).header("Authorization", AUTH)
                        .contentType(MediaType.APPLICATION_JSON).content(body.replace("Launch", "Revised")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.topic").value("Revised"));
    }

    @Test
    void validatesRequestsAndQueuesUnsupportedPlatformsHonestly() throws Exception {
        mvc.perform(post("/api/v1/posts").header("Authorization", AUTH)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"variants\":[]}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.variants").exists());

        String created = mvc.perform(post("/api/v1/posts").header("Authorization", AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"topic\":\"Native\",\"variants\":[{\"platform\":\"youtube\",\"caption\":\"Use Studio\"}]}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = new com.fasterxml.jackson.databind.ObjectMapper().readTree(created).path("id").asText();
        mvc.perform(post("/api/v1/posts/" + id + "/publish").header("Authorization", AUTH))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].status").value("queued"));
        mvc.perform(put("/api/v1/posts/" + id).header("Authorization", AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"topic\":\"Changed\",\"variants\":[{\"platform\":\"youtube\",\"caption\":\"Changed\"}]}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value(containsString("duplicate it to revise")));
        mvc.perform(delete("/api/v1/posts/" + id).header("Authorization", AUTH))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value(containsString("duplicate it to revise")));
        mvc.perform(get("/api/v1/platforms").header("Authorization", AUTH))
                .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.platform == 'youtube')].publishingMode").value(hasItem("native_scheduler")));
    }

    @Test
    void todayUsesExplicitContentDateForUnscheduledFutureDrafts() throws Exception {
        String created = mvc.perform(post("/api/v1/posts").header("Authorization", AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"topic\":\"Future draft\",\"contentDate\":\"2031-07-09\",\"variants\":[{\"platform\":\"linkedin\",\"caption\":\"Later\"}]}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.contentDate").value("2031-07-09"))
                .andExpect(jsonPath("$.status").value("draft"))
                .andReturn().getResponse().getContentAsString();
        String id = new com.fasterxml.jackson.databind.ObjectMapper().readTree(created).path("id").asText();

        mvc.perform(get("/api/v1/posts/today").header("Authorization", AUTH).param("date", "2031-07-09"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[*].id", hasItem(id)));
    }

    @Test
    void rejectsPastSchedulesInsteadOfMassPublishingImportedHistory() throws Exception {
        mvc.perform(post("/api/v1/posts").header("Authorization", AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"topic\":\"Old CSV row\",\"scheduledAt\":\"2020-01-01T00:00:00Z\",\"variants\":[{\"platform\":\"facebook\",\"caption\":\"Old\"}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(containsString("scheduledAt must be in the future")));
    }

    @Test
    void rejectsAutomatedSchedulesForNativeOnlyPlatforms() throws Exception {
        mvc.perform(post("/api/v1/posts").header("Authorization", AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"topic\":\"Native\",\"scheduledAt\":\"2032-01-01T00:00:00Z\",\"variants\":[{\"platform\":\"youtube\",\"caption\":\"Use Studio\"}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(containsString("native-scheduler-only")));
    }

    @Test
    void validatesIncompleteSchedulesAndCombinedPlatformTextLimits() throws Exception {
        mvc.perform(post("/api/v1/posts").header("Authorization", AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"topic\":\"IG\",\"scheduledAt\":\"2032-01-01T00:00:00Z\",\"variants\":[{\"platform\":\"instagram\",\"caption\":\"Missing media\"}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(containsString("Instagram variants require mediaId")));

        String tooLongForX = "x".repeat(278);
        mvc.perform(post("/api/v1/posts").header("Authorization", AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"variants\":[{\"platform\":\"x\",\"caption\":\"" + tooLongForX + "\",\"hashtags\":\"#a\"}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(containsString("rendered text exceeds 280")));

        String tags = java.util.stream.IntStream.rangeClosed(1, 31)
                .mapToObj(i -> "#tag" + i).collect(java.util.stream.Collectors.joining(" "));
        mvc.perform(post("/api/v1/posts").header("Authorization", AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"variants\":[{\"platform\":\"instagram\",\"caption\":\"Hello\",\"hashtags\":\"" + tags + "\"}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(containsString("at most 30 hashtag")));
    }

    @Test
    void scheduledPostsRequireOneFixedActiveAccount() throws Exception {
        mvc.perform(post("/api/v1/posts").header("Authorization", AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"topic\":\"Needs channel\",\"scheduledAt\":\"2032-01-01T00:00:00Z\",\"variants\":[{\"platform\":\"x\",\"caption\":\"Later\"}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(containsString("requires a connected active accountId")));
    }

    private void ensureAccount(Platform platform, String externalId) {
        if (accounts.findByPlatformAndExternalId(platform, externalId).isPresent()) return;
        SocialAccount account = new SocialAccount();
        account.platform = platform; account.externalId = externalId; account.displayName = externalId;
        account.accessTokenEnc = vault.encrypt("test-token"); account.status = AccountStatus.ACTIVE;
        accounts.save(account);
    }
}
