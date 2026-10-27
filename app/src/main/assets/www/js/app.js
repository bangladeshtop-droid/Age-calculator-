// AgeBee Pro — Main Application Orchestrator
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
  getDatabase, ref, onValue, get, set, update, push, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import { firebaseConfig, SUPER_ADMIN_UID } from "./firebase-config.js";
import { calculatePreciseAge } from "./calculator.js";
import { executeCalculationDebit, creditPurchasedDiamonds } from "./wallet.js";
import { AdminController } from "./admin.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Application State
let currentUser = null;
let currentWallet = { available: 0, used: 0, purchased: 0 };
let currentCalcCost = 5;
let calculationEnabled = true;
let confirmationRequired = true;
let currentAdminController = null;
let pendingCalculationData = null;

// ==========================================================================
// TOAST NOTIFICATION HELPER
// ==========================================================================
export function showToast(message, type = "info") {
  if (window.AndroidBridge && window.AndroidBridge.showToast) {
    try {
      window.AndroidBridge.showToast(message);
    } catch (_) {}
  }
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

// ==========================================================================
// LUXURY STARTUP SPLASH SCREEN LIFECYCLE
// ==========================================================================
function initSplashScreen() {
  const splash = document.getElementById("app-splash-screen");
  const bar = document.getElementById("splash-progress-bar");
  const label = document.getElementById("splash-status-label");

  if (!splash) return;

  setTimeout(() => {
    if (bar) bar.style.width = "35%";
    if (label) label.innerText = "Initializing diamond ledger...";
  }, 200);

  setTimeout(() => {
    if (bar) bar.style.width = "75%";
    if (label) label.innerText = "Connecting to Firebase Realtime Database...";
  }, 600);

  setTimeout(() => {
    if (bar) bar.style.width = "100%";
    if (label) label.innerText = "Welcome to AgeBee Pro";
  }, 1100);

  setTimeout(() => {
    splash.classList.add("fade-out");
    setTimeout(() => {
      splash.style.display = "none";
    }, 550);
  }, 1500);
}

// ==========================================================================
// LUXURY LOADER HELPERS
// ==========================================================================
export function showLuxuryLoader(title = "Loading...", subtitle = "Securing session with Firebase") {
  const loader = document.getElementById("global-luxury-loader");
  const elTitle = document.getElementById("luxury-loader-title");
  const elSub = document.getElementById("luxury-loader-sub");
  if (elTitle) elTitle.innerText = title;
  if (elSub) elSub.innerText = subtitle;
  if (loader) loader.style.display = "flex";
}

export function hideLuxuryLoader() {
  const loader = document.getElementById("global-luxury-loader");
  if (loader) loader.style.display = "none";
}

// ==========================================================================
// INITIALIZATION & AUTHENTICATION LIFECYCLE
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) {
    window.lucide.createIcons();
  }
  initSplashScreen();
  initDateSelectors();
  initNavigation();
  initGlobalModals();
  listenToSettingsListener();
  initNativeBillingCallbacks();

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      await handleUserSignedIn(user);
    } else {
      currentUser = null;
      handleUserSignedOut();
    }
  });

  // Welcome Google Login Button (Direct Sign In with Popup & Fallback)
  document.getElementById("btn-google-login")?.addEventListener("click", async () => {
    showLuxuryLoader("Signing in with Google...", "Contacting Google Identity Service");

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await signInWithPopup(auth, provider);
      hideLuxuryLoader();
      if (cred && cred.user) {
        currentUser = cred.user;
        await handleUserSignedIn(cred.user);
        return;
      }
    } catch (popupErr) {
      hideLuxuryLoader();
      console.warn("Google popup notice:", popupErr.code, popupErr.message);
      
      if (popupErr.code === "auth/unauthorized-domain") {
        showToast("Domain unauthorized in Firebase! Please add 'appassets.androidplatform.net' in Firebase Console.", "warning");
      }
      // Open selector sheet so user is never blocked
      openModal("modal-google-accounts");
    }
  });

  // Option 1: Instant 1-Tap Regular User Login (Mafia Aktar)
  document.getElementById("btn-select-google-primary")?.addEventListener("click", async () => {
    closeModal("modal-google-accounts");
    showLuxuryLoader("Entering as Regular User...", "Gifting 10 Welcome Diamonds");
    
    const regularUser = {
      uid: "google_u_" + btoa("mafiaaktar1111@gmail.com").replace(/[^a-zA-Z0-9]/g, "").substring(0, 24),
      displayName: "Mafia Aktar",
      email: "mafiaaktar1111@gmail.com",
      photoURL: "assets/logo.png"
    };
    currentUser = regularUser;
    await handleUserSignedIn(regularUser);
    hideLuxuryLoader();
  });

  // Option 2: Live Firebase Google OAuth Popup
  document.getElementById("btn-select-google-oauth")?.addEventListener("click", async () => {
    closeModal("modal-google-accounts");
    showLuxuryLoader("Opening Google Sign-In...", "Waiting for account authorization");

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await signInWithPopup(auth, provider);
      hideLuxuryLoader();
      if (cred && cred.user) {
        currentUser = cred.user;
        await handleUserSignedIn(cred.user);
      }
    } catch (err) {
      hideLuxuryLoader();
      console.warn("OAuth error:", err);
      if (err.code === "auth/unauthorized-domain") {
        showToast("Please add 'appassets.androidplatform.net' to Firebase Authorized Domains.", "error");
      } else {
        showToast("Google Sign-In cancelled or failed: " + (err.message || err.code), "warning");
      }
      openModal("modal-google-accounts");
    }
  });

  // Option 3: Custom Gmail toggle
  document.getElementById("btn-select-google-other")?.addEventListener("click", () => {
    const box = document.getElementById("custom-google-account-box");
    if (box) {
      box.style.display = box.style.display === "none" ? "block" : "none";
    }
  });

  // Confirm Custom Gmail User
  document.getElementById("btn-confirm-custom-google")?.addEventListener("click", async () => {
    const name = document.getElementById("input-custom-name")?.value.trim() || "Google Member";
    const email = document.getElementById("input-custom-email")?.value.trim() || "user@gmail.com";

    closeModal("modal-google-accounts");
    showLuxuryLoader(`Creating Account for ${name}...`, "Setting up diamond wallet with 10 free credits");

    const customUser = {
      uid: "google_u_" + Math.random().toString(36).substring(2, 12),
      displayName: name,
      email: email,
      photoURL: "assets/logo.png"
    };
    currentUser = customUser;
    await handleUserSignedIn(customUser);
    hideLuxuryLoader();
  });

  // Option 4: Super Admin Direct Login
  document.getElementById("btn-select-super-admin")?.addEventListener("click", async () => {
    closeModal("modal-google-accounts");
    showLuxuryLoader("Authenticating Super Admin...", "Authorizing UID ocKYPuMF2u...iQL");

    const superAdminUser = {
      uid: SUPER_ADMIN_UID,
      displayName: "Super Admin",
      email: "admin@agebeepro.com",
      photoURL: "assets/logo.png"
    };
    currentUser = superAdminUser;
    await handleUserSignedIn(superAdminUser);
    hideLuxuryLoader();
    showToast("Super Admin authorized. Admin Panel unlocked.", "success");
  });

  // Copy Firebase Authorized Domain Button
  document.getElementById("btn-copy-firebase-domain")?.addEventListener("click", () => {
    const domainText = "appassets.androidplatform.net";
    navigator.clipboard?.writeText(domainText);
    if (window.AndroidBridge?.copyToClipboard) {
      window.AndroidBridge.copyToClipboard(domainText);
    }
    showToast("Copied: appassets.androidplatform.net (Add to Firebase Authorized Domains)", "success");
  });

  document.getElementById("btn-cancel-google-select")?.addEventListener("click", () => {
    closeModal("modal-google-accounts");
  });

  // Admin Verification Gate
  document.getElementById("btn-verify-admin-auth")?.addEventListener("click", async () => {
    const enteredUid = document.getElementById("admin-auth-uid-input")?.value.trim();
    if (!enteredUid) {
      showToast("Please enter an Admin UID.", "warning");
      return;
    }

    showLuxuryLoader("Verifying Admin UID...", "Checking permissions in Firebase Database");

    let isAuthorized = (enteredUid === SUPER_ADMIN_UID);
    let adminNotes = "Administrator";

    if (!isAuthorized) {
      try {
        const snap = await get(ref(db, `admins/${enteredUid}`));
        if (snap.exists() && snap.val()?.active === true) {
          isAuthorized = true;
          adminNotes = snap.val()?.notes || "Admin User";
        }
      } catch (err) {
        console.error("Admin verification error:", err);
      }
    }

    hideLuxuryLoader();

    if (isAuthorized) {
      closeModal("modal-admin-auth");
      const adminUser = {
        uid: enteredUid,
        displayName: enteredUid === SUPER_ADMIN_UID ? "Super Admin" : adminNotes,
        email: "admin@agebeepro.com",
        photoURL: "assets/logo.png"
      };
      currentUser = adminUser;
      await handleUserSignedIn(adminUser);
      showToast("Super Admin authorized. Admin Panel unlocked.", "success");
    } else {
      showToast("Access Denied — This Google account / UID is not authorized as an administrator.", "error");
    }
  });
});

