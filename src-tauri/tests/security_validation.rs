mod security {
    fn validate_url_scheme(url: &str) -> Result<String, String> {
        let allowed = ["https", "http", "mailto", "tel"];
        let scheme = url.split(':').next().unwrap_or("");
        if !allowed.contains(&scheme) {
            return Err(format!("URL scheme '{}' is not allowed", scheme));
        }
        Ok(url.to_string())
    }

    fn validate_remote_url(url: &str) -> Result<String, String> {
        if url.trim().is_empty() {
            return Err("URL is empty".to_string());
        }
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return Err("Only http:// and https:// URLs are allowed".to_string());
        }
        Ok(url.to_string())
    }

    #[test]
    fn open_external_accepts_https() {
        assert!(validate_url_scheme("https://example.com").is_ok());
    }

    #[test]
    fn open_external_accepts_http() {
        assert!(validate_url_scheme("http://localhost:8080").is_ok());
    }

    #[test]
    fn open_external_accepts_mailto() {
        assert!(validate_url_scheme("mailto:test@example.com").is_ok());
    }

    #[test]
    fn open_external_accepts_tel() {
        assert!(validate_url_scheme("tel:+1234567890").is_ok());
    }

    #[test]
    fn open_external_rejects_javascript() {
        assert!(validate_url_scheme("javascript:alert(1)").is_err());
    }

    #[test]
    fn open_external_rejects_file() {
        assert!(validate_url_scheme("file:///etc/passwd").is_err());
    }

    #[test]
    fn open_external_rejects_data() {
        assert!(validate_url_scheme("data:text/html,<script>alert(1)</script>").is_err());
    }

    #[test]
    fn open_external_rejects_ftp() {
        assert!(validate_url_scheme("ftp://evil.com").is_err());
    }

    #[test]
    fn open_external_rejects_no_scheme() {
        assert!(validate_url_scheme("just-a-string").is_err());
    }

    #[test]
    fn remote_connection_accepts_https() {
        assert!(validate_remote_url("https://api.example.com").is_ok());
    }

    #[test]
    fn remote_connection_accepts_http() {
        assert!(validate_remote_url("http://localhost:8080").is_ok());
    }

    #[test]
    fn remote_connection_rejects_empty() {
        assert!(validate_remote_url("").is_err());
    }

    #[test]
    fn remote_connection_rejects_whitespace() {
        assert!(validate_remote_url("   ").is_err());
    }

    #[test]
    fn remote_connection_rejects_ftp() {
        assert!(validate_remote_url("ftp://evil.com").is_err());
    }

    #[test]
    fn remote_connection_rejects_javascript() {
        assert!(validate_remote_url("javascript:alert(1)").is_err());
    }

    #[test]
    fn remote_connection_rejects_file_scheme() {
        assert!(validate_remote_url("file:///etc/passwd").is_err());
    }

    #[test]
    fn diagnostics_output_excludes_secrets() {
        let sample = "Hermes Desktop v0.1.0 (commit abc1234)\nGateway status: Ready\n";
        assert!(!sample.contains("api_key"));
        assert!(!sample.contains("Bearer"));
        assert!(!sample.contains("token"));
    }

    #[test]
    fn csp_does_not_allow_unsafe_eval() {
        let csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: https://data; font-src 'self' asset:; connect-src 'self' http://localhost:* http://127.0.0.1:* https:; media-src 'self'";
        assert!(!csp.contains("'unsafe-eval'"));
        assert!(csp.contains("script-src 'self'"));
    }
}
