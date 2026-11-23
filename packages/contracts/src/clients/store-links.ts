// Modified by Agental: moved out of client-build.ts, which build tooling loads on its own and so
// imports nothing. The listings belong to the brand, and are "" until it has one.
import { BRAND } from "../brand/brand.js";

export const IOS_APP_STORE_URL = BRAND.stores.ios;
export const ANDROID_APK_URL = BRAND.stores.androidApk;
export const ANDROID_APP_STORE_URL = BRAND.stores.android;