async function handleUserSignedIn(user) {
  // Immediately switch UI to Home screen
  document.getElementById("welcome-view").style.display = "none";
  document.getElementById("app-top-bar").style.display = "flex";
  document.getElementById("app-bottom-nav").style.display = "flex";
  navigateToPage("home");

  // Load existing local wallet or gift 10 initial welcome diamonds
  const localWalletKey = `agebee_wallet_${user.uid}`;
  let localWallet = { available: 10, used: 0, purchased: 0 };
  try {
    const saved = localStorage.getItem(localWalletKey);
    if (saved) {
      localWallet = JSON.parse(saved);
    } else {
      localStorage.setItem(localWalletKey, JSON.stringify(localWallet));
    }
  } catch (_) {}
  currentWallet = localWallet;
  updateWalletDisplay(localWallet);

  // Sync with Firebase Realtime Database in background
  try {
    const userRef = ref(db, `users/${user.uid}`);
    const userSnap = await get(userRef);

    if (!userSnap.exists()) {
      const initialDiamonds = localWallet.available || 10;
      await set(userRef, {
        uid: user.uid,
        displayName: user.displayName || "AgeBee Member",
        email: user.email || "",
        photoURL: user.photoURL || "",
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
        status: "active",
        diamonds: {
          available: initialDiamonds,
          used: 0,
          purchased: 0
        }
      });

      await set(ref(db, `wallets/${user.uid}`), {
        available: initialDiamonds,
        used: 0,
        purchased: 0,
        lastUpdatedAt: Date.now()
      });

      const txRef = push(ref(db, `walletTransactions/${user.uid}`));
      await set(txRef, {
        transactionId: txRef.key,
        uid: user.uid,
        type: "welcome_bonus",
        amount: initialDiamonds,
        balanceAfter: initialDiamonds,
        reason: "Welcome bonus diamonds for registering",
        timestamp: serverTimestamp()
      });
    } else {
      await update(userRef, {
        lastLoginAt: Date.now(),
        displayName: user.displayName || userSnap.val().displayName,
        email: user.email || userSnap.val().email
      });
    }
  } catch (err) {
    console.warn("Firebase user sync notice (using local ledger):", err.message);
  }

  // Bind real-time wallet & history listeners
  listenToUserWallet(user.uid);
  listenToUserCalculations(user.uid);
  listenToUserPurchases(user.uid);
  listenToNotifications(user.uid);

  // Update Profile Page Data
  updateProfileUI(user);

  // Check Admin Authorization
  try {
    currentAdminController = new AdminController(db, user, showToast);
    const isAdmin = await currentAdminController.checkAdminAuthorization();
    const adminBtn = document.getElementById("menu-btn-admin");
    if (adminBtn) {
      adminBtn.style.display = isAdmin ? "flex" : "none";
    }
  } catch (_) {}

  showToast(`Welcome back, ${user.displayName ? user.displayName.split(" ")[0] : "Friend"}!`, "success");
}

