package com.example.bridge

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.webkit.JavascriptInterface
import android.widget.Toast
import com.example.billing.BillingManager

/**
 * JavaScriptInterface bridge allowing web UI to communicate with native Android features.
 */
class AndroidBridge(
    private val activity: Activity,
    private val billingManager: BillingManager
) {

    @JavascriptInterface
    fun isNativeApp(): Boolean {
        return true
    }

    @JavascriptInterface
    fun launchBilling(productId: String, uid: String) {
        activity.runOnUiThread {
            billingManager.launchPurchaseFlow(productId, uid)
        }
    }

    @JavascriptInterface
    fun showToast(message: String) {
        activity.runOnUiThread {
            Toast.makeText(activity, message, Toast.LENGTH_SHORT).show()
        }
    }

    @JavascriptInterface
    fun copyToClipboard(text: String) {
        activity.runOnUiThread {
            val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            val clip = ClipData.newPlainText("AgeBee UID", text)
            clipboard?.setPrimaryClip(clip)
        }
    }

    @JavascriptInterface
    fun vibrateHaptic(type: String) {
        activity.runOnUiThread {
            try {
                val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    val manager = activity.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                    manager?.defaultVibrator
                } else {
                    @Suppress("DEPRECATION")
                    activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                }
                vibrator?.let {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        it.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE))
                    } else {
                        @Suppress("DEPRECATION")
                        it.vibrate(50)
                    }
                }
            } catch (_: Exception) {}
        }
    }

    @JavascriptInterface
    fun openExternalUrl(url: String) {
        activity.runOnUiThread {
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                activity.startActivity(intent)
            } catch (_: Exception) {}
        }
    }
}
