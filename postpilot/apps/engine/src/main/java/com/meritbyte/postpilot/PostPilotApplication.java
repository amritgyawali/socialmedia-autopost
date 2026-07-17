package com.meritbyte.postpilot;

import com.meritbyte.postpilot.config.PostPilotProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties(PostPilotProperties.class)
public class PostPilotApplication {
    public static void main(String[] args) {
        SpringApplication.run(PostPilotApplication.class, args);
    }
}
