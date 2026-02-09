"use client";

// Jitsu Analytics Client for PocketAnalyst
// Tracks user events and sends them to Jitsu → ClickHouse

interface JitsuConfig {
  host: string;
  writeKey: string;
}

interface EventProperties {
  [key: string]: string | number | boolean | null | undefined;
}

interface UserTraits {
  email?: string;
  name?: string;
  [key: string]: string | number | boolean | null | undefined;
}

class JitsuClient {
  private config: JitsuConfig | null = null;
  private userId: string | null = null;
  private anonymousId: string;
  private sessionId: string;

  constructor() {
    this.anonymousId = this.getOrCreateAnonymousId();
    this.sessionId = this.getOrCreateSessionId();
  }

  init(config: JitsuConfig) {
    this.config = config;
  }

  private getOrCreateAnonymousId(): string {
    if (typeof window === "undefined") return "server";
    
    let id = localStorage.getItem("pa_anonymous_id");
    if (!id) {
      id = "anon_" + Math.random().toString(36).substring(2, 15);
      localStorage.setItem("pa_anonymous_id", id);
    }
    return id;
  }

  private getOrCreateSessionId(): string {
    if (typeof window === "undefined") return "server";
    
    let id = sessionStorage.getItem("pa_session_id");
    if (!id) {
      id = "sess_" + Math.random().toString(36).substring(2, 15);
      sessionStorage.setItem("pa_session_id", id);
    }
    return id;
  }

  identify(userId: string, traits?: UserTraits) {
    this.userId = userId;
    this.sendEvent("identify", { userId, traits });
  }

  track(eventName: string, properties?: EventProperties) {
    this.sendEvent("track", { eventName, properties });
  }

  page(pageName?: string, properties?: EventProperties) {
    const pageProps = {
      ...properties,
      url: typeof window !== "undefined" ? window.location.href : "",
      path: typeof window !== "undefined" ? window.location.pathname : "",
      title: typeof document !== "undefined" ? document.title : "",
      referrer: typeof document !== "undefined" ? document.referrer : "",
    };
    this.sendEvent("page", { pageName, properties: pageProps });
  }

  private async sendEvent(
    type: "track" | "page" | "identify",
    data: {
      eventName?: string;
      pageName?: string;
      userId?: string;
      traits?: UserTraits;
      properties?: EventProperties;
    }
  ) {
    if (!this.config) {
      console.warn("Jitsu not initialized. Call jitsu.init() first.");
      return;
    }

    const event = {
      type,
      event: data.eventName || data.pageName || type,
      userId: this.userId,
      anonymousId: this.anonymousId,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      context: {
        page: {
          url: typeof window !== "undefined" ? window.location.href : "",
          path: typeof window !== "undefined" ? window.location.pathname : "",
          title: typeof document !== "undefined" ? document.title : "",
        },
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        screen: typeof window !== "undefined" ? {
          width: window.screen.width,
          height: window.screen.height,
        } : {},
      },
      properties: data.properties || {},
      traits: data.traits || {},
    };

    try {
      await fetch(`${this.config.host}/api/s/s2s/track`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Write-Key": this.config.writeKey,
        },
        body: JSON.stringify(event),
      });
    } catch (error) {
      console.error("Failed to send event to Jitsu:", error);
    }
  }
}

// Singleton instance
export const jitsu = new JitsuClient();

// React hook for tracking
export function useJitsu() {
  return {
    track: jitsu.track.bind(jitsu),
    page: jitsu.page.bind(jitsu),
    identify: jitsu.identify.bind(jitsu),
  };
}
