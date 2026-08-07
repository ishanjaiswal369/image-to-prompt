import { OAuth2Client } from "google-auth-library";
import { config } from "../config.js";
import { UnauthorizedError } from "./errors.js";

const client = new OAuth2Client(config.GOOGLE_CLIENT_ID);

export interface GoogleIdentity {
  sub: string;
  email: string;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  let ticket;
  try {
    ticket = await client.verifyIdToken({ idToken, audience: config.GOOGLE_CLIENT_ID });
  } catch (err) {
    throw new UnauthorizedError(`invalid Google ID token: ${(err as Error).message}`);
  }

  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new UnauthorizedError("Google ID token missing sub or email");
  }

  return { sub: payload.sub, email: payload.email };
}
