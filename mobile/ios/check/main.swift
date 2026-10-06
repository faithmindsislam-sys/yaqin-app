import Foundation

assert(NavigationPolicy.inApp(NavigationPolicy.appURL))
for raw in ["http://app.yaqeenguide.com/app/", "https://app.yaqeenguide.com.evil.test/",
            "https://app.yaqeenguide.com@evil.test/", "https://evil.test@app.yaqeenguide.com/",
            "https://app.yaqeenguide.com:8443/", "file:///etc/passwd", "javascript:alert(1)"] {
    assert(!NavigationPolicy.inApp(URL(string: raw)!))
}
assert(NavigationPolicy.googleLogin(URL(string: "https://project.supabase.co/auth/v1/authorize?provider=google")!))
assert(!NavigationPolicy.googleLogin(URL(string: "https://evil.test/auth/v1/authorize")!))
assert(NavigationPolicy.external(URL(string: "https://quran.com/1")!))
assert(!NavigationPolicy.external(URL(string: "file:///etc/passwd")!))
print("PASS iOS trusted app navigation, external links and OAuth handling")
