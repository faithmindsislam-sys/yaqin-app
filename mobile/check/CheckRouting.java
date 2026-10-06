package com.yaqeenguide.app;

public final class CheckRouting {
    public static void main(String[] args) {
        assert NavigationPolicy.inApp(NavigationPolicy.APP_URL);
        assert NavigationPolicy.inApp("https://yaqeenguide.com/auth/callback/#token");
        for (String url : new String[] {
            "http://app.yaqeenguide.com/app/", "https://app.yaqeenguide.com.evil.test/",
            "https://app.yaqeenguide.com@evil.test/", "https://evil.test@app.yaqeenguide.com/",
            "https://app.yaqeenguide.com:8443/", "file:///etc/passwd", "javascript:alert(1)", "not a URL"
        }) assert !NavigationPolicy.inApp(url) : url;
        assert NavigationPolicy.googleLogin("https://project.supabase.co/auth/v1/authorize?provider=google");
        assert NavigationPolicy.googleLogin("https://accounts.google.com/o/oauth2/auth");
        assert !NavigationPolicy.googleLogin("https://evil.test/auth/v1/authorize");
        assert NavigationPolicy.external("https://quran.com/1");
        assert !NavigationPolicy.external("intent://evil.test/");
        assert !NavigationPolicy.external("file:///etc/passwd");
        System.out.println("PASS trusted app navigation, external links and OAuth handling");
    }
}
