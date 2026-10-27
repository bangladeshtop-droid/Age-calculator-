// AgeBee Pro — Comprehensive Admin Portal Controller
import { 
  ref, onValue, get, set, update, push, remove, serverTimestamp, runTransaction 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { SUPER_ADMIN_UID } from "./firebase-config.js";

export class AdminController {
  constructor(db, currentUser, showToastCallback) {
    this.db = db;
    this.currentUser = currentUser;
    this.showToast = showToastCallback;
    this.isSuperAdmin = (currentUser && currentUser.uid === SUPER_ADMIN_UID);
  }

  /**
   * Verifies if current authenticated user has administrative authorization.
   */
  async checkAdminAuthorization() {
    if (!this.currentUser) return false;
    if (this.currentUser.uid === SUPER_ADMIN_UID) return true;

    try {
      const adminSnapshot = await get(ref(this.db, `admins/${this.currentUser.uid}`));
      return adminSnapshot.exists() && adminSnapshot.val()?.active === true;
    } catch (e) {
      console.error("Admin authorization check error:", e);
      return false;
    }
  }

  /**
   * Logs privileged action to immutable admin audit trail
   */
  async logAudit(action, details, targetUid = null) {
    try {
      const logRef = push(ref(this.db, "adminAuditLogs"));
      await set(logRef, {
        logId: logRef.key,
        adminUid: this.currentUser.uid,
        action: action,
        targetUid: targetUid || "N/A",
        details: details,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.warn("Could not write audit log:", err);
    }
  }

  /**
   * Initializes real-time listeners for dashboard and admin subpages
   */
  initAdminListeners() {
    // 1. Dashboard Metrics
    try {
      onValue(ref(this.db, "users"), (snap) => {
        const users = snap.val() || {};
        const userList = Object.values(users);
        const total = userList.length;
        const active = userList.filter(u => u.status !== "disabled").length;
        
        const elTotal = document.getElementById("metric-total-users");
        const elActive = document.getElementById("metric-active-users");
        if (elTotal) elTotal.innerText = total;
        if (elActive) elActive.innerText = active;
        
        this.renderUsersTable(users);
      }, (e) => console.warn("Admin users listener notice:", e.message));
    } catch (_) {}

    try {
      onValue(ref(this.db, "purchases"), (snap) => {
        const purchases = snap.val() || {};
        const list = Object.values(purchases);
        const elPurchases = document.getElementById("metric-total-purchases");
        if (elPurchases) elPurchases.innerText = list.length;
        
        let gross = 0;
        let totalDiamondsPurchased = 0;
        list.forEach(p => {
          if (p.verified !== false) {
            gross += Number(p.amount || 0);
            totalDiamondsPurchased += Number(p.diamonds || 0);
          }
        });

        const elDiamondsP = document.getElementById("metric-diamonds-purchased");
        if (elDiamondsP) elDiamondsP.innerText = totalDiamondsPurchased;

        const elGross = document.getElementById("rev-gross-amount");
        const elNet = document.getElementById("rev-net-amount");
        if (elGross) elGross.innerText = `$${gross.toFixed(2)}`;
        if (elNet) elNet.innerText = `$${(gross * 0.85).toFixed(2)}`;

        this.renderPurchasesTable(purchases);
      }, (e) => console.warn("Admin purchases listener notice:", e.message));
    } catch (_) {}

    try {
      onValue(ref(this.db, "calculationHistory"), (snap) => {
        const histories = snap.val() || {};
        let totalCalcs = 0;
        let totalDiamondsSpent = 0;
        const allCalcs = [];

        Object.entries(histories).forEach(([uid, userCalcs]) => {
          Object.entries(userCalcs).forEach(([calcId, data]) => {
            totalCalcs++;
            totalDiamondsSpent += Number(data.diamondsCharged || 0);
            allCalcs.push({ ...data, uid, calcId });
          });
        });

        const elCalcs = document.getElementById("metric-total-calcs");
        const elSpent = document.getElementById("metric-diamonds-spent");
        if (elCalcs) elCalcs.innerText = totalCalcs;
        if (elSpent) elSpent.innerText = totalDiamondsSpent;

        this.renderAllCalcsTable(allCalcs);
      }, (e) => console.warn("Admin calcs listener notice:", e.message));
    } catch (_) {}

    // 2. Diamond Packages Listener
    try {
      onValue(ref(this.db, "diamondPackages"), (snap) => {
        this.renderPackagesTable(snap.val() || {});
      }, (e) => console.warn("Admin packages listener notice:", e.message));
    } catch (_) {}

    // 3. Age Calculation Settings
    try {
      onValue(ref(this.db, "settings/ageCalculation"), (snap) => {
        const config = snap.val() || { cost: 5, enabled: true, confirmationRequired: true };
        const elCost = document.getElementById("setting-calc-cost");
        const elEnabled = document.getElementById("setting-calc-enabled");
        const elConfirm = document.getElementById("setting-calc-confirm");

        if (elCost) elCost.value = config.cost || 5;
        if (elEnabled) elEnabled.checked = config.enabled !== false;
        if (elConfirm) elConfirm.checked = config.confirmationRequired !== false;
      }, (e) => console.warn("Admin settings listener notice:", e.message));
    } catch (_) {}

    // 4. Admin UIDs Listener
    try {
      onValue(ref(this.db, "admins"), (snap) => {
        this.renderAdminUidsTable(snap.val() || {});
      }, (e) => console.warn("Admin UIDs listener notice:", e.message));
    } catch (_) {}

    // 5. Audit Logs Listener
    try {
      onValue(ref(this.db, "adminAuditLogs"), (snap) => {
        this.renderAuditLogsTable(snap.val() || {});
      }, (e) => console.warn("Admin audit listener notice:", e.message));
    } catch (_) {}

    // 6. Notifications Listener
    try {
      onValue(ref(this.db, "notifications"), (snap) => {
        this.renderNotificationsManageList(snap.val() || {});
      }, (e) => console.warn("Admin notifs listener notice:", e.message));
    } catch (_) {}

    // 7. Wallet Transactions
    try {
      onValue(ref(this.db, "walletTransactions"), (snap) => {
        const allTxs = [];
        const userTxGroups = snap.val() || {};
        Object.entries(userTxGroups).forEach(([uid, txs]) => {
          Object.values(txs).forEach(tx => allTxs.push({ ...tx, uid }));
        });
        allTxs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        this.renderWalletTransactionsTable(allTxs);
      }, (e) => console.warn("Admin wallet listener notice:", e.message));
    } catch (_) {}
  }

  renderUsersTable(usersObj) {
    const tbody = document.getElementById("admin-users-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const users = Object.values(usersObj);
    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No users found.</td></tr>`;
      return;
    }

    users.forEach(u => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div style="font-weight:700;">${u.displayName || "Anonymous"}</div>
          <div style="font-size:10px; color:var(--text-muted); font-family:monospace;">${u.uid}</div>
        </td>
        <td>
          <span style="color:var(--primary); font-weight:700;">${u.diamonds?.available || 0}</span>
        </td>
        <td>
          <span class="badge-tag ${u.status === 'disabled' ? 'inactive' : 'active'}">${u.status || 'active'}</span>
        </td>
        <td>
          <button class="admin-action-btn" data-uid="${u.uid}" data-action="adjust" style="background:rgba(56,189,248,0.15); color:var(--primary); border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;">
            Adjust
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("button[data-action='adjust']").forEach(btn => {
      btn.addEventListener("click", () => {
        const uid = btn.dataset.uid;
        const card = document.getElementById("admin-user-adjust-card");
        const targetText = document.getElementById("adjust-target-uid");
        if (card && targetText) {
          card.style.display = "block";
          targetText.innerText = uid;
          card.scrollIntoView({ behavior: "smooth" });
        }
      });
    });
  }

  renderPackagesTable(packagesObj) {
    const tbody = document.getElementById("admin-packages-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const entries = Object.entries(packagesObj);
    if (entries.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No packages configured.</td></tr>`;
      return;
    }

    entries.forEach(([pkgId, pkg]) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${pkg.name || pkgId}</strong></td>
        <td style="color:var(--primary); font-weight:700;">${pkg.diamonds || 0} 💎</td>
        <td style="font-family:monospace;">${pkg.productId || "-"}</td>
        <td><span class="badge-tag ${pkg.active ? 'active' : 'inactive'}">${pkg.active ? 'ACTIVE' : 'INACTIVE'}</span></td>
        <td>
          <button class="btn-toggle-pkg" data-id="${pkgId}" data-status="${pkg.active}" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:11px;">
            ${pkg.active ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".btn-toggle-pkg").forEach(b => {
      b.addEventListener("click", async () => {
        const id = b.dataset.id;
        const newStatus = b.dataset.status !== "true";
        await update(ref(this.db, `diamondPackages/${id}`), { active: newStatus });
        this.logAudit("TOGGLE_PACKAGE", `Package ${id} status set to ${newStatus}`);
        this.showToast(`Package ${newStatus ? 'activated' : 'deactivated'}.`, "success");
      });
    });
  }

  renderPurchasesTable(purchasesObj) {
    const tbody = document.getElementById("admin-purchases-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const list = Object.entries(purchasesObj);
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No purchases logged.</td></tr>`;
      return;
    }

    list.reverse().forEach(([pid, p]) => {
      const tr = document.createElement("tr");
      const d = p.timestamp ? new Date(p.timestamp).toLocaleDateString() : "-";
      tr.innerHTML = `
        <td style="font-family:monospace; font-size:10px;">${pid.substring(0, 10)}...</td>
        <td style="font-family:monospace; font-size:10px;">${(p.uid || "").substring(0, 8)}...</td>
        <td style="color:var(--primary); font-weight:700;">+${p.diamonds || 0}</td>
        <td><span class="badge-tag active">${p.state || "VERIFIED"}</span></td>
        <td>${d}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  renderWalletTransactionsTable(txs) {
    const tbody = document.getElementById("admin-wallet-transactions-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (txs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No transactions recorded.</td></tr>`;
      return;
    }

    txs.slice(0, 50).forEach(t => {
      const tr = document.createElement("tr");
      const d = t.timestamp ? new Date(t.timestamp).toLocaleTimeString() : "-";
      const isPositive = Number(t.amount || 0) > 0;
      tr.innerHTML = `
        <td style="font-size:10px; color:var(--text-muted);">${d}</td>
        <td style="font-family:monospace; font-size:10px;">${(t.uid || "").substring(0, 8)}...</td>
        <td>${t.type || "transaction"}</td>
        <td style="font-weight:700; color:${isPositive ? 'var(--success)' : 'var(--danger)'};">
          ${isPositive ? '+' : ''}${t.amount}
        </td>
        <td style="font-size:11px; color:var(--text-secondary);">${t.reason || "-"}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  renderAllCalcsTable(calcs) {
    const tbody = document.getElementById("admin-all-calcs-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (calcs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No calculation records found.</td></tr>`;
      return;
    }

    calcs.reverse().slice(0, 50).forEach(c => {
      const tr = document.createElement("tr");
      const d = c.timestamp ? new Date(c.timestamp).toLocaleDateString() : "-";
      const res = c.result ? `${c.result.years}y ${c.result.months}m ${c.result.days}d` : "-";
      tr.innerHTML = `
        <td style="font-family:monospace; font-size:10px;">${(c.uid || "").substring(0, 8)}...</td>
        <td>${c.dob || "-"}</td>
        <td><strong>${res}</strong></td>
        <td style="color:var(--primary); font-weight:700;">-${c.diamondsCharged || 0}</td>
        <td>${d}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  renderAdminUidsTable(adminsObj) {
    const tbody = document.getElementById("admin-uids-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    // First row: Permanent Super Admin
    const superRow = document.createElement("tr");
    superRow.innerHTML = `
      <td>
        <span style="font-family:monospace; color:var(--accent-gold); font-weight:700;">${SUPER_ADMIN_UID}</span>
        <span class="badge-tag super" style="margin-left:6px;">SUPER ADMIN</span>
      </td>
      <td>Permanent System Authority</td>
      <td>System Hardcoded</td>
      <td style="color:var(--text-muted); font-size:11px;">Protected (Permanent)</td>
    `;
    tbody.appendChild(superRow);

    // Additional Admins
    Object.entries(adminsObj).forEach(([uid, data]) => {
      if (uid === SUPER_ADMIN_UID) return;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-family:monospace; font-size:11px;">${uid}</td>
        <td>${data.notes || "Additional Admin"}</td>
        <td style="font-size:10px; color:var(--text-muted);">${(data.addedBy || "").substring(0, 8)}...</td>
        <td>
          ${this.isSuperAdmin ? `
            <button class="btn-remove-admin" data-uid="${uid}" style="background:rgba(239,68,68,0.15); color:var(--danger); border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;">
              Revoke
            </button>
          ` : `<span style="color:var(--text-muted); font-size:11px;">Super Admin Only</span>`}
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".btn-remove-admin").forEach(b => {
      b.addEventListener("click", async () => {
        const uid = b.dataset.uid;
        if (!confirm(`Are you sure you want to revoke administrative access for UID ${uid}?`)) return;
        await remove(ref(this.db, `admins/${uid}`));
        await this.logAudit("REVOKE_ADMIN", `Admin access revoked for UID ${uid}`, uid);
        this.showToast(`Admin privileges revoked for ${uid}`, "success");
      });
    });
  }

  renderNotificationsManageList(notifsObj) {
    const container = document.getElementById("admin-notifications-manage-list");
    if (!container) return;
    container.innerHTML = "";

    const entries = Object.entries(notifsObj);
    if (entries.length === 0) {
      container.innerHTML = `<div class="empty-state">No announcements created yet.</div>`;
      return;
    }

    entries.reverse().forEach(([nid, item]) => {
      const card = document.createElement("div");
      card.className = "history-item";
      card.innerHTML = `
        <div>
          <div style="font-weight:700; color:#fff;">${item.title || "Announcement"}</div>
          <div style="font-size:12px; color:var(--text-secondary);">${item.message || ""}</div>
          <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">
            ${item.timestamp ? new Date(item.timestamp).toLocaleString() : ""}
          </div>
        </div>
        <button class="btn-del-notif" data-id="${nid}" style="background:none; border:none; color:var(--danger); cursor:pointer;">
          Delete
        </button>
      `;
      container.appendChild(card);
    });

    container.querySelectorAll(".btn-del-notif").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        await remove(ref(this.db, `notifications/${id}`));
        this.logAudit("DELETE_NOTIFICATION", `Deleted notification ${id}`);
        this.showToast("Notification deleted.", "success");
      });
    });
  }

  renderAuditLogsTable(logsObj) {
    const tbody = document.getElementById("admin-audit-logs-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const list = Object.values(logsObj);
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No audit events recorded.</td></tr>`;
      return;
    }

    list.reverse().slice(0, 50).forEach(l => {
      const tr = document.createElement("tr");
      const d = l.timestamp ? new Date(l.timestamp).toLocaleString() : "-";
      tr.innerHTML = `
        <td style="font-size:10px; color:var(--text-muted);">${d}</td>
        <td style="font-family:monospace; font-size:10px;">${(l.adminUid || "").substring(0, 8)}...</td>
        <td><span class="badge-tag super">${l.action || "ACTION"}</span></td>
        <td style="font-size:11px; color:var(--text-secondary);">${l.details || "-"}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  /**
   * Executes manual wallet adjustment (credit or debit) with required reason and audit log
   */
  async adjustUserWallet(targetUid, type, amount, reason) {
    if (!targetUid || !amount || amount <= 0 || !reason.trim()) {
      throw new Error("Target UID, positive amount, and mandatory reason are required.");
    }

    const walletRef = ref(this.db, `wallets/${targetUid}`);
    const userRef = ref(this.db, `users/${targetUid}`);
    const txRef = push(ref(this.db, `walletTransactions/${targetUid}`));
    const delta = type === "credit" ? Number(amount) : -Number(amount);

    const result = await runTransaction(walletRef, (currentData) => {
      const data = currentData || { available: 0, used: 0, purchased: 0 };
      const newAvail = Number(data.available || 0) + delta;
      if (newAvail < 0) return; // Prevent negative balance
      return {
        available: newAvail,
        used: Number(data.used || 0),
        purchased: Number(data.purchased || 0) + (type === "credit" ? Number(amount) : 0),
        lastUpdatedAt: Date.now()
      };
    });

    if (!result.committed) {
      throw new Error("Adjustment failed or would result in negative diamond balance.");
    }

    const balanceAfter = result.snapshot.val().available;

    // Log transaction
    await set(txRef, {
      transactionId: txRef.key,
      uid: targetUid,
      type: `admin_${type}`,
      amount: delta,
      balanceAfter: balanceAfter,
      adjustedBy: this.currentUser.uid,
      reason: reason.trim(),
      timestamp: serverTimestamp()
    });

    // Update user record cache
    await update(userRef, {
      "diamonds/available": balanceAfter
    });

    // Audit log
    await this.logAudit("ADMIN_WALLET_ADJUSTMENT", `${type.toUpperCase()} ${amount} diamonds. Reason: ${reason.trim()}`, targetUid);

    return balanceAfter;
  }
}
