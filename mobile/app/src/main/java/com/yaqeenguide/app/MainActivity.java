package com.yaqeenguide.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.Toast;
import java.util.Arrays;

public final class MainActivity extends Activity {
    private WebView web;
    private PermissionRequest microphone;
    private boolean showingError;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(7, 90, 171));
        getWindow().setNavigationBarColor(Color.WHITE);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setBackgroundColor(Color.WHITE);
        layout.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        ProgressBar progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        layout.addView(progress, new LinearLayout.LayoutParams(-1, 6));
        web = new WebView(this);
        layout.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(layout);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) {
                progress.setProgress(value);
                progress.setVisibility(value == 100 ? android.view.View.GONE : android.view.View.VISIBLE);
            }
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    if (!NavigationPolicy.inApp(request.getOrigin().toString())
                        || !Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                        request.deny(); return;
                    }
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
                    } else {
                        if (microphone != null) microphone.deny();
                        microphone = request;
                        requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, 1);
                    }
                });
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (microphone == request) microphone = null;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                String url = request.getUrl().toString();
                // ponytail: email/password works in this demo; native OAuth needs a browser callback integration.
                if (NavigationPolicy.googleLogin(url)) {
                    new AlertDialog.Builder(MainActivity.this).setTitle("Google sign-in")
                        .setMessage("Use email and password to stay in the mobile demo. You can also use Google in the full web app.")
                        .setPositiveButton("Use email", (dialog, which) -> {})
                        .setNeutralButton("Open web app", (dialog, which) -> openExternal(NavigationPolicy.APP_URL)).show();
                    return true;
                }
                if (NavigationPolicy.inApp(url)) return false;
                if (NavigationPolicy.external(url)) openExternal(url);
                return true;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) connectionError();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) connectionError();
            }
        });
        if (state == null || web.restoreState(state) == null) web.loadUrl(NavigationPolicy.APP_URL);
    }

    private void openExternal(String url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
        catch (ActivityNotFoundException e) { Toast.makeText(this, "No app is available to open this link.", Toast.LENGTH_LONG).show(); }
    }

    private void connectionError() {
        if (showingError || isFinishing()) return;
        showingError = true;
        new AlertDialog.Builder(this).setTitle("Unable to load Yaqeen")
            .setMessage("Check your connection and try again.")
            .setPositiveButton("Retry", (dialog, which) -> web.loadUrl(NavigationPolicy.APP_URL))
            .setNegativeButton("Cancel", null).setOnDismissListener(dialog -> showingError = false).show();
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == 1 && microphone != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED)
                microphone.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
            else microphone.deny();
            microphone = null;
        }
    }
    @Override public void onSaveInstanceState(Bundle state) { web.saveState(state); super.onSaveInstanceState(state); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override public void onDestroy() { if (microphone != null) microphone.deny(); web.destroy(); super.onDestroy(); }
}
