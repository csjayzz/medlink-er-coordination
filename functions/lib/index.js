"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupExpiredAlerts = exports.setUserRole = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
admin.initializeApp();
const firestore = admin.firestore();
/**
 * Feature 5: Set custom role claim on a user.
 * Called after user creation to assign 'medic' or 'hospital' role.
 * Only admins should call this — in production, add admin-check logic.
 */
exports.setUserRole = (0, https_1.onCall)(async (request) => {
    const { uid, role } = request.data;
    if (!uid || !role) {
        throw new https_1.HttpsError('invalid-argument', 'uid and role are required');
    }
    if (!['medic', 'hospital'].includes(role)) {
        throw new https_1.HttpsError('invalid-argument', 'role must be "medic" or "hospital"');
    }
    // TODO: Add admin verification before production
    // e.g. check request.auth?.token?.admin === true
    await admin.auth().setCustomUserClaims(uid, { role });
    return { success: true, uid, role };
});
/**
 * Feature 9: TTL Cloud Function — delete alerts older than 24 hours.
 * Runs every hour. Deletes medlinkAlerts docs where transmittedAt is > 24h ago.
 */
exports.cleanupExpiredAlerts = (0, scheduler_1.onSchedule)('every 60 minutes', async () => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
    const snapshot = await firestore
        .collection('medlinkAlerts')
        .where('transmittedAt', '<', cutoff)
        .get();
    if (snapshot.empty) {
        console.log('No expired alerts to clean up.');
        return;
    }
    const batch = firestore.batch();
    let count = 0;
    for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
        count++;
        // Firestore batch limit is 500
        if (count % 500 === 0) {
            await batch.commit();
        }
    }
    if (count % 500 !== 0) {
        await batch.commit();
    }
    console.log(`Deleted ${count} expired alert(s).`);
});
//# sourceMappingURL=index.js.map