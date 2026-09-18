import styles from "./ntp.module.css";
import { NtpClient } from "./NtpClient";
export const dynamic = "force-dynamic";

/** Chrome's New Tab Page (dark), rendered inside the tab's web pane. */
export default function NtpPage() {
  return (
    <div className={styles.page}>
      <NtpClient />
    </div>
  );
}