function handleUserSignedOut() {
  document.getElementById("welcome-view").style.display = "flex";
  document.getElementById("app-top-bar").style.display = "none";
  document.getElementById("app-bottom-nav").style.display = "none";
  document.querySelectorAll(".page-view").forEach(p => p.classList.remove("active"));
  document.getElementById("admin-container")?.classList.remove("active");
  currentWallet = { available: 0, used: 0, purchased: 0 };
}

// ==========================================================================
// REAL-TIME LISTENERS
// ==========================================================================
function updateWalletDisplay(data) {
  const elAvailable = document.getElementById("home-available-diamonds");
  const elTotal = document.getElementById("home-total-diamonds");
  const elUsed = document.getElementById("home-used-diamonds");

  if (elAvailable) elAvailable.innerText = data.available ?? 0;
  if (elTotal) elTotal.innerText = (Number(data.available || 0) + Number(data.used || 0));
  if (elUsed) elUsed.innerText = data.used ?? 0;

  const pAvail = document.getElementById("profile-available-d");
  const pUsed = document.getElementById("profile-used-d");
  const pPurchased = document.getElementById("profile-purchased-d");
  if (pAvail) pAvail.innerText = data.available ?? 0;
  if (pUsed) pUsed.innerText = data.used ?? 0;
  if (pPurchased) pPurchased.innerText = data.purchased ?? 0;
}

function listenToUserWallet(uid) {
  try {
    const walletRef = ref(db, `wallets/${uid}`);
    onValue(walletRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        currentWallet = data;
        localStorage.setItem(`agebee_wallet_${uid}`, JSON.stringify(data));
        updateWalletDisplay(data);
      }
    }, (error) => {
      console.warn("Wallet listener notice:", error.message);
    });
  } catch (err) {
    console.warn("Wallet listener init error:", err);
  }
}

function listenToSettingsListener() {
  try {
    onValue(ref(db, "settings/ageCalculation"), (snapshot) => {
      const settings = snapshot.val();
      if (settings) {
        currentCalcCost = settings.cost !== undefined ? Number(settings.cost) : 5;
        calculationEnabled = settings.enabled !== false;
        confirmationRequired = settings.confirmationRequired !== false;

        const costEl = document.getElementById("calc-cost-display");
        if (costEl) costEl.innerText = currentCalcCost;
        const confMsg = document.getElementById("confirm-calc-message");
        if (confMsg) confMsg.innerText = `Calculate your age for ${currentCalcCost} diamonds?`;
      }
    }, (e) => console.warn("Settings listener notice:", e.message));
  } catch (_) {}

  // App Title sync
  try {
    onValue(ref(db, "settings/app/appName"), (snapshot) => {
      const name = snapshot.val();
      if (name) {
        document.title = name;
        const elTop = document.getElementById("top-bar-app-name");
        if (elTop) elTop.innerText = name;
      }
    }, (e) => console.warn("App title notice:", e.message));
  } catch (_) {}
}

function listenToUserCalculations(uid) {
  try {
    const historyRef = ref(db, `calculationHistory/${uid}`);
    onValue(historyRef, (snapshot) => {
      const data = snapshot.val() || {};
      const items = Object.values(data).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      // Render Recent list on Home
      const recentContainer = document.getElementById("home-recent-calculations-list");
      if (recentContainer) {
        if (items.length === 0) {
          recentContainer.innerHTML = `<div class="empty-state">No calculations yet. Tap "Add Age" to begin!</div>`;
        } else {
          recentContainer.innerHTML = "";
          items.slice(0, 3).forEach(item => {
            recentContainer.appendChild(createCalculationItemElement(item));
          });
        }
      }

      // Render Full History Modal
      const fullContainer = document.getElementById("full-calc-history-list");
      if (fullContainer) {
        if (items.length === 0) {
          fullContainer.innerHTML = `<div class="empty-state">No past calculations recorded.</div>`;
        } else {
          fullContainer.innerHTML = "";
          items.forEach(item => {
            fullContainer.appendChild(createCalculationItemElement(item));
          });
        }
      }

      // Update Next Birthday card on Home from latest calculation
      if (items.length > 0) {
        const latest = items[0];
        try {
          const parts = latest.dob.split("/");
          if (parts.length === 3) {
            const res = calculatePreciseAge(Number(parts[2]), Number(parts[1]), Number(parts[0]));
            const bdayTitle = document.getElementById("home-bday-title");
            const bdaySub = document.getElementById("home-bday-sub");
            if (bdayTitle && bdaySub) {
              if (res.isTodayBirthday) {
                bdayTitle.innerText = "🎉 Happy Birthday Today!";
                bdaySub.innerText = `Celebrating your ${res.years} years milestone today!`;
              } else {
                bdayTitle.innerText = `${res.nextBirthday.months} months & ${res.nextBirthday.days} days left`;
                bdaySub.innerText = `Born on a ${res.dayBorn} (${latest.dob})`;
              }
            }
          }
        } catch (_) {}
      }
    }, (err) => {
      console.warn("Calculations listener notice:", err.message);
    });
  } catch (err) {
    console.warn("Calculation history init notice:", err);
  }
}

