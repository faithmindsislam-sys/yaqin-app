package com.yaqeenguide.app;

import java.net.URI;
import java.util.Arrays;
import java.util.List;

final class NavigationPolicy {
    static final String APP_URL = "https://app.yaqeenguide.com/app/";
    private static final List<String> HOSTS = Arrays.asList(
        "app.yaqeenguide.com", "yaqeenguide.com", "www.yaqeenguide.com", "studio.yaqeenguide.com"
    );

    static boolean inApp(String url) {
        try {
            URI uri = URI.create(url);
            return "https".equals(uri.getScheme()) && HOSTS.contains(uri.getHost())
                && uri.getUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (IllegalArgumentException e) { return false; }
    }

    static boolean external(String url) {
        try { return Arrays.asList("https", "mailto", "tel").contains(URI.create(url).getScheme()); }
        catch (IllegalArgumentException | NullPointerException e) { return false; }
    }

    static boolean googleLogin(String url) {
        try {
            URI uri = URI.create(url);
            String host = uri.getHost();
            return "https".equals(uri.getScheme()) && host != null && (
                host.equals("accounts.google.com") || (host.endsWith(".supabase.co")
                && "/auth/v1/authorize".equals(uri.getPath()))
            );
        } catch (IllegalArgumentException e) { return false; }
    }
}
