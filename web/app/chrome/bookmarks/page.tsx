import { BookmarksClient } from "./BookmarksClient";
export const dynamic = "force-dynamic";
export const metadata = { title: "Bookmarks" };
/** chrome://bookmarks */
export default function BookmarksPage() { return <BookmarksClient />; }