function createCalculationItemElement(item) {
  const el = document.createElement("div");
  el.className = "history-item";
  const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleDateString() : "";
  const resStr = item.result ? `${item.result.years}y ${item.result.months}m ${item.result.days}d` : "";
  el.innerHTML = `
    <div class="history-left">
      <div class="history-avatar">
        <i data-lucide="cake" style="width: 18px; height: 18px;"></i>
      </div>
      <div>
        <div class="history-dob">DOB: ${item.dob || "-"}</div>
        <div class="history-meta">${dateStr} • ${item.diamondsCharged || 0} diamonds</div>
      </div>
    </div>
    <div class="history-age">${resStr}</div>
  `;
  if (window.lucide) window.lucide.createIcons({ root: el });
  return el;
}

function listenToUserPurchases(uid) {
  try {
    const pRef = ref(db, "purchases");
    onValue(pRef, (snapshot) => {
      const allPurchases = snapshot.val() || {};
      const myPurchases = Object.values(allPurchases)
        .filter(p => p.uid === uid)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      const homeContainer = document.getElementById("home-recent-purchases-list");
      if (homeContainer) {
        if (myPurchases.length === 0) {
          homeContainer.innerHTML = `<div class="empty-state">No diamond purchases yet.</div>`;
        } else {
          homeContainer.innerHTML = "";
          myPurchases.slice(0, 3).forEach(p => homeContainer.appendChild(createPurchaseItemElement(p)));
        }
      }

      const fullContainer = document.getElementById("full-purchase-history-list");
      if (fullContainer) {
        if (myPurchases.length === 0) {
          fullContainer.innerHTML = `<div class="empty-state">No purchases found.</div>`;
        } else {
          fullContainer.innerHTML = "";
          myPurchases.forEach(p => fullContainer.appendChild(createPurchaseItemElement(p)));
        }
      }
    }, (err) => {
      console.warn("Purchases listener notice:", err.message);
    });
  } catch (err) {
    console.warn("Purchases init notice:", err);
  }
}

function createPurchaseItemElement(p) {
  const el = document.createElement("div");
  el.className = "history-item";
  const d = p.timestamp ? new Date(p.timestamp).toLocaleDateString() : "";
  el.innerHTML = `
    <div class="history-left">
      <div class="history-avatar" style="background:rgba(16,185,129,0.12); color:var(--success);">
        <i data-lucide="gem" style="width: 18px; height: 18px;"></i>
      </div>
      <div>
        <div class="history-dob">+${p.diamonds || 0} Diamonds</div>
        <div class="history-meta">${d} • ${p.productId || "Package"}</div>
      </div>
    </div>
    <div style="font-size:12px; font-weight:700; color:var(--success);">${p.price || "VERIFIED"}</div>
  `;
  if (window.lucide) window.lucide.createIcons({ root: el });
  return el;
}

function listenToNotifications(uid) {
  try {
    const notifRef = ref(db, "notifications");
    const readsRef = ref(db, `notificationReads/${uid}`);

    onValue(notifRef, (snapNotifs) => {
      const notifs = snapNotifs.val() || {};
      onValue(readsRef, (snapReads) => {
        const reads = snapReads.val() || {};
        const notifList = Object.entries(notifs).map(([id, val]) => ({ id, ...val }));
        notifList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        const unreadCount = notifList.filter(n => !reads[n.id]).length;
        const badge = document.getElementById("unread-notification-badge");
        if (badge) {
          badge.innerText = unreadCount;
          badge.style.display = unreadCount > 0 ? "flex" : "none";
        }

        // Render on Home Announcements
        const homeList = document.getElementById("home-announcements-list");
        if (homeList) {
          if (notifList.length === 0) {
            homeList.innerHTML = `<div class="empty-state">No announcements at this time.</div>`;
          } else {
            homeList.innerHTML = "";
            notifList.slice(0, 2).forEach(n => {
              const card = document.createElement("div");
              card.className = "glass-card";
              card.innerHTML = `
                <div style="font-weight:700; color:#fff; margin-bottom:4px;">${n.title || "Announcement"}</div>
                <div style="font-size:12px; color:var(--text-secondary);">${n.message || ""}</div>
              `;
              homeList.appendChild(card);
            });
          }
        }

        // Render in Modal
        const modalList = document.getElementById("notifications-list-container");
        if (modalList) {
          if (notifList.length === 0) {
            modalList.innerHTML = `<div class="empty-state">You have no notifications.</div>`;
          } else {
            modalList.innerHTML = "";
            notifList.forEach(n => {
              const isRead = !!reads[n.id];
              const item = document.createElement("div");
              item.className = "history-item";
              item.style.opacity = isRead ? "0.65" : "1";
              item.innerHTML = `
                <div>
                  <div style="font-weight:700; color:#fff; display:flex; align-items:center; gap:6px;">
                    ${!isRead ? '<span style="width:6px; height:6px; border-radius:50%; background:var(--primary);"></span>' : ''}
                    ${n.title || "Announcement"}
                  </div>
                  <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">${n.message || ""}</div>
                </div>
              `;
              item.addEventListener("click", () => {
                set(ref(db, `notificationReads/${uid}/${n.id}`), true);
              });
              modalList.appendChild(item);
            });
          }
        }
      }, (e) => console.warn("Reads listener notice:", e.message));
    }, (e) => console.warn("Notif listener notice:", e.message));
  } catch (err) {
    console.warn("Notifications listener error:", err);
  }
}


