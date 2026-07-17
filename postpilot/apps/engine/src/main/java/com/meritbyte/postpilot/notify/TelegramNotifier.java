package com.meritbyte.postpilot.notify;

import com.meritbyte.postpilot.config.PostPilotProperties;
import org.slf4j.*;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;

@Service
public class TelegramNotifier {
    private static final Logger log = LoggerFactory.getLogger(TelegramNotifier.class);
    private final String token;
    private final String chatId;
    private final RestClient http;
    public TelegramNotifier(PostPilotProperties properties, RestClient http) {
        this.token = properties.telegram().botToken();
        this.chatId = properties.telegram().chatId();
        this.http = http;
    }

    public void send(String message) {
        if (token == null || token.isBlank() || chatId == null || chatId.isBlank()) return;
        try {
            var form = new LinkedMultiValueMap<String, String>();
            form.add("chat_id", chatId); form.add("text", message); form.add("disable_web_page_preview", "true");
            http.post().uri("https://api.telegram.org/bot" + token + "/sendMessage")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().toBodilessEntity();
        } catch (Exception e) {
            // RestClient exception messages can contain the request URI, which embeds the bot token.
            log.warn("Telegram notification failed ({})", e.getClass().getSimpleName());
        }
    }
}
