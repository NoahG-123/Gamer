import { DownloadsClient } from "./DownloadsClient";
export const dynamic = "force-dynamic";
export const metadata = { title: "Downloads" };
/** chrome://downloads */
export default function DownloadsPage() { return <DownloadsClient />; }
