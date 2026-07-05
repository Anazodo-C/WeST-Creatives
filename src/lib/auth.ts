import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

/**
 * NextAuth configuration. Google is the only provider wired for MVP (matches
 * the "connect wallet + Google auth" sign-up flow from the brief). Session
 * strategy is JWT so this works without a database — the user's stable
 * identity (session.user.email) is what the rest of the app uses as the
 * creator/developer ownerId.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signup",
  },
  callbacks: {
    async session({ session }) {
      return session;
    },
  },
};
