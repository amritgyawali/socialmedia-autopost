package com.meritbyte.postpilot.config;

import org.springframework.context.annotation.*;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.core.task.support.TaskExecutorAdapter;
import org.springframework.web.client.RestClient;
import org.springframework.http.client.JdkClientHttpRequestFactory;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.net.http.HttpClient;

@Configuration
public class RuntimeConfig {
    @Bean(destroyMethod = "close")
    ExecutorService publishExecutorService() {
        return Executors.newVirtualThreadPerTaskExecutor();
    }

    @Bean
    @Primary
    AsyncTaskExecutor publishExecutor(ExecutorService publishExecutorService) {
        return new TaskExecutorAdapter(publishExecutorService);
    }

    @Bean
    RestClient restClient(PostPilotProperties props) {
        HttpClient client = HttpClient.newBuilder().connectTimeout(props.publishing().httpTimeout()).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(props.publishing().httpTimeout());
        return RestClient.builder().requestFactory(factory).build();
    }
}
