package com.meritbyte.postpilot.config;

import com.meritbyte.postpilot.domain.*;
import org.springframework.context.annotation.Configuration;
import org.springframework.format.FormatterRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void addFormatters(FormatterRegistry registry) {
        registry.addConverter(String.class, Platform.class, Platform::from);
        registry.addConverter(String.class, PostStatus.class, PostStatus::from);
        registry.addConverter(String.class, PublishStatus.class, PublishStatus::from);
    }
}
