package com.ahansantra607.gullak;

import android.app.Activity;
import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.animation.ValueAnimator;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.security.MessageDigest;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.webkit.SafeBrowsingResponse;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebChromeClient;
import android.webkit.ValueCallback;
import android.webkit.JavascriptInterface;
import android.webkit.CookieManager;
import android.text.InputFilter;
import android.widget.EditText;
import android.util.Base64;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://gullak-piggybank.ahansantra607.workers.dev/#/";
    private static final String RELEASE_API = "https://api.github.com/repos/ahansantra607/Gullak-PiggyBank/releases/latest";
    private static final String APP_HOST = "gullak-piggybank.ahansantra607.workers.dev";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private WebView webView;
    private boolean showingUpdate;
    private static final int REQUEST_FILE_CHOOSER = 2101;
    private static final int REQUEST_SAVE_BACKUP = 2102;
    private static final int REQUEST_INSTALL_APK = 2103;
    private ValueCallback<Uri[]> filePathCallback;
    private byte[] pendingBackupBytes;
    private static final String API_URL = "https://server.ahansantra607.workers.dev";
    private static final String APP_ORIGIN = "https://gullak-piggybank.ahansantra607.workers.dev";
    private boolean pinCheckDone;
    private boolean pinConfigured;
    private boolean pinScreenVisible;
    private boolean needsUnlock;
    private EditText pinInput;
    private String pendingSetupPin = "";
    private String pendingUpdateApkUrl = "";
    private String pendingUpdateVersion = "";
    private String pendingUpdateNotes = "";
    private String pendingUpdateSha256 = "";
    private File downloadedUpdateApk;
    private boolean waitingForInstallPermission;
    private static final long INACTIVITY_LOCK_MS = 7 * 60 * 1000L;
    private final Handler inactivityHandler = new Handler(Looper.getMainLooper());
    private final Runnable inactivityLock = () -> {
        if (pinConfigured && webView != null && !showingUpdate && !pinScreenVisible) showPhonePinScreen(false);
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showLoading();
        checkForUpdate();
    }

    private void checkForUpdate() {
        executor.execute(() -> {
            try {
                HttpURLConnection connection = (HttpURLConnection) new URL(RELEASE_API).openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(7000);
                connection.setReadTimeout(7000);
                connection.setRequestProperty("Accept", "application/vnd.github+json");
                connection.setRequestProperty("User-Agent", "Gullak-Android");
                int status = connection.getResponseCode();
                if (status != HttpURLConnection.HTTP_OK) {
                    connection.disconnect();
                    runOnUiThread(this::openApp);
                    return;
                }
                StringBuilder jsonText = new StringBuilder();
                try (InputStream stream = connection.getInputStream();
                     BufferedReader reader = new BufferedReader(new InputStreamReader(stream))) {
                    String line;
                    while ((line = reader.readLine()) != null) jsonText.append(line);
                } finally {
                    connection.disconnect();
                }

                JSONObject release = new JSONObject(jsonText.toString());
                String tag = release.optString("tag_name", "");
                String latestVersion = tag.startsWith("v") ? tag.substring(1) : tag;
                String installedVersion = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
                JSONArray assets = release.optJSONArray("assets");
                String apkUrl = null;
                if (assets != null) {
                    for (int i = 0; i < assets.length(); i++) {
                        JSONObject asset = assets.optJSONObject(i);
                        if (asset != null && "Gullak.apk".equals(asset.optString("name"))) {
                            apkUrl = asset.optString("browser_download_url", null);
                            String digest = asset.optString("digest", "");
                            pendingUpdateSha256 = digest.startsWith("sha256:") ? digest.substring(7) : "";
                            break;
                        }
                    }
                }

                if (isNewerVersion(latestVersion, installedVersion) && apkUrl != null && apkUrl.startsWith("https://")) {
                    String notes = release.optString("body", "").trim();
                    String finalApkUrl = apkUrl;
                    runOnUiThread(() -> showUpdate(latestVersion, notes, finalApkUrl));
                } else {
                    runOnUiThread(this::openApp);
                }
            } catch (Exception ignored) {
                runOnUiThread(this::openApp);
            }
        });
    }

    private boolean isNewerVersion(String latest, String installed) {
        try {
            String[] a = latest.split("\\.");
            String[] b = installed.split("\\.");
            for (int i = 0; i < Math.max(a.length, b.length); i++) {
                int av = i < a.length ? Integer.parseInt(a[i].replaceAll("[^0-9].*$", "")) : 0;
                int bv = i < b.length ? Integer.parseInt(b[i].replaceAll("[^0-9].*$", "")) : 0;
                if (av > bv) return true;
                if (av < bv) return false;
            }
        } catch (Exception ignored) {
            return false;
        }
        return false;
    }

    private void showLoading() {
        LinearLayout splash = new LinearLayout(this);
        splash.setOrientation(LinearLayout.VERTICAL);
        splash.setGravity(Gravity.CENTER);
        splash.setBackgroundColor(Color.rgb(255, 247, 251));
        splash.setPadding(dp(24), dp(24), dp(24), dp(24));

        ImageView piggy = new ImageView(this);
        piggy.setImageResource(R.drawable.gullak_piggy);
        piggy.setScaleType(android.widget.ImageView.ScaleType.FIT_CENTER);
        LinearLayout.LayoutParams piggyParams = new LinearLayout.LayoutParams(dp(250), dp(213));
        splash.addView(piggy, piggyParams);

        TextView label = new TextView(this);
        label.setText("GULLAK");
        label.setTextSize(38);
        label.setLetterSpacing(0.16f);
        label.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        label.setTextColor(Color.rgb(163, 36, 91));
        label.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams labelParams = matchWrap();
        labelParams.topMargin = dp(12);
        splash.addView(label, labelParams);

        TextView tagline = new TextView(this);
        tagline.setText("Your money buddy");
        tagline.setTextSize(15);
        tagline.setLetterSpacing(0.05f);
        tagline.setTextColor(Color.rgb(122, 92, 153));
        tagline.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams taglineParams = matchWrap();
        taglineParams.topMargin = dp(4);
        splash.addView(tagline, taglineParams);

        setContentView(splash);

        ObjectAnimator bounce = ObjectAnimator.ofPropertyValuesHolder(
            piggy,
            PropertyValuesHolder.ofFloat(View.SCALE_X, 1.0f, 1.055f, 1.0f),
            PropertyValuesHolder.ofFloat(View.SCALE_Y, 1.0f, 1.055f, 1.0f),
            PropertyValuesHolder.ofFloat(View.TRANSLATION_Y, 0f, -dp(7), 0f),
            PropertyValuesHolder.ofFloat(View.ROTATION, 0f, -1.8f, 1.8f, 0f)
        );
        bounce.setDuration(1450);
        bounce.setRepeatMode(ValueAnimator.RESTART);
        bounce.setRepeatCount(ValueAnimator.INFINITE);
        bounce.start();

        label.setAlpha(0f);
        label.setTranslationY(dp(12));
        label.animate().alpha(1f).translationY(0f).setDuration(950).start();
        tagline.setAlpha(0f);
        tagline.animate().alpha(1f).setStartDelay(250).setDuration(650).start();
    }

    private void showUpdate(String version, String notes, String apkUrl) {
        showingUpdate = true;
        pendingUpdateVersion = version == null ? "" : version;
        pendingUpdateNotes = notes == null ? "" : notes;
        pendingUpdateApkUrl = apkUrl == null ? "" : apkUrl;
        showHtmlScreen("update.html", "update");
    }

    private void openApp() {
        showingUpdate = false;
        if (!pinCheckDone) {
            String cookie = CookieManager.getInstance().getCookie(API_URL);
            if (cookie != null && cookie.contains("gullak_android_session=")) {
                executor.execute(() -> {
                    try {
                        JSONObject status = apiRequest("GET", "/api/mobile-pin/status", null);
                        boolean configured = status.optBoolean("configured", false);
                        runOnUiThread(() -> {
                            pinCheckDone = true;
                            pinConfigured = configured;
                            if (configured) showPhonePinScreen(false);
                            else openAppWebView();
                        });
                    } catch (Exception ignored) {
                        runOnUiThread(() -> { pinCheckDone = true; openAppWebView(); });
                    }
                });
                return;
            }
            pinCheckDone = true;
        }
        openAppWebView();
    }

    private void openAppWebView() {
        pinScreenVisible = false;
        needsUnlock = false;
        resetInactivityLock();
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
        ensureWebView();
        setContentView(webView);
        webView.loadUrl(APP_URL);
    }

    private void ensureWebView() {
        if (webView != null) return;
        webView = new WebView(this);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        webView.setBackgroundColor(Color.WHITE);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        webView.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.addJavascriptInterface(new GullakNativeBridge(), "GullakNative");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(pick, "Choose Gullak backup"), REQUEST_FILE_CHOOSER);
                    return true;
                } catch (Exception error) {
                    filePathCallback = null;
                    return false;
                }
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equalsIgnoreCase(uri.getScheme()) && APP_HOST.equalsIgnoreCase(uri.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    view.loadData("<meta name='viewport' content='width=device-width, initial-scale=1'><div style='font-family:sans-serif;padding:28px;text-align:center'><h2>Can't connect to Gullak</h2><p>Check your internet connection and try again.</p><a href='https://gullak-piggybank.ahansantra607.workers.dev/#/'>Try again</a></div>", "text/html", "UTF-8");
                }
            }
        });
    }

    private void showHtmlScreen(String assetName, String mode) {
        try {
            ensureWebView();
            StringBuilder html = new StringBuilder();
            try (InputStream input = getAssets().open(assetName);
                 BufferedReader reader = new BufferedReader(new InputStreamReader(input, "UTF-8"))) {
                String line;
                while ((line = reader.readLine()) != null) html.append(line).append("\n");
            }
            webView.setWebViewClient(new WebViewClient() {
                @Override public void onPageFinished(WebView view, String url) {
                    if ("update".equals(mode)) {
                        view.evaluateJavascript("window.initGullakUpdate && window.initGullakUpdate(" +
                            JSONObject.quote(pendingUpdateVersion) + "," + JSONObject.quote(pendingUpdateNotes) + ")", null);
                    } else if (mode != null && !mode.isEmpty()) {
                        view.evaluateJavascript("window.initGullakPin && window.initGullakPin(" + JSONObject.quote(mode) + ")", null);
                    }
                }
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri uri = request.getUrl();
                    if ("https".equalsIgnoreCase(uri.getScheme()) && APP_HOST.equalsIgnoreCase(uri.getHost())) return false;
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
                    return true;
                }
            });
            setContentView(webView);
            webView.loadDataWithBaseURL(APP_ORIGIN + "/", html.toString(), "text/html", "UTF-8", null);
        } catch (Exception error) {
            Toast.makeText(this, "Could not open the secure Gullak screen.", Toast.LENGTH_LONG).show();
            if (!showingUpdate) openAppWebView();
        }
    }


    private JSONObject apiRequest(String method, String path, String pin) throws Exception {
        URL url = new URL(API_URL + path);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(8000);
        connection.setReadTimeout(8000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Origin", APP_ORIGIN);
        connection.setRequestProperty("X-Gullak-Android", "1");
        String cookie = CookieManager.getInstance().getCookie(API_URL);
        if (cookie == null || !cookie.contains("gullak_android_session=")) throw new IllegalStateException("Your Gullak session has expired. Log in again.");
        connection.setRequestProperty("Cookie", cookie);
        if (pin != null) {
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            byte[] body = new JSONObject().put("pin", pin).toString().getBytes("UTF-8");
            try (OutputStream output = connection.getOutputStream()) { output.write(body); }
        }
        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
        StringBuilder response = new StringBuilder();
        if (stream != null) {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream))) {
                String line; while ((line = reader.readLine()) != null) response.append(line);
            }
        }
        connection.disconnect();
        JSONObject data = response.length() == 0 ? new JSONObject() : new JSONObject(response.toString());
        if (status < 200 || status >= 300) throw new IllegalStateException(data.optString("error", "Phone PIN request failed."));
        return data;
    }

    private void showPhonePinScreen(boolean setup) {
        inactivityHandler.removeCallbacks(inactivityLock);
        pinScreenVisible = true;
        showHtmlScreen("pin.html", setup ? "setup" : "unlock");
    }

    private void logoutFromPhone() {
        executor.execute(() -> {
            try { apiRequest("POST", "/api/logout", null); } catch (Exception ignored) { }
            runOnUiThread(() -> {
                CookieManager manager = CookieManager.getInstance();
                manager.removeAllCookies(null);
                manager.flush();
                pinConfigured = false;
                pinCheckDone = true;
                inactivityHandler.removeCallbacks(inactivityLock);
                pendingSetupPin = "";
                if (webView != null) {
                    webView.evaluateJavascript("if(window.G&&G.cloudAccount){G.cloudAccount.logout().catch(()=>{});}", null);
                    webView.loadUrl(APP_URL);
                    setContentView(webView);
                } else {
                    openAppWebView();
                }
            });
        });
    }

    private void resetInactivityLock() {
        inactivityHandler.removeCallbacks(inactivityLock);
        if (pinConfigured && webView != null && !pinScreenVisible && !showingUpdate) {
            inactivityHandler.postDelayed(inactivityLock, INACTIVITY_LOCK_MS);
        }
    }

    @Override
    public boolean dispatchTouchEvent(android.view.MotionEvent event) {
        if (event.getAction() == android.view.MotionEvent.ACTION_DOWN && pinConfigured && !pinScreenVisible && !showingUpdate) resetInactivityLock();
        return super.dispatchTouchEvent(event);
    }

    private void checkPinAfterCloudLogin() {
        if (pinConfigured && !pinScreenVisible) return;
        executor.execute(() -> {
            try {
                JSONObject status = apiRequest("GET", "/api/mobile-pin/status", null);
                boolean configured = status.optBoolean("configured", false);
                runOnUiThread(() -> {
                    pinCheckDone = true;
                    pinConfigured = configured;
                    showPhonePinScreen(!configured);
                });
            } catch (Exception error) {
                runOnUiThread(() -> Toast.makeText(this, error.getMessage(), Toast.LENGTH_LONG).show());
            }
        });
    }

    private final class GullakNativeBridge {
        @JavascriptInterface
        public void onCloudReady() {
            CookieManager.getInstance().flush();
            checkPinAfterCloudLogin();
        }

        @JavascriptInterface
        public void onCloudLogout() {
            pinConfigured = false; pinCheckDone = false; pendingSetupPin = "";
        }

        @JavascriptInterface
        public void setupPhonePin(String pin) {
            executor.execute(() -> {
                try {
                    apiRequest("POST", "/api/mobile-pin/setup", pin);
                    runOnUiThread(() -> { pinConfigured = true; pinCheckDone = true; openAppWebView(); });
                } catch (Exception error) { showPinError(error.getMessage()); }
            });
        }

        @JavascriptInterface
        public void verifyPhonePin(String pin) {
            executor.execute(() -> {
                try {
                    apiRequest("POST", "/api/mobile-pin/verify", pin);
                    runOnUiThread(() -> { pinConfigured = true; pinCheckDone = true; openAppWebView(); });
                } catch (Exception error) { showPinError(error.getMessage()); }
            });
        }

        @JavascriptInterface
        public void logoutFromPin() { logoutFromPhone(); }

        @JavascriptInterface
        public void installUpdate() {
            runOnUiThread(() -> downloadAndInstallUpdate());
        }

        @JavascriptInterface
        public void dismissUpdate() { runOnUiThread(MainActivity.this::openApp); }

        @JavascriptInterface
        public void saveEncryptedBackup(String filename, String mimeType, String base64) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                if (bytes.length == 0 || bytes.length > 15 * 1024 * 1024) {
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "Backup file is too large or empty.", Toast.LENGTH_LONG).show());
                    return;
                }
                String safeName = filename == null ? "gullak-backup.gullak" : filename.replaceAll("[^A-Za-z0-9._-]", "_");
                if (!safeName.endsWith(".gullak")) safeName += ".gullak";
                final String finalSafeName = safeName;
                runOnUiThread(() -> {
                    pendingBackupBytes = bytes;
                    Intent create = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    create.addCategory(Intent.CATEGORY_OPENABLE);
                    create.setType("application/json");
                    create.putExtra(Intent.EXTRA_TITLE, finalSafeName);
                    try { startActivityForResult(create, REQUEST_SAVE_BACKUP); }
                    catch (Exception error) {
                        pendingBackupBytes = null;
                        Toast.makeText(MainActivity.this, "Unable to open the save dialog.", Toast.LENGTH_LONG).show();
                    }
                });
            } catch (Exception error) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Could not prepare the encrypted backup.", Toast.LENGTH_LONG).show());
            }
        }
    }

    private void downloadAndInstallUpdate() {
        if (pendingUpdateApkUrl == null || !pendingUpdateApkUrl.startsWith("https://")) {
            Toast.makeText(this, "The update download is unavailable.", Toast.LENGTH_LONG).show();
            return;
        }
        Toast.makeText(this, "Downloading Gullak update…", Toast.LENGTH_SHORT).show();
        executor.execute(() -> {
            File temp = null;
            try {
                URL url = new URL(pendingUpdateApkUrl);
                if (!"api.github.com".equalsIgnoreCase(url.getHost()) &&
                    !"github.com".equalsIgnoreCase(url.getHost()) &&
                    !"objects.githubusercontent.com".equalsIgnoreCase(url.getHost()) &&
                    !"release-assets.githubusercontent.com".equalsIgnoreCase(url.getHost())) {
                    throw new IllegalStateException("Untrusted update download host.");
                }
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("User-Agent", "Gullak-Android-Updater");
                int status = connection.getResponseCode();
                if (status != HttpURLConnection.HTTP_OK) throw new IllegalStateException("GitHub download failed (" + status + ").");
                File folder = new File(getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS), "updates");
                if (!folder.exists() && !folder.mkdirs()) throw new IllegalStateException("Could not prepare temporary update storage.");
                temp = new File(folder, "Gullak-" + pendingUpdateVersion + ".apk");
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long total = 0;
                try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(temp)) {
                    byte[] buffer = new byte[32768];
                    int count;
                    while ((count = in.read(buffer)) != -1) {
                        total += count;
                        if (total > 150L * 1024L * 1024L) throw new IllegalStateException("The update file is unexpectedly large.");
                        digest.update(buffer, 0, count);
                        out.write(buffer, 0, count);
                    }
                    out.getFD().sync();
                } finally {
                    connection.disconnect();
                }
                if (total < 10000) throw new IllegalStateException("The downloaded update is incomplete.");
                StringBuilder actual = new StringBuilder();
                for (byte b : digest.digest()) actual.append(String.format(Locale.US, "%02x", b & 0xff));
                if (pendingUpdateSha256 == null || pendingUpdateSha256.length() != 64 ||
                    !actual.toString().equalsIgnoreCase(pendingUpdateSha256)) {
                    throw new IllegalStateException("The update checksum could not be verified. Please try again later.");
                }
                PackageManager pm = getPackageManager();
                PackageInfo archive = pm.getPackageArchiveInfo(temp.getAbsolutePath(), PackageManager.GET_META_DATA);
                if (archive == null || !getPackageName().equals(archive.packageName) ||
                    !pendingUpdateVersion.equals(archive.versionName)) {
                    throw new IllegalStateException("The downloaded file is not the expected Gullak update.");
                }
                File ready = temp;
                runOnUiThread(() -> {
                    downloadedUpdateApk = ready;
                    launchPackageInstaller();
                });
            } catch (Exception error) {
                if (temp != null) temp.delete();
                String message = error.getMessage() == null ? "Could not download the update." : error.getMessage();
                runOnUiThread(() -> {
                    Toast.makeText(this, message, Toast.LENGTH_LONG).show();
                    if (showingUpdate && webView != null) webView.evaluateJavascript(
                        "document.getElementById('message').textContent=" + JSONObject.quote(message), null);
                });
            }
        });
    }

    private void launchPackageInstaller() {
        if (downloadedUpdateApk == null || !downloadedUpdateApk.isFile()) {
            Toast.makeText(this, "The downloaded update is no longer available.", Toast.LENGTH_LONG).show();
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
            waitingForInstallPermission = true;
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getPackageName()));
            startActivity(settings);
            return;
        }
        try {
            Uri apkUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", downloadedUpdateApk);
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(apkUri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivityForResult(install, REQUEST_INSTALL_APK);
        } catch (Exception error) {
            Toast.makeText(this, "Android could not open the installer. The downloaded update is kept temporarily.", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (waitingForInstallPermission) {
            waitingForInstallPermission = false;
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls()) {
                launchPackageInstaller();
            } else {
                Toast.makeText(this, "Allow Gullak to install updates to continue.", Toast.LENGTH_LONG).show();
            }
        }
    }

    private void showPinError(String message) {
        runOnUiThread(() -> {
            if (webView == null) return;
            webView.evaluateJavascript("window.showGullakPinError && window.showGullakPinError(" +
                JSONObject.quote(message == null ? "Please try again." : message) + ")", null);
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQUEST_INSTALL_APK) {
            if (downloadedUpdateApk != null) { downloadedUpdateApk.delete(); downloadedUpdateApk = null; }
            return;
        }
        if (requestCode == REQUEST_FILE_CHOOSER) {
            if (filePathCallback != null) {
                Uri[] result = resultCode == RESULT_OK && data != null && data.getData() != null
                    ? new Uri[]{data.getData()} : null;
                filePathCallback.onReceiveValue(result);
                filePathCallback = null;
            }
            return;
        }
        if (requestCode == REQUEST_SAVE_BACKUP) {
            try {
                if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingBackupBytes != null) {
                    try (OutputStream output = getContentResolver().openOutputStream(data.getData())) {
                        if (output == null) throw new IllegalStateException("Unable to open the selected destination.");
                        output.write(pendingBackupBytes);
                        output.flush();
                    }
                    Toast.makeText(this, "Encrypted Gullak backup saved.", Toast.LENGTH_LONG).show();
                }
            } catch (Exception error) {
                Toast.makeText(this, "Could not save the backup. Please try again.", Toast.LENGTH_LONG).show();
            } finally {
                pendingBackupBytes = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private Button makeButton(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setAllCaps(false);
        button.setTextSize(16);
        button.setTextColor(Color.WHITE);
        button.setBackground(tintedBackground(Color.rgb(38, 115, 77)));
        return button;
    }

    private GradientDrawable tintedBackground(int color) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(14));
        return drawable;
    }

    private LinearLayout.LayoutParams matchWidth() {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(52));
        return p;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    @Override
    public void onBackPressed() {
        if (pinScreenVisible) return;
        if (showingUpdate) {
            openApp();
        } else if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onStop() {
        super.onStop();
        inactivityHandler.removeCallbacks(inactivityLock);
        if (pinConfigured && webView != null && !showingUpdate && !pinScreenVisible) needsUnlock = true;
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (needsUnlock && pinConfigured && webView != null) showPhonePinScreen(false);
    }

    @Override
    protected void onDestroy() {
        inactivityHandler.removeCallbacks(inactivityLock);
        executor.shutdownNow();
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
        pendingBackupBytes = null;
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
