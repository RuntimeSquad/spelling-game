import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  browserLocalPersistence,
  setPersistence,
  signInAnonymously,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  EmailAuthProvider,
  linkWithCredential,
  signInWithEmailLink,
  signOut,
} from "firebase/auth";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";

export const isLocalPreview = import.meta.env.MODE !== "production-release";
const config = isLocalPreview
  ? {
      projectId: "demo-spell-bee",
      apiKey: "demo-only-not-a-production-key",
      authDomain: "demo-spell-bee.firebaseapp.com",
      storageBucket: "demo-spell-bee.appspot.com",
    }
  : JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG || "{}");
if (isLocalPreview && !["127.0.0.1", "localhost"].includes(location.hostname))
  throw Error("Local review builds only run on loopback.");
if (
  !isLocalPreview &&
  (config.projectId !== "spell-bee-c218a" ||
    !config.appId ||
    !config.apiKey ||
    !import.meta.env.VITE_APPCHECK_SITE_KEY)
)
  throw Error(
    "Verified production Firebase and App Check configuration required.",
  );
const app = initializeApp(config);
if (!isLocalPreview)
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(
      import.meta.env.VITE_APPCHECK_SITE_KEY,
    ),
    isTokenAutoRefreshEnabled: true,
  });
export const auth = getAuth(app);
const functions = getFunctions(app, "us-central1");
if (isLocalPreview) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
let analyticsAllowed = false;
let analyticsInstance: import("firebase/analytics").Analytics | undefined;
let analyticsModule: typeof import("firebase/analytics") | undefined;
async function configureAnalyticsInternal(allowed: boolean) {
  analyticsAllowed = allowed;
  if (isLocalPreview) return;
  if (!allowed) {
    if (analyticsInstance)
      analyticsModule?.setAnalyticsCollectionEnabled(analyticsInstance, false);
    for (const cookie of document.cookie.split(";")) {
      const key = cookie.split("=")[0].trim();
      if (key.startsWith("_ga")) {
        document.cookie = `${key}=; Max-Age=0; path=/`;
        document.cookie = `${key}=; Max-Age=0; path=/; domain=${location.hostname}`;
      }
    }
    return;
  }
  const mod = await import("firebase/analytics");
  if (!analyticsAllowed || !(await mod.isSupported())) return;
  analyticsModule = mod;
  analyticsInstance ||= mod.initializeAnalytics(app, {
    config: {
      send_page_view: false,
      page_location: location.origin + "/",
      page_referrer: "",
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_flags: "SameSite=Lax;Secure",
    },
  });
  if (auth.currentUser) {
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(auth.currentUser.uid),
    );
    const pseudonym = [...new Uint8Array(bytes)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    mod.setUserId(analyticsInstance, pseudonym);
  }
  mod.setAnalyticsCollectionEnabled(analyticsInstance, true);
}
export async function configureAnalytics(allowed: boolean) {
  try {
    await configureAnalyticsInternal(allowed);
  } catch {
    analyticsAllowed = false;
  } // Optional analytics must never block gameplay.
}
export function analyticsEvent(
  event: string,
  properties: Record<string, string | number> = {},
) {
  if (analyticsAllowed && analyticsModule && analyticsInstance) {
    try {
      analyticsModule.logEvent(analyticsInstance, event, {
        ...properties,
        page_location: location.origin + "/",
        page_referrer: "",
      });
    } catch {
      /* Optional collection failures do not affect answers. */
    }
  }
}
export async function initializeSession() {
  await setPersistence(auth, browserLocalPersistence);
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
}
export async function api<T = any>(
  name: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  if (!auth.currentUser) throw Error("Your session is not connected yet.");
  const response = await httpsCallable(functions, name)(data);
  return response.data as T;
}
export const pendingEmailLink = () =>
  isSignInWithEmailLink(auth, location.href);
export async function sendSaveLink(email: string) {
  const { claim } = await api("prepareAccountClaim");
  sessionStorage.setItem("spellbee-claim", claim);
  localStorage.setItem("spellbee-email", email);
  await sendSignInLinkToEmail(auth, email, {
    url: location.origin + location.pathname,
    handleCodeInApp: true,
  });
  if (!isLocalPreview) return undefined;
  // Local-only email preview: no message leaves the Auth emulator.
  const r = await fetch(
    "http://127.0.0.1:9099/emulator/v1/projects/demo-spell-bee/oobCodes",
  );
  const data = await r.json();
  return [...(data.oobCodes || [])]
    .reverse()
    .find((c: any) => c.email === email)?.oobLink as string | undefined;
}
export async function completeSaveLink(email: string) {
  const url = location.href;
  const credential = EmailAuthProvider.credentialWithLink(email, url);
  try {
    if (auth.currentUser?.isAnonymous)
      await linkWithCredential(auth.currentUser, credential);
    else await signInWithEmailLink(auth, email, url);
  } catch (e: any) {
    if (
      !["auth/credential-already-in-use", "auth/email-already-in-use"].includes(
        e.code,
      )
    )
      throw e;
    await signInWithEmailLink(auth, email, url);
  }
  const claim = sessionStorage.getItem("spellbee-claim");
  if (claim) {
    await api("claimGuestHistory", { claim });
    sessionStorage.removeItem("spellbee-claim");
  }
  localStorage.removeItem("spellbee-email");
  history.replaceState({}, "", location.pathname);
}
export async function resetIdentity() {
  await signOut(auth);
  await signInAnonymously(auth);
}
export type Challenge = {
  id: string;
  kind: "daily" | "private";
  closesAt: number;
  opensAt: number;
  expiresAt: number;
  wordCount: number;
  date: string | null;
};
export type GameState = {
  challenge: Challenge;
  attempt: null | {
    id: string;
    status: "active" | "completed" | "expired";
    position: number;
    displayName: string;
  };
  results?: {
    score: number;
    total: number;
    partial: boolean;
    items: {
      word: string;
      definition: string;
      note: string;
      submitted: string | null;
      correct: boolean;
    }[];
  };
};