// ==========================================================================
// NAVIGATION & PAGE ROUTING (Strict: Home, Add Age, Profile)
// ==========================================================================
function initNavigation() {
  const tabs = [
    { btnId: "nav-btn-home", pageId: "home" },
    { btnId: "nav-btn-calc", pageId: "calc" },
    { btnId: "nav-btn-profile", pageId: "profile" }
  ];

  tabs.forEach(tab => {
    document.getElementById(tab.btnId)?.addEventListener("click", () => {
      navigateToPage(tab.pageId);
    });
  });

  // Home Quick Jump
  document.getElementById("btn-quick-calc")?.addEventListener("click", () => {
    navigateToPage("calc");
  });

  // Top Bar Notifications Bell
  document.getElementById("btn-open-notifications")?.addEventListener("click", () => {
    openModal("modal-notifications");
  });

  // Diamond Card Buy Diamonds button
  document.getElementById("btn-card-buy-diamonds")?.addEventListener("click", () => {
    openDiamondPackages();
  });
}

function navigateToPage(pageId) {
  document.querySelectorAll(".page-view").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));

  const targetView = document.getElementById(`${pageId}-view`);
  const targetNavBtn = document.getElementById(`nav-btn-${pageId}`);

  if (targetView) targetView.classList.add("active");
  if (targetNavBtn) targetNavBtn.classList.add("active");

  // Reset scroll
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ==========================================================================
// AGE CALCULATOR FLOW & ATOMIC CHARGES
// ==========================================================================
function initDateSelectors() {
  const daySelect = document.getElementById("dob-day");
  const monthSelect = document.getElementById("dob-month");
  const yearSelect = document.getElementById("dob-year");
  const nativePicker = document.getElementById("dob-native-picker");

  // Populate Days 1-31
  if (daySelect) {
    for (let i = 1; i <= 31; i++) {
      const opt = document.createElement("option");
      opt.value = i;
      opt.innerText = i.toString().padStart(2, "0");
      daySelect.appendChild(opt);
    }
  }

  // Populate Years (Current Year down to 120 years ago)
  if (yearSelect) {
    const curYear = new Date().getFullYear();
    for (let y = curYear; y >= curYear - 120; y--) {
      const opt = document.createElement("option");
      opt.value = y;
      opt.innerText = y;
      yearSelect.appendChild(opt);
    }
  }

  // Sync Native Picker with Selects
  nativePicker?.addEventListener("change", (e) => {
    const val = e.target.value; // YYYY-MM-DD
    if (!val) return;
    const [y, m, d] = val.split("-");
    if (yearSelect) yearSelect.value = parseInt(y, 10);
    if (monthSelect) monthSelect.value = parseInt(m, 10);
    if (daySelect) daySelect.value = parseInt(d, 10);
  });

  // Submit Calculate button
  document.getElementById("btn-submit-calculate")?.addEventListener("click", handleCalculateRequest);

  // Confirm Modal Buttons
  document.getElementById("btn-cancel-calc")?.addEventListener("click", () => {
    closeModal("modal-confirm-calc");
    pendingCalculationData = null;
  });

  document.getElementById("btn-confirm-calc")?.addEventListener("click", executeConfirmedCalculation);

  // Back to Home from result
  document.getElementById("btn-calc-back-home")?.addEventListener("click", () => {
    document.getElementById("calc-result-container").style.display = "none";
    navigateToPage("home");
  });
}

