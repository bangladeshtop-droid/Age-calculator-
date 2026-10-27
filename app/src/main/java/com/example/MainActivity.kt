package com.example

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import com.example.billing.BillingManager
import com.example.bridge.AndroidBridge

private const val TAG = "AgeBee_MainActivity"

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var billingManager: BillingManager

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Initialize Native Billing Manager
        billingManager = BillingManager(
            activity = this,
            onPurchaseSuccess = { purchaseJson ->
                runOnUiThread {
                    webView.evaluateJavascript(
                        "window.onGooglePlayPurchaseSuccess && window.onGooglePlayPurchaseSuccess($purchaseJson);",
                        null
                    )
                }
            },
            onPurchaseError = { errorMsg ->
                runOnUiThread {
                    val sanitized = errorMsg.replace("\"", "\\\"")
                    webView.evaluateJavascript(
                        "window.onGooglePlayPurchaseError && window.onGooglePlayPurchaseError(\"$sanitized\");",
                        null
                    )
                }
            }
        )

        // Set up secure local asset loader via HTTPS domain
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        // Initialize WebView
        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#0b0f19"))

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                loadsImagesAutomatically = true
                cacheMode = WebSettings.LOAD_DEFAULT
                useWideViewPort = true
                loadWithOverviewMode = true
                setSupportMultipleWindows(true)
                javaScriptCanOpenWindowsAutomatically = true
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            }

            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                    Log.d("AgeBee_WebConsole", "${consoleMessage?.message()} [line ${consoleMessage?.lineNumber()}]")
                    return true
                }
            }

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView?,
                    request: WebResourceRequest?
                ): WebResourceResponse? {
                    val url = request?.url ?: return null
                    return assetLoader.shouldInterceptRequest(url)
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    Log.d(TAG, "Page finished loading: $url")
                }
            }

            // Bind Native JavaScriptInterface
            addJavascriptInterface(AndroidBridge(this@MainActivity, billingManager), "AndroidBridge")
        }

        setContentView(webView)

        // Insets handling for Edge to Edge
        ViewCompat.setOnApplyWindowInsetsListener(webView) { view, windowInsets ->
            val insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(0, insets.top, 0, 0)
            windowInsets
        }

        // Handle Android Back Navigation
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        // Load local assets via secure HTTPS virtual domain
        webView.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")
    }

    override fun onDestroy() {
        billingManager.destroy()
        webView.destroy()
        super.onDestroy()
    }
}
