package com.ahansantra607.gullak;

import android.app.Activity;
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
import android.util.Base64;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
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
                String installedVersion = BuildConfig.VERSION_NAME;
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
        TextView label = new TextView(this);
        label.setText("🐷  Gullak");
        label.setTextSize(27);
        label.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        label.setTextColor(Color.rgb(38, 91, 62));
        label.setGravity(Gravity.CENTER);
        setContentView(label);
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


    private final class GullakNativeBridge {
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
        if (showingUpdate) {
            openApp();
        } else if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
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
