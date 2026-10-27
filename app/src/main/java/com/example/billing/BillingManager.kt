package com.example.billing

import android.app.Activity
import android.util.Log
import com.android.billingclient.api.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Handles official Google Play Billing lifecycle and purchases for consumable diamonds.
 */
class BillingManager(
    private val activity: Activity,
    private val onPurchaseSuccess: (purchaseJson: String) -> Unit,
    private val onPurchaseError: (errorMsg: String) -> Unit
) : PurchasesUpdatedListener, BillingClientStateListener {

    private val tag = "AgeBee_Billing"
    private val coroutineScope = CoroutineScope(Dispatchers.Main)

    private val billingClient: BillingClient = BillingClient.newBuilder(activity)
        .setListener(this)
        .enablePendingPurchases()
        .build()

    private val productDetailsMap = mutableMapOf<String, ProductDetails>()

    init {
        startConnection()
    }

    private fun startConnection() {
        billingClient.startConnection(this)
    }

    override fun onBillingSetupFinished(billingResult: BillingResult) {
        if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
            Log.d(tag, "Google Play Billing client connected successfully.")
            preloadProducts(listOf(
                "diamonds_starter_50",
                "diamonds_pro_150",
                "diamonds_master_350",
                "diamonds_ultimate_800"
            ))
        } else {
            Log.w(tag, "Billing setup failed: ${billingResult.debugMessage}")
        }
    }

    override fun onBillingServiceDisconnected() {
        Log.w(tag, "Billing service disconnected. Reconnecting...")
        startConnection()
    }

    /**
     * Preloads product details from Google Play
     */
    fun preloadProducts(productIds: List<String>) {
        val productList = productIds.map { id ->
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(id)
                .setProductType(BillingClient.ProductType.INAPP)
                .build()
        }

        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(productList)
            .build()

        billingClient.queryProductDetailsAsync(params) { billingResult, productDetailsList ->
            if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                productDetailsList.forEach { details ->
                    productDetailsMap[details.productId] = details
                    Log.d(tag, "Loaded product: ${details.productId}")
                }
            }
        }
    }

    /**
     * Launches the native Google Play purchase sheet for a product
     */
    fun launchPurchaseFlow(productId: String, uid: String) {
        val details = productDetailsMap[productId]
        if (details == null) {
            // Query dynamically if not cached
            val productList = listOf(
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(productId)
                    .setProductType(BillingClient.ProductType.INAPP)
                    .build()
            )
            val params = QueryProductDetailsParams.newBuilder()
                .setProductList(productList)
                .build()

            billingClient.queryProductDetailsAsync(params) { billingResult, productDetailsList ->
                val fetchedDetails = productDetailsList.firstOrNull()
                if (fetchedDetails != null) {
                    productDetailsMap[productId] = fetchedDetails
                    activity.runOnUiThread {
                        executeLaunchFlow(fetchedDetails, uid)
                    }
                } else {
                    activity.runOnUiThread {
                        onPurchaseError("Product $productId is currently unavailable on Google Play.")
                    }
                }
            }
            return
        }

        executeLaunchFlow(details, uid)
    }

    private fun executeLaunchFlow(details: ProductDetails, uid: String) {
        val productDetailsParamsList = listOf(
            BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(details)
                .build()
        )

        val flowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(productDetailsParamsList)
            .setObfuscatedAccountId(uid)
            .build()

        val responseCode = billingClient.launchBillingFlow(activity, flowParams).responseCode
        if (responseCode != BillingClient.BillingResponseCode.OK) {
            onPurchaseError("Unable to open Google Play Store checkout (Code: $responseCode)")
        }
    }

    override fun onPurchasesUpdated(billingResult: BillingResult, purchases: MutableList<Purchase>?) {
        when (billingResult.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                purchases?.forEach { purchase ->
                    handlePurchase(purchase)
                }
            }
            BillingClient.BillingResponseCode.USER_CANCELED -> {
                onPurchaseError("Purchase was cancelled.")
            }
            else -> {
                onPurchaseError("Purchase failed: ${billingResult.debugMessage}")
            }
        }
    }

    private fun handlePurchase(purchase: Purchase) {
        if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
            // For consumable diamond products, consume the purchase
            val consumeParams = ConsumeParams.newBuilder()
                .setPurchaseToken(purchase.purchaseToken)
                .build()

            coroutineScope.launch {
                billingClient.consumeAsync(consumeParams) { billingResult, _ ->
                    if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                        val productId = purchase.products.firstOrNull() ?: "diamonds"
                        val json = JSONObject().apply {
                            put("orderId", purchase.orderId ?: "gp_${System.currentTimeMillis()}")
                            put("purchaseToken", purchase.purchaseToken)
                            put("productId", productId)
                            put("purchaseTime", purchase.purchaseTime)
                            put("diamonds", extractDiamondsFromProductId(productId))
                        }
                        activity.runOnUiThread {
                            onPurchaseSuccess(json.toString())
                        }
                    } else {
                        activity.runOnUiThread {
                            onPurchaseError("Failed to consume purchase: ${billingResult.debugMessage}")
                        }
                    }
                }
            }
        } else if (purchase.purchaseState == Purchase.PurchaseState.PENDING) {
            onPurchaseError("Purchase is pending bank or payment confirmation.")
        }
    }

    private fun extractDiamondsFromProductId(productId: String): Int {
        return when {
            productId.contains("800") -> 800
            productId.contains("350") -> 350
            productId.contains("150") -> 150
            else -> 50
        }
    }

    fun destroy() {
        billingClient.endConnection()
    }
}
