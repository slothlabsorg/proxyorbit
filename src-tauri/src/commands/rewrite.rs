// Rewrite rules engine.
//
// Lets ProxyOrbit automatically transform matched requests/responses without
// manual per-request interception. Two headline use cases:
//
//   1. **Local file injection** — when the browser loads an asset from a CDN
//      (e.g. a JS bundle at `cdn.example.com/pkg@x/dist/bundle.js`), a
//      `ServeLocalFile` rule serves your freshly-built local file instead,
//      so you iterate on code without publishing to the CDN.
//
//   2. **Backend interception** — reshape or short-circuit calls to any API
//      with a `RewriteResponseBody`, `MockResponse`, or `Redirect` rule —
//      e.g. force a field, return a canned payload, or point a call at a
//      local service.
//
// Rules are evaluated in order; the first match whose `enabled` is true wins.
// Matching is on method (optional), host (suffix match), and path (substring
// or regex). Everything is data-driven from the frontend so no rebuild is
// needed to change routing.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// How to match an incoming request.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RuleMatch {
    /// HTTP method to match (e.g. "GET"). `None`/empty matches any method.
    #[serde(default)]
    pub method: Option<String>,
    /// Host suffix match — "example.com" matches "api.dev.example.com".
    /// Empty matches any host.
    #[serde(default)]
    pub host: String,
    /// Substring the path+query must contain. Empty matches any path.
    #[serde(default)]
    pub path_contains: String,
    /// Optional regex the full URL must match. Takes precedence over
    /// `path_contains` when set. Invalid regex is ignored (rule won't match).
    #[serde(default)]
    pub url_regex: Option<String>,
}

/// What to do when a rule matches.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RuleAction {
    /// Serve a file from local disk instead of forwarding upstream. Used for
    /// plugin bundle injection. `content_type` overrides the guessed MIME.
    ServeLocalFile {
        path: String,
        #[serde(default)]
        content_type: Option<String>,
    },
    /// Forward upstream, then run string replacements on the response body.
    /// Each `(from, to)` pair is applied in order. Useful for flipping a
    /// field like `"mode":"A"` -> `"mode":"B"`.
    RewriteResponseBody {
        replacements: Vec<(String, String)>,
    },
    /// Don't forward at all — return this canned response.
    MockResponse {
        status: u16,
        #[serde(default)]
        content_type: Option<String>,
        body: String,
    },
    /// Rewrite the outbound URL before forwarding (e.g. point a dev-next call
    /// at a local service). Full replacement URL.
    Redirect {
        to_url: String,
    },
    /// Forward upstream, then run string replacements on the REQUEST body
    /// before it's sent. Flips outbound payload fields.
    RewriteRequestBody {
        replacements: Vec<(String, String)>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RewriteRule {
    pub id: String,
    pub name: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(rename = "match")]
    pub match_: RuleMatch,
    pub action: RuleAction,
}

fn default_true() -> bool {
    true
}

impl RuleMatch {
    /// Does this matcher apply to the given request?
    pub fn matches(&self, method: &str, host: &str, url: &str, path_q: &str) -> bool {
        // Method
        if let Some(m) = &self.method {
            if !m.is_empty() && !m.eq_ignore_ascii_case(method) {
                return false;
            }
        }
        // Host (suffix)
        if !self.host.is_empty()
            && host != self.host
            && !host.ends_with(&format!(".{}", self.host))
        {
            return false;
        }
        // URL regex takes precedence over path_contains
        if let Some(re_src) = &self.url_regex {
            if !re_src.is_empty() {
                return regex_match(re_src, url);
            }
        }
        // Path substring
        if !self.path_contains.is_empty() && !path_q.contains(&self.path_contains) {
            return false;
        }
        true
    }
}

/// Find the first enabled rule that matches. Returns a clone so the caller
/// doesn't hold the rules lock across the await points in the request path.
pub fn first_match(
    rules: &[RewriteRule],
    method: &str,
    host: &str,
    url: &str,
    path_q: &str,
) -> Option<RewriteRule> {
    rules
        .iter()
        .find(|r| r.enabled && r.match_.matches(method, host, url, path_q))
        .cloned()
}

/// Guess a content-type from a file extension. Covers the handful of types
/// relevant to plugin/asset injection; defaults to octet-stream.
pub fn guess_content_type(path: &str) -> &'static str {
    let lower = path.to_lowercase();
    if lower.ends_with(".js") || lower.ends_with(".mjs") {
        "application/javascript"
    } else if lower.ends_with(".json") || lower.ends_with(".map") {
        "application/json"
    } else if lower.ends_with(".css") {
        "text/css"
    } else if lower.ends_with(".html") {
        "text/html"
    } else if lower.ends_with(".wasm") {
        "application/wasm"
    } else {
        "application/octet-stream"
    }
}

fn regex_match(pattern: &str, haystack: &str) -> bool {
    match regex::Regex::new(pattern) {
        Ok(re) => re.is_match(haystack),
        Err(_) => false,
    }
}

// ── Persistence ────────────────────────────────────────────────────────────
//
// Rules live in the same config dir as settings.json so they survive
// restarts and appear in the UI on next launch.

