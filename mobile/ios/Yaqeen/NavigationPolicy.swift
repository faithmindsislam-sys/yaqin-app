import Foundation

enum NavigationPolicy {
    static let appURL = URL(string: "https://app.yaqeenguide.com/app/")!
    private static let hosts: Set<String> = [
        "app.yaqeenguide.com", "yaqeenguide.com", "www.yaqeenguide.com", "studio.yaqeenguide.com"
    ]
    static func inApp(_ url: URL) -> Bool {
        url.scheme == "https" && hosts.contains(url.host ?? "") && url.user == nil
            && url.password == nil && (url.port == nil || url.port == 443)
    }
    static func external(_ url: URL) -> Bool { ["https", "mailto", "tel"].contains(url.scheme ?? "") }
    static func googleLogin(_ url: URL) -> Bool {
        guard url.scheme == "https", let host = url.host else { return false }
        return host == "accounts.google.com"
            || (host.hasSuffix(".supabase.co") && url.path == "/auth/v1/authorize")
    }
}
