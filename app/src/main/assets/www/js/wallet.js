// AgeBee Pro — Diamond Wallet & Transaction Ledger System
import { ref, runTransaction, push, set, serverTimestamp, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/**
 * Atomically deducts diamonds for an age calculation and logs ledger record.
 */
export async function executeCalculationDebit(db, uid, cost, calcResult, dobFormatted) {
  if (!uid) throw new Error("User must be authenticated.");
  if (cost <= 0) throw new Error("Invalid cost amount.");

  const walletRef = ref(db, `wallets/${uid}`);
  const calcHistoryRef = push(ref(db, `calculationHistory/${uid}`));
  const calcId = calcHistoryRef.key;
  const txRef = push(ref(db, `walletTransactions/${uid}`));
  const txId = txRef.key;

  let balanceAfter = 0;

  try {
    // Run atomic transaction on Firebase wallet
    const result = await runTransaction(walletRef, (currentData) => {
      if (currentData === null) {
        return currentData;
      }

      const available = Number(currentData.available || 0);
      const used = Number(currentData.used || 0);
      const purchased = Number(currentData.purchased || 0);

      if (available < cost) {
        return; 
      }

      return {
        available: available - cost,
        used: used + cost,
        purchased: purchased,
        lastUpdatedAt: Date.now()
      };
    });

    if (result && result.committed) {
      const snapshot = result.snapshot.val();
      balanceAfter = snapshot.available;

      // Record calculation in history
      await set(calcHistoryRef, {
        calculationId: calcId,
        uid: uid,
        dob: dobFormatted,
        result: {
          years: calcResult.years,
          months: calcResult.months,
          days: calcResult.days,
          totalMonths: calcResult.totalMonths,
          totalWeeks: calcResult.totalWeeks,
          totalDays: calcResult.totalDays,
          dayBorn: calcResult.dayBorn
        },
        diamondsCharged: cost,
        timestamp: serverTimestamp()
      });

      // Record immutable transaction ledger
      await set(txRef, {
        transactionId: txId,
        uid: uid,
        type: "calculation_debit",
        amount: -cost,
        balanceAfter: balanceAfter,
        referenceId: calcId,
        reason: `Age calculation for DOB ${dobFormatted}`,
        timestamp: serverTimestamp()
      });
    } else {
      throw new Error("Insufficient diamonds to complete calculation. Please purchase more diamonds.");
    }
  } catch (err) {
    if (err.message && err.message.includes("Insufficient diamonds")) {
      throw err;
    }
    console.warn("Firebase transaction fallback to local wallet:", err);

    // Resilient local wallet update
    const localWalletKey = `agebee_wallet_${uid}`;
    let localWallet = { available: 10, used: 0, purchased: 0 };
    try {
      const saved = localStorage.getItem(localWalletKey);
      if (saved) localWallet = JSON.parse(saved);
    } catch (_) {}

    if (localWallet.available < cost) {
      throw new Error(`Insufficient diamonds. You have ${localWallet.available} diamonds, but need ${cost}.`);
    }

    localWallet.available -= cost;
    localWallet.used = (localWallet.used || 0) + cost;
    localStorage.setItem(localWalletKey, JSON.stringify(localWallet));
    balanceAfter = localWallet.available;

    // Save calculation to local history
    const calcsKey = `agebee_calcs_${uid}`;
    let localCalcs = [];
    try {
      localCalcs = JSON.parse(localStorage.getItem(calcsKey) || "[]");
    } catch (_) {}
    localCalcs.unshift({
      calculationId: calcId,
      uid: uid,
      dob: dobFormatted,
      result: calcResult,
      diamondsCharged: cost,
      timestamp: Date.now()
    });
    localStorage.setItem(calcsKey, JSON.stringify(localCalcs));
  }

  return {
    calcId,
    balanceAfter,
    diamondsCharged: cost
  };
}

/**
 * Credits diamonds following verified Google Play purchase
 */
export async function creditPurchasedDiamonds(db, uid, diamonds, purchaseId, productId, playToken) {
  if (!uid || diamonds <= 0) throw new Error("Invalid credit parameters.");

  const walletRef = ref(db, `wallets/${uid}`);
  const txRef = push(ref(db, `walletTransactions/${uid}`));
  const txId = txRef.key;

  const result = await runTransaction(walletRef, (currentData) => {
    const data = currentData || { available: 0, used: 0, purchased: 0 };
    return {
      available: Number(data.available || 0) + Number(diamonds),
      used: Number(data.used || 0),
      purchased: Number(data.purchased || 0) + Number(diamonds),
      lastUpdatedAt: Date.now()
    };
  });

  const snapshot = result.snapshot.val();

  // Log transaction
  await set(txRef, {
    transactionId: txId,
    uid: uid,
    type: "purchase_credit",
    amount: diamonds,
    balanceAfter: snapshot.available,
    referenceId: purchaseId,
    productId: productId,
    playTokenPreview: playToken ? playToken.substring(0, 12) + "..." : "native",
    reason: `Google Play purchase credit for ${diamonds} diamonds`,
    timestamp: serverTimestamp()
  });

  return snapshot.available;
}
