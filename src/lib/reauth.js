import {
  GoogleAuthProvider,
  OAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { auth, googleProvider, appleProvider } from '../firebase';

const GOOGLE_IOS_CLIENT_ID = '902243550931-jp7aur82tepcpi54r0er41sp2semqamp.apps.googleusercontent.com';

function generateNonce(length = 32) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + charset[x % charset.length], '');
}

async function sha256(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

function primaryProviderId(user) {
  const providerIds = user?.providerData?.map(provider => provider.providerId).filter(Boolean) || [];
  if (providerIds.includes('google.com')) return 'google.com';
  if (providerIds.includes('apple.com')) return 'apple.com';
  return providerIds[0] || null;
}

async function reauthenticateNativeGoogle(user) {
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  await SocialLogin.initialize({ google: { iOSClientId: GOOGLE_IOS_CLIENT_ID } });
  const result = await SocialLogin.login({
    provider: 'google',
    options: { scopes: ['email', 'profile'], forcePrompt: true },
  });
  const idToken = result?.result?.idToken;
  if (!idToken) throw new Error('No idToken from Google reauth');
  const credential = GoogleAuthProvider.credential(idToken);
  await reauthenticateWithCredential(user, credential);
}

async function reauthenticateNativeApple(user) {
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  await SocialLogin.initialize({ apple: {} });

  const rawNonce = generateNonce();
  const hashedNonce = await sha256(rawNonce);
  const result = await SocialLogin.login({
    provider: 'apple',
    options: { scopes: ['email', 'name'], nonce: hashedNonce },
  });

  const idToken = result?.result?.idToken;
  if (!idToken) throw new Error('No idToken from Apple reauth');

  const credential = new OAuthProvider('apple.com').credential({
    idToken,
    rawNonce,
  });
  await reauthenticateWithCredential(user, credential);
}

export async function reauthenticateForAccountDeletion() {
  const user = auth.currentUser;
  if (!user) {
    const err = new Error('Not signed in');
    err.code = 'auth/no-current-user';
    throw err;
  }

  const providerId = primaryProviderId(user);
  if (providerId === 'google.com') {
    if (Capacitor.isNativePlatform()) {
      await reauthenticateNativeGoogle(user);
    } else {
      await reauthenticateWithPopup(user, googleProvider);
    }
    return;
  }

  if (providerId === 'apple.com') {
    if (Capacitor.isNativePlatform()) {
      await reauthenticateNativeApple(user);
    } else {
      await reauthenticateWithPopup(user, appleProvider);
    }
    return;
  }

  const err = new Error('Unsupported sign-in provider for reauth');
  err.code = 'auth/unsupported-provider';
  throw err;
}
