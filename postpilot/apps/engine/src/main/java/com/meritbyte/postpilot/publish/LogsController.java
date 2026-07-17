package com.meritbyte.postpilot.publish;

import com.meritbyte.postpilot.api.ApiMapper;
import com.meritbyte.postpilot.api.ApiModels.PublishResultDto;
import com.meritbyte.postpilot.api.ApiModels.LogsPage;
import com.meritbyte.postpilot.domain.*;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/v1/logs")
@Validated
public class LogsController {
    private final PublishResultRepository results;
    public LogsController(PublishResultRepository results) { this.results = results; }
    @GetMapping
    @Transactional(readOnly = true)
    public Object logs(@RequestParam(required = false) Platform platform,
                                      @RequestParam(required = false) PublishStatus status,
                                      @RequestParam(required = false) @Min(0) Integer page,
                                      @RequestParam(required = false) @Min(1) @Max(200) Integer size,
                                      @RequestParam(defaultValue = "100") @Min(1) @Max(200) int limit) {
        int requestedPage = page == null ? 0 : page;
        int requestedSize = size == null ? limit : size;
        var result = results.logs(platform, status, PageRequest.of(requestedPage, requestedSize));
        List<PublishResultDto> items = result.getContent().stream().map(ApiMapper::result).toList();
        // Backward compatibility: the original ?limit=N contract returns a bare array.
        if (page == null && size == null) return items;
        return new LogsPage(items, result.getNumber(), result.getSize(), result.getTotalElements(), result.getTotalPages());
    }
}
