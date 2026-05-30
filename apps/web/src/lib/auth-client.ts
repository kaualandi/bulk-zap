"use client";

import { createAuthClient } from "better-auth/react";
import { API_URL } from "./api";

export const authClient = createAuthClient({
  baseURL: `${API_URL}/api/auth`,
  fetchOptions: {
    credentials: "include",
  },
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
} = authClient;

// Better Auth renamed `forgetPassword` -> `requestPasswordReset`.
// Keep an alias so callers can use the familiar name.
export const forgetPassword = requestPasswordReset;
