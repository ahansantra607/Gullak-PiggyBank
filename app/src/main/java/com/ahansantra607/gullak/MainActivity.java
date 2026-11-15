package com.ahansantra607.gullak;

import android.app.Activity;
import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.animation.ValueAnimator;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
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
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setGravity(Gravity.CENTER_HORIZONTAL);
        page.setPadding(dp(26), dp(34), dp(26), dp(24));
        page.setBackgroundColor(Color.rgb(248, 249, 244));

        TextView icon = new TextView(this);
        icon.setText("🐷");
        icon.setTextSize(58);
        icon.setGravity(Gravity.CENTER);
        page.addView(icon, matchWrap());

        TextView title = new TextView(this);
        title.setText("Gullak update available");
        title.setTextColor(Color.rgb(31, 55, 40));
        title.setTextSize(25);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleParams = matchWrap();
        titleParams.topMargin = dp(18);
        page.addView(title, titleParams);

        TextView versionText = new TextView(this);
        versionText.setText("Version " + version + " is ready");
        versionText.setTextColor(Color.rgb(38, 115, 77));
        versionText.setTextSize(17);
        versionText.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams versionParams = matchWrap();
        versionParams.topMargin = dp(8);
        page.addView(versionText, versionParams);

        TextView description = new TextView(this);
        description.setText("A newer version of Gullak is available. Update to get the latest improvements.");
        description.setTextColor(Color.rgb(76, 82, 76));
        description.setTextSize(15);
        description.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams descParams = matchWrap();
        descParams.topMargin = dp(20);
        page.addView(description, descParams);

        if (!notes.isEmpty()) {
            TextView notesTitle = new TextView(this);
            notesTitle.setText("What's new");
            notesTitle.setTextColor(Color.rgb(31, 55, 40));
            notesTitle.setTextSize(17);
            notesTitle.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
            LinearLayout.LayoutParams nt = matchWrap();
            nt.topMargin = dp(26);
            page.addView(notesTitle, nt);

            TextView notesText = new TextView(this);
            notesText.setText(notes.length() > 5000 ? notes.substring(0, 5000) : notes);
            notesText.setTextColor(Color.rgb(76, 82, 76));
            notesText.setTextSize(14);
            LinearLayout.LayoutParams np = matchWrap();
            np.topMargin = dp(8);
            page.addView(notesText, np);
        }

        View spacer = new View(this);
        page.addView(spacer, new LinearLayout.LayoutParams(1, 0, 1));

        Button update = makeButton("Update now");
        update.setOnClickListener(v -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl)));
            } catch (Exception ignored) {
                openApp();
            }
        });
        page.addView(update, matchWidth());

        Button later = makeButton("Not now");
        later.setBackground(tintedBackground(Color.rgb(232, 237, 229)));
        later.setTextColor(Color.rgb(42, 69, 49));
        later.setOnClickListener(v -> openApp());
        LinearLayout.LayoutParams laterParams = matchWidth();
        laterParams.topMargin = dp(10);
        page.addView(later, laterParams);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(page);
        setContentView(scroll);
    }

    private void openApp() {
        showingUpdate = false;
        if (!pinCheckDone) {
            String cookie = CookieManager.getInstance().getCookie(API_URL);
            if (cookie != null && cookie.contains("gullak_session=")) {
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
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
        if (webView != null) {
            setContentView(webView);
            return;
        }
        webView = new WebView(this);
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
                if ("https".equalsIgnoreCase(uri.getScheme()) && APP_HOST.equalsIgnoreCase(uri.getHost())) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    view.loadData("<meta name='viewport' content='width=device-width, initial-scale=1'><div style='font-family:sans-serif;padding:28px;text-align:center'><h2>Can't connect to Gullak</h2><p>Check your internet connection and try again.</p><button onclick=\"location.href='https://gullak-piggybank.ahansantra607.workers.dev/#/'\">Try again</button></div>", "text/html", "UTF-8");
                }
            }
        });
        setContentView(webView);
        webView.loadUrl(APP_URL);
    }



    private JSONObject apiRequest(String method, String path, String pin) throws Exception {
        URL url = new URL(API_URL + path);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(8000);
        connection.setReadTimeout(8000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Origin", APP_ORIGIN);
        String cookie = CookieManager.getInstance().getCookie(API_URL);
        if (cookie == null || !cookie.contains("gullak_session=")) throw new IllegalStateException("Your Gullak session has expired. Log in again.");
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
        pinScreenVisible = true;
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setGravity(Gravity.CENTER);
        page.setPadding(dp(28), dp(28), dp(28), dp(28));
        page.setBackgroundColor(Color.rgb(255, 247, 251));

        TextView pig = new TextView(this);
        pig.setText("🐷");
        pig.setTextSize(48);
        pig.setGravity(Gravity.CENTER);
        page.addView(pig, matchWrap());

        TextView title = new TextView(this);
        title.setText(setup ? "Set up your phone PIN" : "Welcome back to Gullak");
        title.setTextSize(24);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setTextColor(Color.rgb(163, 36, 91));
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleParams = matchWrap();
        titleParams.topMargin = dp(12);
        page.addView(title, titleParams);

        TextView hint = new TextView(this);
        hint.setText(setup ? "Create a six-digit PIN. It will work on all phones using this Gullak account." : "Enter your six-digit PIN to unlock your Gullak.");
        hint.setTextSize(14);
        hint.setTextColor(Color.rgb(100, 82, 100));
        hint.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams hintParams = matchWrap();
        hintParams.topMargin = dp(8);
        page.addView(hint, hintParams);

        pinInput = new EditText(this);
        pinInput.setSingleLine(true);
        pinInput.setInputType(android.text.InputType.TYPE_CLASS_NUMBER | android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        pinInput.setEms(6);
        pinInput.setGravity(Gravity.CENTER);
        pinInput.setTextSize(25);
        pinInput.setLetterSpacing(0.25f);
        pinInput.setFilters(new InputFilter[]{new InputFilter.LengthFilter(6)});
        pinInput.setHint("••••••");
        LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(dp(220), dp(58));
        inputParams.topMargin = dp(22);
        page.addView(pinInput, inputParams);

        Button action = makeButton(setup ? "Continue" : "Unlock Gullak");
        LinearLayout.LayoutParams actionParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(54));
        actionParams.topMargin = dp(18);
        page.addView(action, actionParams);
        action.setOnClickListener(v -> {
            String entered = pinInput.getText().toString();
            if (!entered.matches("\\d{6}")) {
                Toast.makeText(this, "Enter all six digits.", Toast.LENGTH_SHORT).show();
                return;
            }
            action.setEnabled(false);
            if (setup) {
                if (pendingSetupPin.isEmpty()) {
                    pendingSetupPin = entered;
                    pinInput.setText("");
                    hint.setText("Enter the same six-digit PIN again to confirm.");
                    title.setText("Confirm your phone PIN");
                    action.setText("Set my PIN");
                    action.setEnabled(true);
                    return;
                }
                if (!pendingSetupPin.equals(entered)) {
                    pendingSetupPin = "";
                    pinInput.setText("");
                    hint.setText("The PINs did not match. Please create your PIN again.");
                    title.setText("Set up your phone PIN");
                    action.setText("Continue");
                    action.setEnabled(true);
                    return;
                }
                executor.execute(() -> {
                    try {
                        apiRequest("POST", "/api/mobile-pin/setup", entered);
                        runOnUiThread(() -> {
                            pendingSetupPin = "";
                            pinConfigured = true;
                            pinCheckDone = true;
                            Toast.makeText(this, "Phone PIN set up. It will work on your other phones too.", Toast.LENGTH_LONG).show();
                            openAppWebView();
                        });
                    } catch (Exception error) {
                        runOnUiThread(() -> {
                            pendingSetupPin = "";
                            pinInput.setText("");
                            action.setEnabled(true);
                            Toast.makeText(this, error.getMessage(), Toast.LENGTH_LONG).show();
                        });
                    }
                });
            } else {
                executor.execute(() -> {
                    try {
                        apiRequest("POST", "/api/mobile-pin/verify", entered);
                        runOnUiThread(() -> {
                            pinConfigured = true;
                            pinCheckDone = true;
                            openAppWebView();
                        });
                    } catch (Exception error) {
                        runOnUiThread(() -> {
                            pinInput.setText("");
                            action.setEnabled(true);
                            Toast.makeText(this, error.getMessage(), Toast.LENGTH_LONG).show();
                        });
                    }
                });
            }
        });

        Button logout = makeButton("Log out");
        logout.setBackground(tintedBackground(Color.rgb(232, 237, 229)));
        logout.setTextColor(Color.rgb(42, 69, 49));
        LinearLayout.LayoutParams logoutParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(50));
        logoutParams.topMargin = dp(10);
        page.addView(logout, logoutParams);
        logout.setOnClickListener(v -> logoutFromPhone());

        setContentView(page);
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
            checkPinAfterCloudLogin();
        }

        @JavascriptInterface
        public void onCloudLogout() {
            pinConfigured = false;
            pinCheckDone = false;
            pendingSetupPin = "";
        }

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
                    try {
                        startActivityForResult(create, REQUEST_SAVE_BACKUP);
                    } catch (Exception error) {
                        pendingBackupBytes = null;
                        Toast.makeText(MainActivity.this, "Unable to open the save dialog.", Toast.LENGTH_LONG).show();
                    }
                });
            } catch (Exception error) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Could not prepare the encrypted backup.", Toast.LENGTH_LONG).show());
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
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
        if (pinConfigured && webView != null && !showingUpdate && !pinScreenVisible) needsUnlock = true;
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (needsUnlock && pinConfigured && webView != null) showPhonePinScreen(false);
    }

    @Override
    protected void onDestroy() {
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