fn rules_path() -> Option<PathBuf> {
    dirs::config_dir().map(|d| d.join("proxyorbit").join("rewrite-rules.json"))
}

/// Load persisted rules from disk. Returns an empty vec if none exist or on
/// any parse error (never panics — a corrupt file degrades to no rules).
pub fn load_rules() -> Vec<RewriteRule> {
    let Some(path) = rules_path() else { return Vec::new() };
    if !path.exists() {
        return Vec::new();
    }
    let data = std::fs::read_to_string(&path).unwrap_or_default();
    serde_json::from_str(&data).unwrap_or_default()
}

/// Persist rules to disk. Best-effort — surfaces IO/serialize errors to the
/// caller so the command can report them.
pub fn save_rules(rules: &[RewriteRule]) -> Result<(), String> {
    let path = rules_path().ok_or("cannot determine config dir")?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(rules).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

/// Built-in starter preset — one disabled example of each common rule so
/// new users see the shape of a rule without any pre-wired third-party
/// hosts. All rules ship disabled; the user fills in hosts/paths/files.
pub fn default_preset(local_file_path: &str) -> Vec<RewriteRule> {
    vec![
        RewriteRule {
            id: "example-serve-local-file".into(),
            name: "Example — serve a local file instead of a CDN asset".into(),
            enabled: false,
            match_: RuleMatch {
                method: Some("GET".into()),
                host: "cdn.example.com".into(),
                path_contains: "/dist/".into(),
                url_regex: None,
            },
            action: RuleAction::ServeLocalFile {
                path: local_file_path.to_string(),
                content_type: Some("application/javascript".into()),
            },
        },
        RewriteRule {
            id: "example-rewrite-response".into(),
            name: "Example — rewrite a field in a JSON response".into(),
            enabled: false,
            match_: RuleMatch {
                method: None,
                host: "api.example.com".into(),
                path_contains: "/v1/".into(),
                url_regex: None,
            },
            action: RuleAction::RewriteResponseBody {
                replacements: vec![("\"mode\":\"a\"".into(), "\"mode\":\"b\"".into())],
            },
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rule(host: &str, path: &str, action: RuleAction) -> RewriteRule {
        RewriteRule {
            id: "t".into(),
            name: "t".into(),
            enabled: true,
            match_: RuleMatch {
                method: None,
                host: host.into(),
                path_contains: path.into(),
                url_regex: None,
            },
            action,
        }
    }

    #[test]
    fn host_suffix_matches_subdomain() {
        let m = RuleMatch { host: "example.com".into(), ..Default::default() };
        assert!(m.matches("GET", "api.dev.example.com", "https://api.dev.example.com/x", "/x"));
        assert!(m.matches("GET", "example.com", "https://example.com/x", "/x"));
        assert!(!m.matches("GET", "evil-example.com.attacker.com", "https://x/x", "/x"));
    }

    #[test]
    fn method_filter() {
        let m = RuleMatch { method: Some("POST".into()), host: "x.com".into(), ..Default::default() };
        assert!(m.matches("POST", "x.com", "https://x.com/", "/"));
        assert!(!m.matches("GET", "x.com", "https://x.com/", "/"));
    }

    #[test]
    fn path_substring() {
        let m = RuleMatch { host: "x.com".into(), path_contains: "/plugin".into(), ..Default::default() };
        assert!(m.matches("GET", "x.com", "https://x.com/foo/plugin/bar", "/foo/plugin/bar"));
        assert!(!m.matches("GET", "x.com", "https://x.com/foo/bar", "/foo/bar"));
    }

    #[test]
    fn regex_precedence() {
        let m = RuleMatch {
            host: "x.com".into(),
            url_regex: Some(r"pkg@\d+\.\d+".into()),
            path_contains: "SHOULD_NOT_BE_USED".into(),
            ..Default::default()
        };
        assert!(m.matches("GET", "x.com", "https://x.com/pkg@3.18/dist", "/pkg@3.18/dist"));
        assert!(!m.matches("GET", "x.com", "https://x.com/pkg@latest/dist", "/pkg@latest/dist"));
    }

    #[test]
    fn first_match_respects_enabled_and_order() {
        let mut r1 = rule("x.com", "/a", RuleAction::MockResponse { status: 200, content_type: None, body: "1".into() });
        r1.enabled = false;
        let r2 = rule("x.com", "/a", RuleAction::MockResponse { status: 201, content_type: None, body: "2".into() });
        let rules = vec![r1, r2];
        let found = first_match(&rules, "GET", "x.com", "https://x.com/a", "/a").unwrap();
        assert_eq!(found.id, "t"); // second rule (first enabled match)
        match found.action {
            RuleAction::MockResponse { status, .. } => assert_eq!(status, 201),
            _ => panic!("wrong action"),
        }
    }

    #[test]
    fn content_type_guess() {
        assert_eq!(guess_content_type("/x/bundle.umd.js"), "application/javascript");
        assert_eq!(guess_content_type("/x/bento.json"), "application/json");
        assert_eq!(guess_content_type("/x/style.css"), "text/css");
    }
}
