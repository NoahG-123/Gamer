import { SettingsClient } from "./SettingsClient";
export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };
/** chrome://settings */
export default function ChromeSettingsPage() { return <SettingsClient />; }
