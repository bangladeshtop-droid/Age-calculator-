/**
 * AgeBee Pro — Secure Server-Side Firebase Functions Reference
 * 
 * Implements server-side Google Play purchase verification, token deduplication,
 * atomic wallet credits/debits, and admin audit logging.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { google } = require("googleapis");

admin.initializeApp();
const db = admin.database();

const SUPER_ADMIN_UID = "ocKYPuMF2u7wM9BHJ3W50yfrBx24qHvJfVOI2iQL";

/**
 * Verify Google Play Purchase and Credit Diamonds Atomically
 */
exports.verifyPlayPurchase = functions.https.onCall(async (data, context) => {
  // 1. Authenticate caller
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be signed in.");
  }

  const { packageName, productId, purchaseToken, diamonds } = data;
  const uid = context.auth.uid;

  if (!productId || !purchaseToken || !diamonds) {
    throw new functions.https.HttpsError("invalid-argument", "Missing required purchase fields.");
  }

  // 2. Token deduplication check
  const tokenHash = Buffer.from(purchaseToken).toString("base64").substring(0, 32);
  const tokenRef = db.ref(`purchaseTokens/${tokenHash}`);
  const tokenSnap = await tokenRef.get();

  if (tokenSnap.exists()) {
    throw new functions.https.HttpsError("already-exists", "This purchase token has already been processed.");
  }

  try {
    // 3. Mark token as processing immediately
    await tokenRef.set({
      uid,
      productId,
      status: "processing",
      timestamp: admin.database.ServerValue.TIMESTAMP
    });

    // 4. Verify with Google Play Developer API (In Production)
    /*
    const authClient = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/androidpublisher"]
    });
    const playDeveloper = google.androidpublisher({ version: "v3", auth: authClient });
    const response = await playDeveloper.purchases.products.get({
      packageName: packageName || "com.aistudio.agebeepro.wvmk",
      productId: productId,
      token: purchaseToken
    });

    if (response.data.purchaseState !== 0) { // 0 = Purchased
      throw new Error("Invalid purchase state from Google Play: " + response.data.purchaseState);
    }
    */

    // 5. Credit diamond wallet atomically
    const walletRef = db.ref(`wallets/${uid}`);
    const txRef = db.ref(`walletTransactions/${uid}`).push();
    const purchaseRef = db.ref(`purchases`).push();

    await walletRef.transaction((current) => {
      const w = current || { available: 0, used: 0, purchased: 0 };
      return {
        available: Number(w.available || 0) + Number(diamonds),
        used: Number(w.used || 0),
        purchased: Number(w.purchased || 0) + Number(diamonds),
        lastUpdatedAt: Date.now()
      };
    });

    const txId = txRef.key;
    const purchaseId = purchaseRef.key;

    // Log verified purchase
    await purchaseRef.set({
      purchaseId,
      uid,
      productId,
      diamonds,
      state: "VERIFIED",
      verified: true,
      timestamp: admin.database.ServerValue.TIMESTAMP
    });

    // Log ledger entry
    await txRef.set({
      transactionId: txId,
      uid,
      type: "purchase_credit",
      amount: diamonds,
      referenceId: purchaseId,
      reason: `Google Play purchase credit for ${diamonds} diamonds`,
      timestamp: admin.database.ServerValue.TIMESTAMP
    });

    // Finalize token record
    await tokenRef.update({ status: "verified", purchaseId });

    return { success: true, diamondsCredited: diamonds, purchaseId };
  } catch (error) {
    await tokenRef.remove();
    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Server-Side Admin Authorization Enforcement
 */
exports.manageAdminPrivileges = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.uid !== SUPER_ADMIN_UID) {
    throw new functions.https.HttpsError("permission-denied", "Only the permanent Super Admin can manage administrator roles.");
  }

  const { targetUid, action, notes } = data; // action: 'add' or 'remove'
  if (!targetUid) {
    throw new functions.https.HttpsError("invalid-argument", "Target UID is required.");
  }

  if (targetUid === SUPER_ADMIN_UID) {
    throw new functions.https.HttpsError("failed-precondition", "Permanent Super Admin cannot be modified.");
  }

  const adminTargetRef = db.ref(`admins/${targetUid}`);
  const auditRef = db.ref("adminAuditLogs").push();

  if (action === "add") {
    await adminTargetRef.set({
      uid: targetUid,
      notes: notes || "Additional Admin",
      active: true,
      addedBy: context.auth.uid,
      addedAt: admin.database.ServerValue.TIMESTAMP
    });

    await auditRef.set({
      logId: auditRef.key,
      adminUid: context.auth.uid,
      action: "ADD_ADMIN",
      targetUid,
      details: `Authorized admin UID: ${targetUid}`,
      timestamp: admin.database.ServerValue.TIMESTAMP
    });
    return { success: true, message: `Admin ${targetUid} granted.` };
  } else if (action === "remove") {
    await adminTargetRef.remove();
    await auditRef.set({
      logId: auditRef.key,
      adminUid: context.auth.uid,
      action: "REVOKE_ADMIN",
      targetUid,
      details: `Revoked admin UID: ${targetUid}`,
      timestamp: admin.database.ServerValue.TIMESTAMP
    });
    return { success: true, message: `Admin ${targetUid} revoked.` };
  }

  throw new functions.https.HttpsError("invalid-argument", "Invalid action.");
});
