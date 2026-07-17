package com.meritbyte.postpilot.posts;

import com.meritbyte.postpilot.api.ApiModels.*;
import com.meritbyte.postpilot.domain.PostStatus;
import com.meritbyte.postpilot.publish.PublishService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.time.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1/posts")
public class PostController {
    private final PostService posts;
    private final PublishService publishing;
    public PostController(PostService posts, PublishService publishing) {
        this.posts = posts; this.publishing = publishing;
    }

    @GetMapping
    public List<PostDto> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(required = false) PostStatus status) {
        return posts.list(from, to, status);
    }

    @GetMapping("/today")
    public List<PostDto> today(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return posts.today(date);
    }

    @GetMapping("/{id}") public PostDto get(@PathVariable UUID id) { return posts.get(id); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public PostDto create(@Valid @RequestBody PostRequest request) { return posts.create(request); }
    @PutMapping("/{id}") public PostDto update(@PathVariable UUID id, @Valid @RequestBody PostRequest request) {
        return posts.update(id, request);
    }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) { posts.delete(id); }
    @PostMapping("/{id}/publish") public List<PublishResultDto> publish(@PathVariable UUID id) {
        return publishing.publishPost(id);
    }
    @GetMapping("/{id}/results") public List<PublishResultDto> results(@PathVariable UUID id) {
        return publishing.latestResults(id);
    }
}
