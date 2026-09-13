export interface HttpRequestPayload {
  url: string;
  method?: string;
  headers?: string | Record<string, string>;
  body?: string | Record<string, any>;
  timeout?: number;
}

export interface HttpRequestResult {
  success: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  data?: any;
  output?: string;
  duration: number;
  error?: string;
}

/**
 * Parses headers from either a JSON string or an object
 */
function parseHeaders(headersInput?: string | Record<string, string>): Record<string, string> {
  if (!headersInput) return {};
  if (typeof headersInput === "object") return headersInput;
  if (typeof headersInput === "string") {
    const trimmed = headersInput.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed;
      }
    } catch {
      // If not JSON, parse as newline-delimited key: value pairs
      const headers: Record<string, string> = {};
      const lines = trimmed.split("\n");
      for (const line of lines) {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
          const key = line.substring(0, colonIdx).trim();
          const val = line.substring(colonIdx + 1).trim();
          if (key) headers[key] = val;
        }
      }
      return headers;
    }
  }
  return {};
}

/**
 * Executes a configurable HTTP request with timeout protection and parses the response
 */
export async function executeHttpRequest(payload: HttpRequestPayload): Promise<HttpRequestResult> {
  const startTime = Date.now();
  const rawUrl = (payload.url || "").trim();

  if (!rawUrl) {
    return {
      success: false,
      error: "URL is required for HTTP Request node",
      duration: Date.now() - startTime,
    };
  }

  // Validate URL protocol
  if (!/^https?:\/\//i.test(rawUrl)) {
    return {
      success: false,
      error: `Invalid URL protocol in "${rawUrl}". Must start with http:// or https://`,
      duration: Date.now() - startTime,
    };
  }

  const method = (payload.method || "GET").toUpperCase();
  const headers = parseHeaders(payload.headers);
  const timeoutMs = Math.min(Math.max(payload.timeout || 15000, 1000), 60000);

  let bodyData: string | undefined = undefined;
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && payload.body !== undefined && payload.body !== null) {
    if (typeof payload.body === "object") {
      bodyData = JSON.stringify(payload.body);
      if (!headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
      }
    } else {
      bodyData = String(payload.body);
      if (bodyData.startsWith("{") || bodyData.startsWith("[")) {
        if (!headers["Content-Type"] && !headers["content-type"]) {
          headers["Content-Type"] = "application/json";
        }
      }
    }
  }

  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(rawUrl, {
      method,
      headers,
      body: bodyData,
      signal: controller.signal,
    });
    clearTimeout(timeoutTimer);

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((val, key) => {
      responseHeaders[key] = val;
    });

    const contentType = response.headers.get("content-type") || "";
    let data: any = null;
    let outputString = "";

    if (contentType.includes("application/json")) {
      data = await response.json().catch(() => null);
      outputString = data !== null ? JSON.stringify(data, null, 2) : "";
    } else {
      outputString = await response.text().catch(() => "");
      try {
        data = JSON.parse(outputString);
      } catch {
        data = outputString;
      }
    }

    const isSuccess = response.ok;

    return {
      success: isSuccess,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      data,
      output: outputString,
      duration: Date.now() - startTime,
      error: !isSuccess ? `HTTP ${response.status} ${response.statusText}` : undefined,
    };
  } catch (error: any) {
    clearTimeout(timeoutTimer);
    const isTimeout = error?.name === "AbortError";
    return {
      success: false,
      error: isTimeout
        ? `Request timed out after ${timeoutMs}ms`
        : error?.message || "HTTP request failed",
      duration: Date.now() - startTime,
    };
  }
}
