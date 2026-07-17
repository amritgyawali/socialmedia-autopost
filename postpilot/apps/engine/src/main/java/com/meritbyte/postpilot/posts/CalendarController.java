package com.meritbyte.postpilot.posts;

import com.meritbyte.postpilot.api.ApiModels.CalendarItemDto;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/v1/calendar")
public class CalendarController {
    private final PostService service;
    public CalendarController(PostService service) { this.service = service; }
    @GetMapping
    public List<CalendarItemDto> calendar(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) {
        return service.calendar(from, to);
    }
}
