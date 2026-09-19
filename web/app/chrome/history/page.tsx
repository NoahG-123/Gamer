import { HistoryClient } from "./HistoryClient";
export const dynamic = "force-dynamic";
export const metadata = { title: "History" };
/** chrome://history */
export default function HistoryPage() { return <HistoryClient />; }