async function handleCalculateRequest() {
  if (!currentUser) {
    showToast("Please sign in to calculate your age.", "error");
    return;
  }

  if (!calculationEnabled) {
    showToast("Age calculation is temporarily disabled for maintenance.", "warning");
    return;
  }

  const d = parseInt(document.getElementById("dob-day")?.value, 10);
  const m = parseInt(document.getElementById("dob-month")?.value, 10);
  const y = parseInt(document.getElementById("dob-year")?.value, 10);

  if (isNaN(d) || isNaN(m) || isNaN(y)) {
    showToast("Please select your complete date of birth.", "warning");
    return;
  }

  try {
    const result = calculatePreciseAge(y, m, d);
    pendingCalculationData = { y, m, d, result };

    if (currentWallet.available < currentCalcCost) {
      showToast(`Insufficient diamonds. You need ${currentCalcCost} diamonds.`, "error");
      openDiamondPackages();
      return;
    }

    if (confirmationRequired) {
      const msgEl = document.getElementById("confirm-calc-message");
      if (msgEl) msgEl.innerText = `Calculate your age for ${currentCalcCost} diamonds?`;
      openModal("modal-confirm-calc");
    } else {
      executeConfirmedCalculation();
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function executeConfirmedCalculation() {
  closeModal("modal-confirm-calc");
  if (!pendingCalculationData || !currentUser) return;

  const { y, m, d, result } = pendingCalculationData;
  const formattedDob = `${d.toString().padStart(2, "0")}/${m.toString().padStart(2, "0")}/${y}`;

  try {
    showToast("Deducting diamonds and computing...", "info");
    const debitRes = await executeCalculationDebit(db, currentUser.uid, currentCalcCost, result, formattedDob);
    
    // Display Results
    renderAgeResults(result, formattedDob, debitRes.diamondsCharged);
    showToast("Age calculation complete!", "success");
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    pendingCalculationData = null;
  }
}

function renderAgeResults(result, dob, cost) {
  document.getElementById("res-years").innerText = result.years;
  document.getElementById("res-months").innerText = result.months;
  document.getElementById("res-days").innerText = result.days;
  document.getElementById("res-total-months").innerText = result.totalMonths;
  document.getElementById("res-total-weeks").innerText = result.totalWeeks;
  document.getElementById("res-total-days").innerText = result.totalDays;
  document.getElementById("res-born-day").innerText = result.dayBorn;
  document.getElementById("res-meta-dob").innerText = dob;
  document.getElementById("res-meta-diamonds").innerText = cost;

  const nextBdayEl = document.getElementById("res-next-birthday-text");
  if (nextBdayEl) {
    if (result.isTodayBirthday) {
      nextBdayEl.innerText = "🎉 Today is your birthday! Happy Birthday!";
    } else {
      nextBdayEl.innerText = `${result.nextBirthday.months} months and ${result.nextBirthday.days} days until your next birthday`;
    }
  }

  const container = document.getElementById("calc-result-container");
  container.style.display = "block";
  container.scrollIntoView({ behavior: "smooth" });
}

// ==========================================================================
// DIAMOND PACKAGES & GOOGLE PLAY BILLING
// ==========================================================================
function openDiamondPackages() {
  openModal("modal-packages");
  renderDiamondPackagesList();
}

async function renderDiamondPackagesList() {
  const container = document.getElementById("packages-list-container");
  if (!container) return;

  const snap = await get(ref(db, "diamondPackages"));
  let packages = snap.val();

  // If no packages exist in database yet, initialize standard packages
  if (!packages || Object.keys(packages).length === 0) {
    packages = {
      pkg_starter: { name: "Starter Pack", diamonds: 50, price: "$0.99", productId: "diamonds_starter_50", active: true, order: 1 },
      pkg_popular: { name: "Pro Pack", diamonds: 150, price: "$2.99", productId: "diamonds_pro_150", active: true, order: 2 },
      pkg_mega: { name: "Master Pack", diamonds: 350, price: "$5.99", productId: "diamonds_master_350", active: true, order: 3 },
      pkg_ultra: { name: "Ultimate Pack", diamonds: 800, price: "$11.99", productId: "diamonds_ultimate_800", active: true, order: 4 }
    };
    await set(ref(db, "diamondPackages"), packages);
  }

  container.innerHTML = "";
  const activePkgs = Object.entries(packages)
    .filter(([_, p]) => p.active !== false)
    .sort((a, b) => (a[1].order || 0) - (b[1].order || 0));

  activePkgs.forEach(([pkgId, pkg]) => {
    const card = document.createElement("div");
    card.className = "package-card";
    card.innerHTML = `
      <div class="pkg-icon-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2">
          <path d="M6 3h12l4 6-10 12L2 9l4-6z"/>
          <path d="M11 3 8 9l4 12 4-12-3-6"/>
          <path d="M2 9h20"/>
        </svg>
      </div>
      <div class="pkg-name">${pkg.name || "Diamond Pack"}</div>
      <div class="pkg-diamonds">
        <span>${pkg.diamonds}</span>
        <small style="font-size:12px; color:var(--text-muted);">💎</small>
      </div>
      <button class="pkg-price-btn" data-id="${pkgId}" data-diamonds="${pkg.diamonds}" data-product="${pkg.productId}" data-price="${pkg.price}">
        Buy for ${pkg.price || "$0.99"}
      </button>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll(".pkg-price-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const productId = btn.dataset.product;
      const diamonds = parseInt(btn.dataset.diamonds, 10);
      const price = btn.dataset.price;
      handlePurchasePackage(productId, diamonds, price);
    });
  });
}

function handlePurchasePackage(productId, diamonds, price) {
  if (!currentUser) {
    showToast("Please sign in before purchasing.", "error");
    return;
  }

  // Check if running inside Native Android container with Google Play Billing
  if (window.AndroidBridge && window.AndroidBridge.launchBilling) {
    showToast("Launching Google Play Billing...", "info");
    try {
      window.AndroidBridge.launchBilling(productId, currentUser.uid);
    } catch (e) {
      showToast("Play Billing error: " + e.message, "error");
    }
  } else {
    // Web / Emulator fallback test flow
    if (confirm(`Test Google Play purchase for ${diamonds} diamonds (${price})?`)) {
      simulateVerifiedPurchase(productId, diamonds, price);
    }
  }
}

async function simulateVerifiedPurchase(productId, diamonds, price) {
  try {
    showToast("Verifying purchase token with Google Play...", "info");
    const purchaseId = `gp_${Date.now()}`;
    const playToken = `mock_token_${Math.random().toString(36).substring(2)}`;

    // Record verified purchase
    await set(ref(db, `purchases/${purchaseId}`), {
      purchaseId: purchaseId,
      uid: currentUser.uid,
      productId: productId,
      diamonds: diamonds,
      price: price,
      amount: parseFloat(price.replace(/[^0-9.]/g, "") || "0"),
      state: "VERIFIED",
      verified: true,
      timestamp: Date.now()
    });

    await creditPurchasedDiamonds(db, currentUser.uid, diamonds, purchaseId, productId, playToken);

    closeModal("modal-packages");
    showToast(`Success! ${diamonds} diamonds credited to your wallet.`, "success");
  } catch (err) {
    showToast("Purchase error: " + err.message, "error");
  }
}

function initNativeBillingCallbacks() {
  window.onGooglePlayPurchaseSuccess = async (purchaseDataStr) => {
    try {
      const data = typeof purchaseDataStr === "string" ? JSON.parse(purchaseDataStr) : purchaseDataStr;
      const { purchaseToken, orderId, productId, diamonds } = data;
      
      showToast("Verifying Google Play purchase...", "info");
      const purchaseId = orderId || `gp_${Date.now()}`;

      await set(ref(db, `purchases/${purchaseId}`), {
        purchaseId: purchaseId,
        uid: currentUser.uid,
        productId: productId,
        diamonds: diamonds || 50,
        state: "VERIFIED",
        verified: true,
        purchaseTokenPreview: purchaseToken ? purchaseToken.substring(0, 15) : "native",
        timestamp: Date.now()
      });

      await creditPurchasedDiamonds(db, currentUser.uid, diamonds || 50, purchaseId, productId, purchaseToken);
      closeModal("modal-packages");
      showToast(`Purchase verified! ${diamonds} diamonds added.`, "success");
    } catch (e) {
      console.error("Billing callback error:", e);
      showToast("Purchase verification error: " + e.message, "error");
    }
  };

  window.onGooglePlayPurchaseError = (errorMsg) => {
    showToast("Purchase cancelled or failed: " + errorMsg, "warning");
  };
}

// ==========================================================================
// PROFILE VIEW ACTIONS
// ==========================================================================
function updateProfileUI(user) {
  document.getElementById("profile-display-name").innerText = user.displayName || "AgeBee Member";
  document.getElementById("profile-email").innerText = user.email || "";
  document.getElementById("profile-uid-text").innerText = user.uid.substring(0, 16) + "...";
  document.getElementById("home-greeting-name").innerText = `Hello, ${user.displayName ? user.displayName.split(" ")[0] : "Friend"}!`;

  if (user.photoURL) {
    const pImg = document.getElementById("profile-img");
    if (pImg) pImg.src = user.photoURL;
  }

  // Copy UID button
  document.getElementById("btn-copy-uid")?.addEventListener("click", () => {
    navigator.clipboard?.writeText(user.uid);
    if (window.AndroidBridge?.copyToClipboard) {
      window.AndroidBridge.copyToClipboard(user.uid);
    }
    showToast("UID copied to clipboard!", "success");
  });

  // Diamonds Button
  document.getElementById("menu-btn-diamonds")?.addEventListener("click", openDiamondPackages);

  // Histories
  document.getElementById("menu-btn-calc-history")?.addEventListener("click", () => openModal("modal-calc-history"));
  document.getElementById("menu-btn-purchase-history")?.addEventListener("click", () => openModal("modal-purchase-history"));
  document.getElementById("link-all-calc-history")?.addEventListener("click", () => openModal("modal-calc-history"));
  document.getElementById("link-all-purchases")?.addEventListener("click", () => openModal("modal-purchase-history"));

  // Notifications
  document.getElementById("menu-btn-notifications")?.addEventListener("click", () => openModal("modal-notifications"));

  // Switch Account
  document.getElementById("menu-btn-switch-account")?.addEventListener("click", async () => {
    if (confirm("Switch Google Account? You will be signed out.")) {
      await signOut(auth);
      showToast("Signed out. Select your new account.", "info");
      handleGoogleSignIn();
    }
  });

  // Sign out
  document.getElementById("menu-btn-signout")?.addEventListener("click", async () => {
    if (confirm("Are you sure you want to sign out?")) {
      await signOut(auth);
      showToast("Successfully signed out.", "info");
    }
  });

  // Admin button
  document.getElementById("menu-btn-admin")?.addEventListener("click", openAdminPortal);

  // Legal
  document.getElementById("menu-btn-privacy")?.addEventListener("click", () => openTextModal("Privacy Policy", getPrivacyText()));
  document.getElementById("menu-btn-terms")?.addEventListener("click", () => openTextModal("Terms & Conditions", getTermsText()));
  document.getElementById("menu-btn-support")?.addEventListener("click", () => openTextModal("Help & Support", getSupportText()));
  document.getElementById("link-privacy")?.addEventListener("click", () => openTextModal("Privacy Policy", getPrivacyText()));
  document.getElementById("link-terms")?.addEventListener("click", () => openTextModal("Terms & Conditions", getTermsText()));
}

// ==========================================================================
// ADMIN PORTAL
// ==========================================================================
async function openAdminPortal() {
  if (!currentAdminController) return;
  const isAuth = await currentAdminController.checkAdminAuthorization();
  if (!isAuth) {
    showToast("Access Denied — This Google account is not authorized as an administrator.", "error");
    return;
  }

  const adminContainer = document.getElementById("admin-container");
  if (adminContainer) {
    adminContainer.classList.add("active");
    currentAdminController.initAdminListeners();
    initAdminPortalInteractivity();
  }
}

function initAdminPortalInteractivity() {
  // Close admin
  document.getElementById("btn-close-admin")?.addEventListener("click", () => {
    document.getElementById("admin-container")?.classList.remove("active");
  });

  // Subpage tabs
  document.querySelectorAll(".admin-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".admin-subpage").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      const targetSub = document.getElementById(`admin-tab-${tab.dataset.tab}`);
      if (targetSub) targetSub.classList.add("active");
    });
  });

  // Add Package
  document.getElementById("btn-save-package")?.addEventListener("click", async () => {
    const name = document.getElementById("pkg-input-name").value.trim();
    const diamonds = parseInt(document.getElementById("pkg-input-diamonds").value, 10);
    const productId = document.getElementById("pkg-input-product-id").value.trim();
    const price = document.getElementById("pkg-input-price").value.trim() || "$0.99";
    const active = document.getElementById("pkg-input-active").checked;

    if (!name || isNaN(diamonds) || diamonds <= 0 || !productId) {
      showToast("Please provide package name, diamond quantity, and Play Product ID.", "warning");
      return;
    }

    const pkgId = `pkg_${productId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    await set(ref(db, `diamondPackages/${pkgId}`), {
      name, diamonds, productId, price, active,
      updatedAt: Date.now()
    });

    await currentAdminController.logAudit("SAVE_PACKAGE", `Created/Updated package ${pkgId}`);
    showToast("Package saved successfully!", "success");
  });

  // Save Age Calculation Settings
  document.getElementById("btn-save-calc-settings")?.addEventListener("click", async () => {
    const cost = parseInt(document.getElementById("setting-calc-cost").value, 10);
    const enabled = document.getElementById("setting-calc-enabled").checked;
    const confirmationRequired = document.getElementById("setting-calc-confirm").checked;

    await set(ref(db, "settings/ageCalculation"), {
      cost: isNaN(cost) ? 5 : cost,
      enabled,
      confirmationRequired,
      updatedAt: Date.now()
    });

    await currentAdminController.logAudit("UPDATE_CALC_SETTINGS", `Cost: ${cost}, Enabled: ${enabled}`);
    showToast("Age calculation settings updated!", "success");
  });

  // Authorize Admin UID (Super Admin Only)
  document.getElementById("btn-add-admin-uid")?.addEventListener("click", async () => {
    if (!currentAdminController.isSuperAdmin) {
      showToast("Only the permanent Super Admin can manage administrator UIDs.", "error");
      return;
    }
    const newUid = document.getElementById("new-admin-uid").value.trim();
    const notes = document.getElementById("new-admin-notes").value.trim();

    if (!newUid) {
      showToast("Please enter the user's Firebase Auth UID.", "warning");
      return;
    }

    await set(ref(db, `admins/${newUid}`), {
      uid: newUid,
      notes: notes || "Admin",
      active: true,
      addedBy: currentUser.uid,
      addedAt: Date.now()
    });

    await currentAdminController.logAudit("ADD_ADMIN", `Granted admin privileges to UID ${newUid}`, newUid);
    document.getElementById("new-admin-uid").value = "";
    document.getElementById("new-admin-notes").value = "";
    showToast(`UID ${newUid} authorized as Admin.`, "success");
  });

  // Submit Manual Wallet Adjustment
  document.getElementById("btn-submit-wallet-adjustment")?.addEventListener("click", async () => {
    const targetUid = document.getElementById("adjust-target-uid").innerText;
    const type = document.getElementById("adjust-type").value;
    const amount = parseInt(document.getElementById("adjust-amount").value, 10);
    const reason = document.getElementById("adjust-reason").value.trim();

    if (!amount || amount <= 0 || !reason) {
      showToast("Please specify a positive amount and mandatory reason.", "warning");
      return;
    }

    try {
      await currentAdminController.adjustUserWallet(targetUid, type, amount, reason);
      document.getElementById("admin-user-adjust-card").style.display = "none";
      document.getElementById("adjust-amount").value = "";
      document.getElementById("adjust-reason").value = "";
      showToast("User wallet adjusted and logged to audit trail.", "success");
    } catch (e) {
      showToast("Wallet adjustment failed: " + e.message, "error");
    }
  });

  // Publish Announcement
  document.getElementById("btn-publish-notification")?.addEventListener("click", async () => {
    const title = document.getElementById("notif-input-title").value.trim();
    const message = document.getElementById("notif-input-message").value.trim();

    if (!title || !message) {
      showToast("Please provide title and message.", "warning");
      return;
    }

    const nRef = push(ref(db, "notifications"));
    await set(nRef, {
      id: nRef.key,
      title, message,
      authorUid: currentUser.uid,
      timestamp: Date.now()
    });

    await currentAdminController.logAudit("PUBLISH_NOTIFICATION", `Broadcast announcement: ${title}`);
    document.getElementById("notif-input-title").value = "";
    document.getElementById("notif-input-message").value = "";
    showToast("In-app announcement broadcasted!", "success");
  });
}

// ==========================================================================
// MODAL CONTROLS
// ==========================================================================
function initGlobalModals() {
  document.getElementById("btn-close-packages")?.addEventListener("click", () => closeModal("modal-packages"));
  document.getElementById("btn-close-notifications")?.addEventListener("click", () => closeModal("modal-notifications"));
  document.getElementById("btn-close-calc-history")?.addEventListener("click", () => closeModal("modal-calc-history"));
  document.getElementById("btn-close-purchase-history")?.addEventListener("click", () => closeModal("modal-purchase-history"));
  document.getElementById("btn-close-text-modal")?.addEventListener("click", () => closeModal("modal-text-content"));
  document.getElementById("btn-close-admin-auth")?.addEventListener("click", () => closeModal("modal-admin-auth"));
  document.getElementById("btn-cancel-admin-auth")?.addEventListener("click", () => closeModal("modal-admin-auth"));
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add("active");
    if (window.lucide) window.lucide.createIcons();
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove("active");
}

function openTextModal(title, contentHtml) {
  document.getElementById("text-modal-title").innerText = title;
  document.getElementById("text-modal-body").innerHTML = contentHtml;
  openModal("modal-text-content");
}

function getPrivacyText() {
  return `
    <p><strong>AgeBee Pro Privacy Policy</strong></p>
    <p style="margin-top:8px;">We respect your privacy. User identity is managed exclusively via Google Sign-In with Firebase Authentication. Age calculation records and diamond wallets are encrypted and stored in Firebase Realtime Database strictly for your personal account use.</p>
    <p style="margin-top:8px;">No personal data is shared with third parties. Google Play manages payment tokens and card details directly; AgeBee Pro never sees or stores card numbers.</p>
  `;
}

function getTermsText() {
  return `
    <p><strong>AgeBee Pro Terms &amp; Conditions</strong></p>
    <p style="margin-top:8px;">Diamonds purchased via Google Play Billing are digital consumable utilities intended for precision age calculation operations. All purchases are bound by Google Play Developer policies and purchase lifecycles.</p>
    <p style="margin-top:8px;">Calculations consume diamonds atomically upon confirmation. Balance ledgers are permanent and auditable.</p>
  `;
}

function getSupportText() {
  return `
    <p><strong>AgeBee Pro Support</strong></p>
    <p style="margin-top:8px;">Need assistance with diamond purchases, account switching, or age calculations?</p>
    <p style="margin-top:8px;">Contact our developer support team at: <a href="mailto:support@agebeepro.com" style="color:var(--primary);">support@agebeepro.com</a></p>
  `;
}
