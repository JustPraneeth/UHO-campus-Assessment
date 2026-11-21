import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth as useClerkAuth, useSignIn, useSignUp } from "@clerk/react";
import api, { getErrorMessage } from "../api/axios";
import { setTokenProvider } from "../api/axios";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { isLoaded, isSignedIn, getToken, signOut: clerkSignOut } = useClerkAuth();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  const pendingProfile = useRef(null);
  const finalizingSignIn = useRef(false);

  useEffect(() => {
    let active = true;
    setTokenProvider(getToken);
    if (!isLoaded) return () => { active = false; };
    if (!isSignedIn) {
      setUser(null);
      setProfileError("");
      setLoading(false);
      return () => { active = false; };
    }
    if (finalizingSignIn.current) return () => { active = false; };
    setLoading(true);
    fetchProfile()
      .then((data) => {
        if (!active) return;
        setUser(data);
        setProfileError("");
      })
      .catch((err) => {
        if (!active) return;
        setUser(null);
        setProfileError(getErrorMessage(err));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [getToken, isLoaded, isSignedIn]);

  async function fetchProfile(token) {
    const sessionToken = token || await getToken({ skipCache: true });
    if (!sessionToken) {
      throw new Error("Your Clerk session is not available. Please sign in again.");
    }
    const response = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.message || `Profile request failed (${response.status})`);
      error.response = { status: response.status, data };
      throw error;
    }
    return data;
  }

  async function loadProfile(token) {
    try {
      const data = await fetchProfile(token);
      setUser(data);
      setProfileError("");
      return data;
    } catch (err) {
      setUser(null);
      setProfileError(getErrorMessage(err));
      throw err;
    }
  }

  async function finalizeSignIn() {
    finalizingSignIn.current = true;
    try {
      const { error } = await signIn.finalize({
        navigate: ({ session }) => { if (session?.currentTask) return; },
      });
      if (error) throw error;
      const token = await getToken({ skipCache: true });
      if (!token) throw new Error("Unable to establish your session. Please try signing in again.");
      return await loadProfile(token);
    } finally {
      finalizingSignIn.current = false;
    }
  }

  async function login(emailAddress, password) {
    try {
      if (isSignedIn && !user) {
        await clerkSignOut();
      }
      await signIn.reset();
      const attemptSignIn = async () => {
        const result = await signIn.password({ identifier: emailAddress.trim(), password });
        if (result.error) throw result.error;
      };
      try {
        await attemptSignIn();
      } catch (err) {
        if (!/already signed in|already authenticated/i.test(getErrorMessage(err))) throw err;
        await clerkSignOut();
        await signIn.reset();
        await attemptSignIn();
      }
      if (signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") {
        const emailFactor = signIn.supportedSecondFactors?.find((factor) => factor.strategy === "email_code");
        if (emailFactor) {
          await signIn.mfa.sendEmailCode();
          return { success: true, verificationRequired: true };
        }
        return { success: false, message: "This account requires an additional verification method." };
      }
      if (signIn.status !== "complete") {
        return { success: false, message: "Unable to complete sign-in. Check your account verification settings." };
      }
      const profile = await finalizeSignIn();
      return { success: true, user: profile };
    } catch (err) {
      return { success: false, message: getErrorMessage(err) };
    }
  }

  async function verifySignInCode(code) {
    try {
      const { error } = await signIn.mfa.verifyEmailCode({ code: code.trim() });
      if (error) throw error;
      if (signIn.status !== "complete") return { success: false, message: "Email verification is not complete." };
      const profile = await finalizeSignIn();
      return { success: true, user: profile };
    } catch (err) {
      return { success: false, message: getErrorMessage(err) };
    }
  }

  async function requestPasswordReset(emailAddress) {
    try {
      if (isSignedIn && !user) await clerkSignOut();
      signIn.reset();
      const { error: createError } = await signIn.create({ identifier: emailAddress.trim().toLowerCase() });
      if (createError) throw createError;
      const { error } = await signIn.resetPasswordEmailCode.sendCode();
      if (error) throw error;
      return { success: true };
    } catch (err) {
      return { success: false, message: getErrorMessage(err) };
    }
  }

  async function verifyPasswordResetCode(code) {
    try {
      const { error } = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
      if (error) throw error;
      return { success: signIn.status === "needs_new_password" };
    } catch (err) {
      return { success: false, message: getErrorMessage(err) };
    }
  }

  async function completePasswordReset(password) {
    try {
      const { error } = await signIn.resetPasswordEmailCode.submitPassword({
        password,
      });
      if (error) throw error;
      if (signIn.status !== "complete") {
        return { success: false, message: "Password reset is not complete. Try verifying the email code again." };
      }
      const profile = await finalizeSignIn();
      return { success: true, user: profile };
    } catch (err) {
      return { success: false, message: getErrorMessage(err) };
    }
  }

  async function register(payload) {
    try {
      pendingProfile.current = {
        name: payload.name,
        collegeName: payload.collegeName,
        university: payload.university,
        degree: payload.degree,
        branch: payload.branch,
        passingYear: Number(payload.passingYear),
        currentYearSemester: payload.currentYearSemester,
        rollNumber: payload.rollNumber,
        city: payload.city,
      };
      const [firstName, ...lastNameParts] = payload.name.trim().split(/\s+/);
      const { error } = await signUp.password({
        emailAddress: payload.email.trim().toLowerCase(),
        password: payload.password,
        firstName,
        lastName: lastNameParts.join(" "),
      });
      if (error) throw error;
      if (signUp.status === "complete") {
        await signUp.finalize({ navigate: ({ session }) => { if (session?.currentTask) return; } });
        await api.put("/auth/me", pendingProfile.current);
        await loadProfile();
        pendingProfile.current = null;
        return { success: true, authenticated: true };
      }
      await signUp.verifications.sendEmailCode();
      return { success: true, verificationRequired: true };
    } catch (err) {
      pendingProfile.current = null;
      const message = getErrorMessage(err);
      const existingSession = /already signed in|already authenticated/i.test(message);
      return {
        success: false,
        message: existingSession
          ? "This browser already has an active Clerk session. Sign out before creating another account."
          : message,
        existingSession,
        existingAccount: /already exists|already registered/i.test(message),
      };
    }
  }

  async function verifyEmailCode(code) {
    try {
      const { error } = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (error) throw error;
      if (signUp.status !== "complete") return { success: false, message: "Email verification is not complete." };
      await signUp.finalize({ navigate: ({ session }) => { if (session?.currentTask) return; } });
      if (pendingProfile.current) await api.put("/auth/me", pendingProfile.current);
      await loadProfile();
      pendingProfile.current = null;
      return { success: true };
    } catch (err) {
      return { success: false, message: getErrorMessage(err) };
    }
  }

  async function resendEmailCode() {
    try {
      const { error } = await signUp.verifications.sendEmailCode();
      if (error) throw error;
      return { success: true };
    } catch (err) {
      return { success: false, message: getErrorMessage(err) };
    }
  }

  async function logout() {
    await clerkSignOut();
    signIn.reset();
    signUp.reset();
    pendingProfile.current = null;
    setUser(null);
    setProfileError("");
  }

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      sessionActive: isLoaded && Boolean(isSignedIn),
      profileError,
      refreshProfile: loadProfile,
      login,
      verifySignInCode,
      requestPasswordReset,
      verifyPasswordResetCode,
      completePasswordReset,
      register,
      verifyEmailCode,
      resendEmailCode,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
